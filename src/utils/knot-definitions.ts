// Pure knot/stitch parsing logic, kept free of any `vscode` import so it can
// be unit tested directly (mirrors computeInkFoldingRanges in folding.ts).

const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";

// A knot (`== name ==`) or stitch (`= name`) header, optionally a `function`.
// The number of leading `=` distinguishes a top-level knot (2+) from a stitch
// nested in the preceding knot's body (exactly 1) — the same convention the
// hover provider's getKnotComment already relies on.
const HEADER_REGEX = new RegExp(`^\\s*(=+)\\s*(function\\s+)?(${IDENTIFIER})`);

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

        if (equals.length >= 2 || !currentKnot) {
            currentKnot = name;
            definitions.push({ knotName: name, fullName: name, filePath, line: i, isFunction });
        } else {
            definitions.push({
                knotName: currentKnot,
                stitchName: name,
                fullName: `${currentKnot}.${name}`,
                filePath,
                line: i,
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
