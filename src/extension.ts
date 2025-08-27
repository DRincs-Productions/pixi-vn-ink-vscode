import { CancellationToken, ExtensionContext, Hover, HoverProvider, languages, Position, TextDocument } from "vscode";

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        languages.registerHoverProvider("ink", <HoverProvider>{
            provideHover(document: TextDocument, position: Position, token: CancellationToken) {
                const range = document.getWordRangeAtPosition(position, /\b(END|DONE)\b/);
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);

                if (word === "END") {
                    return new Hover(
                        "**END**: Ends the current story flow immediately. Use this when the story should stop completely."
                    );
                }

                if (word === "DONE") {
                    return new Hover(
                        "**DONE**: Marks the current knot as finished. The story flow can continue to the next knot or choice."
                    );
                }

                return undefined;
            },
        })
    );
}
