import { existsSync } from "fs";
import { ErrorType } from "inkjs/engine/Error";
import path from "path";
import { Diagnostic, DiagnosticCollection, DiagnosticSeverity, Range, TextDocument, workspace } from "vscode";
import { getErrors } from "./utils/ink-utility";
import { getErrorsPixiVN } from "./utils/pixi-vn-utility";

export function updateDiagnostics(doc: TextDocument, collection: DiagnosticCollection) {
    const config = workspace.getConfiguration("ink");
    const engine = config.get<"Inky" | "pixi-vn">("engine");

    let errors;
    if (engine === "pixi-vn") {
        errors = getErrorsPixiVN(doc.getText());
    } else {
        errors = getErrors(doc.getText());
    }

    const diagnostics: Diagnostic[] = [];

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

    collection.set(doc.uri, diagnostics);
}

export function checkIncludes(document: TextDocument, collection: DiagnosticCollection) {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    const workspaceRoot = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath || "";

    lines.forEach((line, lineIndex) => {
        const match = line.match(/^\s*INCLUDE\s+(.+)$/);
        if (match) {
            const relativePath = match[1].trim();
            const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(workspaceRoot, relativePath);

            if (!existsSync(fullPath)) {
                diagnostics.push(
                    new Diagnostic(
                        new Range(lineIndex, 0, lineIndex, line.length),
                        `Included file "${relativePath}" does not exist.`,
                        DiagnosticSeverity.Error
                    )
                );
            } else if (path.extname(fullPath) !== ".ink") {
                diagnostics.push(
                    new Diagnostic(
                        new Range(lineIndex, 0, lineIndex, line.length),
                        `Included file "${relativePath}" is not a .ink file.`,
                        DiagnosticSeverity.Warning
                    )
                );
            }
        }
    });

    collection.set(document.uri, diagnostics);
}
