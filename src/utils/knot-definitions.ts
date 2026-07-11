// Pure knot/stitch parsing logic, kept free of any `vscode` import so it can
// be unit tested directly (mirrors computeInkFoldingRanges in folding.ts).

export const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";

// A knot (`== name ==`) or stitch (`= name`) header, optionally a `function`.
// The number of leading `=` distinguishes a top-level knot (2+) from a stitch
// nested in the preceding knot's body (exactly 1) — the same convention the
// hover provider's getKnotComment already relies on.
export const HEADER_REGEX = new RegExp(`^\\s*(=+)\\s*(function\\s+)?(${IDENTIFIER})`);

export interface InkFileLike {
    path: string;
    content: string;
}

export interface KnotDefinition {
    knotName: string;
    stitchName?: string;
    fullName: string;
    filePath: string;
    line: number;
    // Column where the knot/stitch's own name starts on `line` — Go to
    // Definition should land right on the name, not column 0 of the line.
    column: number;
    isFunction: boolean;
}

/**
 * Parses one .ink file's content into its knot and stitch definitions.
 */
export function extractKnotDefinitions(filePath: string, content: string): KnotDefinition[] {
    const definitions: KnotDefinition[] = [];
    let currentKnot: string | undefined;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(HEADER_REGEX);
        if (!match) continue;

        const [, equals, functionKeyword, name] = match;
        const isFunction = Boolean(functionKeyword);
        // `name` is the last thing HEADER_REGEX captures, so it always ends
        // exactly where the whole match ends — no need for a separate lookup.
        const column = match[0].length - name.length;

        if (equals.length >= 2 || !currentKnot) {
            currentKnot = name;
            definitions.push({ knotName: name, fullName: name, filePath, line: i, column, isFunction });
        } else {
            definitions.push({
                knotName: currentKnot,
                stitchName: name,
                fullName: `${currentKnot}.${name}`,
                filePath,
                line: i,
                column,
                isFunction,
            });
        }
    }

    return definitions;
}

export function getAllKnotDefinitions(files: InkFileLike[]): KnotDefinition[] {
    return files.flatMap((file) => extractKnotDefinitions(file.path, file.content));
}

/**
 * Returns the knot/stitch that encloses `lineNumber` — the nearest knot/stitch
 * header at or before that line. Used to scope things that (unlike a knot or
 * stitch itself) aren't addressable from anywhere in the file, only from
 * within their own enclosing knot/stitch — e.g. a `temp` variable, whose
 * value "is thrown away after the story leaves the stitch in which it was
 * defined" per the official docs.
 */
export function getEnclosingKnotStitch(content: string, lineNumber: number): { knotName?: string; stitchName?: string } {
    let knotName: string | undefined;
    let stitchName: string | undefined;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i <= lineNumber && i < lines.length; i++) {
        const match = lines[i].match(HEADER_REGEX);
        if (!match) continue;

        const [, equals, , name] = match;
        if (equals.length >= 2 || !knotName) {
            knotName = name;
            stitchName = undefined;
        } else {
            stitchName = name;
        }
    }

    return { knotName, stitchName };
}

// A gather (`-`) or choice (`*`/`+`) line whose bullet is immediately followed
// by a `(label_name)` — ink's "labelled gathers/options"
// (https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md,
// "Gathers and options can be labelled"). Nesting repeats the bullet
// character (e.g. `- - (top)` or `** (name)`), and a label always comes
// before any `{condition}`, so requiring it right after the bullet run is
// enough to exclude plain narrative text that starts with `-`/`*`/`+`.
const LABEL_REGEX = new RegExp(`^\\s*(?:[-*+]\\s*)+\\((${IDENTIFIER})\\)`);

export interface LabelDefinition {
    labelName: string;
    knotName?: string;
    stitchName?: string;
    // Every address that resolves to this label: the bare name (valid within
    // the same weave), `stitch.label` / `knot.label` (valid from elsewhere in
    // the same knot), and the full `knot.stitch.label` (valid from anywhere) —
    // see the doc's "Knots, stitches and labels" addressing examples.
    fullNames: string[];
    filePath: string;
    line: number;
    // Column where the label name itself starts on `line` (i.e. right after
    // the opening `(`), not the bullet that precedes it.
    column: number;
}

/**
 * Parses one .ink file's content into its labelled gather/choice definitions.
 * Unlike knots/stitches, labels are only ever looked up within the same file
 * they're defined in (see findLabelDefinitionsByName's caller) — the ink
 * compiler doesn't require an INCLUDE to divert to them, but they're still
 * only reachable via a path rooted at a knot/stitch of that same file.
 */
export function extractLabelDefinitions(filePath: string, content: string): LabelDefinition[] {
    const definitions: LabelDefinition[] = [];
    let currentKnot: string | undefined;
    let currentStitch: string | undefined;

    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const headerMatch = lines[i].match(HEADER_REGEX);
        if (headerMatch) {
            const [, equals, , name] = headerMatch;
            if (equals.length >= 2 || !currentKnot) {
                currentKnot = name;
                currentStitch = undefined;
            } else {
                currentStitch = name;
            }
            continue;
        }

        const labelMatch = lines[i].match(LABEL_REGEX);
        if (!labelMatch) continue;

        const labelName = labelMatch[1];
        // LABEL_REGEX ends with a literal `)` right after the name, so the
        // name itself starts one character before the match ends.
        const column = labelMatch[0].length - labelName.length - 1;
        const fullNames = [labelName];
        if (currentStitch) {
            fullNames.push(`${currentStitch}.${labelName}`);
            if (currentKnot) fullNames.push(`${currentKnot}.${currentStitch}.${labelName}`);
        } else if (currentKnot) {
            fullNames.push(`${currentKnot}.${labelName}`);
        }

        definitions.push({
            labelName,
            knotName: currentKnot,
            stitchName: currentStitch,
            fullNames,
            filePath,
            line: i,
            column,
        });
    }

    return definitions;
}

/**
 * Resolves a label name (bare, or a dotted `stitch.label` / `knot.label` /
 * `knot.stitch.label` path) against every known label in the file. A bare
 * name matches every label with that name regardless of which knot/stitch
 * it's nested in — the same "propose every match" simplification
 * findKnotDefinitionsByName already makes for unqualified stitch names.
 */
export function findLabelDefinitionsByName(definitions: LabelDefinition[], name: string): LabelDefinition[] {
    return definitions.filter((def) => def.fullNames.includes(name));
}

/**
 * Resolves a knot/stitch name (either a bare `knot`/`stitch` name, or a dotted
 * `knot.stitch` divert target) against every known definition. A bare name
 * matches a top-level knot of that name, and any stitch with that plain name
 * (ink allows diverting to a local stitch without qualifying it) — so more
 * than one location can come back, e.g. when two knots share a name across
 * different files.
 */
export function findKnotDefinitionsByName(definitions: KnotDefinition[], fullName: string): KnotDefinition[] {
    if (fullName.includes(".")) {
        return definitions.filter((def) => def.fullName === fullName);
    }
    return definitions.filter((def) => (def.knotName === fullName && !def.stitchName) || def.stitchName === fullName);
}

/**
 * Computes where to insert a new `INCLUDE` statement and what text to write,
 * given the target document's lines: alongside any `INCLUDE` lines already at
 * the very top of the file, or right at the top if there are none there
 * (INCLUDE statements elsewhere in the file, not part of that leading block,
 * are ignored — ink convention is to keep them all together at the start).
 * Always leaves at least one blank line between the include block and
 * whatever follows, adding one if the file doesn't already have it.
 */
export function computeIncludeInsertion(lines: string[], relativePath: string): { line: number; text: string } {
    let includeCount = 0;
    while (includeCount < lines.length && /^\s*INCLUDE\s+/.test(lines[includeCount])) {
        includeCount++;
    }

    const nextLineIsBlank = lines[includeCount] === undefined || lines[includeCount].trim() === "";
    let text = `INCLUDE ${relativePath}\n`;
    if (!nextLineIsBlank) {
        text += "\n";
    }

    return { line: includeCount, text };
}
