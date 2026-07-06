export interface MarkdownRange {
    start: number;
    end: number;
}

export interface MarkdownTokenRanges {
    italic: MarkdownRange[];
    bold: MarkdownRange[];
    newlines: MarkdownRange[];
}

function isEscaped(text: string, index: number): boolean {
    let backslashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
        backslashes++;
    }
    return backslashes % 2 === 1;
}

function hasVisibleContent(text: string) {
    return /\S/.test(text);
}

function getMarkerRunLength(text: string, index: number, marker: string): number {
    let length = 0;
    while (text[index + length] === marker) {
        length++;
    }
    return length;
}

/**
 * Finds inline emphasis ranges delimited by a repeated markdown marker.
 * A delimiter length of 1 matches italic, 2 matches bold, and 3 matches bold+italic.
 * Opening or closing runs longer than delimiterLength are accepted when at least one side
 * is exactly delimiterLength (e.g. `***text**` counts as bold). Runs shorter than
 * delimiterLength are always skipped.
 */
function findDelimitedRanges(text: string, marker: "*" | "_", delimiterLength: 1 | 2 | 3): MarkdownRange[] {
    const ranges: MarkdownRange[] = [];

    for (let i = 0; i < text.length; i++) {
        if (text[i] !== marker || isEscaped(text, i)) continue;
        if (i > 0 && text[i - 1] === marker) continue;

        const openingLength = getMarkerRunLength(text, i, marker);
        if (openingLength < delimiterLength) {
            i += openingLength - 1;
            continue;
        }
        // Content starts after all opening markers.
        const contentStart = i + openingLength;

        for (let j = contentStart; j < text.length; j++) {
            if (text[j] !== marker || isEscaped(text, j)) continue;
            if (j > 0 && text[j - 1] === marker) continue;

            const closingLength = getMarkerRunLength(text, j, marker);
            if (closingLength < delimiterLength) {
                j += closingLength - 1;
                continue;
            }
            // Require at least one side to be exactly delimiterLength to prevent
            // a longer run (e.g. `**`) from satisfying a shorter delimiter (e.g. d=1).
            if (openingLength !== delimiterLength && closingLength !== delimiterLength) {
                j += closingLength - 1;
                continue;
            }

            if (hasVisibleContent(text.slice(contentStart, j))) {
                ranges.push({ start: contentStart, end: j });
                i = j + closingLength - 1;
            }
            break;
        }
    }

    return ranges;
}

/**
 * Returns ranges ordered by start position, then by end position for equal starts.
 */
function sortRanges(ranges: MarkdownRange[]) {
    return [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
}

/**
 * Parses markdown-like inline tokens and returns the ranges of emphasized text and visible `\n` escapes.
 * Escaped markers are ignored, and returned ranges cover only the inner content, not the delimiters.
 */
export function findMarkdownTokenRanges(text: string): MarkdownTokenRanges {
    let italic: MarkdownRange[] = [];
    let bold: MarkdownRange[] = [];
    const newlines: MarkdownRange[] = [];

    for (let i = 0; i < text.length; i++) {
        const nextChar = i + 1 < text.length ? text[i + 1] : "";
        if (text[i] === "\\" && nextChar === "n" && !isEscaped(text, i)) {
            newlines.push({ start: i, end: i + 2 });
            i++;
        }
    }

    for (const marker of ["*", "_"] as const) {
        const boldItalic = findDelimitedRanges(text, marker, 3);
        italic.push(...boldItalic);
        bold.push(...boldItalic);
        bold.push(...findDelimitedRanges(text, marker, 2));
        italic.push(...findDelimitedRanges(text, marker, 1));
    }

    italic = sortRanges(italic);
    bold = sortRanges(bold);

    return { italic, bold, newlines };
}
