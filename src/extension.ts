import {
    Diagnostic,
    ExtensionContext,
    Hover,
    languages,
    MarkdownString,
    Position,
    Range,
    TextDocument,
    window,
    workspace,
} from "vscode";
import { checkIncludes, updateDiagnostics } from "./diagnostics";
import { includeCtrlClick, suggestionsInclude } from "./utils/include-utility";

export function activate(context: ExtensionContext) {
    const diagnostics = languages.createDiagnosticCollection("ink");
    context.subscriptions.push(diagnostics);

    // Listen for configuration changes

    workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("ink.engine")) {
            const newEngine = workspace.getConfiguration("ink").get<string>("engine");
            window.showInformationMessage(`Engine changed to ${newEngine}`);
        }
        if (event.affectsConfiguration("ink.markup")) {
            const newMarkup = workspace.getConfiguration("ink").get<string | null>("markup");
            window.showInformationMessage(`Markup changed to ${newMarkup ?? "none"}`);
        }
    });

    // Initial diagnostics for all open ink files

    workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "ink") {
            const list: Diagnostic[] = [];
            updateDiagnostics(doc, list);
            checkIncludes(doc, list);
            diagnostics.set(doc.uri, list);
        }
    });

    workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === "ink") {
            const list: Diagnostic[] = [];
            updateDiagnostics(e.document, list);
            checkIncludes(e.document, list);
            diagnostics.set(e.document.uri, list);
        }
    });

    workspace.onDidCloseTextDocument((doc) => {
        diagnostics.delete(doc.uri);
    });

    const diagnosticCollection = languages.createDiagnosticCollection("ink");
    context.subscriptions.push(diagnosticCollection);

    // CTRL+CLICK support for INCLUDE statements
    const includeProvider = includeCtrlClick();
    context.subscriptions.push(languages.registerDefinitionProvider({ language: "ink" }, includeProvider));

    // Suggestions include
    const includeSuggestionsProvider = suggestionsInclude();
    context.subscriptions.push(
        languages.registerCompletionItemProvider({ language: "ink" }, includeSuggestionsProvider, " ")
    );

    context.subscriptions.push(
        languages.registerHoverProvider("ink", {
            provideHover(document, position) {
                // Normal word/symbol detection (END, DONE, ->, <>, identifiers)
                const line = document.lineAt(position.line).text;
                let word: string | undefined;
                let range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+|->|<>|\*|\+|-/);

                // Handle single special characters separately
                const char = line[position.character];
                if ("&!~|".includes(char) && !isEscaped(line, position.character)) {
                    word = char;
                    range = new Range(position, position.translate(0, 1));
                } else if (range) {
                    word = document.getText(range);
                }

                if (!word) return;

                // Hover for END / DONE
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

                // Hover for divert arrow ->
                if (word === "->") {
                    return new Hover(
                        "**Divert (`->`)**: Moves the story immediately to another knot. This happens without any user input and can even occur mid-sentence."
                    );
                }

                // Hover for glue <>
                if (word === "<>") {
                    return new Hover(
                        "**Glue (`<>`)**: Prevents a line-break before this content. Use it when you want consecutive content to stick together on the same line."
                    );
                }

                // Hover for special symbols inside { }
                if (isInsideVariableText(document, position)) {
                    if (word === "&" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                "**Cycle (`&`)**: Cycles repeat their options in a loop.\n\nExample:\n```ink\nIt was {&Monday|Tuesday|Wednesday}\n```"
                            )
                        );
                    }

                    if (word === "!" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                "**Once-only (`!`)**: Works like a sequence, but stops producing output after all options are exhausted.\n\nExample:\n```ink\nHe told me a joke. {!I laughed.|I smiled.}\n```"
                            )
                        );
                    }

                    if (word === "~" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                "**Shuffle (`~`)**: Randomly selects an option each time.\n\nExample:\n```ink\nI tossed the coin. {~Heads|Tails}\n```"
                            )
                        );
                    }
                }

                // Hover for "|" (always, unless it is escaped as \| )
                if (word === "|" && !isEscaped(line, position.character)) {
                    return new Hover(
                        new MarkdownString(
                            "**Alternative separator (`|`)**: Used to separate alternative pieces of text (commonly inside `{}`).\n\nExample:\n```ink\n{Hello|Hi|Hey}\n```\nThis can output *Hello*, *Hi*, or *Hey* depending on the alternative type.\n\nTo write a literal `|`, escape it as `\\|`."
                        )
                    );
                }

                const match = line.match(/^(\s*[-*+\s]+)/);
                if (match) {
                    const seq = match[1];
                    const start = line.indexOf(seq);
                    const end = start + seq.length;

                    if (position.character >= start && position.character < end) {
                        if (char === "*") {
                            return new Hover(
                                new MarkdownString(
                                    "**Choice (`*`)**: Offers the player a one-time choice. Flows to the next line after selection."
                                )
                            );
                        }
                        if (char === "+") {
                            return new Hover(
                                new MarkdownString(
                                    "**Sticky Choice (`+`)**: Same as `*`, but reusable (remains available even after being chosen)."
                                )
                            );
                        }
                        if (char === "-") {
                            return new Hover(
                                new MarkdownString(
                                    "**Gather (`-`)**: Collects multiple branches back into a single flow point."
                                )
                            );
                        }
                    }
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

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function isInsideVariableText(document: TextDocument, position: Position): boolean {
    const line = document.lineAt(position.line).text;
    const before = line.substring(0, position.character);

    // Count unescaped curly braces before the position
    let depth = 0;
    for (let i = 0; i < before.length; i++) {
        if (before[i] === "{" && (i === 0 || before[i - 1] !== "\\")) {
            depth++;
        } else if (before[i] === "}" && (i === 0 || before[i - 1] !== "\\")) {
            depth--;
        }
    }

    return depth > 0; // true if we are inside a { ... }
}

function isEscaped(line: string, position: number): boolean {
    // true if the character at `position` is preceded by a backslash
    return position > 0 && line[position - 1] === "\\";
}
