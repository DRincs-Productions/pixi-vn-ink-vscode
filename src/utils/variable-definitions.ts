// Pure VAR/CONST/LIST parsing logic, kept free of any `vscode` import so it
// can be unit tested directly (mirrors knot-definitions.ts).

const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";

// `VAR name = ...` / `CONST name = ...`, documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
const VAR_OR_CONST_REGEX = new RegExp(`^\\s*(VAR|CONST)\\s+(${IDENTIFIER})\\b`);

// `LIST name = item, (item), item = 5, ...` — item names may be parenthesized
// (meaning "not in the list's default state") and/or given an explicit
// integer value; either way the bare identifier before any `=`/`(`/`)` is
// the item's actual name.
const LIST_REGEX = new RegExp(`^\\s*LIST\\s+(${IDENTIFIER})\\s*=\\s*(.+)$`);
const IDENTIFIER_ONLY_REGEX = new RegExp(`^${IDENTIFIER}$`);

export type VariableKind = "VAR" | "CONST" | "LIST" | "LIST_ITEM";

export interface VariableDefinition {
    name: string;
    kind: VariableKind;
    // Present only for a LIST_ITEM: the list it was declared in.
    listName?: string;
    // Every address that resolves to this definition: the bare name, plus
    // `list.item` for a list item (ink's syntax for disambiguating an item
    // name shared by more than one list).
    fullNames: string[];
    line: number;
}

/**
 * Parses one .ink file's content into its VAR/CONST/LIST declarations —
 * including each LIST's individual item names, which are themselves usable
 * identifiers (e.g. `~ temp x = Adams`, `{DoctorsInSurgery has Adams}`).
 */
export function extractVariableDefinitions(content: string): VariableDefinition[] {
    const definitions: VariableDefinition[] = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
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

        const varMatch = lines[i].match(VAR_OR_CONST_REGEX);
        if (varMatch) {
            const [, kind, name] = varMatch;
            definitions.push({ name, kind: kind as "VAR" | "CONST", fullNames: [name], line: i });
        }
    }

    return definitions;
}

/**
 * Resolves a variable/constant/list/list-item name (bare, or a dotted
 * `list.item` path) against every known definition. A bare name matches every
 * definition with that name — including every list that happens to declare
 * an item of that name — so more than one can come back when ambiguous,
 * same as findKnotDefinitionsByName's handling of unqualified stitch names.
 */
export function findVariableDefinitionsByName(definitions: VariableDefinition[], name: string): VariableDefinition[] {
    return definitions.filter((def) => def.fullNames.includes(name));
}
