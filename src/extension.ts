import {
    DecorationRangeBehavior,
    type DecorationOptions,
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
    type TextEditor,
    ThemeColor,
    window,
    workspace,
} from "vscode";
import { checkIncludes, checkPixiVnUnimplementedFunctions, updateDiagnostics } from "./diagnostics";
import { inkFoldingRangeProvider } from "./folding";
import { findMarkdownTokenRanges } from "./markdown";
import { BUILTIN_FUNCTIONS, isBuiltinFunctionCallContext } from "./utils/builtin-functions";
import { collectCommentAbove } from "./utils/comments";
import { includeCtrlClick, suggestionsInclude } from "./utils/include-utility";
import { previewCommand, runProjectCommand } from "./webview";

export { collectCommentAbove } from "./utils/comments";

// Legend for the pixi-vn bracket semantic tokens (uses the built-in "keyword" type so it
// shares the theme colour already used by choice brackets in the TextMate grammar).
const bracketTokenLegend = new SemanticTokensLegend(["keyword"], []);
const declaredSymbolRegexCache = new Map<string, RegExp>();

// Hover text for the VAR / CONST / LIST declaration keywords, documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
export const DECLARATION_KEYWORD_DOCS: Record<string, string> = {
    VAR: '**VAR**: Declares a global variable, accessible and modifiable from anywhere in the story. It must be given an initial value — an integer, float, string, boolean, or divert target — which determines its type.\n\nExample:\n```ink\nVAR knowledge_of_the_cure = false\nVAR players_name = "Emilia"\n```',
    CONST: "**CONST**: Declares a global constant: a named value that can never be changed at runtime. Useful for giving readable names to values used in comparisons and lookups.\n\nExample:\n```ink\nCONST MAX_HEALTH = 100\n```",
    LIST: "**LIST**: Declares a list — an enumeration of named values that double as on/off flags (a *set*). List variables can be tested, combined, and compared much like mathematical sets, and can also be used as simple state machines.\n\nExample:\n```ink\nLIST DoctorsInSurgery = Adams, Bernard, (Cartwright)\n```",
};

// Hover text for the `->` divert arrow (and its `->->` tunnel-return form), keyed by
// the role a specific arrow plays — see getDivertArrowHoverKind. Documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
export const DIVERT_ARROW_DOCS: Record<string, string> = {
    divert: '**Divert (`->`)**: Moves the story immediately to another knot, stitch, or gather, with no user input required — it can even happen invisibly, mid-sentence. Diverts can also pass arguments, e.g. `-> accuse("Hastings")`.\n\nExample:\n```ink\n=== hurry_home ===\nWe hurried home -> as_fast_as_we_could\n\n=== as_fast_as_we_could ===\nas fast as we could.\n```',
    tunnelCall:
        '**Tunnel call (`-> knot ->`)**: Diverts into `knot` as a *tunnel* rather than a plain divert — it remembers where it came from, so a `->->` reached inside `knot` returns control right back here instead of leaving for good.\n\nExample:\n```ink\n-> crossing_the_date_line ->\nWe continue on, once the tunnel returns.\n\n=== crossing_the_date_line ===\nWe crossed the date line, gaining a whole day!\n->->\n```',
    tunnelReturnPoint:
        '**Tunnel return point (the second `->` in `-> knot ->`)**: Marks this as a tunnel call rather than a plain divert — once `knot` reaches a `->->`, the flow resumes right after this arrow instead of stopping inside `knot`.\n\nExample:\n```ink\n-> crossing_the_date_line ->\nWe continue on, once the tunnel returns.\n```',
    tunnelOnward:
        '**Tunnel onward (`-> knot -> next`)**: Calls `knot` as a tunnel, but once it returns with a `->->`, continues at `next` instead of resuming right after this line.\n\nExample:\n```ink\n-> crossing_the_date_line -> check_foggs_health\n```',
    tunnelReturn:
        '**Tunnel return (`->->`)**: Returns from the tunnel that was called to reach here, resuming the flow right after the `-> knot ->` that invoked it — like a function return, unlike a plain divert, which never comes back.\n\nExample:\n```ink\n=== crossing_the_date_line ===\nWe crossed the date line, gaining a whole day!\n->->\n```',
    tunnelReturnElsewhere:
        '**Tunnel return, elsewhere (`->-> destination`)**: Leaves the tunnel entirely — instead of resuming right after the `-> knot ->` that called it, the flow jumps straight to `destination`. Use sparingly; it\'s easy to lose track of where control actually ends up.\n\nExample:\n```ink\n=== fall_down_cliff ===\n-> hurt(5) ->\nYou\'re still alive! You pick yourself up and walk on.\n\n=== hurt(x) ===\n~ stamina -= x\n{ stamina <= 0:\n\t->-> youre_dead\n}\n\n=== youre_dead ===\nSuddenly, there is a white light all around you.\n```',
    divertTargetValue:
        '**Divert target (as a value)**: Here `-> name` isn\'t an immediate jump — it\'s a *divert target*, a storable value naming a location, being passed as an argument, assigned to a variable, or compared. The receiving parameter/variable must be explicitly typed as a divert target, so it isn\'t confused with a read count.\n\nExample:\n```ink\nVAR current_epilogue = -> everybody_dies\n\n=== sleeping_in_hut ===\nYou lie down and close your eyes.\n-> generic_sleep(-> waking_in_the_hut)\n\n=== generic_sleep(-> waking)\nYou sleep, perchance to dream...\n-> waking\n```',
};

// A `->` immediately adjacent (no space) to another `->` is one half of a `->->`
// tunnel-return statement, not a plain divert arrow.
export function isTunnelReturnArrow(line: string, arrowStart: number): boolean {
    return (
        line.substring(arrowStart, arrowStart + 4) === "->->" ||
        (arrowStart >= 2 && line.substring(arrowStart - 2, arrowStart) === "->")
    );
}

// Given that `arrowStart` is one half of a `->->` pair (isTunnelReturnArrow is true),
// returns the destination name written right after it, e.g. `youre_dead` in
// `->-> youre_dead` — this is a *different* statement from a bare `->->`: it leaves
// the tunnel for that destination instead of resuming at the original call site.
export function getTunnelReturnDestination(line: string, arrowStart: number): string | undefined {
    const pairEnd = line.substring(arrowStart, arrowStart + 4) === "->->" ? arrowStart + 4 : arrowStart + 2;
    return line.substring(pairEnd).match(/^\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?)/)?.[1];
}

// A `->` is used as a value rather than executed when it's a function/knot argument
// (preceded by `(` or `,`) or the right-hand side of an assignment/comparison
// (preceded by `=`), e.g. `Foo(-> knot)` or `VAR x = -> knot`.
export function isDivertTargetValueContext(beforeArrow: string): boolean {
    return /[(,=]\s*$/.test(beforeArrow);
}

// A tunnel call written on one line: `-> knot ->` or `-> knot -> destination`,
// optionally with a parameter list and/or a trailing comment.
const TUNNEL_CALL_LINE_REGEX =
    /^\s*->\s*[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?\s*(?:\([^()]*\))?\s*->\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)?)?\s*(?:\/\/.*)?$/;

export function getTunnelCallLineDestination(line: string): { isTunnelCallLine: boolean; destination?: string } {
    const match = line.match(TUNNEL_CALL_LINE_REGEX);
    if (!match) return { isTunnelCallLine: false };
    return { isTunnelCallLine: true, destination: match[1] };
}

/**
 * Classifies the `->` at `arrowStart` on `line` into a key of DIVERT_ARROW_DOCS,
 * so the hover popup explains the specific role this arrow plays: a plain jump,
 * a tunnel call/return, or a divert target used as a value rather than executed.
 */
export function getDivertArrowHoverKind(line: string, arrowStart: number): keyof typeof DIVERT_ARROW_DOCS {
    if (isTunnelReturnArrow(line, arrowStart)) {
        return getTunnelReturnDestination(line, arrowStart) ? "tunnelReturnElsewhere" : "tunnelReturn";
    }

    if (isDivertTargetValueContext(line.substring(0, arrowStart))) return "divertTargetValue";

    const tunnelLine = getTunnelCallLineDestination(line);
    if (tunnelLine.isTunnelCallLine) {
        const firstArrowStart = line.indexOf("->");
        if (arrowStart !== firstArrowStart) {
            return tunnelLine.destination ? "tunnelOnward" : "tunnelReturnPoint";
        }
        return "tunnelCall";
    }

    return "divert";
}

// Hover text for the word-form type keywords of a multiline `{ keyword: - a - b }`
// alternatives block, keyed by the exact phrase (see getMultilineBlockTypeKeywordAt).
// These are the written-out equivalents of the `&`/`!`/`~` shorthand symbols, plus
// the two combined shuffle forms. Documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
export const MULTILINE_BLOCK_TYPE_DOCS: Record<string, string> = {
    stopping:
        "**Sequence (`{ stopping: ...}`)**: Shows the next alternative each time this point is reached, moving through them in order, then keeps repeating the last one once they've all been shown. This is also what a plain `{A|B|C}` sequence with no type keyword does.\n\nExample:\n```ink\n{ stopping:\n-\tI entered the casino.\n-\tI entered the casino again.\n-\tOnce more, I went inside.\n}\n```",
    cycle: "**Cycle (`{ cycle: ...}`)**: Shows the next alternative each time this point is reached, moving through them in order, then loops back to the first one once they've all been shown — same as the `&` shorthand.\n\nExample:\n```ink\n{ cycle:\n-\tI held my breath.\n-\tI waited impatiently.\n-\tI paused.\n}\n```",
    once: "**Once-only (`{ once: ...}`)**: Shows each alternative once, in order, then shows nothing once they've all been used up — same as the `!` shorthand.\n\nExample:\n```ink\n{ once:\n-\tWould my luck hold?\n-\tCould I win the hand?\n}\n```",
    shuffle:
        "**Shuffle (`{ shuffle: ...}`)**: Shows one alternative at random each time this point is reached, and can repeat entries — same as the `~` shorthand.\n\nExample:\n```ink\n{ shuffle:\n-\tAce of Hearts.\n-\tKing of Spades.\n-\t2 of Diamonds.\n}\n```",
    "shuffle once":
        "**Shuffle once (`{ shuffle once: ...}`)**: Shuffles the alternatives, plays through all of them exactly once with no repeats, then shows nothing once they run out.\n\nExample:\n```ink\n{ shuffle once:\n-\tThe sun was hot.\n-\tIt was a hot day.\n}\n```",
    "shuffle stopping":
        "**Shuffle stopping (`{ shuffle stopping: ...}`)**: Shuffles all but the last alternative and plays through them, then sticks on that last entry for good once the shuffled ones run out.\n\nExample:\n```ink\n{ shuffle stopping:\n-\tA silver BMW roars past.\n-\tA bright yellow Mustang takes the turn.\n-\tThere are like, cars, here.\n}\n```",
};

const MULTILINE_BLOCK_TYPE_REGEX = /^(stopping|shuffle(?:\s+(?:once|stopping))?|cycle|once)\s*:/;

/**
 * Returns the multiline-block type keyword phrase (a key of MULTILINE_BLOCK_TYPE_DOCS)
 * that `position` falls inside of, e.g. the `shuffle once` in `{ shuffle once: ... }`.
 * Only matches when the phrase is the first thing after an unescaped `{` (with only
 * whitespace in between) and is followed by `:` — narrative text that happens to
 * contain one of these words doesn't count.
 */
export function getMultilineBlockTypeKeywordAt(line: string, position: number): string | undefined {
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

    if (innermostOpenBrace < 0) return undefined;

    const afterBrace = line.substring(innermostOpenBrace + 1);
    const leadingWhitespace = afterBrace.match(/^\s*/)?.[0].length ?? 0;
    const match = afterBrace.substring(leadingWhitespace).match(MULTILINE_BLOCK_TYPE_REGEX);
    if (!match) return undefined;

    const phraseStart = innermostOpenBrace + 1 + leadingWhitespace;
    const phraseEnd = phraseStart + match[1].length;
    if (position < phraseStart || position >= phraseEnd) return undefined;

    return match[1];
}

export function activate(context: ExtensionContext) {
    // Register the command to open the Ink Preview webview

    context.subscriptions.push(previewCommand(context));
    context.subscriptions.push(runProjectCommand(context));

    // Emitter used to tell VS Code to re-compute semantic tokens when the engine setting changes
    const onDidChangeSemanticTokensEmitter = new EventEmitter<void>();
    context.subscriptions.push(onDidChangeSemanticTokensEmitter);
    const markdownItalicDecoration = window.createTextEditorDecorationType({
        fontStyle: "italic",
        rangeBehavior: DecorationRangeBehavior.ClosedClosed,
    });
    const markdownBoldDecoration = window.createTextEditorDecorationType({
        fontWeight: "bold",
        rangeBehavior: DecorationRangeBehavior.ClosedClosed,
    });
    const markdownNewlineDecoration = window.createTextEditorDecorationType({
        color: new ThemeColor("symbolIcon.constantForeground"),
        rangeBehavior: DecorationRangeBehavior.ClosedClosed,
    });
    context.subscriptions.push(markdownItalicDecoration, markdownBoldDecoration, markdownNewlineDecoration);

    const refreshMarkdownDecorations = (editor?: TextEditor) => {
        if (editor?.document.languageId !== "ink") return;

        const markup = workspace.getConfiguration("ink").get<string | null>("markup", null);
        if (markup !== "Markdown") {
            editor.setDecorations(markdownItalicDecoration, []);
            editor.setDecorations(markdownBoldDecoration, []);
            editor.setDecorations(markdownNewlineDecoration, []);
            return;
        }

        const italicRanges: Range[] = [];
        const boldRanges: Range[] = [];
        const newlineRanges: DecorationOptions[] = [];
        let inBlockComment = false;

        for (let i = 0; i < editor.document.lineCount; i++) {
            const line = editor.document.lineAt(i).text;
            const { segments, inComment: newState } = getUncommentedSegments(line, inBlockComment);
            inBlockComment = newState;

            if (segments.length === 0) continue;

            const firstSeg = segments[0];
            // When text starts at column 0 the full line prefix determines whether it is
            // narrative text or ink syntax. If the line began inside a block comment,
            // only inspect the first visible segment after the comment closes.
            const scanStart = getMarkdownScanStart(firstSeg.offset === 0 ? line : firstSeg.text);
            if (scanStart === null) continue;

            const absoluteScanStart = firstSeg.offset + scanStart;

            for (const { text: segmentText, offset } of segments) {
                const localScanStart = Math.max(0, absoluteScanStart - offset);
                if (localScanStart >= segmentText.length) continue;

                const markdownRanges = findMarkdownTokenRanges(segmentText.substring(localScanStart));
                for (const range of markdownRanges.italic) {
                    italicRanges.push(
                        new Range(i, offset + localScanStart + range.start, i, offset + localScanStart + range.end),
                    );
                }
                for (const range of markdownRanges.bold) {
                    boldRanges.push(
                        new Range(i, offset + localScanStart + range.start, i, offset + localScanStart + range.end),
                    );
                }
                for (const range of markdownRanges.newlines) {
                    newlineRanges.push({
                        range: new Range(
                            i,
                            offset + localScanStart + range.start,
                            i,
                            offset + localScanStart + range.end,
                        ),
                        hoverMessage: new MarkdownString("`\\n`: inserts a line break."),
                    });
                }
            }
        }

        editor.setDecorations(markdownItalicDecoration, italicRanges);
        editor.setDecorations(markdownBoldDecoration, boldRanges);
        editor.setDecorations(markdownNewlineDecoration, newlineRanges);
    };

    const refreshVisibleMarkdownDecorations = () => {
        for (const editor of window.visibleTextEditors) {
            refreshMarkdownDecorations(editor);
        }
    };

    // Initial diagnostics for all open ink files

    const diagnostics = languages.createDiagnosticCollection("ink");
    context.subscriptions.push(diagnostics);

    const refreshDiagnostics = (doc: TextDocument) => {
        const list: Diagnostic[] = [];
        updateDiagnostics(doc, list);
        checkIncludes(doc, list);
        checkPixiVnUnimplementedFunctions(doc, list);
        diagnostics.set(doc.uri, list);
    };

    for (const doc of workspace.textDocuments) {
        if (doc.languageId === "ink") {
            refreshDiagnostics(doc);
        }
    }

    // Listen for configuration changes

    workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("ink.engine")) {
            const newEngine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
            window.showInformationMessage(`Engine changed to ${newEngine}`);
            onDidChangeSemanticTokensEmitter.fire();
            for (const doc of workspace.textDocuments) {
                if (doc.languageId === "ink") {
                    refreshDiagnostics(doc);
                }
            }
        }
        if (event.affectsConfiguration("ink.markup")) {
            const newMarkup = workspace.getConfiguration("ink").get<string | null>("markup", null);
            window.showInformationMessage(`Markup changed to ${newMarkup ?? "none"}`);
            refreshVisibleMarkdownDecorations();
        }
    });

    workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "ink") {
            refreshDiagnostics(doc);
        }
    });

    workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId === "ink") {
            refreshDiagnostics(e.document);

            for (const editor of window.visibleTextEditors) {
                if (editor.document === e.document) {
                    refreshMarkdownDecorations(editor);
                }
            }
        }
    });

    workspace.onDidCloseTextDocument((doc) => {
        diagnostics.delete(doc.uri);
    });
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            refreshMarkdownDecorations(editor);
        }),
        window.onDidChangeVisibleTextEditors(() => {
            refreshVisibleMarkdownDecorations();
        }),
    );

    const diagnosticCollection = languages.createDiagnosticCollection("ink");
    context.subscriptions.push(diagnosticCollection);

    // CTRL+CLICK support for INCLUDE statements
    const includeProvider = includeCtrlClick();
    context.subscriptions.push(languages.registerDefinitionProvider({ language: "ink" }, includeProvider));

    // Folding for knot/stitch/function headers, keeping trailing exit diverts visible
    context.subscriptions.push(
        languages.registerFoldingRangeProvider({ language: "ink" }, inkFoldingRangeProvider()),
    );

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
                let range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_]+|->|<>|<-|\*|\+|-/);

                // Handle single special characters separately
                const char = line[position.character];
                if ("&!~|[]".includes(char) && !isEscaped(line, position.character)) {
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
                                new MarkdownString(
                                    '**END (`-> END`)**: Ends the story flow immediately and completely — no further choices or content, nothing to resume. Use it when a storyline (or the whole game) is genuinely over; diverting here without it produces an "out of content" warning.\n\nExample:\n```ink\n=== top_knot ===\nHello world!\n-> END\n```',
                                ),
                            );
                        }
                        return new Hover(
                            new MarkdownString(
                                '**DONE (`-> DONE`)**: Marks the current thread or weave as intentionally finished, without stopping the whole story — the engine falls back to any other running thread instead of raising an "out of content" warning. At the top level (outside a thread), it behaves the same as `-> END`.\n\nExample:\n```ink\n== conversation ==\n"Hello!" I said.\n-> DONE\n```',
                            ),
                        );
                    }
                }

                // Hover for divert arrow -> (but not an escaped \->, which is literal text).
                // What it means varies by context: a plain jump, a tunnel call/return, or a
                // divert target used as a value — see getDivertArrowHoverKind.
                if (word === "->" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(
                        new MarkdownString(DIVERT_ARROW_DOCS[getDivertArrowHoverKind(line, range.start.character)]),
                    );
                }

                // Hover for glue <> (but not escaped \<>)
                if (word === "<>" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(
                        new MarkdownString(
                            '**Glue (`<>`)**: Suppresses the automatic line-break that would otherwise be inserted before this content, joining it to whatever text came right before. You can\'t "un-stick" a line once glued, and stacking multiple glues has no extra effect.\n\nExample:\n```ink\nWe hurried home <>\n-> to_savile_row\n\n=== to_savile_row ===\nto Savile Row.\n```',
                        ),
                    );
                }

                // Hover for thread <- (but not escaped \<-)
                if (word === "<-" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(
                        new MarkdownString(
                            '**Thread (`<-`)**: Pulls the content and choices of another knot/stitch into the current flow, as if written right here, without leaving the current flow the way a divert does. Useful for weaving choices gathered from several different knots into one combined list.\n\nExample:\n```ink\n=== welcome ===\nI had a headache; threading is hard to get your head around.\n<- conversation\n<- walking\n\n= conversation\n*\t"What did you have for lunch?"\n\t"Spam and eggs," he replied.\n-\t-> house\n\n= walking\n*\t[Continue walking]\n\t-> house\n\n= house\nBefore long, we arrived at his house.\n-> END\n```',
                        ),
                    );
                }

                // Hover for the VAR / CONST / LIST declaration keywords, only when the
                // word actually opens the declaration line (not a coincidental match).
                if (word in DECLARATION_KEYWORD_DOCS && range && isDeclarationKeywordContext(line, range.start.character)) {
                    return new Hover(new MarkdownString(DECLARATION_KEYWORD_DOCS[word]));
                }

                // Hover for the logic tilde (~) at the start of a logic line, e.g. `~ x = 1`.
                // Distinct from the shuffle `~` type-specifier inside `{ }`, handled below.
                if (
                    word === "~" &&
                    range &&
                    !isEscaped(line, range.start.character) &&
                    !isInsideVariableText(document, position) &&
                    isTildeLogicContext(line, range.start.character)
                ) {
                    return new Hover(
                        new MarkdownString(
                            "**Logic (`~`)**: Marks the line as pure logic — an assignment, function call, or other statement — rather than story text. The line itself is never printed.\n\nExample:\n```ink\n~ x = 5\n~ myFunction()\n```",
                        ),
                    );
                }

                // Hover for choice brackets [ ] (only inside a choice line's option text).
                if (
                    (word === "[" || word === "]") &&
                    range &&
                    !isEscaped(line, range.start.character) &&
                    isChoiceBracketContext(line)
                ) {
                    return new Hover(
                        new MarkdownString(
                            "**Choice brackets (`[` `]`)**: Divide an option's text into three parts. Text *before* the brackets is shown both as the choice and in the resulting output; text *inside* the brackets is shown only in the choice; text *after* the brackets is shown only in the output.\n\nExample:\n```ink\n*\tHello [back!] right back to you!\n\tNice to hear from you!\n```\nChoosing this produces the choice `Hello back!`, then the output `Hello right back to you! Nice to hear from you!`.\n\nIf the option has *only* bracketed text, it disappears from the output once chosen:\n```ink\n*\t[Hello back!]\n\tNice to hear from you!\n```",
                        ),
                    );
                }

                // Hover for built-in ink functions (RANDOM, SEED_RANDOM, LIST_COUNT, etc.),
                // only when the word is actually being called as a function.
                if (word in BUILTIN_FUNCTIONS && range && isBuiltinFunctionCallContext(line, range.end.character)) {
                    return new Hover(new MarkdownString(BUILTIN_FUNCTIONS[word]));
                }

                // Hover for the word-form type keywords of a multiline alternatives block
                // (e.g. `{ stopping:`, `{ shuffle once:`) — the written-out equivalents of
                // the ~/&/! shorthand symbols handled below.
                if (["stopping", "shuffle", "cycle", "once"].includes(word) && range) {
                    const multilineKeyword = getMultilineBlockTypeKeywordAt(line, range.start.character);
                    if (multilineKeyword) {
                        return new Hover(new MarkdownString(MULTILINE_BLOCK_TYPE_DOCS[multilineKeyword]));
                    }
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

                // Hover for the `-` that introduces a branch of a conditional/switch
                // block inside `{ }` (e.g. `- x > 0:` or `- else:`). Visually identical
                // to a weave gather, but semantically different — checked first so it
                // takes priority over the plain Gather hover below.
                if (
                    char === "-" &&
                    !isEscaped(line, position.character) &&
                    isConditionalBranchDash(line, position.character) &&
                    isInsideCurlyBraceBlock(document, position)
                ) {
                    return new Hover(
                        new MarkdownString(
                            "**Conditional branch (`-`)**: Introduces one branch of a multi-clause `{ }` conditional or switch block. Branches are tried in order, and only the first one whose condition matches runs; `- else:` catches anything not matched above.\n\nExample:\n```ink\n{ x:\n- 0: zero\n- 1: one\n- else: lots\n}\n```",
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
                                    "**Choice (`*`)**: Offers the player a one-time option. Once chosen it's used up and won't be offered again on a later visit; by default its text is echoed into the output, then the flow continues into whatever follows.\n\nExample:\n```ink\nHello world!\n*\tHello back!\n\tNice to hear from you!\n```",
                                ),
                            );
                        }
                        if (char === "+") {
                            return new Hover(
                                new MarkdownString(
                                    "**Sticky Choice (`+`)**: Like `*`, but never gets used up — it stays available even after being picked, which makes it useful for loops and repeatable actions.\n\nExample:\n```ink\n=== homers_couch ===\n+\t[Eat another donut]\n\tYou eat another donut. -> homers_couch\n*\t[Get off the couch]\n\t-> END\n```",
                                ),
                            );
                        }
                        if (char === "-") {
                            return new Hover(
                                new MarkdownString(
                                    '**Gather (`-`)**: Collects the different branches of a set of choices back into a single point, so the story continues on a shared path no matter which option was picked. Can be labelled (e.g. `- (top)`) so it can be diverted to or tested later.\n\nExample:\n```ink\n*\t"Murder!"\n*\t"Suicide!"\n-\tMrs Christie lowered her manuscript a moment.\n```',
                                ),
                            );
                        }
                    }
                }

                const declarationHover = getDeclaredSymbolHover(document, word);
                if (declarationHover && range && isDeclaredSymbolHoverContext(document, position, line)) {
                    return declarationHover;
                }

                // Only show knot comment popup when the word is used as a knot reference:
                // a divert or thread (-> word / <- word), inside curly braces {word}, or on a
                // knot/stitch definition line. Plain narrative text that happens to share a knot
                // name should not trigger the popup.
                const wordStartChar = range ? range.start.character : position.character;
                const beforeWord = line.substring(0, wordStartChar);
                const isKnotReferenceContext =
                    /^\s*=/.test(line) || // knot/stitch definition line (=== name === or = stitch)
                    isPrecededByUnescapedDivert(line, beforeWord) || // immediately preceded by a real divert arrow
                    isPrecededByUnescapedDivertToKnot(line, beforeWord) || // -> knot.stitch, hovering the stitch part
                    isPrecededByUnescapedThread(line, beforeWord) || // immediately preceded by a real thread arrow
                    isPrecededByUnescapedThreadToKnot(line, beforeWord) || // <- knot.stitch, hovering the stitch part
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

    refreshVisibleMarkdownDecorations();
}

function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isEndDoneHoverContext(line: string, wordStartChar: number) {
    return isPrecededByUnescapedDivert(line, line.substring(0, wordStartChar));
}

/**
 * Returns true when `before` (a prefix of `line` ending right where a word
 * starts) ends with a real, unescaped divert arrow (optionally followed by
 * whitespace), e.g. `-> ` or `->`. An escaped arrow (`\->`) doesn't count —
 * it's literal text, not a real divert, so it shouldn't be treated as one.
 */
export function isPrecededByUnescapedDivert(line: string, before: string): boolean {
    const match = before.match(/->\s*$/);
    return !!match && match.index !== undefined && !isEscaped(line, match.index);
}

/**
 * Returns true when `before` ends with a real, unescaped divert arrow
 * followed by a knot name and a dot, e.g. `-> the_orient_express.` right
 * before the stitch part of a dotted `-> knot.stitch` divert target. This is
 * what makes hovering the *stitch* half of such a divert (not just the knot
 * half right after the arrow) still trigger the knot-comment popup.
 */
export function isPrecededByUnescapedDivertToKnot(line: string, before: string): boolean {
    const match = before.match(/->\s*[A-Za-z_][A-Za-z0-9_]*\.\s*$/);
    return !!match && match.index !== undefined && !isEscaped(line, match.index);
}

/**
 * Same as {@link isPrecededByUnescapedDivert}, but for a thread arrow (`<-`)
 * instead of a divert arrow (`->`).
 */
export function isPrecededByUnescapedThread(line: string, before: string): boolean {
    const match = before.match(/<-\s*$/);
    return !!match && match.index !== undefined && !isEscaped(line, match.index);
}

/**
 * Same as {@link isPrecededByUnescapedDivertToKnot}, but for a thread arrow
 * (`<-`) instead of a divert arrow (`->`), e.g. `<- knot.` right before the
 * stitch part of a dotted `<- knot.stitch` thread target.
 */
export function isPrecededByUnescapedThreadToKnot(line: string, before: string): boolean {
    const match = before.match(/<-\s*[A-Za-z_][A-Za-z0-9_]*\.\s*$/);
    return !!match && match.index !== undefined && !isEscaped(line, match.index);
}

/**
 * Returns a Hover with the comments associated with the knot or stitch
 * under the mouse cursor.
 */
export function getKnotComment(document: TextDocument, word: string) {
    if (!word.length) return;

    // Split word in case of knot.stitch
    const parts = word.split(".");
    const stitchName = parts.at(-1);
    if (!stitchName?.length) return;
    const parentKnotName = parts.at(-2);

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
    const cleaned = cleanCommentLines(commentLines);

    if (!cleaned) return;

    return new Hover(new MarkdownString(cleaned));
}

type DeclaredSymbolKind = "VAR" | "CONST";

export function findDeclaredSymbol(
    lines: string[],
    word: string,
): { kind: DeclaredSymbolKind; lineNumber: number } | undefined {
    if (!word.length) return;

    const declarationRegex = getDeclaredSymbolRegex(word);

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(declarationRegex);
        if (match?.[1] === "VAR" || match?.[1] === "CONST") {
            return {
                kind: match[1],
                lineNumber: i,
            };
        }
    }

    function getDeclaredSymbolRegex(word: string): RegExp {
        const cached = declaredSymbolRegexCache.get(word);
        if (cached) return cached;

        const created = new RegExp(`^\\s*(VAR|CONST)\\s+${escapeRegExp(word)}\\b`);
        declaredSymbolRegexCache.set(word, created);
        return created;
    }
}

export function getDeclaredSymbolHoverText(lines: string[], word: string): string | undefined {
    const declaration = findDeclaredSymbol(lines, word);
    if (!declaration) return;

    const sections: string[] = [];
    const cleanedComment = cleanCommentLines(collectCommentAbove(lines, declaration.lineNumber));

    if (cleanedComment) {
        sections.push(cleanedComment);
    }
    if (declaration.kind === "CONST") {
        sections.push("_Declared as `CONST`: this value is constant._");
    }

    if (!sections.length) return;

    return sections.join("\n\n");
}

export function getDeclaredSymbolHover(document: TextDocument, word: string) {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
    }

    const text = getDeclaredSymbolHoverText(lines, word);
    if (!text) return;

    return new Hover(new MarkdownString(text));
}

/**
 * Normalizes collected block-comment lines by removing the comment markers
 * and joining the remaining text into a markdown-friendly paragraph block.
 */
function cleanCommentLines(commentLines: string[]): string | undefined {
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

    return cleaned || undefined;
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

/**
 * Returns true when `wordStartChar` is where a VAR/CONST/LIST declaration
 * keyword begins the line (only whitespace precedes it), as opposed to the
 * keyword appearing elsewhere (e.g. matched incidentally further down the line).
 */
export function isDeclarationKeywordContext(line: string, wordStartChar: number): boolean {
    return /^\s*$/.test(line.substring(0, wordStartChar));
}

/**
 * Returns true when the `~` at `charPos` marks a logic line (e.g. `~ x = 1`),
 * i.e. it's the first non-whitespace character on the line. Distinct from the
 * shuffle `~` type-specifier, which only appears right after an opening `{`.
 */
export function isTildeLogicContext(line: string, charPos: number): boolean {
    return /^\s*$/.test(line.substring(0, charPos));
}

/**
 * Returns true when `line` is a choice line (starts with one or more `*`/`+`
 * bullets, possibly nested), i.e. the context where `[` `]` divide choice text
 * from output text. Mirrors the `choices` rule in ink.tmLanguage.json.
 */
export function isChoiceBracketContext(line: string): boolean {
    return /^\s*(?:[*+]\s*)+/.test(line);
}

/**
 * Returns true when the `-` at `dashChar` on `line` looks like it introduces a
 * branch of a `{ }` conditional/switch block (e.g. `- x > 0:`, `- else:`, or
 * `- 0: zero`), rather than a weave gather. Mirrors the two dash rules in the
 * `conditionalBlocks` grammar: either right after an opening `{` (only
 * whitespace in between), or at the very start of a line — and, either way,
 * followed later on the same line by the `:` that ends the branch condition.
 * Callers must additionally confirm the position is actually inside a `{ }`
 * block (see `isInsideCurlyBraceBlock`), since a weave gather can coincidentally
 * satisfy this shape too (e.g. `- "Well," she said: "go on."`).
 */
export function isConditionalBranchDash(line: string, dashChar: number): boolean {
    const before = line.substring(0, dashChar);
    const afterOpenBrace = /\{[ \t]*$/.test(before);
    const atLineStart = /^[ \t]*$/.test(before);
    if (!afterOpenBrace && !atLineStart) return false;

    // Not a divert arrow.
    if (line.substring(dashChar, dashChar + 2) === "->") return false;

    return line.indexOf(":", dashChar + 1) !== -1;
}

function countUnescapedBraceDelta(text: string): number {
    let delta = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "{" && (i === 0 || text[i - 1] !== "\\")) {
            delta++;
        } else if (text[i] === "}" && (i === 0 || text[i - 1] !== "\\")) {
            delta--;
        }
    }
    return delta;
}

function stripLineComment(text: string): string {
    const idx = text.indexOf("//");
    return idx === -1 ? text : text.substring(0, idx);
}

/**
 * Returns true when `character` on `lines[lineNumber]` sits inside a `{ }`
 * block that may have opened on an earlier line (e.g. a multi-line conditional
 * or switch block), by tracking unescaped brace depth from the start of the
 * document. Unlike `isInsideVariableText`, this looks across lines. Block
 * comments and `//` line comments are stripped before counting, so braces
 * mentioned in comments don't throw off the depth.
 */
export function isInsideCurlyBraceBlockAtLines(lines: string[], lineNumber: number, character: number): boolean {
    let depth = 0;
    let inBlockComment = false;
    for (let i = 0; i < lineNumber; i++) {
        const { segments, inComment } = getUncommentedSegments(lines[i], inBlockComment);
        inBlockComment = inComment;
        for (const { text } of segments) {
            depth += countUnescapedBraceDelta(stripLineComment(text));
        }
    }

    const { segments } = getUncommentedSegments(lines[lineNumber], inBlockComment);
    for (const { text, offset } of segments) {
        if (offset >= character) continue;
        const localEnd = Math.min(text.length, character - offset);
        depth += countUnescapedBraceDelta(stripLineComment(text.substring(0, localEnd)));
    }

    return depth > 0;
}

function isInsideCurlyBraceBlock(document: TextDocument, position: Position): boolean {
    const lines: string[] = [];
    for (let i = 0; i <= position.line; i++) {
        lines.push(document.lineAt(i).text);
    }
    return isInsideCurlyBraceBlockAtLines(lines, position.line, position.character);
}

export function isDeclaredSymbolHoverContext(document: TextDocument, position: Position, line: string): boolean {
    const trimmed = line.trimStart();
    if (/^(VAR|CONST)\b/.test(trimmed)) return true;
    if (trimmed.startsWith("~")) return true;
    if (isInsideVariableText(document, position)) return true;

    return /(==|!=|<=|>=|<|>|=|\+|-|\*|\/|%|\bmod\b|\bnot\b|\bor\b|\band\b)/.test(line);
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

function getMarkdownScanStart(line: string): number | null {
    const trimmed = line.trimStart();
    if (trimmed === "") return null;
    if (trimmed.startsWith("//")) return null;
    if (trimmed.startsWith("/*")) return null;
    if (trimmed.startsWith("=")) return null;
    if (trimmed.startsWith("~")) return null;
    if (/^(INCLUDE|VAR|CONST|LIST)\b/.test(trimmed)) return null;

    const choiceMatch = line.match(/^(\s*(?:[*+]\s*)+)/);
    if (choiceMatch) {
        return choiceMatch[1].length;
    }

    return 0;
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
