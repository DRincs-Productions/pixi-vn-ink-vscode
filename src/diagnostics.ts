import { existsSync } from "node:fs";
import { InkCompiler } from "@drincs/pixi-vn-ink/parser";
import { ErrorType } from "inkjs/engine/Error";
import path from "node:path";
import { Diagnostic, DiagnosticSeverity, l10n, Range, type TextDocument, workspace } from "vscode";
import { findPixiVnUnimplementedFunctionCalls, PIXI_VN_ISSUES_URL } from "./utils/builtin-functions";
import { getInkRootFolder, loadInkFileContent } from "./utils/include-utility";
import { getErrors, getProjectErrors } from "./utils/ink-utility";
import { getAllKnotDefinitions } from "./utils/knot-definitions";
import { getProjectInkFiles } from "./utils/knot-utility";
import { getPixiVnDevLabelNames } from "./utils/pixi-vn-dev-data";
import { getErrorsPixiVN } from "./utils/pixi-vn-utility";

export function updateDiagnostics(doc: TextDocument, diagnostics: Diagnostic[]) {
    const config = workspace.getConfiguration("ink");
    const engine = config.get<"Inky" | "pixi-vn">("engine", "Inky");
    const rootFolderSetting = getInkRootFolder(doc);

    let errors: { message: string; type: ErrorType; line: number }[];

    if (engine === "pixi-vn") {
        errors = getErrorsPixiVN(doc.getText());
    } else {
        const mainFileSetting = config.get<string>("mainFile", "");
        errors = mainFileSetting
            ? getProjectErrors(doc.getText(), doc.uri.fsPath, mainFileSetting, rootFolderSetting)
            : getErrors(doc.getText(), {
                  LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
              });
    }

    for (const issue of errors) {
        if (issue.line >= 0) {
            const lineIndex = issue.line - 1;
            const line = doc.lineAt(lineIndex);
            const range = new Range(line.range.start, line.range.end);

            diagnostics.push({
                severity:
                    issue.type === ErrorType.Error
                        ? DiagnosticSeverity.Error
                        : issue.type === ErrorType.Warning
                          ? DiagnosticSeverity.Warning
                          : DiagnosticSeverity.Information,
                message: issue.message,
                source: "ink",
                range,
            });
        }
    }
}

export function checkPixiVnUnimplementedFunctions(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        for (const { name, start, end } of findPixiVnUnimplementedFunctionCalls(line)) {
            diagnostics.push(
                new Diagnostic(
                    new Range(i, start, i, end),
                    l10n.t(
                        "{0}() is not implemented yet in the pixi-vn engine. Contact the developers to request it: {1}",
                        name,
                        PIXI_VN_ISSUES_URL,
                    ),
                    DiagnosticSeverity.Warning,
                ),
            );
        }
    }
}

/**
 * Flags `-> target` diverts whose target isn't a knot/stitch anywhere in the project and
 * isn't a label currently registered on the pixi-vn Vite dev server either — the same
 * check `vitePluginInk` runs at build time, passing it the same "known labels" (dev-server
 * labels + project knots) offered as knot-completion suggestions after `->`/`<-` (see
 * knotCompletionProvider). Only runs when the dev server has actually returned some
 * labels: without them there's no reliable way to tell a real typo from a label defined
 * purely in JS, so — same as before this check existed — nothing is flagged.
 */
export async function checkPixiVnUnknownDivertTargets(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const pixiVnLabels = getPixiVnDevLabelNames();
    if (pixiVnLabels.length === 0) return;

    const projectFiles = await getProjectInkFiles(document);
    const knotFullNames = getAllKnotDefinitions(projectFiles).map((def) => def.fullName);
    const knownLabels = [...new Set([...knotFullNames, ...pixiVnLabels])];

    for (const occurrence of InkCompiler.getUnknownDivertTargets(document.getText(), knownLabels)) {
        const lineIndex = occurrence.line - 1;
        if (lineIndex < 0 || lineIndex >= document.lineCount) continue;

        diagnostics.push(
            new Diagnostic(
                document.lineAt(lineIndex).range,
                l10n.t('Divert target "{0}" not found in any known label source.', occurrence.target),
                DiagnosticSeverity.Warning,
            ),
        );
    }
}

export function checkIncludes(document: TextDocument, diagnostics: Diagnostic[]) {
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    const workspaceRoot = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath || "";
    const config = workspace.getConfiguration("ink");
    const rootFolderSetting: string = config.get("rootFolder", "");
    const baseFolder = rootFolderSetting ? path.resolve(workspaceRoot, rootFolderSetting) : workspaceRoot;

    lines.forEach((line, lineIndex) => {
        const match = line.match(/^\s*INCLUDE\s+(.+)$/);
        if (match) {
            const relativePath = match[1].trim();
            const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(baseFolder, relativePath);

            if (!existsSync(fullPath)) {
                diagnostics.push(
                    new Diagnostic(
                        new Range(lineIndex, 0, lineIndex, line.length),
                        l10n.t('Included file "{0}" does not exist (resolved from "{1}").', relativePath, baseFolder),
                        DiagnosticSeverity.Error,
                    ),
                );
            } else if (path.extname(fullPath) !== ".ink") {
                diagnostics.push(
                    new Diagnostic(
                        new Range(lineIndex, 0, lineIndex, line.length),
                        l10n.t('Included file "{0}" is not a .ink file.', relativePath),
                        DiagnosticSeverity.Warning,
                    ),
                );
            }
        }
    });
}
