import type { Position, TextDocument } from "vscode";

// Shared low-level helpers describing where a divert (`->`), thread (`<-`) or
// knot/stitch reference sits on a line. Used both by the hover provider (to
// decide what popup to show) and by the go-to-definition/completion
// providers (to decide whether a word is actually a knot/stitch reference).
// See https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md

export function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// true if the character at `position` is preceded by a backslash
export function isEscaped(line: string, position: number): boolean {
    return position > 0 && line[position - 1] === "\\";
}

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
 * Splits `line` into text segments that lie outside of block comments,
 * carrying the original character offset of each segment so callers can map
 * positions back to the original line. `inBlockComment` is the state at the
 * start of the line; the returned `inComment` reflects the state at the end.
 */
export function getUncommentedSegments(
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

/**
 * Returns true when `character` on `lines[lineNumber]` sits inside a `{ }`
 * block that may have opened on an earlier line (e.g. a multi-line
 * conditional/switch block, or a `{ }` deliberately split so its opening
 * brace sits alone on its own line), by tracking unescaped brace depth from
 * the start of the document. Block comments and `//` line comments are
 * stripped before counting, so braces mentioned in comments don't throw off
 * the depth.
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

/**
 * Returns true when `position` sits inside an unescaped `{ }` block —
 * tracking brace depth from the start of the document (see
 * {@link isInsideCurlyBraceBlockAtLines}), not just the current line. A `{ }`
 * block whose opening brace sits alone on its own line (a common ink
 * formatting style) still counts: single-line-only counting would otherwise
 * miss it entirely on every line after the opening one.
 */
export function isInsideVariableText(document: TextDocument, position: Position): boolean {
    const lines: string[] = [];
    for (let i = 0; i <= position.line; i++) {
        lines.push(document.lineAt(i).text);
    }
    return isInsideCurlyBraceBlockAtLines(lines, position.line, position.character);
}

/**
 * Returns true when `word` (found at `beforeWord`, the line prefix ending
 * right where the word starts) is used as a knot/stitch *reference* rather
 * than coincidental narrative text: a divert or thread (`-> word` / `<- word`),
 * the stitch half of a dotted `-> knot.word` / `<- knot.word`, inside `{ word }`,
 * or on the knot/stitch's own declaration line (`=== word ===` / `= word`).
 */
export function isKnotReferenceContext(
    document: TextDocument,
    position: Position,
    line: string,
    beforeWord: string,
): boolean {
    return (
        /^\s*=/.test(line) ||
        isPrecededByUnescapedDivert(line, beforeWord) ||
        isPrecededByUnescapedDivertToKnot(line, beforeWord) ||
        isPrecededByUnescapedThread(line, beforeWord) ||
        isPrecededByUnescapedThreadToKnot(line, beforeWord) ||
        isInsideVariableText(document, position)
    );
}

/**
 * Returns true when `word` is used where a declared `VAR`/`CONST`/`LIST`
 * symbol could plausibly be referenced: on the declaration line itself, a
 * `~` logic line, inside `{ }`, or a line containing an operator (`==`, `+`,
 * `mod`, `or`, …). Broad on purpose — the hover popup this gates only shows
 * anything when a symbol with that exact name actually exists, so a loose
 * match here just means no popup rather than a wrong one.
 */
export function isDeclaredSymbolHoverContext(document: TextDocument, position: Position, line: string): boolean {
    const trimmed = line.trimStart();
    if (/^(VAR|CONST)\b/.test(trimmed)) return true;
    if (trimmed.startsWith("~")) return true;
    if (isInsideVariableText(document, position)) return true;

    // `?` is the "has" operator for LIST membership tests (e.g. `bedroomLightState ? seen`).
    return /(==|!=|<=|>=|<|>|=|\+|-|\*|\/|%|\?|\bmod\b|\bnot\b|\bor\b|\band\b)/.test(line);
}

/**
 * A narrower version of {@link isDeclaredSymbolHoverContext} for gating
 * autocompletion suggestions: drops the trailing "line contains an operator"
 * fallback, which matches almost any narrative sentence containing a hyphen
 * or the English words "or"/"and" — harmless for a hover popup (nothing
 * shows unless the exact symbol exists) but too noisy for a completion
 * widget that would otherwise pop up while typing plain prose.
 */
export function isVariableReferenceContext(document: TextDocument, position: Position, line: string): boolean {
    const trimmed = line.trimStart();
    if (/^(VAR|CONST|LIST)\b/.test(trimmed)) return true;
    if (trimmed.startsWith("~")) return true;
    return isInsideVariableText(document, position);
}
