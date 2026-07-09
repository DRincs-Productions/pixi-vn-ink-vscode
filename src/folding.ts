import {
    type CancellationToken,
    type FoldingContext,
    FoldingRange,
    type FoldingRangeProvider,
    type TextDocument,
} from "vscode";
import { findCommentBlockAbove } from "./utils/comments";

export interface InkFoldingRange {
    start: number;
    end: number;
}

// A knot/stitch/function header: one or more `=` followed by an identifier
// (optionally preceded by the `function` keyword). Requiring an identifier
// character right after the `=` run/whitespace excludes purely decorative
// separator lines such as `===` or `==`.
const HEADER_REGEX = /^\s*=+\s*(?:function\s+)?[A-Za-z_]/;

// A header declared with the `function` keyword specifically.
const FUNCTION_HEADER_REGEX = /^\s*=+\s*function\s+[A-Za-z_]/;

// A line that is nothing but a divert (e.g. `-> DONE`, `->END`, `-> knot_name`).
// Diverts embedded mid-sentence (e.g. `text ->knot`) do not match, since the
// arrow must be the first non-whitespace content on the line.
const DIVERT_ONLY_REGEX = /^\s*->\s*\S/;

// A divert whose sole target is DONE or END.
const DONE_OR_END_DIVERT_REGEX = /^\s*->\s*(?:DONE|END)\s*$/;

function leadingWhitespaceLength(line: string): number {
    return line.length - line.trimStart().length;
}

/**
 * Splits `lines[from..to]` (inclusive) into maximal runs of consecutive
 * non-blank lines, i.e. the paragraphs separated by blank lines.
 */
function splitIntoBlocks(lines: string[], from: number, to: number): InkFoldingRange[] {
    const blocks: InkFoldingRange[] = [];
    let start = -1;

    for (let k = from; k <= to; k++) {
        if (lines[k].trim() === "") {
            if (start !== -1) {
                blocks.push({ start, end: k - 1 });
                start = -1;
            }
        } else if (start === -1) {
            start = k;
        }
    }
    if (start !== -1) {
        blocks.push({ start, end: to });
    }

    return blocks;
}

/**
 * Computes foldable ranges for ink knot/stitch/function headers.
 *
 * A header's body (up to the next header or end of file) is split into
 * paragraphs separated by blank lines. The first paragraph that ends with a
 * top-level divert (its "exit point") is used to keep that divert visible
 * even when collapsed, folding away everything from the header up to that
 * divert, including any earlier non-exiting paragraphs and blank lines.
 *
 * A divert only counts as an "exit point" when it sits at the same
 * indentation as its own paragraph's opening line. A divert indented deeper
 * than that is the action of one specific choice (e.g. nested under `* ...`),
 * not a statement that every path through the knot actually reaches, so it
 * would be misleading to reveal it as if it were the knot's overall exit.
 *
 * Functions never get this "reveal the exit" treatment for `-> DONE` and
 * `-> END`: those don't describe how a function actually exits (that's what
 * `~ return` is for, and a `~ return` is never treated as an exit point
 * either), so they are folded away like any other body content instead of
 * being kept visible. A function that diverts to a knot/stitch still gets
 * that divert revealed, same as a knot would.
 *
 * If no paragraph ends with a qualifying divert, the whole body is folded —
 * except for a trailing `/** ... *\/` comment that documents the *next*
 * knot/stitch (the same comment `getKnotComment` would resolve to that next
 * declaration), which is left visible rather than folded away with this one.
 */
export function computeInkFoldingRanges(lines: string[]): InkFoldingRange[] {
    const ranges: InkFoldingRange[] = [];

    for (let i = 0; i < lines.length; i++) {
        if (!HEADER_REGEX.test(lines[i])) continue;

        let bodyEnd = i;
        for (let j = i + 1; j < lines.length && !HEADER_REGEX.test(lines[j]); j++) {
            bodyEnd = j;
        }

        if (bodyEnd <= i) continue; // no body to fold

        const blocks = splitIntoBlocks(lines, i + 1, bodyEnd);
        if (blocks.length === 0) continue;

        const isFunction = FUNCTION_HEADER_REGEX.test(lines[i]);

        const exitBlock = blocks.find((block) => {
            if (!DIVERT_ONLY_REGEX.test(lines[block.end])) return false;
            if (isFunction && DONE_OR_END_DIVERT_REGEX.test(lines[block.end])) return false;
            const paragraphIndent = leadingWhitespaceLength(lines[block.start]);
            const divertIndent = leadingWhitespaceLength(lines[block.end]);
            return divertIndent <= paragraphIndent;
        });

        if (exitBlock) {
            if (exitBlock.end - 1 > i) {
                ranges.push({ start: i, end: exitBlock.end - 1 });
            }
            continue;
        }

        let lastRealBlock: InkFoldingRange | undefined = blocks[blocks.length - 1];
        const nextHeaderLine = bodyEnd + 1;
        if (nextHeaderLine < lines.length) {
            const commentStart = findCommentBlockAbove(lines, nextHeaderLine);
            if (commentStart !== undefined) {
                lastRealBlock = [...blocks].reverse().find((block) => block.end < commentStart);
            }
        }

        if (lastRealBlock && lastRealBlock.end > i) {
            ranges.push({ start: i, end: lastRealBlock.end });
        }
    }

    return ranges;
}

export function inkFoldingRangeProvider(): FoldingRangeProvider {
    return {
        provideFoldingRanges(document: TextDocument, _context: FoldingContext, _token: CancellationToken) {
            const lines: string[] = [];
            for (let i = 0; i < document.lineCount; i++) {
                lines.push(document.lineAt(i).text);
            }

            return computeInkFoldingRanges(lines).map((range) => new FoldingRange(range.start, range.end));
        },
    };
}
