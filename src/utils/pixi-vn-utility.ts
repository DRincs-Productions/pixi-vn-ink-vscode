import { convertInkToJson } from "@drincs/pixi-vn-ink/converter";
import { InkCompiler } from "@drincs/pixi-vn-ink/parser";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";

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
