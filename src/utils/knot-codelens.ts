import { CodeLens, type CodeLensProvider, l10n, Range, type TextDocument } from "vscode";
import { extractKnotDefinitions } from "./knot-definitions";

// A knot header that also declares parameters, e.g. `== my_knot(x, y) ==`.
// Diverting straight into one of these without supplying arguments would
// just fail to compile, so it doesn't get a "run from here" CodeLens.
const PARAMETERIZED_HEADER_REGEX = /^\s*=+\s*(?:function\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(/;

/**
 * Shows a "Run from here" CodeLens above every top-level knot (not stitches
 * or functions — diverting straight into either isn't a meaningful preview
 * entry point) so the story can be previewed starting from that knot
 * without editing the source file. See `ink.runFromKnot` in webview.ts.
 */
export function knotRunCodeLensProvider(): CodeLensProvider {
    return {
        provideCodeLenses(document: TextDocument): CodeLens[] {
            const definitions = extractKnotDefinitions(document.uri.fsPath, document.getText());
            const lenses: CodeLens[] = [];

            for (const definition of definitions) {
                if (definition.stitchName || definition.isFunction) continue;

                const line = document.lineAt(definition.line);
                if (PARAMETERIZED_HEADER_REGEX.test(line.text)) continue;

                lenses.push(
                    new CodeLens(new Range(definition.line, 0, definition.line, line.text.length), {
                        title: `$(play) ${l10n.t("Run from here")}`,
                        command: "ink.runFromKnot",
                        arguments: [document.uri, definition.knotName],
                    }),
                );
            }

            return lenses;
        },
    };
}
