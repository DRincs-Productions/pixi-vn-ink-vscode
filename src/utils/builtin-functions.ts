// Built-in ink "game query" functions, documented in
// https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md
export const BUILTIN_FUNCTIONS: Record<string, string> = {
    CHOICE_COUNT:
        "**CHOICE_COUNT()**: Returns the number of options created so far in the current chunk. Useful for controlling how many options a player gets on a turn.\n\nExample:\n```ink\n*\t{false} Option A\n*\t{true} Option B\n*\t{CHOICE_COUNT() == 1} Option C\n```",
    TURNS: "**TURNS()**: Returns the number of game turns (player choices) since the story began.",
    TURNS_SINCE:
        "**TURNS_SINCE(-> knot)**: Returns the number of turns since the given knot/stitch was last visited. `0` means it was visited as part of the current chunk, `-1` means it has never been visited.\n\nExample:\n```ink\n*\t{TURNS_SINCE(-> sleeping.intro) > 10} You are feeling tired... -> sleeping\n*\t{TURNS_SINCE(-> laugh) == 0} You try to stop laughing.\n```",
    SEED_RANDOM:
        "**SEED_RANDOM(seed)**: Seeds the random number generator so that `RANDOM()` produces the same sequence of outcomes every time the story is played. Useful for testing.\n\nExample:\n```ink\n~ SEED_RANDOM(235)\n```",
    RANDOM: "**RANDOM(min, max)**: Returns a random integer between `min` and `max`, inclusive (like rolling a dice).\n\nExample:\n```ink\n~ temp dice_roll = RANDOM(1, 6)\n```",
    INT: "**INT(x)**: Casts `x` to an integer, truncating towards zero.\n\nExample:\n```ink\n{INT(3.2)} is 3.\n{INT(-4.8)} is -4.\n```",
    FLOOR: "**FLOOR(x)**: Casts `x` to an integer, rounding down.\n\nExample:\n```ink\n{FLOOR(4.8)} is 4.\n{FLOOR(-4.8)} is -5.\n```",
    FLOAT: "**FLOAT(x)**: Casts `x` to a floating point number.\n\nExample:\n```ink\n{FLOAT(4)} is, um, still 4.\n```",
    POW: "**POW(base, exponent)**: Raises `base` to the power of `exponent`.\n\nExample:\n```ink\n{POW(3, 2)} is 9.\n{POW(16, 0.5)} is 4.\n```",
    LIST_VALUE:
        "**LIST_VALUE(listItem)**: Returns the underlying numerical value of a list item. Note that the first value in a list is `1`, not `0`.\n\nExample:\n```ink\nThe lecturer has {LIST_VALUE(deafening) - LIST_VALUE(lecturersVolume)} notches still available to him.\n```",
    LIST_COUNT:
        '**LIST_COUNT(list)**: Returns the number of items currently in the list.\n\nExample:\n```ink\n{LIST_COUNT(DoctorsInSurgery)} // "2"\n```',
    LIST_MIN:
        '**LIST_MIN(list)**: Returns a list containing only the item with the lowest value in the given list.\n\nExample:\n```ink\n{LIST_MIN(DoctorsInSurgery)} // "Adams"\n```',
    LIST_MAX:
        '**LIST_MAX(list)**: Returns a list containing only the item with the highest value in the given list.\n\nExample:\n```ink\n{LIST_MAX(DoctorsInSurgery)} // "Cartwright"\n```',
    LIST_RANDOM:
        '**LIST_RANDOM(list)**: Returns a list containing a single random item from the given list.\n\nExample:\n```ink\n{LIST_RANDOM(DoctorsInSurgery)} // "Adams" or "Cartwright"\n```',
    LIST_ALL:
        "**LIST_ALL(list)**: Returns a list containing every possible item defined for the same underlying `LIST` type, not just the ones currently set.\n\nExample:\n```ink\n{LIST_ALL(DoctorsInSurgery)} // Adams, Bernard, Cartwright, Denver, Eamonn\n```",
    LIST_RANGE:
        "**LIST_RANGE(list, min, max)**: Returns a slice of the list containing only the items whose numerical values fall between `min` and `max`, inclusive.\n\nExample:\n```ink\n{LIST_RANGE(LIST_ALL(primeNumbers), 10, 20)}\n```",
    LIST_INVERT:
        "**LIST_INVERT(list)**: Returns the inverse of the list — every possible item that is *not* currently in it. Returns `null` if the list is empty and its origin list can't be inferred.\n\nExample:\n```ink\n~ GuardsOnDuty = LIST_INVERT(GuardsOnDuty)\n```",
};

// Built-in functions from BUILTIN_FUNCTIONS that the `pixi-vn` engine doesn't implement yet.
export const PIXI_VN_UNIMPLEMENTED_FUNCTIONS = new Set([
    "CHOICE_COUNT",
    "TURNS",
    "TURNS_SINCE",
    "SEED_RANDOM",
    "LIST_RANDOM",
    "LIST_COUNT",
    "LIST_INVERT",
    "LIST_ALL",
    "LIST_RANGE",
    "LIST_MIN",
    "LIST_MAX",
    "LIST_VALUE",
]);

export const PIXI_VN_ISSUES_URL = "https://github.com/DRincs-Productions/pixi-vn-ink-vscode/issues";

/**
 * Returns true when the word ending at `wordEndChar` is immediately followed
 * (ignoring whitespace) by an opening parenthesis, i.e. it's being used as a
 * function call rather than just appearing as plain text.
 */
export function isBuiltinFunctionCallContext(line: string, wordEndChar: number): boolean {
    return /^\s*\(/.test(line.substring(wordEndChar));
}

/**
 * Finds every call, on `line`, to a built-in function not yet implemented by
 * the `pixi-vn` engine. Skips single-line comments.
 */
export function findPixiVnUnimplementedFunctionCalls(line: string): { name: string; start: number; end: number }[] {
    if (line.trimStart().startsWith("//")) return [];

    const results: { name: string; start: number; end: number }[] = [];
    for (const name of PIXI_VN_UNIMPLEMENTED_FUNCTIONS) {
        const regex = new RegExp(`\\b${name}\\b`, "g");
        let match: RegExpExecArray | null = regex.exec(line);
        while (match !== null) {
            const end = match.index + name.length;
            if (isBuiltinFunctionCallContext(line, end)) {
                results.push({ name, start: match.index, end });
            }
            match = regex.exec(line);
        }
    }

    return results.sort((a, b) => a.start - b.start);
}
