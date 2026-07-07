/**
 * Walks backwards from `lineNumber` (exclusive) through `lines` and returns the
 * line index where a block comment (/** ... *\/) immediately above that line
 * starts, or `undefined` if there isn't one.
 *
 * Only lines that are actually inside a block comment count:
 * - The closing tag marks the start of a comment block (scanning backwards).
 * - Lines beginning with `*` are accepted only once a closing tag has been seen,
 *   so that ink choice lines (e.g. `* [Go to Paris]`) are never mistaken
 *   for JSDoc continuation lines.
 * - The opening tag ends the walk.
 * - A single-line block comment is also accepted.
 * - Blank lines between the knot/stitch declaration and the comment are skipped.
 */
export function findCommentBlockAbove(lines: string[], lineNumber: number): number | undefined {
    let inCommentBlock = false;
    for (let i = lineNumber - 1; i >= 0; i--) {
        const text = lines[i].trim();
        if (text.startsWith("/**") && text.endsWith("*/")) {
            // Single-line block comment: /** … */ — note: `text.endsWith("*/")` is
            // sufficient because a line like `/** comment */ extra` does NOT end with `*/`.
            return i;
        } else if (text.endsWith("*/")) {
            // Closing tag of a multi-line block comment (e.g. trimmed ` */` → `*/`)
            inCommentBlock = true;
        } else if (text.startsWith("/**")) {
            // Opening of a multi-line block comment
            return inCommentBlock ? i : undefined;
        } else if (text.startsWith("*") && inCommentBlock) {
            // Continuation line inside /** … */ block
        } else if (text === "") {
            // Skip blank lines between the declaration and the comment
        } else {
            break;
        }
    }
    return undefined;
}

/**
 * Collects the text of the block comment found by `findCommentBlockAbove`
 * (trimmed, one entry per line, blank lines in the gap omitted), or `[]` if
 * there isn't one.
 */
export function collectCommentAbove(lines: string[], lineNumber: number): string[] {
    const start = findCommentBlockAbove(lines, lineNumber);
    if (start === undefined) return [];

    const comments: string[] = [];
    for (let i = start; i < lineNumber; i++) {
        const text = lines[i].trim();
        if (text !== "") {
            comments.push(text);
        }
    }
    return comments;
}
