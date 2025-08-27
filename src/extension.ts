import { ExtensionContext, Hover, languages, MarkdownString } from "vscode";

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        languages.registerHoverProvider("ink", {
            provideHover(document, position, token) {
                const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+/);
                if (!range) {
                    return;
                }

                const word = document.getText(range);

                switch (word) {
                    case "END":
                        return new Hover(
                            "**END**: Ends the current story flow immediately. Use this when the story should stop completely."
                        );
                    case "DONE":
                        return new Hover(
                            "**DONE**: Marks the current knot as finished. The story flow can continue to the next knot or choice."
                        );
                }

                const lineText = document.lineAt(position.line).text;
                if (lineText.match(/={2,}\s*${word}/) || lineText.includes(`-> ${word}`)) {
                    console.log("Looking for comments for", word);
                    let commentLines: string[] = [];
                    for (let i = position.line - 1; i >= 0; i--) {
                        const text = document.lineAt(i).text.trim();
                        if (text.startsWith("/**") || text.startsWith("*") || text.startsWith("*/")) {
                            commentLines.unshift(text);
                        } else if (text === "" || text.startsWith("//")) {
                            continue;
                        } else {
                            break;
                        }
                    }
                    console.log("Found comment lines:", commentLines);

                    if (commentLines.length > 0) {
                        const cleaned = commentLines
                            .map((l) =>
                                l
                                    .replace(/^\/\*\*?/, "")
                                    .replace(/\*\/$/, "")
                                    .replace(/^\s*\*\s?/, "")
                                    .trim()
                            )
                            .filter(Boolean)
                            .join("\n");

                        if (cleaned) {
                            return new Hover(new MarkdownString(cleaned));
                        }
                    }
                }

                return;
            },
        })
    );
}
