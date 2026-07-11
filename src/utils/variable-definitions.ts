// Pure VAR/CONST/LIST/temp parsing logic, kept free of any `vscode` import so
// it can be unit tested directly (mirrors knot-definitions.ts).

import { HEADER_REGEX, IDENTIFIER } from "./knot-definitions";

// `VAR name = ...` / `CONST name = ...`, documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
const VAR_OR_CONST_REGEX = new RegExp(`^\\s*(VAR|CONST)\\s+(${IDENTIFIER})\\b`);

// `~ temp name = ...`. Unlike VAR/CONST/LIST, a temp's "value is thrown away
// after the story leaves the stitch in which it was defined" (per the
// official docs), so it's only ever addressable from within that same
// knot/stitch — see getEnclosingKnotStitch and findVariableDefinitionsByName.
const TEMP_REGEX = new RegExp(`^\\s*~\\s*temp\\s+(${IDENTIFIER})\\b`);

// `LIST name = item, (item), item = 5, ...` — item names may be parenthesized
// (meaning "not in the list's default state") and/or given an explicit
// integer value; either way the bare identifier before any `=`/`(`/`)` is
// the item's actual name.
const LIST_REGEX = new RegExp(`^\\s*LIST\\s+(${IDENTIFIER})\\s*=\\s*(.+)$`);
const IDENTIFIER_ONLY_REGEX = new RegExp(`^${IDENTIFIER}$`);

// The parenthesized parameter list on a knot/stitch/function header line
// (`=== name(ref x, y) ===`). "Any knot or stitch can be given a value as a
// parameter" per the official docs — a parameter is itself "a particularly
// useful form of temporary variable", so — like `~ temp` — it's only
// addressable from within that same knot/stitch (see getEnclosingKnotStitch).
// A leading `ref` marks it as passed by reference: the callee can alter the
// caller's actual variable instead of receiving a copy of its value.
const PARAMS_REGEX = /\(([^)]*)\)/;
// Tightened to an exact identifier (rather than `(.+)$`) so its match ends
// exactly where the name ends — see the `column` computation below, which
// relies on that to locate the name past a leading `ref`.
const REF_PARAM_REGEX = new RegExp(`^ref\\s+(${IDENTIFIER})$`);

export type VariableKind = "VAR" | "CONST" | "LIST" | "LIST_ITEM" | "TEMP" | "PARAM";

export interface VariableDefinition {
    name: string;
    kind: VariableKind;
    // Present only for a LIST_ITEM: the list it was declared in.
    listName?: string;
    // Present only for a TEMP or PARAM: the knot/stitch it's scoped to.
    knotName?: string;
    stitchName?: string;
    // Present only for a PARAM: whether it's declared with a leading `ref`.
    isRef?: boolean;
    // Every address that resolves to this definition: the bare name, plus
    // `list.item` for a list item (ink's syntax for disambiguating an item
    // name shared by more than one list).
    fullNames: string[];
    line: number;
    // Column where the name itself starts on `line` — Go to Definition should
    // land right on the name, not column 0 of the line.
    column: number;
}

/**
 * Parses one .ink file's content into its VAR/CONST/LIST/temp declarations —
 * including each LIST's individual item names, which are themselves usable
 * identifiers (e.g. `~ temp x = Adams`, `{DoctorsInSurgery has Adams}`).
 */
export function extractVariableDefinitions(content: string): VariableDefinition[] {
    const definitions: VariableDefinition[] = [];
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

            // PARAMS_REGEX isn't anchored, so match.index is the absolute
            // column of the opening `(` — the parameter list itself starts
            // right after it.
            const paramsMatch = lines[i].match(PARAMS_REGEX);
            if (paramsMatch?.index !== undefined) {
                const paramsOffset = paramsMatch.index + 1;
                const paramsText = paramsMatch[1];
                let searchFrom = 0;
                for (const rawParam of paramsText.split(",")) {
                    const rawStart = searchFrom;
                    searchFrom += rawParam.length + 1; // +1 for the comma just split on

                    const trimmed = rawParam.trim();
                    if (!trimmed) continue;
                    const leadingWs = rawParam.length - rawParam.trimStart().length;

                    const refMatch = trimmed.match(REF_PARAM_REGEX);
                    const paramName = refMatch ? refMatch[1] : trimmed;
                    if (!IDENTIFIER_ONLY_REGEX.test(paramName)) continue;

                    // Without `ref`, the name is the trimmed content itself (offset 0).
                    // With `ref`, the name starts right after "ref" + its whitespace.
                    const nameOffsetInTrimmed = refMatch ? refMatch[0].length - paramName.length : 0;
                    const column = paramsOffset + rawStart + leadingWs + nameOffsetInTrimmed;

                    definitions.push({
                        name: paramName,
                        kind: "PARAM",
                        isRef: Boolean(refMatch),
                        knotName: currentKnot,
                        stitchName: currentStitch,
                        fullNames: [paramName],
                        line: i,
                        column,
                    });
                }
            }
            continue;
        }

        const listMatch = lines[i].match(LIST_REGEX);
        if (listMatch) {
            const [, listName, itemsText] = listMatch;
            // listName is followed by `\s*=\s*(.+)$`, so it isn't at the tail
            // of the match — but a header-only sub-match of the same prefix is.
            const listNameMatch = lines[i].match(new RegExp(`^\\s*LIST\\s+(${IDENTIFIER})`));
            const listNameColumn = listNameMatch ? listNameMatch[0].length - listName.length : 0;
            definitions.push({ name: listName, kind: "LIST", fullNames: [listName], line: i, column: listNameColumn });

            // itemsText is captured via `(.+)$`, so it's exactly the tail of the line.
            const itemsOffset = lines[i].length - itemsText.length;
            let searchFrom = 0;
            for (const rawItem of itemsText.split(",")) {
                const rawStart = searchFrom;
                searchFrom += rawItem.length + 1; // +1 for the comma just split on

                const itemName = rawItem.replace(/[()]/g, "").split("=")[0].trim();
                if (!IDENTIFIER_ONLY_REGEX.test(itemName)) continue;

                const nameOffsetInRaw = rawItem.indexOf(itemName);
                const column = itemsOffset + rawStart + nameOffsetInRaw;

                definitions.push({
                    name: itemName,
                    kind: "LIST_ITEM",
                    listName,
                    fullNames: [itemName, `${listName}.${itemName}`],
                    line: i,
                    column,
                });
            }
            continue;
        }

        const tempMatch = lines[i].match(TEMP_REGEX);
        if (tempMatch) {
            const [, name] = tempMatch;
            definitions.push({
                name,
                kind: "TEMP",
                knotName: currentKnot,
                stitchName: currentStitch,
                fullNames: [name],
                line: i,
                column: tempMatch[0].length - name.length,
            });
            continue;
        }

        const varMatch = lines[i].match(VAR_OR_CONST_REGEX);
        if (varMatch) {
            const [, kind, name] = varMatch;
            definitions.push({
                name,
                kind: kind as "VAR" | "CONST",
                fullNames: [name],
                line: i,
                column: varMatch[0].length - name.length,
            });
        }
    }

    return definitions;
}

/**
 * Resolves a variable/constant/list/list-item/temp/parameter name (bare, or a
 * dotted `list.item` path) against every known definition. A bare name
 * matches every VAR/CONST/LIST/LIST_ITEM definition with that name —
 * including every list that happens to declare an item of that name — so
 * more than one can come back when ambiguous, same as
 * findKnotDefinitionsByName's handling of unqualified stitch names.
 *
 * A `temp` or a parameter, however, only matches when `scope` (the
 * knot/stitch enclosing the *reference*, from getEnclosingKnotStitch) is
 * exactly the knot/stitch it was declared in — its value doesn't exist
 * anywhere else, so a same-named temp/parameter in a different stitch must
 * never be offered as if it were reachable.
 */
export function findVariableDefinitionsByName(
    definitions: VariableDefinition[],
    name: string,
    scope: { knotName?: string; stitchName?: string } = {},
): VariableDefinition[] {
    return definitions.filter((def) => {
        if (!def.fullNames.includes(name)) return false;
        if (def.kind !== "TEMP" && def.kind !== "PARAM") return true;
        return def.knotName === scope.knotName && def.stitchName === scope.stitchName;
    });
}
