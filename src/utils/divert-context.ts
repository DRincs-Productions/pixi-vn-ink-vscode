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

export function isInsideVariableText(document: TextDocument, position: Position): boolean {
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
