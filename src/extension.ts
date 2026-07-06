import {
    type Diagnostic,
    EventEmitter,
    type ExtensionContext,
    Hover,
    languages,
    MarkdownString,
    type Position,
    Range,
    SemanticTokensBuilder,
    SemanticTokensLegend,
    type TextDocument,
    window,
    workspace,
} from "vscode";
import { checkIncludes, updateDiagnostics } from "./diagnostics";
import { includeCtrlClick, suggestionsInclude } from "./utils/include-utility";
import { previewCommand, runProjectCommand } from "./webview";

// Legend for the pixi-vn bracket semantic tokens (uses the built-in "keyword" type so it
// shares the theme colour already used by choice brackets in the TextMate grammar).
const bracketTokenLegend = new SemanticTokensLegend(["keyword"], []);

export function activate(context: ExtensionContext) {
    // Register the command to open the Ink Preview webview

    context.subscriptions.push(previewCommand(context));
    context.subscriptions.push(runProjectCommand(context));

    // Emitter used to tell VS Code to re-compute semantic tokens when the engine setting changes
    const onDidChangeSemanticTokensEmitter = new EventEmitter<void>();
    context.subscriptions.push(onDidChangeSemanticTokensEmitter);

    // Listen for configuration changes

    workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("ink.engine")) {
            const newEngine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
            window.showInformationMessage(`Engine changed to ${newEngine}`);
            onDidChangeSemanticTokensEmitter.fire();
        }
        if (event.affectsConfiguration("ink.markup")) {
            const newMarkup = workspace.getConfiguration("ink").get<string | null>("markup", null);
            window.showInformationMessage(`Markup changed to ${newMarkup ?? "none"}`);
        }
    });

    // Initial diagnostics for all open ink files

    const diagnostics = languages.createDiagnosticCollection("ink");
    context.subscriptions.push(diagnostics);

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
        languages.registerCompletionItemProvider({ language: "ink" }, includeSuggestionsProvider, " "),
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

                // Hover for END / DONE — only after a divert arrow.
                if (word === "END" || word === "DONE") {
                    const wordStartChar = range ? range.start.character : position.character;
                    if (isEndDoneHoverContext(line, wordStartChar)) {
                        if (word === "END") {
                            return new Hover(
                                "**END**: Ends the current story flow immediately. Use this when the story should stop completely.",
                            );
                        }
                        return new Hover(
                            "**DONE**: Marks the current knot as finished. The story flow can continue to the next knot or choice.",
                        );
                    }
                }

                // Hover for divert arrow ->
                if (word === "->") {
                    return new Hover(
                        "**Divert (`->`)**: Moves the story immediately to another knot. This happens without any user input and can even occur mid-sentence.",
                    );
                }

                // Hover for glue <> (but not escaped \<>)
                if (word === "<>" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(
                        "**Glue (`<>`)**: Prevents a line-break before this content. Use it when you want consecutive content to stick together on the same line.",
                    );
                }

                // Hover for special symbols inside { }
                // ~, & and ! are only type specifiers when they appear as the first
                // non-whitespace character immediately after the opening { of a block.
                // In cases like {TEST~|TEST&|TEST!} they are plain text and must not
                // trigger a popup.
                if (isInsideVariableText(document, position) && isVariableTextTypeSpecifier(line, position.character)) {
                    if (word === "&" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                "**Cycle (`&`)**: Cycles repeat their options in a loop.\n\nExample:\n```ink\nIt was {&Monday|Tuesday|Wednesday}\n```",
                            ),
                        );
                    }

                    if (word === "!" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                "**Once-only (`!`)**: Works like a sequence, but stops producing output after all options are exhausted.\n\nExample:\n```ink\nHe told me a joke. {!I laughed.|I smiled.}\n```",
                            ),
                        );
                    }

                    if (word === "~" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                "**Shuffle (`~`)**: Randomly selects an option each time.\n\nExample:\n```ink\nI tossed the coin. {~Heads|Tails}\n```",
                            ),
                        );
                    }
                }

                // Hover for "|" (always, unless it is escaped as \| )
                if (word === "|" && !isEscaped(line, position.character)) {
                    return new Hover(
                        new MarkdownString(
                            "**Alternative separator (`|`)**: Used to separate alternative pieces of text (commonly inside `{}`).\n\nExample:\n```ink\n{Hello|Hi|Hey}\n```\nThis can output *Hello*, *Hi*, or *Hey* depending on the alternative type.\n\nTo write a literal `|`, escape it as `\\|`.",
                        ),
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
                                    "**Choice (`*`)**: Offers the player a one-time choice. Flows to the next line after selection.",
                                ),
                            );
                        }
                        if (char === "+") {
                            return new Hover(
                                new MarkdownString(
                                    "**Sticky Choice (`+`)**: Same as `*`, but reusable (remains available even after being chosen).",
                                ),
                            );
                        }
                        if (char === "-") {
                            return new Hover(
                                new MarkdownString(
                                    "**Gather (`-`)**: Collects multiple branches back into a single flow point.",
                                ),
                            );
                        }
                    }
                }

                // Only show knot comment popup when the word is used as a knot reference:
                // a divert (-> word), inside curly braces {word}, or on a knot/stitch definition line.
                // Plain narrative text that happens to share a knot name should not trigger the popup.
                const wordStartChar = range ? range.start.character : position.character;
                const beforeWord = line.substring(0, wordStartChar);
                const isKnotReferenceContext =
                    /^\s*=/.test(line) || // knot/stitch definition line (=== name === or = stitch)
                    /->\s*$/.test(beforeWord) || // immediately preceded by a divert arrow
                    isInsideVariableText(document, position); // inside { }

                if (isKnotReferenceContext) {
                    const commentLines = getKnotComment(document, word);
                    if (commentLines) {
                        return commentLines;
                    }
                }

                return;
            },
        }),
    );

    // Semantic token provider: color matched [ ] pairs in normal text when engine is pixi-vn
    context.subscriptions.push(
        languages.registerDocumentSemanticTokensProvider(
            { language: "ink" },
            {
                onDidChangeSemanticTokens: onDidChangeSemanticTokensEmitter.event,
                provideDocumentSemanticTokens(document) {
                    const engine = workspace
                        .getConfiguration("ink")
                        .get<"Inky" | "pixi-vn">("engine", "Inky");
                    const builder = new SemanticTokensBuilder(bracketTokenLegend);
                    if (engine !== "pixi-vn") {
                        return builder.build();
                    }

                    let inBlockComment = false;
                    for (let i = 0; i < document.lineCount; i++) {
                        const line = document.lineAt(i).text;
                        const { segments, inComment: newState } = getUncommentedSegments(
                            line,
                            inBlockComment,
                        );
                        inBlockComment = newState;

                        if (segments.length === 0) continue;

                        // Determine the line type from the first processable text segment.
                        // When the first segment starts at offset 0 the full-line prefix governs
                        // the type (choice, knot declaration, etc.).  When offset > 0 the line
                        // was starting inside a block comment, so inspect the segment text itself.
                        const firstSeg = segments[0];
                        const typeCheckText = firstSeg.offset === 0 ? line : firstSeg.text;
                        if (!isNormalTextLine(typeCheckText)) continue;

                        for (const { text: segmentText, offset } of segments) {
                            const positions = findMatchingBracketsInNormalText(segmentText);
                            for (const pos of positions) {
                                builder.push(i, offset + pos, 1, 0, 0);
                            }
                        }
                    }
                    return builder.build();
                },
            },
            bracketTokenLegend,
        ),
    );
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isEndDoneHoverContext(line: string, wordStartChar: number) {
    return /->\s*$/.test(line.substring(0, wordStartChar));
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

    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
    }
    const commentLines = collectCommentAbove(lines, targetLine);
    if (!commentLines.length) return;

    const cleaned = commentLines
        .map((l) =>
            l
                .replace(/^\/\*\*?/, "")
                .replace(/\*\/$/, "")
                .replace(/^\s*\*\s?/, "")
                .trim(),
        )
        .filter(Boolean)
        .join("\n");

    if (!cleaned) return;

    return new Hover(new MarkdownString(cleaned));
}

/**
 * Walks backwards from `lineNumber` (exclusive) through `lines` and collects
 * lines that form a block comment (/** ... *\/) immediately above that line.
 *
 * Only lines that are actually inside a block comment are collected:
 * - The closing tag marks the start of a comment block (scanning backwards).
 * - Lines beginning with `*` are accepted only once a closing tag has been seen,
 *   so that ink choice lines (e.g. `* [Go to Paris]`) are never mistaken
 *   for JSDoc continuation lines.
 * - The opening tag ends the collection.
 * - A single-line block comment is also accepted.
 * - Blank lines between the knot/stitch declaration and the comment are skipped.
 */
export function collectCommentAbove(lines: string[], lineNumber: number): string[] {
    const comments: string[] = [];
    let inCommentBlock = false;
    for (let i = lineNumber - 1; i >= 0; i--) {
        const text = lines[i].trim();
        if (text.startsWith("/**") && text.endsWith("*/")) {
            // Single-line block comment: /** … */
            comments.unshift(text);
            break;
        } else if (text.startsWith("*/")) {
            inCommentBlock = true;
            comments.unshift(text);
        } else if (text.startsWith("/**")) {
            // Opening of a multi-line block comment
            if (inCommentBlock) {
                comments.unshift(text);
            }
            break;
        } else if (text.startsWith("*") && inCommentBlock) {
            // Continuation line inside /** … */ block
            comments.unshift(text);
        } else if (text === "") {
            // Skip blank lines between the declaration and the comment
        } else {
            break;
        }
    }
    return comments;
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

/**
 * Returns true when the character at `position` is the type-specifier of a
 * variable-text block (`~` shuffle, `&` cycle, `!` once-only).  The specifier
 * is valid only when it is the very first non-whitespace character after the
 * innermost unescaped `{` that precedes `position`.
 *
 * Examples:
 *   `{&Monday|…}`   → true  (& at pos 1)
 *   `{ ~Heads|…}`   → true  (~ at pos 2, only whitespace between { and ~)
 *   `{TEST~|TEST&|}` → false (~ and & are preceded by non-whitespace text)
 */
export function isVariableTextTypeSpecifier(line: string, position: number): boolean {
    // Walk backwards to find the innermost unescaped { before position.
    let depth = 0;
    let innermostOpenBrace = -1;
    for (let i = position - 1; i >= 0; i--) {
        if (line[i] === "}" && (i === 0 || line[i - 1] !== "\\")) {
            depth++;
        } else if (line[i] === "{" && (i === 0 || line[i - 1] !== "\\")) {
            if (depth === 0) {
                innermostOpenBrace = i;
                break;
            }
            depth--;
        }
    }

    if (innermostOpenBrace < 0) return false;

    // The specifier must be the first non-whitespace character after the {.
    const between = line.substring(innermostOpenBrace + 1, position);
    return /^\s*$/.test(between);
}

function isEscaped(line: string, position: number): boolean {
    // true if the character at `position` is preceded by a backslash
    return position > 0 && line[position - 1] === "\\";
}

/**
 * Returns true when `line` is a "normal text" line in ink — i.e. not a choice,
 * knot declaration, logic line, comment, include, or variable declaration.
 * Used by the pixi-vn semantic-token provider to decide which lines can contain
 * coloured square brackets.
 */
export function isNormalTextLine(line: string): boolean {
    const trimmed = line.trimStart();
    if (trimmed === "") return false;
    // Single-line comments
    if (trimmed.startsWith("//")) return false;
    // Block-comment openers (multi-line tracking is handled in the caller)
    if (trimmed.startsWith("/*")) return false;
    // Choice lines (* or +, possibly repeated with spaces)
    if (/^[*+]/.test(trimmed)) return false;
    // Knot / stitch declarations
    if (trimmed.startsWith("=")) return false;
    // Tilde logic
    if (trimmed.startsWith("~")) return false;
    // INCLUDE / VAR / CONST / LIST declarations
    if (/^(INCLUDE|VAR|CONST|LIST)\b/.test(trimmed)) return false;
    return true;
}

/**
 * Returns the character positions of every `[` and `]` that form a matched
 * pair on `line`, respecting nesting (innermost pairs resolved first).
 * Escaped brackets (`\[`, `\]`) are ignored.
 *
 * Example: `"Hello [a [b] c]"` → [9, 11, 6, 14]
 */
export function findMatchingBracketsInNormalText(line: string): number[] {
    const positions: number[] = [];
    const stack: number[] = [];

    for (let i = 0; i < line.length; i++) {
        if (line[i] === "[" && !isEscaped(line, i)) {
            stack.push(i);
        } else if (line[i] === "]" && !isEscaped(line, i)) {
            const open = stack.pop();
            if (open !== undefined) {
                positions.push(open);
                positions.push(i);
            }
        }
    }

    return positions;
}

/**
 * Splits `line` into text segments that lie outside of block comments,
 * carrying the original character offset of each segment so callers can map
 * positions back to the original line.  `inBlockComment` is the state at the
 * start of the line; the returned `inComment` reflects the state at the end.
 */
function getUncommentedSegments(
    line: string,
    inBlockComment: boolean,
): { segments: { text: string; offset: number }[]; inComment: boolean } {
    const segments: { text: string; offset: number }[] = [];
    let i = 0;
    let inCmnt = inBlockComment;

    while (i < line.length) {
        if (inCmnt) {
            const closeIdx = line.indexOf("*/", i);
            if (closeIdx < 0) break; // rest of line is inside the comment
            inCmnt = false;
            i = closeIdx + 2;
        } else {
            const openIdx = line.indexOf("/*", i);
            if (openIdx < 0) {
                segments.push({ text: line.substring(i), offset: i });
                break;
            }
            if (openIdx > i) {
                segments.push({ text: line.substring(i, openIdx), offset: i });
            }
            inCmnt = true;
            i = openIdx + 2;
        }
    }

    return { segments, inComment: inCmnt };
}
