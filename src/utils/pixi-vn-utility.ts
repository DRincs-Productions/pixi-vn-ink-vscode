import { convertInkToJson } from "@drincs/pixi-vn-ink/converter";
import { InkCompiler } from "@drincs/pixi-vn-ink/parser";

/**
 * Returns every compile issue (error/warning/author note, with its line) for `text` under the
 * pixi-vn engine — used for editor diagnostics. `InkCompiler.compile` already retries past a
 * missing divert target, an unresolved variable, a LIST/read-count issue, a missing function,
 * or a wrong argument count by stubbing in a minimal definition and recompiling (mirroring what
 * `vitePluginInk` relies on for the same leniency), so this only ever needs one call.
 */
export function getErrorsPixiVN(text: string) {
    return InkCompiler.compile(text).issues;
}

const REFERENCE_REGEX = /(?:->|<-)[ \t]+(\w[\w.]*)/g;

/**
 * Every knot/stitch name `text` diverts (`->`) or threads (`<-`) into — just the literal word
 * after the arrow (comments stripped first, one line at a time), dotted stitch paths (e.g.
 * `knot.stitch`) reduced to their leading knot name, since that's the granularity project files
 * are found at. Used to lazily discover which *other* project files a previewed story actually
 * needs compiled, instead of compiling every `.ink` file under the root folder unconditionally.
 */
export function extractReferencedKnotNames(text: string): Set<string> {
    const names = new Set<string>();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/\/\/.*$/, "");
        for (const match of line.matchAll(REFERENCE_REGEX)) {
            names.add(match[1].split(".")[0]);
        }
    }
    return names;
}

// pixi-vn-ink's own mapper only turns *named* containers (knots) into PixiVNJson labels —
// top-level content with no `=== knot ===` around it is silently dropped (confirmed by its own
// "Empty file" test: prose with no knot maps to `labels: {}`). Wrapping the whole source in one
// synthetic top-level knot guarantees there's always a real, addressable entry point — and it's
// also the label the webview's `narration.call` starts every story from.
export const PIXI_VN_START_LABEL = "__pixi_vn_start__";

/**
 * Compiles `text` for the pixi-vn engine straight into a `PixiVNJson` (a `labels` dictionary of
 * dialogue/choice/etc. steps), ready for `@drincs/pixi-vn-ink`'s `importJson` — the same
 * `convertInkToJson` pipeline `vitePluginInk` itself uses to turn a `.ink` file into JSON.
 *
 * Imported from `@drincs/pixi-vn-ink/converter` specifically, not its root export: the root also
 * re-exports `importJson`/`VariableGetter`, which need `@drincs/pixi-vn`'s live canvas runtime —
 * harmless in the webview's real DOM context, but pulling that into the extension host (a plain
 * Node.js process with no `navigator`) crashes on activation the moment pixi.js's browser-only
 * `DOMAdapter` gets touched. `/converter` only reaches the pure ink→JSON conversion.
 */
export function compilePixiVN(text: string, characterIds?: ReadonlySet<string>) {
    return convertInkToJson(`=== ${PIXI_VN_START_LABEL} ===\n${text}`, {
        characters: characterIds ? [...characterIds] : [],
    });
}

type RootPixiVnInkModule = {
    addBaseHashtagCommands: (options?: unknown) => void;
    convertInkToJson: typeof convertInkToJson;
};

let rootModulePromise: Promise<RootPixiVnInkModule | undefined> | undefined;
let hashtagCommandsRegistered = false;

/**
 * Lazily, and only once, loads `@drincs/pixi-vn-ink`'s root export and calls its
 * `addBaseHashtagCommands()` — needed for {@link compilePixiVNWithResolvedHashtagCommands} to see
 * built-in commands (`show`/`edit`/`remove`/... for images, sound, text, canvas elements, ...)
 * resolved into their real structured `PixiVNJson` operation at compile time, instead of left as
 * an opaque `{ type: "operationtoconvert", values: [...] }` placeholder.
 *
 * A dynamic `import()`, not a static one: `addBaseHashtagCommands` is only available from the
 * root export, which also re-exports `importJson`/`VariableGetter` — these need `@drincs/pixi-vn`'s
 * live canvas runtime, harmless in the webview's real DOM context but a documented crash risk in
 * the extension host (see {@link compilePixiVN}'s own doc comment on why it avoids the root
 * export entirely). Loading it dynamically, wrapped in a `try`, contains that risk to this one
 * lazily-invoked path — if it ever does fail, this silently falls back to `undefined` (letting
 * {@link compilePixiVNWithResolvedHashtagCommands} fall back to the always-safe
 * {@link compilePixiVN}) instead of taking down extension activation.
 *
 * Registering into the *root* export's own `HashtagCommands` matters specifically because it does
 * NOT share state with `/converter`'s: confirmed empirically that calling `addBaseHashtagCommands`
 * from the root while compiling via `/converter`'s `convertInkToJson` (as {@link compilePixiVN}
 * does) leaves every hashtag command unresolved — the two entry points bundle separate copies of
 * the same module-level registry.
 */
async function loadRootPixiVnInkWithHashtagCommands(): Promise<RootPixiVnInkModule | undefined> {
    if (!rootModulePromise) {
        rootModulePromise = (async () => {
            try {
                return (await import("@drincs/pixi-vn-ink")) as RootPixiVnInkModule;
            } catch {
                return undefined;
            }
        })();
    }

    const mod = await rootModulePromise;
    if (mod && !hashtagCommandsRegistered) {
        hashtagCommandsRegistered = true;
        try {
            mod.addBaseHashtagCommands();
        } catch {
            // Registration itself failed — keep going with whatever managed to register.
        }
    }
    return mod;
}

/**
 * Like {@link compilePixiVN}, but tries to first register pixi-vn's built-in hashtag commands
 * (see {@link loadRootPixiVnInkWithHashtagCommands}) so the compiled JSON contains their real
 * structured operations rather than opaque placeholders — needed for
 * {@link ../../diagnostics!checkPixiVnJsonSchemaValidation} to actually see inside a `# show ...`
 * / `# edit ...` / etc. command's arguments (e.g. an unrecognised `props` key). Falls back to the
 * plain {@link compilePixiVN} (still useful — it validates everything else about the document)
 * if that registration didn't succeed.
 */
export async function compilePixiVNWithResolvedHashtagCommands(text: string, characterIds?: ReadonlySet<string>) {
    const root = await loadRootPixiVnInkWithHashtagCommands();
    if (!root) return compilePixiVN(text, characterIds);

    return root.convertInkToJson(`=== ${PIXI_VN_START_LABEL} ===\n${text}`, {
        characters: characterIds ? [...characterIds] : [],
    });
}

/**
 * Compiles a project `.ink` file that *isn't* the one being previewed — its own knots become
 * directly callable labels, with none of {@link compilePixiVN}'s synthetic entry-point wrapper
 * (that wrapper only makes sense for the file the preview actually starts from). Used so a
 * `-> knot`/`<- knot` in the previewed file can resolve a knot that only lives in a sibling
 * project file, the same way the compiled app itself would see every file at once.
 */
export function compilePixiVNLibraryFile(text: string, characterIds?: ReadonlySet<string>) {
    return convertInkToJson(text, {
        characters: characterIds ? [...characterIds] : [],
    });
}

type PixiVNJson = NonNullable<ReturnType<typeof convertInkToJson>>;
type PixiVNJsonLabelStep = NonNullable<PixiVNJson["labels"]>[string][number];
// The library's own `labelToOpen` field accepts a single entry, an array of entries, or a
// conditional-statement wrapper around either (a label chosen at runtime based on story state).
// Only the plain single-entry, literal-string-label case can be checked statically (see
// `isSimpleLabelToOpen`), so entries are handled as `unknown` here and cast back once rebuilt.
type SimpleLabelToOpen = { label: string; type: "call" | "jump" };

/**
 * The `character` id a rewritten dialogue step (see {@link markUnresolvableLabelCalls}) uses to
 * mark itself as a "non-ink label" notice rather than real narration — the webview's
 * `NarrationView` renders anything with these ids centered, instead of as normal dialogue. Must
 * stay in sync with the matching constants in `src/webview/src/NarrationView.tsx.tsx` (the
 * extension host and the webview are separate bundles and can't share a literal import).
 */
export const NON_INK_LABEL_CALL_CHARACTER = "__non_ink_label_call__";
export const NON_INK_LABEL_JUMP_CHARACTER = "__non_ink_label_jump__";

/**
 * Every label id defined across `jsons` — the full set of `.ink` labels the preview actually
 * knows about, once every project file (not just the one being previewed) has been compiled.
 */
export function collectKnownPixiVnLabels(jsons: readonly PixiVNJson[]): Set<string> {
    const known = new Set<string>();
    for (const json of jsons) {
        for (const labelId of Object.keys(json.labels ?? {})) known.add(labelId);
    }
    return known;
}

function isSimpleLabelToOpen(entry: unknown): entry is SimpleLabelToOpen {
    if (typeof entry !== "object" || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    return typeof candidate.label === "string" && (candidate.type === "call" || candidate.type === "jump");
}

/**
 * Rewrites a step's `labelToOpen` if it targets a label absent from `knownLabels` (e.g. a
 * `<- knot` / `-> knot` for a label only ever defined in the app's own TypeScript code, never in
 * an `.ink` file) into a synthetic dialogue step naming the label — see
 * {@link markUnresolvableLabelCalls}. Any other field the original step had carries over onto the
 * synthetic step, *except* `glueEnabled` (confirmed present alongside `labelToOpen` in real
 * compiler output for a glued `<-`/`->`) — left as-is, it would glue whatever narration comes
 * right after onto this notice's own dialogue, both visually joining unrelated text and making
 * that narration inherit the notice's sentinel `character`, silently swallowing it instead of
 * displaying normally.
 *
 * Only handles the plain single-entry, literal-string-label shape ink actually compiles a
 * `<-`/`->` to — an array of `labelToOpen` entries or a runtime-computed label (a
 * `PixiVNJsonValueGet`, or a whole conditional-statement wrapper) can't be validated statically
 * and is left untouched.
 */
function rewriteStep(step: PixiVNJsonLabelStep, knownLabels: ReadonlySet<string>): PixiVNJsonLabelStep {
    const entry = step.labelToOpen;
    if (!entry || Array.isArray(entry) || !isSimpleLabelToOpen(entry) || knownLabels.has(entry.label)) {
        return step;
    }

    const { labelToOpen, glueEnabled, ...rest } = step;
    return {
        ...rest,
        dialogue: {
            character: entry.type === "call" ? NON_INK_LABEL_CALL_CHARACTER : NON_INK_LABEL_JUMP_CHARACTER,
            text: entry.label,
        },
        ...(entry.type === "jump" ? { end: "label_end" as const } : {}),
    } as PixiVNJsonLabelStep;
}

/**
 * Returns a copy of `json` where every `call`/`jump` to a label absent from `knownLabels` has
 * been replaced with a plain, centered dialogue line naming the label instead of the tag/divert
 * silently failing at runtime with no visible explanation (see `NarrationView`'s rendering of
 * {@link NON_INK_LABEL_CALL_CHARACTER}/{@link NON_INK_LABEL_JUMP_CHARACTER}).
 *
 * A `call` (ink thread, `<- knot`) continues normally right after the notice. A `jump` (ink
 * divert, `-> knot`) ends just the current label (`end: "label_end"`) — same as if that label had
 * reached its own end — resuming whichever label (if any) called into it, mirroring how a real
 * divert replaces the current flow rather than returning to it.
 */
export function markUnresolvableLabelCalls(json: PixiVNJson, knownLabels: ReadonlySet<string>): PixiVNJson {
    if (!json.labels) return json;

    const labels: Record<string, PixiVNJsonLabelStep[]> = {};
    for (const [labelId, steps] of Object.entries(json.labels)) {
        labels[labelId] = steps.map((step) => rewriteStep(step, knownLabels));
    }
    return { ...json, labels };
}
