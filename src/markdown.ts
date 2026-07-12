export interface MarkdownRange {
    start: number;
    end: number;
}

export interface MarkdownTokenRanges {
    italic: MarkdownRange[];
    bold: MarkdownRange[];
    newlines: MarkdownRange[];
    headers: MarkdownRange[];
    listMarkers: MarkdownRange[];
    /** Delimiter characters themselves (`*`, `\*`, `_`, ...), not the emphasized content. */
    emphasisMarkers: MarkdownRange[];
}

const MAX_HEADER_LEVEL = 6;

/**
 * Counts the contiguous backslash characters immediately before `index`.
 */
function countPrecedingBackslashes(text: string, index: number): number {
    let backslashes = 0;
    for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
        backslashes++;
    }
    return backslashes;
}

/**
 * In ink, `\X` always outputs a bare `X` (the backslash is consumed even when `X` has no
 * special meaning), so a run of backslashes only survives into the output in pairs: each
 * `\\` collapses to one literal `\`, and a leftover unpaired backslash escapes whatever
 * follows it instead of appearing itself. Counting the contiguous backslashes immediately
 * before `index` and checking parity tells us which case we're in.
 */
function isEscaped(text: string, index: number): boolean {
    return countPrecedingBackslashes(text, index) % 2 === 1;
}

function hasVisibleContent(text: string) {
    return /\S/.test(text);
}

/**
 * A backslash acts as an escape operator only if it isn't itself the literal, paired-off
 * output of an earlier `\\` — i.e. it must not be escaped.
 */
function isEscapingBackslash(text: string, index: number): boolean {
    return text[index] === "\\" && !isEscaped(text, index);
}

interface MarkerRun {
    /** Number of logical marker occurrences in the run (each escaped `\X` counts as one). */
    level: number;
    /** Number of source characters the run occupies. */
    sourceLength: number;
}

/**
 * Measures a maximal run of `marker` occurrences starting at `index`, where each occurrence
 * is either a bare marker character or — when `allowEscaped` — a `\marker` pair. Ink strips
 * the escape entirely for non-special characters, so `\*` and `*` produce the same literal
 * `*` in the output; letting the run mix both forms is what makes `\*\*bold\*\*` highlight
 * the same as `**bold**`.
 */
function matchMarkerRun(text: string, index: number, marker: string, allowEscaped: boolean): MarkerRun {
    let level = 0;
    let cursor = index;
    while (cursor < text.length) {
        if (text[cursor] === marker) {
            level++;
            cursor++;
            continue;
        }
        if (allowEscaped && isEscapingBackslash(text, cursor) && text[cursor + 1] === marker) {
            level++;
            cursor += 2;
            continue;
        }
        break;
    }
    return { level, sourceLength: cursor - index };
}

/**
 * Whether `index` starts a marker occurrence: a bare, unescaped marker character, or —
 * when `allowEscaped` — an escaping backslash immediately followed by the marker.
 */
function isMarkerStart(text: string, index: number, marker: string, allowEscaped: boolean): boolean {
    if (text[index] === marker) return !isEscaped(text, index);
    return allowEscaped && isEscapingBackslash(text, index) && text[index + 1] === marker;
}

function isWordChar(ch: string | undefined): boolean {
    return !!ch && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Like CommonMark, a run of `_` markers cannot open or close emphasis when it sits
 * between two word characters (e.g. the `_` in `visit_paris`). Without this check,
 * every snake_case identifier would be mistaken for an emphasis delimiter — and two
 * of them on the same line would italicize everything in between. `*` has no such
 * restriction, since it isn't used inside ink identifiers.
 */
function isIntrawordUnderscoreRun(text: string, index: number, sourceLength: number): boolean {
    return isWordChar(text[index - 1]) && isWordChar(text[index + sourceLength]);
}

interface DelimitedMatch {
    content: MarkdownRange;
    /** Source spans of the opening and closing delimiter itself (e.g. `\**` or `__`). */
    markers: [MarkdownRange, MarkdownRange];
}

/**
 * Finds inline emphasis delimited by a repeated markdown marker, returning both the
 * emphasized content and the delimiter spans themselves.
 * A delimiter length of 1 matches italic, 2 matches bold, and 3 matches bold+italic.
 * Opening or closing runs longer than delimiterLength are accepted when at least one side
 * is exactly delimiterLength (e.g. `***text**` counts as bold). Runs shorter than
 * delimiterLength are always skipped.
 *
 * For `*`, escaped (`\*`) and bare (`*`) occurrences are treated as equivalent, since ink
 * outputs the same literal `*` for both — a run can freely mix the two forms.
 */
function findDelimitedRanges(text: string, marker: "*" | "_", delimiterLength: 1 | 2 | 3): DelimitedMatch[] {
    const matches: DelimitedMatch[] = [];
    const allowEscaped = marker === "*";

    for (let i = 0; i < text.length; i++) {
        if (!isMarkerStart(text, i, marker, allowEscaped)) continue;

        const opening = matchMarkerRun(text, i, marker, allowEscaped);
        if (opening.level < delimiterLength) {
            i += opening.sourceLength - 1;
            continue;
        }
        if (marker === "_" && isIntrawordUnderscoreRun(text, i, opening.sourceLength)) {
            i += opening.sourceLength - 1;
            continue;
        }
        // Content starts after all opening markers.
        const contentStart = i + opening.sourceLength;

        let matched = false;
        for (let j = contentStart; j < text.length; j++) {
            if (!isMarkerStart(text, j, marker, allowEscaped)) continue;

            const closing = matchMarkerRun(text, j, marker, allowEscaped);
            if (closing.level < delimiterLength) {
                j += closing.sourceLength - 1;
                continue;
            }
            if (marker === "_" && isIntrawordUnderscoreRun(text, j, closing.sourceLength)) {
                j += closing.sourceLength - 1;
                continue;
            }
            // Require at least one side to be exactly delimiterLength to prevent
            // a longer run (e.g. `**`) from satisfying a shorter delimiter (e.g. d=1).
            if (opening.level !== delimiterLength && closing.level !== delimiterLength) {
                j += closing.sourceLength - 1;
                continue;
            }

            if (hasVisibleContent(text.slice(contentStart, j))) {
                matches.push({
                    content: { start: contentStart, end: j },
                    markers: [
                        { start: i, end: contentStart },
                        { start: j, end: j + closing.sourceLength },
                    ],
                });
            }
            i = j + closing.sourceLength - 1;
            matched = true;
            break;
        }

        if (!matched) {
            i += opening.sourceLength - 1;
        }
    }

    return matches;
}

/**
 * Returns ranges ordered by start position, then by end position for equal starts.
 */
function sortRanges(ranges: MarkdownRange[]) {
    return [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
}

/**
 * Finds a leading run of escaped ATX heading markers (`\#`, `\#\#`, ... up to h6) at the
 * very start of `text`. Each `#` must be individually escaped — ink turns an unescaped `#`
 * into the start of a tag, which is how the file can tell "literal heading marker" apart
 * from "tag follows". CommonMark also requires the marker to be followed by whitespace
 * (or the end of the line) to count as a heading.
 */
function findHeaderRange(text: string): MarkdownRange | null {
    let i = 0;
    let level = 0;
    while (level < MAX_HEADER_LEVEL && text[i] === "\\" && text[i + 1] === "#" && isEscaped(text, i + 1)) {
        level++;
        i += 2;
    }
    if (level === 0) return null;
    if (i < text.length && !/\s/.test(text[i])) return null;
    return { start: 0, end: i };
}

/**
 * Finds a single escaped list-bullet marker (`\-` or `\*`) at the very start of `text`,
 * followed by whitespace or the end of the line — mirroring markdown's `-`/`*` list items.
 * Like heading markers, escaping is what tells ink not to read the character as its own
 * syntax at the start of a line (`-` starts a gather, `*` starts a choice).
 */
function findListMarkerRange(text: string): MarkdownRange | null {
    if (text[0] !== "\\" || !isEscaped(text, 1)) return null;
    if (text[1] !== "-" && text[1] !== "*") return null;
    if (text.length > 2 && !/\s/.test(text[2])) return null;
    return { start: 0, end: 2 };
}

/**
 * Parses markdown-like inline tokens and returns the ranges of emphasized text (and its
 * delimiters), visible `\n` escapes, leading heading markers, and leading list markers.
 *
 * Escaped markers are ignored for `_`, but not for `*` (see `findDelimitedRanges`).
 * Emphasis ranges cover only the inner content; `emphasisMarkers`, `\n`, header, and list
 * marker ranges cover the visible marker/delimiter itself.
 *
 * `atLineStart` should be true only for the text actually beginning the line's narrative
 * content (heading and list markers are only meaningful there); pass false for later
 * segments of the same line (e.g. text resuming after an inline block comment).
 */
export function findMarkdownTokenRanges(text: string, atLineStart = true): MarkdownTokenRanges {
    let italic: MarkdownRange[] = [];
    let bold: MarkdownRange[] = [];
    let emphasisMarkers: MarkdownRange[] = [];
    const newlines: MarkdownRange[] = [];
    const headers: MarkdownRange[] = [];
    const listMarkers: MarkdownRange[] = [];

    for (let i = 0; i < text.length; i++) {
        const nextChar = i + 1 < text.length ? text[i + 1] : "";
        if (text[i] !== "\\" || nextChar !== "n") continue;

        // Only a `\\` pair survives as a literal backslash in ink's output; a lone `\`
        // before `n` is consumed by the escape and leaves just a bare `n` behind. The
        // whole backslash run (not just the last one) is what the author typed to get
        // that literal `\`, so it's all part of the visible `\\n` marker.
        const precedingBackslashes = countPrecedingBackslashes(text, i);
        if (precedingBackslashes % 2 === 1) {
            newlines.push({ start: i - precedingBackslashes, end: i + 2 });
            i++;
        }
    }

    if (atLineStart) {
        const headerRange = findHeaderRange(text);
        if (headerRange) headers.push(headerRange);

        const listMarkerRange = findListMarkerRange(text);
        if (listMarkerRange) listMarkers.push(listMarkerRange);
    }

    for (const marker of ["*", "_"] as const) {
        for (const delimiterLength of [3, 2, 1] as const) {
            const matches = findDelimitedRanges(text, marker, delimiterLength);
            for (const match of matches) {
                if (delimiterLength !== 2) italic.push(match.content);
                if (delimiterLength !== 1) bold.push(match.content);
                emphasisMarkers.push(...match.markers);
            }
        }
    }

    italic = sortRanges(italic);
    bold = sortRanges(bold);
    emphasisMarkers = sortRanges(emphasisMarkers);

    return { italic, bold, newlines, headers, listMarkers, emphasisMarkers };
}
