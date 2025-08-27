import { ExtensionContext, Hover, languages, MarkdownString, TextDocument } from "vscode";

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        languages.registerHoverProvider("ink", {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+|->|<>/);
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
                // Hover per glue <>
                if (word === "<>") {
                    return new Hover(
                        "**Glue (`<>`)**: Prevents a line-break before this content. Use it when you want consecutive content to stick together on the same line."
                    );
                }

                const commentLines = getKnotComment(document, word);
                if (commentLines) {
                    return commentLines;
                }

                return;
            },
        })
    );
}

/**
 * Returns a Hover with the comments associated with the knot or stitch
 * under the mouse cursor.
 */
export function getKnotComment(document: TextDocument, word: string) {
    // Split word in case of knot.stitch
    const parts = word.split(".");
    const stitchName = parts.pop()!; // if present, stitch
    const parentKnotName = parts.pop(); // if present, parent knot

    let targetLine = -1;

    // Loop through all lines of the document
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text.trim();

        // 1) If it's a main knot
        if (!stitchName && /^\s*={2,}/.test(line)) {
            const knotRegex = new RegExp(`^={2,}\\s*${escapeRegExp(word)}\\b`);
            if (knotRegex.test(line)) {
                targetLine = i;
                break;
            }
        }

        // 2) If it's a divert to knot or knot.stitch
        if (parentKnotName) {
            const parentRegex = new RegExp(`^={2,}\\s*${escapeRegExp(parentKnotName)}\\b`);
            if (parentRegex.test(line)) {
                // Search for the stitch immediately after
                for (let j = i + 1; j < document.lineCount; j++) {
                    const subLine = document.lineAt(j).text.trim();

                    // If another main knot is found, stop
                    if (/^={2,}/.test(subLine)) break;

                    const stitchRegex = new RegExp(`^=+\\s*${escapeRegExp(stitchName)}\\b`);
                    if (stitchRegex.test(subLine)) {
                        targetLine = j;
                        break;
                    }
                }
                break; // parent found, stop searching
            }
        }

        // 3) If the user is hovering directly over the stitch itself
        if (stitchName && /^\s*=+/.test(line)) {
            const stitchRegex = new RegExp(`^=+\\s*${escapeRegExp(stitchName)}\\b`);
            if (stitchRegex.test(line)) {
                targetLine = i;
                break;
            }
        }
    }

    if (targetLine < 0) return;

    // Function to collect comments above the target line
    function collectCommentAbove(lineNumber: number): string[] {
        const comments: string[] = [];
        for (let i = lineNumber - 1; i >= 0; i--) {
            const text = document.lineAt(i).text.trim();
            if (text.startsWith("/**") || text.startsWith("*") || text.startsWith("*/")) {
                comments.unshift(text);
            } else if (text === "") {
                continue;
            } else {
                break;
            }
        }
        return comments;
    }

    const commentLines = collectCommentAbove(targetLine);
    if (!commentLines.length) return;

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

    if (!cleaned) return;

    return new Hover(new MarkdownString(cleaned));
}
