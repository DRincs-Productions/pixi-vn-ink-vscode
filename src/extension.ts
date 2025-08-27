import { ExtensionContext, Hover, languages, MarkdownString, Position, TextDocument } from "vscode";

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        languages.registerHoverProvider("ink", {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+|->/);
                if (!range) return;

                const word = document.getText(range);

                // Hover per END / DONE
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
                // Hover per divert arrow ->
                if (word === "->") {
                    return new Hover(
                        "**Divert (`->`)**: Moves the story immediately to another knot. This happens without any user input and can even occur mid-sentence."
                    );
                }

                const lineText = document.lineAt(position.line).text;
                const commentLines = getKnotComment(document, lineText, word, position);
                if (commentLines) {
                    return commentLines;
                }

                return;
            },
        })
    );
}

export function getKnotComment(document: TextDocument, lineText: string, word: string, position: Position) {
    const knotDefRegex = new RegExp(`^={2,}\\s*${escapeRegExp(word)}(?:\\s*={2,})?\\b`);
    const divertRegex = new RegExp(`->\\s*${escapeRegExp(word)}\\b`);
    let targetKnotLine = -1;
    if (knotDefRegex.test(lineText)) {
        targetKnotLine = position.line;
    } else if (divertRegex.test(lineText)) {
        for (let i = 0; i < document.lineCount; i++) {
            if (knotDefRegex.test(document.lineAt(i).text)) {
                targetKnotLine = i;
                break;
            }
        }
    } else {
        return;
    }

    if (targetKnotLine < 0) {
        return;
    }

    function collectDocAbove(startLine: number): string[] {
        let i = startLine - 1;

        while (i >= 0 && document.lineAt(i).text.trim() === "") i--;

        if (i < 0) return [];

        const firstTrim = document.lineAt(i).text.trim();

        if (!firstTrim.startsWith("*/") && !firstTrim.startsWith("*") && !firstTrim.startsWith("/**")) {
            return [];
        }

        let j = i;
        while (j >= 0 && !document.lineAt(j).text.trim().startsWith("/**")) {
            j--;
        }
        if (j < 0) return [];

        const collected: string[] = [];
        for (let k = j; k < startLine && k < document.lineCount; k++) {
            collected.push(document.lineAt(k).text);
            if (document.lineAt(k).text.includes("*/")) break;
        }
        return collected;
    }

    const commentLines = collectDocAbove(targetKnotLine);
    if (!commentLines || commentLines.length === 0) return;

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
