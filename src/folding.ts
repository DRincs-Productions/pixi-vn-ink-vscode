import {
    type CancellationToken,
    type FoldingContext,
    FoldingRange,
    type FoldingRangeProvider,
    type TextDocument,
} from "vscode";

export interface InkFoldingRange {
    start: number;
    end: number;
}

// A knot/stitch/function header: one or more `=` followed by an identifier
// (optionally preceded by the `function` keyword). Requiring an identifier
// character right after the `=` run/whitespace excludes purely decorative
// separator lines such as `===` or `==`.
const HEADER_REGEX = /^\s*=+\s*(?:function\s+)?[A-Za-z_]/;

// A line that is nothing but a divert (e.g. `-> DONE`, `->END`, `-> knot_name`).
// Diverts embedded mid-sentence (e.g. `text ->knot`) do not match, since the
// arrow must be the first non-whitespace content on the line.
const DIVERT_ONLY_REGEX = /^\s*->\s*\S/;

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
 * even when collapsed — similar to seeing a function's return statement
 * while its body is folded — folding away everything from the header up to
 * that divert, including any earlier non-exiting paragraphs and blank lines.
 * If no paragraph ends with a divert, only the first paragraph is folded.
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

        const exitBlock = blocks.find((block) => DIVERT_ONLY_REGEX.test(lines[block.end]));

        if (exitBlock) {
            if (exitBlock.end - 1 > i) {
                ranges.push({ start: i, end: exitBlock.end - 1 });
            }
        } else if (blocks[0].end > i) {
            ranges.push({ start: i, end: blocks[0].end });
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
