import { InkCompiler } from "@drincs/pixi-vn-ink/parser";
import type { InkValidationInfo } from "@drincs/pixi-vn-ink/parser";
import type { InkTextReplaceInfo } from "@drincs/pixi-vn-ink/dev-api";

// zod's own `toJSONSchema` (used by @drincs/pixi-vn-ink's serializeValidation) always embeds a
// "$schema": ".../draft/2020-12/schema" key, but Ajv (which InkCompiler.getSchemaValidator uses
// internally) has no meta-schema registered for that URL and throws trying to compile it as-is.
// Ajv already validates against draft 2020-12 semantics by default, so the key is safe to drop.
function stripSchemaKeyword(schema: Record<string, unknown>): Record<string, unknown> {
    const { $schema, ...rest } = schema;
    return rest;
}

// Compiling an Ajv validator isn't free, and the same handful of schemas get checked against
// every `[...]` span on every semantic-token/hover request — cache by schema content so a schema
// that hasn't changed since the last dev-server poll is never recompiled.
const compiledValidatorCache = new Map<string, ReturnType<typeof InkCompiler.getSchemaValidator>>();

function getCachedSchemaValidator(schema: Record<string, unknown>) {
    const key = JSON.stringify(schema);
    let validator = compiledValidatorCache.get(key);
    if (!validator) {
        validator = InkCompiler.getSchemaValidator(stripSchemaKeyword(schema));
        compiledValidatorCache.set(key, validator);
    }
    return validator;
}

/**
 * Checks `content` (the text between a `[` and `]` pair, brackets excluded) against a single
 * text-replace handler's serialized validation rule — mirroring `TextReplaces.applyHandler`'s own
 * matching semantics (`@drincs/pixi-vn-json`'s translator: `validation.test(key)` for a regexp,
 * `validation.safeParse(key)` for a zod schema, an exact `RegisteredCharacters.has(key)` check for
 * the `"characterId"` literal, unconditional for `"all"`), so a coloured/hovered `[...]` in the
 * editor actually predicts what the running app would replace.
 */
export function matchesTextReplaceValidation(
    content: string,
    validation: InkValidationInfo,
    characterIds: ReadonlySet<string>,
): boolean {
    // The dev server's wire format for this endpoint isn't part of its typed surface — an entry
    // with no `validation` at all, or one whose shape doesn't match any known kind, must not throw
    // and take down the whole semantic-token/hover request (and thus every other feature relying
    // on the same providers) for every `[...]` in the file.
    try {
        switch (validation?.type) {
            case "literal":
                if (validation.value === "all") return true;
                if (validation.value === "characterId") return characterIds.has(content);
                return false;
            case "regexp":
                return new RegExp(validation.source, validation.flags).test(content);
            case "zod": {
                const validator = getCachedSchemaValidator(validation.schema);
                return InkCompiler.validateAgainstJsonSchema(content, validator).length === 0;
            }
            default:
                return false;
        }
    } catch {
        return false;
    }
}

/**
 * Returns the first registered text-replace handler whose validation rule matches `content`, or
 * `undefined` if none does.
 */
export function findMatchingTextReplace(
    content: string,
    textReplaces: readonly InkTextReplaceInfo[],
    characterIds: ReadonlySet<string>,
): InkTextReplaceInfo | undefined {
    return textReplaces.find((entry) => matchesTextReplaceValidation(content, entry.validation, characterIds));
}
