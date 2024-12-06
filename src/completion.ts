import { CompletionItem, CompletionItemProvider, Position, Range, TextDocument } from "vscode";
import * as NodeMap from "./nodemap";

export class DivertCompletionProvider implements CompletionItemProvider {

    public provideCompletionItems(document: TextDocument, position: Position): CompletionItem[] {
        // Make sure we are at the end of a valid divert arrow.
        // Ignore a > at the start of a line.
        const before = document.getText(new Range(position.with(position.line, 0), position));
        if (!/(->|<-) ?$/.test(before)) return [];
        if (/-> ?-> ?$/.test(before)) return [];
        return NodeMap.getDivertCompletionTargets(document.uri.fsPath, position.line);
    }

}