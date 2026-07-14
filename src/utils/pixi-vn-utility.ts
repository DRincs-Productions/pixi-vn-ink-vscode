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
 * re-exports `addBaseHashtagCommands`/`importJson`/`VariableGetter`, which transitively import
 * `@drincs/pixi-vn/canvas` → `pixi.js` — and one of pixi.js's own submodules (`GlTextureSystem`,
 * via its Safari-detection helper) reads `navigator.userAgent` at *module evaluation time*,
 * throwing immediately in the extension host (a plain Node.js process with no `navigator`, unless
 * shimmed — see {@link loadRootPixiVnInkWithHashtagCommands}). Every built-in hashtag command
 * (`# show ...`, `# edit ...`, ...) necessarily stays an opaque `{ type: "operationtoconvert",
 * values: [...] }` placeholder through *this* function specifically — invisible to schema
 * validation — rather than its real structured operation; use
 * {@link compilePixiVNWithResolvedHashtagCommands} instead when that matters.
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

/**
 * Temporarily overrides the global `navigator` for the duration of `load`, restoring whatever was
 * there before (present or not) once it settles, success or failure.
 *
 * Needed once, to load `@drincs/pixi-vn-ink`'s root export (see
 * {@link loadRootPixiVnInkWithHashtagCommands}): pixi.js's `GlTextureSystem` submodule reads
 * `DOMAdapter.get().getNavigator().userAgent` at module-evaluation time to feature-detect Safari,
 * and that call returns `undefined` in the extension host — even though modern Node.js (21+)
 * itself defines a bare-bones global `navigator`, pixi.js's own adapter doesn't consult it and
 * crashes regardless. That built-in `navigator`, when present, is a *configurable* accessor
 * property, though (confirmed empirically), so it can be swapped for a minimal stand-in just long
 * enough for pixi.js's module graph to finish loading without throwing.
 *
 * This mutates a genuinely global, process-wide object for that whole window — shared with every
 * other extension running in the same extension host process — which would be too invasive to do
 * permanently. Scoped to only the *one-time* module load (module state, once loaded, stays loaded;
 * nothing here needs to repeat it), this narrows that window to something that only ever happens
 * once per extension host lifetime, as early as possible, and never overlaps a real navigator
 * consumer that isn't part of this one load.
 */
async function withNavigatorShim<T>(load: () => Promise<T>): Promise<T> {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    try {
        Object.defineProperty(globalThis, "navigator", {
            value: { userAgent: "Mozilla/5.0 VSCodeExtensionHost" },
            configurable: true,
            writable: true,
        });
    } catch {
        // Not configurable in this environment after all — proceed without the shim; `load` will
        // most likely fail the same way it always did, and its own caller falls back gracefully.
    }

    try {
        return await load();
    } finally {
        if (original) {
            Object.defineProperty(globalThis, "navigator", original);
        } else {
            Reflect.deleteProperty(globalThis, "navigator");
        }
    }
}

/**
 * Lazily, and only once, loads `@drincs/pixi-vn-ink`'s root export (behind {@link withNavigatorShim})
 * and calls its `addBaseHashtagCommands()` — needed for
 * {@link compilePixiVNWithResolvedHashtagCommands} to see built-in commands (`show`/`edit`/
 * `remove`/... for images, sound, text, canvas elements, ...) resolved into their real structured
 * `PixiVNJson` operation at compile time, instead of left as an opaque `operationtoconvert`
 * placeholder. Falls back to `undefined` (never throws) if the shim didn't help after all — an
 * outdated pixi.js internal, or some other unrelated reason — letting
 * {@link compilePixiVNWithResolvedHashtagCommands} fall back to the always-safe
 * {@link compilePixiVN} instead.
 *
 * Registering into the *root* export's own `HashtagCommands` matters specifically because it does
 * NOT share state with `/converter`'s: confirmed empirically that calling `addBaseHashtagCommands`
 * from the root while compiling via `/converter`'s `convertInkToJson` (as {@link compilePixiVN}
 * does) leaves every hashtag command unresolved — the two entry points bundle separate copies of
 * the same module-level registry. Every subsequent compile reuses this already-loaded module, so
 * the navigator shim only ever wraps this one first call, never a later one.
 */
async function loadRootPixiVnInkWithHashtagCommands(): Promise<RootPixiVnInkModule | undefined> {
    if (!rootModulePromise) {
        rootModulePromise = withNavigatorShim(async () => {
            try {
                const mod = (await import("@drincs/pixi-vn-ink")) as RootPixiVnInkModule;
                mod.addBaseHashtagCommands();
                return mod;
            } catch {
                return undefined;
            }
        });
    }
    return rootModulePromise;
}

/**
 * Kicks off {@link loadRootPixiVnInkWithHashtagCommands} in the background, without waiting for
 * or doing anything with the result. `@drincs/pixi-vn-ink`'s root export pulls in `pixi.js`'s
 * whole rendering stack (megabytes of code once bundled), so the *first* time anything actually
 * needs it — e.g. the first `checkPixiVnJsonSchemaValidation` run after opening a file — importing
 * and evaluating it all is noticeably slower than every later call, which just reuses the already
 * -loaded module. Calling this once, early (e.g. right after the pixi-vn dev-server data first
 * becomes available), absorbs that one-time cost in the background instead of it being felt as a
 * delay on whatever diagnostics pass happens to be the first to actually need it.
 */
export function warmUpPixiVnInkRootModule(): void {
    void loadRootPixiVnInkWithHashtagCommands();
}

/**
 * Like {@link compilePixiVN}, but tries to first register pixi-vn's built-in hashtag commands
 * (see {@link loadRootPixiVnInkWithHashtagCommands}) so the compiled JSON contains their real
 * structured operations rather than opaque placeholders — needed for
 * {@link ../../diagnostics!checkPixiVnJsonSchemaValidation} to actually see inside a `# show ...`
 * / `# edit ...` / etc. command's arguments (e.g. an unrecognised `props` key). Falls back to the
 * plain {@link compilePixiVN} (still useful — it validates everything else about the document) if
 * that registration didn't succeed.
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
