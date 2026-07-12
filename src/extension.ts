import {
    DecorationRangeBehavior,
    type DecorationOptions,
    type Diagnostic,
    EventEmitter,
    type ExtensionContext,
    Hover,
    l10n,
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
import { findMarkdownTokenRanges, type MarkdownRange } from "./markdown";
import { BUILTIN_FUNCTIONS, isBuiltinFunctionCallContext } from "./utils/builtin-functions";
import { collectCommentAbove } from "./utils/comments";
import {
    escapeRegExp,
    getTunnelCallLineDestination,
    getTunnelReturnDestination,
    getUncommentedSegments,
    isDeclaredSymbolHoverContext,
    isDivertTargetValueContext,
    isEscaped,
    isInsideCurlyBraceBlockAtLines,
    isInsideVariableText,
    isKnotReferenceContext,
    isPrecededByUnescapedDivert,
    isTunnelReturnArrow,
} from "./utils/divert-context";
import { includeCtrlClick, suggestionsInclude } from "./utils/include-utility";
import { knotRunCodeLensProvider } from "./utils/knot-codelens";
import { knotCompletionProvider, knotDefinitionProvider, registerInsertIncludeCommand } from "./utils/knot-utility";
import { previewCommand, runFromKnotCommand, runProjectCommand } from "./webview";

export { collectCommentAbove } from "./utils/comments";
export {
    getTunnelCallLineDestination,
    getTunnelReturnDestination,
    isDivertTargetValueContext,
    isInsideCurlyBraceBlockAtLines,
    isPrecededByUnescapedDivert,
    isPrecededByUnescapedDivertToKnot,
    isPrecededByUnescapedThread,
    isPrecededByUnescapedThreadToKnot,
    isTunnelReturnArrow,
} from "./utils/divert-context";

// Legend for the pixi-vn bracket semantic tokens (uses the built-in "keyword" type so it
// shares the theme colour already used by choice brackets in the TextMate grammar).
const bracketTokenLegend = new SemanticTokensLegend(["keyword"], []);
const declaredSymbolRegexCache = new Map<string, RegExp>();

// Hover text for the VAR / CONST / LIST declaration keywords, documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
export const DECLARATION_KEYWORD_DOCS: Record<string, string> = {
    VAR: l10n.t(
        '**VAR**: Declares a global variable, accessible and modifiable from anywhere in the story. It must be given an initial value — an integer, float, string, boolean, or divert target — which determines its type.\n\nExample:\n```ink\nVAR knowledge_of_the_cure = false\nVAR players_name = "Emilia"\n```',
    ),
    CONST: l10n.t(
        "**CONST**: Declares a global constant: a named value that can never be changed at runtime. Useful for giving readable names to values used in comparisons and lookups.\n\nExample:\n```ink\nCONST MAX_HEALTH = 100\n```",
    ),
    LIST: l10n.t(
        "**LIST**: Declares a list — an enumeration of named values that double as on/off flags (a *set*). List variables can be tested, combined, and compared much like mathematical sets, and can also be used as simple state machines.\n\nExample:\n```ink\nLIST DoctorsInSurgery = Adams, Bernard, (Cartwright)\n```",
    ),
};

// Hover text for the `ref` keyword in a knot/stitch/function's parameter list,
// documented in https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
const REF_PARAMETER_DOC = l10n.t(
    "**Parameter passed by reference (`ref`)**: Written immediately before a parameter's name, it lets the knot/stitch/function alter the caller's actual variable directly, instead of receiving a temporary copy of its value.\n\nExample:\n```ink\n=== function alter(ref x, k) ===\n~ x = x + k\n```\n```ink\n~ gold = gold + 7\n~ alter(gold, 7)\n```",
);

// Hover text for the `->` divert arrow (and its `->->` tunnel-return form), keyed by
// the role a specific arrow plays — see getDivertArrowHoverKind. Documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
export const DIVERT_ARROW_DOCS: Record<string, string> = {
    divert: l10n.t(
        '**Divert (`->`)**: Moves the story immediately to another knot, stitch, or gather, with no user input required — it can even happen invisibly, mid-sentence. Diverts can also pass arguments, e.g. `-> accuse("Hastings")`.\n\nExample:\n```ink\n=== hurry_home ===\nWe hurried home -> as_fast_as_we_could\n\n=== as_fast_as_we_could ===\nas fast as we could.\n```',
    ),
    tunnelCall: l10n.t(
        '**Tunnel call (`-> knot ->`)**: Diverts into `knot` as a *tunnel* rather than a plain divert — it remembers where it came from, so a `->->` reached inside `knot` returns control right back here instead of leaving for good.\n\nExample:\n```ink\n-> crossing_the_date_line ->\nWe continue on, once the tunnel returns.\n\n=== crossing_the_date_line ===\nWe crossed the date line, gaining a whole day!\n->->\n```',
    ),
    tunnelReturnPoint: l10n.t(
        '**Tunnel return point (the second `->` in `-> knot ->`)**: Marks this as a tunnel call rather than a plain divert — once `knot` reaches a `->->`, the flow resumes right after this arrow instead of stopping inside `knot`.\n\nExample:\n```ink\n-> crossing_the_date_line ->\nWe continue on, once the tunnel returns.\n```',
    ),
    tunnelOnward: l10n.t(
        '**Tunnel onward (`-> knot -> next`)**: Calls `knot` as a tunnel, but once it returns with a `->->`, continues at `next` instead of resuming right after this line.\n\nExample:\n```ink\n-> crossing_the_date_line -> check_foggs_health\n```',
    ),
    tunnelReturn: l10n.t(
        '**Tunnel return (`->->`)**: Returns from the tunnel that was called to reach here, resuming the flow right after the `-> knot ->` that invoked it — like a function return, unlike a plain divert, which never comes back.\n\nExample:\n```ink\n=== crossing_the_date_line ===\nWe crossed the date line, gaining a whole day!\n->->\n```',
    ),
    tunnelReturnElsewhere: l10n.t(
        '**Tunnel return, elsewhere (`->-> destination`)**: Leaves the tunnel entirely — instead of resuming right after the `-> knot ->` that called it, the flow jumps straight to `destination`. Use sparingly; it\'s easy to lose track of where control actually ends up.\n\nExample:\n```ink\n=== fall_down_cliff ===\n-> hurt(5) ->\nYou\'re still alive! You pick yourself up and walk on.\n\n=== hurt(x) ===\n~ stamina -= x\n{ stamina <= 0:\n\t->-> youre_dead\n}\n\n=== youre_dead ===\nSuddenly, there is a white light all around you.\n```',
    ),
    divertTargetValue: l10n.t(
        '**Divert target (as a value)**: Here `-> name` isn\'t an immediate jump — it\'s a *divert target*, a storable value naming a location, being passed as an argument, assigned to a variable, or compared. The receiving parameter/variable must be explicitly typed as a divert target, so it isn\'t confused with a read count.\n\nExample:\n```ink\nVAR current_epilogue = -> everybody_dies\n\n=== sleeping_in_hut ===\nYou lie down and close your eyes.\n-> generic_sleep(-> waking_in_the_hut)\n\n=== generic_sleep(-> waking)\nYou sleep, perchance to dream...\n-> waking\n```',
    ),
};

// Extra note appended to the pixi-vn engine's divert-arrow hover text, explaining how the
// construct maps onto Pixi'VN's own runtime primitives (it has no native "divert"/"tunnel"/
// "thread" concepts of its own — see PIXI_VN_THREAD_DOC below for the `<-` case).
const PIXI_VN_DIVERT_NOTE = () =>
    l10n.t("In the **pixi-vn** engine, this corresponds to performing a **jump** to a `label`.");
const PIXI_VN_TUNNEL_CALL_NOTE = () =>
    l10n.t("In the **pixi-vn** engine, this corresponds to performing a **call** to a `label`.");

/**
 * Returns the hover text for a `->` of the given kind (see getDivertArrowHoverKind),
 * appending a pixi-vn-specific note for the kinds whose Pixi'VN runtime behaviour is
 * worth calling out explicitly: a plain divert maps to a "jump", and either arrow of a
 * tunnel call (`-> knot ->`) maps to a "call". Other kinds are unaffected by engine.
 */
export function getDivertArrowDoc(kind: keyof typeof DIVERT_ARROW_DOCS, engine: "Inky" | "pixi-vn"): string {
    const base = DIVERT_ARROW_DOCS[kind];
    if (engine === "pixi-vn") {
        if (kind === "divert") return `${base}\n\n${PIXI_VN_DIVERT_NOTE()}`;
        if (kind === "tunnelCall" || kind === "tunnelReturnPoint") return `${base}\n\n${PIXI_VN_TUNNEL_CALL_NOTE()}`;
    }
    return base;
}

// Ink thread ("pull the content of another knot/stitch into the current flow without
// leaving") has no equivalent in the pixi-vn runtime, so `<-` was instead made to behave
// exactly like a tunnel call (`-> knot ->`) — this hover text explains that substitution
// rather than describing Ink's own thread semantics, which don't apply under this engine.
const THREAD_DOC = l10n.t(
    '**Thread (`<-`)**: Pulls the content and choices of another knot/stitch into the current flow, as if written right here, without leaving the current flow the way a divert does. Useful for weaving choices gathered from several different knots into one combined list.\n\nExample:\n```ink\n=== welcome ===\nI had a headache; threading is hard to get your head around.\n<- conversation\n<- walking\n\n= conversation\n*\t"What did you have for lunch?"\n\t"Spam and eggs," he replied.\n-\t-> house\n\n= walking\n*\t[Continue walking]\n\t-> house\n\n= house\nBefore long, we arrived at his house.\n-> END\n```',
);
const PIXI_VN_THREAD_DOC = l10n.t(
    "**Thread (`<-`)**: Ink threads (pulling another knot/stitch's content and choices into the current flow without leaving it) can't be implemented by the **pixi-vn** engine. So under this engine, `<-` is instead made to behave exactly like a tunnel call (`-> knot ->`): it corresponds to performing a **call** to a `label`, and returns here once that label finishes.\n\nExample:\n```ink\n<- conversation\nWe continue on here once the call returns.\n\n= conversation\n\"Hello!\" I said.\n->->\n```",
);

export function getThreadDoc(engine: "Inky" | "pixi-vn"): string {
    return engine === "pixi-vn" ? PIXI_VN_THREAD_DOC : THREAD_DOC;
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
    stopping: l10n.t(
        "**Sequence (`{ stopping: ...}`)**: Shows the next alternative each time this point is reached, moving through them in order, then keeps repeating the last one once they've all been shown. This is also what a plain `{A|B|C}` sequence with no type keyword does.\n\nExample:\n```ink\n{ stopping:\n-\tI entered the casino.\n-\tI entered the casino again.\n-\tOnce more, I went inside.\n}\n```",
    ),
    cycle: l10n.t(
        "**Cycle (`{ cycle: ...}`)**: Shows the next alternative each time this point is reached, moving through them in order, then loops back to the first one once they've all been shown — same as the `&` shorthand.\n\nExample:\n```ink\n{ cycle:\n-\tI held my breath.\n-\tI waited impatiently.\n-\tI paused.\n}\n```",
    ),
    once: l10n.t(
        "**Once-only (`{ once: ...}`)**: Shows each alternative once, in order, then shows nothing once they've all been used up — same as the `!` shorthand.\n\nExample:\n```ink\n{ once:\n-\tWould my luck hold?\n-\tCould I win the hand?\n}\n```",
    ),
    shuffle: l10n.t(
        "**Shuffle (`{ shuffle: ...}`)**: Shows one alternative at random each time this point is reached, and can repeat entries — same as the `~` shorthand.\n\nExample:\n```ink\n{ shuffle:\n-\tAce of Hearts.\n-\tKing of Spades.\n-\t2 of Diamonds.\n}\n```",
    ),
    "shuffle once": l10n.t(
        "**Shuffle once (`{ shuffle once: ...}`)**: Shuffles the alternatives, plays through all of them exactly once with no repeats, then shows nothing once they run out.\n\nExample:\n```ink\n{ shuffle once:\n-\tThe sun was hot.\n-\tIt was a hot day.\n}\n```",
    ),
    "shuffle stopping": l10n.t(
        "**Shuffle stopping (`{ shuffle stopping: ...}`)**: Shuffles all but the last alternative and plays through them, then sticks on that last entry for good once the shuffled ones run out.\n\nExample:\n```ink\n{ shuffle stopping:\n-\tA silver BMW roars past.\n-\tA bright yellow Mustang takes the turn.\n-\tThere are like, cars, here.\n}\n```",
    ),
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
    context.subscriptions.push(runFromKnotCommand(context));

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
    // Shared by every markdown "symbol" token embedded as literal ink text (visible `\n`
    // escapes, escaped heading markers, ...) — one distinct colour so they read as markdown
    // syntax rather than ordinary narrative text or ink's own keywords/tags/diverts.
    // `symbolIcon.constantForeground` was tried first but it (like most `symbolIcon.*`
    // colours) defaults to plain `foreground` unless a theme overrides it, making the
    // decoration invisible in practice. `symbolIcon.constructorForeground` ships with a
    // real, distinct purple in every built-in theme and isn't used anywhere else here.
    const markdownSymbolDecoration = window.createTextEditorDecorationType({
        color: new ThemeColor("symbolIcon.constructorForeground"),
        rangeBehavior: DecorationRangeBehavior.ClosedClosed,
    });
    context.subscriptions.push(markdownItalicDecoration, markdownBoldDecoration, markdownSymbolDecoration);

    const refreshMarkdownDecorations = (editor?: TextEditor) => {
        if (editor?.document.languageId !== "ink") return;

        const markup = workspace.getConfiguration("ink").get<string | null>("markup", null);
        if (markup !== "Markdown") {
            editor.setDecorations(markdownItalicDecoration, []);
            editor.setDecorations(markdownBoldDecoration, []);
            editor.setDecorations(markdownSymbolDecoration, []);
            return;
        }

        const italicRanges: Range[] = [];
        const boldRanges: Range[] = [];
        const symbolRanges: DecorationOptions[] = [];
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

            // Only the very first segment can start the line's narrative text — heading
            // markers are only meaningful there, never in a segment resuming after an
            // inline block comment closes mid-line.
            let isFirstSegment = true;
            for (const { text: segmentText, offset } of segments) {
                const localScanStart = Math.max(0, absoluteScanStart - offset);
                if (localScanStart >= segmentText.length) {
                    isFirstSegment = false;
                    continue;
                }

                const markdownRanges = findMarkdownTokenRanges(segmentText.substring(localScanStart), isFirstSegment);
                isFirstSegment = false;

                const toDocRange = (range: MarkdownRange) =>
                    new Range(i, offset + localScanStart + range.start, i, offset + localScanStart + range.end);
                const pushSymbol = (range: MarkdownRange, hoverText: string) => {
                    symbolRanges.push({ range: toDocRange(range), hoverMessage: new MarkdownString(hoverText) });
                };

                for (const range of markdownRanges.italic) {
                    italicRanges.push(toDocRange(range));
                }
                for (const range of markdownRanges.bold) {
                    boldRanges.push(toDocRange(range));
                }
                for (const range of markdownRanges.newlines) {
                    pushSymbol(range, l10n.t("`\\\\n`: inserts a line break."));
                }
                for (const range of markdownRanges.headers) {
                    pushSymbol(range, l10n.t("Markdown heading marker."));
                }
                for (const range of markdownRanges.listMarkers) {
                    pushSymbol(range, l10n.t("Markdown list marker."));
                }
                for (const range of markdownRanges.emphasisMarkers) {
                    pushSymbol(range, l10n.t("Markdown emphasis marker (italic/bold)."));
                }
            }
        }

        editor.setDecorations(markdownItalicDecoration, italicRanges);
        editor.setDecorations(markdownBoldDecoration, boldRanges);
        editor.setDecorations(markdownSymbolDecoration, symbolRanges);
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
            window.showInformationMessage(l10n.t("Engine changed to {0}", newEngine));
            onDidChangeSemanticTokensEmitter.fire();
            for (const doc of workspace.textDocuments) {
                if (doc.languageId === "ink") {
                    refreshDiagnostics(doc);
                }
            }
        }
        if (event.affectsConfiguration("ink.markup")) {
            const newMarkup = workspace.getConfiguration("ink").get<string | null>("markup", null);
            window.showInformationMessage(l10n.t("Markup changed to {0}", newMarkup ?? l10n.t("none")));
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

    // CTRL+CLICK support for knot/stitch references (diverts, threads, divert targets, {knot} conditions, …)
    context.subscriptions.push(languages.registerDefinitionProvider({ language: "ink" }, knotDefinitionProvider()));

    // Folding for knot/stitch/function headers, keeping trailing exit diverts visible
    context.subscriptions.push(
        languages.registerFoldingRangeProvider({ language: "ink" }, inkFoldingRangeProvider()),
    );

    // "Run from here" CodeLens above each top-level knot: opens the preview with a
    // temporary `-> knot` divert prepended, without touching the file on disk
    context.subscriptions.push(languages.registerCodeLensProvider({ language: "ink" }, knotRunCodeLensProvider()));

    // Suggestions include
    const includeSuggestionsProvider = suggestionsInclude();
    context.subscriptions.push(
        languages.registerCompletionItemProvider({ language: "ink" }, includeSuggestionsProvider, " "),
    );

    // Suggestions for knot/stitch names right after a divert (->) or thread (<-) arrow,
    // and for a knot's own stitches after `-> knot.`. Accepting a suggestion for a
    // knot/stitch defined in another file also inserts an INCLUDE for it.
    context.subscriptions.push(registerInsertIncludeCommand());
    context.subscriptions.push(
        languages.registerCompletionItemProvider({ language: "ink" }, knotCompletionProvider(), "-", ">", ".", " "),
    );

    context.subscriptions.push(
        languages.registerHoverProvider("ink", {
            provideHover(document, position) {
                const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");

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
                                    l10n.t(
                                        '**END (`-> END`)**: Ends the story flow immediately and completely — no further choices or content, nothing to resume. Use it when a storyline (or the whole game) is genuinely over; diverting here without it produces an "out of content" warning.\n\nExample:\n```ink\n=== top_knot ===\nHello world!\n-> END\n```',
                                    ),
                                ),
                            );
                        }
                        return new Hover(
                            new MarkdownString(
                                l10n.t(
                                    '**DONE (`-> DONE`)**: Marks the current thread or weave as intentionally finished, without stopping the whole story — the engine falls back to any other running thread instead of raising an "out of content" warning. At the top level (outside a thread), it behaves the same as `-> END`.\n\nExample:\n```ink\n== conversation ==\n"Hello!" I said.\n-> DONE\n```',
                                ),
                            ),
                        );
                    }
                }

                // Hover for divert arrow -> (but not an escaped \->, which is literal text).
                // What it means varies by context: a plain jump, a tunnel call/return, or a
                // divert target used as a value — see getDivertArrowHoverKind.
                if (word === "->" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(
                        new MarkdownString(
                            getDivertArrowDoc(getDivertArrowHoverKind(line, range.start.character), engine),
                        ),
                    );
                }

                // Hover for glue <> (but not escaped \<>)
                if (word === "<>" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(
                        new MarkdownString(
                            l10n.t(
                                '**Glue (`<>`)**: Suppresses the automatic line-break that would otherwise be inserted before this content, joining it to whatever text came right before. You can\'t "un-stick" a line once glued, and stacking multiple glues has no extra effect.\n\nExample:\n```ink\nWe hurried home <>\n-> to_savile_row\n\n=== to_savile_row ===\nto Savile Row.\n```',
                            ),
                        ),
                    );
                }

                // Hover for thread <- (but not escaped \<-). Ink threads can't be implemented
                // by the pixi-vn engine, so under that engine `<-` is instead made to behave
                // exactly like a tunnel call (`-> knot ->`) — see getThreadDoc.
                if (word === "<-" && range && !isEscaped(line, range.start.character)) {
                    return new Hover(new MarkdownString(getThreadDoc(engine)));
                }

                // Hover for the VAR / CONST / LIST declaration keywords, only when the
                // word actually opens the declaration line (not a coincidental match).
                if (word in DECLARATION_KEYWORD_DOCS && range && isDeclarationKeywordContext(line, range.start.character)) {
                    return new Hover(new MarkdownString(DECLARATION_KEYWORD_DOCS[word]));
                }

                // Hover for the `ref` by-reference-parameter keyword, only inside a
                // knot/stitch/function's own parameter list.
                if (word === "ref" && range && isRefParameterContext(line, range.start.character)) {
                    return new Hover(new MarkdownString(REF_PARAMETER_DOC));
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
                            l10n.t(
                                "**Logic (`~`)**: Marks the line as pure logic — an assignment, function call, or other statement — rather than story text. The line itself is never printed.\n\nExample:\n```ink\n~ x = 5\n~ myFunction()\n```",
                            ),
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
                            l10n.t(
                                "**Choice brackets (`[` `]`)**: Divide an option's text into three parts. Text *before* the brackets is shown both as the choice and in the resulting output; text *inside* the brackets is shown only in the choice; text *after* the brackets is shown only in the output.\n\nExample:\n```ink\n*\tHello [back!] right back to you!\n\tNice to hear from you!\n```\nChoosing this produces the choice `Hello back!`, then the output `Hello right back to you! Nice to hear from you!`.\n\nIf the option has *only* bracketed text, it disappears from the output once chosen:\n```ink\n*\t[Hello back!]\n\tNice to hear from you!\n```",
                            ),
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
                                l10n.t(
                                    "**Cycle (`&`)**: Cycles repeat their options in a loop.\n\nExample:\n```ink\nIt was {&Monday|Tuesday|Wednesday}\n```",
                                ),
                            ),
                        );
                    }

                    if (word === "!" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                l10n.t(
                                    "**Once-only (`!`)**: Works like a sequence, but stops producing output after all options are exhausted.\n\nExample:\n```ink\nHe told me a joke. {!I laughed.|I smiled.}\n```",
                                ),
                            ),
                        );
                    }

                    if (word === "~" && !isEscaped(line, position.character)) {
                        return new Hover(
                            new MarkdownString(
                                l10n.t(
                                    "**Shuffle (`~`)**: Randomly selects an option each time.\n\nExample:\n```ink\nI tossed the coin. {~Heads|Tails}\n```",
                                ),
                            ),
                        );
                    }
                }

                // Hover for "|" (always, unless it is escaped as \| )
                if (word === "|" && !isEscaped(line, position.character)) {
                    return new Hover(
                        new MarkdownString(
                            l10n.t(
                                "**Alternative separator (`|`)**: Used to separate alternative pieces of text (commonly inside `{}`).\n\nExample:\n```ink\n{Hello|Hi|Hey}\n```\nThis can output *Hello*, *Hi*, or *Hey* depending on the alternative type.\n\nTo write a literal `|`, escape it as `\\|`.",
                            ),
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
                    isInsideVariableText(document, position)
                ) {
                    return new Hover(
                        new MarkdownString(
                            l10n.t(
                                "**Conditional branch (`-`)**: Introduces one branch of a multi-clause `{ }` conditional or switch block. Branches are tried in order, and only the first one whose condition matches runs; `- else:` catches anything not matched above.\n\nExample:\n```ink\n{ x:\n- 0: zero\n- 1: one\n- else: lots\n}\n```",
                            ),
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
                                    l10n.t(
                                        "**Choice (`*`)**: Offers the player a one-time option. Once chosen it's used up and won't be offered again on a later visit; by default its text is echoed into the output, then the flow continues into whatever follows.\n\nExample:\n```ink\nHello world!\n*\tHello back!\n\tNice to hear from you!\n```",
                                    ),
                                ),
                            );
                        }
                        if (char === "+") {
                            return new Hover(
                                new MarkdownString(
                                    l10n.t(
                                        "**Sticky Choice (`+`)**: Like `*`, but never gets used up — it stays available even after being picked, which makes it useful for loops and repeatable actions.\n\nExample:\n```ink\n=== homers_couch ===\n+\t[Eat another donut]\n\tYou eat another donut. -> homers_couch\n*\t[Get off the couch]\n\t-> END\n```",
                                    ),
                                ),
                            );
                        }
                        if (char === "-") {
                            return new Hover(
                                new MarkdownString(
                                    l10n.t(
                                        '**Gather (`-`)**: Collects the different branches of a set of choices back into a single point, so the story continues on a shared path no matter which option was picked. Can be labelled (e.g. `- (top)`) so it can be diverted to or tested later.\n\nExample:\n```ink\n*\t"Murder!"\n*\t"Suicide!"\n-\tMrs Christie lowered her manuscript a moment.\n```',
                                    ),
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

                if (isKnotReferenceContext(document, position, line, beforeWord)) {
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

export function isEndDoneHoverContext(line: string, wordStartChar: number) {
    return isPrecededByUnescapedDivert(line, line.substring(0, wordStartChar));
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
        sections.push(l10n.t("_Declared as `CONST`: this value is constant._"));
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
 * Returns true when the `ref` at `wordStartChar` is the by-reference-parameter
 * keyword — immediately after a `(` or `,` inside a knot/stitch/function's
 * parameter list (a `=+ name(...)` header line) — as opposed to a narrative
 * word that happens to be "ref" appearing elsewhere.
 */
export function isRefParameterContext(line: string, wordStartChar: number): boolean {
    if (!/^\s*=+/.test(line)) return false;
    return /[(,]\s*$/.test(line.substring(0, wordStartChar));
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
