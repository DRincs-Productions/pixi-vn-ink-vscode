import { DefinitionProvider, Position, Range, TextDocument } from "vscode";
import { getDefinitionByNameAndScope } from "./nodemap";


export class InkDefinitionProvider implements DefinitionProvider {

    public provideDefinition(document: TextDocument, position: Position) {
        const lineStart = new Position(position.line, 0);
        const lineEnd = new Position(position.line + 1, 0);
        const before = new Range(lineStart, position);
        const after = new Range(position, lineEnd);
        const beforeText = document.getText(before);
        const afterText = document.getText(after);
        const beforeMatchTemp = beforeText.match(/(->\s*\w*)$/);
        if (!beforeMatchTemp) { return; }
        const beforeMatch = beforeMatchTemp[1];
        const afterMatchTemp = afterText.match(/^([\w.]*)\s*/);
        if (!afterMatchTemp) { return; }
        const afterMatch = afterMatchTemp[1];
        if (!(beforeMatch && afterMatch)) { return; }
        const nameTemp = (beforeMatch + afterMatch).match(/->\s*([\w.]+)/);
        if (!nameTemp) { return; }
        const [name] = nameTemp;
        const [target] = name.split(".");
        return getDefinitionByNameAndScope(target, document.uri.fsPath, position.line);

    }
}