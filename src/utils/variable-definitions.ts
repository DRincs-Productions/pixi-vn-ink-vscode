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

export type VariableKind = "VAR" | "CONST" | "LIST" | "LIST_ITEM" | "TEMP";

export interface VariableDefinition {
    name: string;
    kind: VariableKind;
    // Present only for a LIST_ITEM: the list it was declared in.
    listName?: string;
    // Present only for a TEMP: the knot/stitch it's scoped to (see TEMP_REGEX).
    knotName?: string;
    stitchName?: string;
    // Every address that resolves to this definition: the bare name, plus
    // `list.item` for a list item (ink's syntax for disambiguating an item
    // name shared by more than one list).
    fullNames: string[];
    line: number;
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
            continue;
        }

        const listMatch = lines[i].match(LIST_REGEX);
        if (listMatch) {
            const [, listName, itemsText] = listMatch;
            definitions.push({ name: listName, kind: "LIST", fullNames: [listName], line: i });

            for (const rawItem of itemsText.split(",")) {
                const itemName = rawItem.replace(/[()]/g, "").split("=")[0].trim();
                if (!IDENTIFIER_ONLY_REGEX.test(itemName)) continue;

                definitions.push({
                    name: itemName,
                    kind: "LIST_ITEM",
                    listName,
                    fullNames: [itemName, `${listName}.${itemName}`],
                    line: i,
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
            });
            continue;
        }

        const varMatch = lines[i].match(VAR_OR_CONST_REGEX);
        if (varMatch) {
            const [, kind, name] = varMatch;
            definitions.push({ name, kind: kind as "VAR" | "CONST", fullNames: [name], line: i });
        }
    }

    return definitions;
}

/**
 * Resolves a variable/constant/list/list-item/temp name (bare, or a dotted
 * `list.item` path) against every known definition. A bare name matches every
 * VAR/CONST/LIST/LIST_ITEM definition with that name — including every list
 * that happens to declare an item of that name — so more than one can come
 * back when ambiguous, same as findKnotDefinitionsByName's handling of
 * unqualified stitch names.
 *
 * A `temp`, however, only matches when `scope` (the knot/stitch enclosing the
 * *reference*, from getEnclosingKnotStitch) is exactly the knot/stitch it was
 * declared in — its value doesn't exist anywhere else, so a same-named temp
 * in a different stitch must never be offered as if it were reachable.
 */
export function findVariableDefinitionsByName(
    definitions: VariableDefinition[],
    name: string,
    scope: { knotName?: string; stitchName?: string } = {},
): VariableDefinition[] {
    return definitions.filter((def) => {
        if (!def.fullNames.includes(name)) return false;
        if (def.kind !== "TEMP") return true;
        return def.knotName === scope.knotName && def.stitchName === scope.stitchName;
    });
}
