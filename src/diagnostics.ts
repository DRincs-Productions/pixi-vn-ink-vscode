import { ErrorType } from "inkjs/engine/Error";
import { Diagnostic, DiagnosticCollection, DiagnosticSeverity, Range, TextDocument } from "vscode";
import { getErrors } from "./utils/ink-utility";

export function updateDiagnostics(doc: TextDocument, collection: DiagnosticCollection) {
    const errors = getErrors(doc.getText());
    const diagnostics: Diagnostic[] = [];

    for (const issue of errors) {
        if (issue.line >= 0) {
            const lineIndex = issue.line - 1; // perché inkjs parte da 1
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
