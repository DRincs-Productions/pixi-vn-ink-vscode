import * as assert from 'assert';
import type { InkTextReplaceInfo } from '@drincs/pixi-vn-ink/dev-api';
import type { InkValidationInfo } from '@drincs/pixi-vn-ink/parser';
import { findMatchingTextReplace, matchesTextReplaceValidation, replaceKnownTextReplaces } from '../utils/pixi-vn-text-replace';

suite('pixi-vn-text-replace Test Suite', () => {
	const characterIds = new Set(['mc', 'sly']);

	suite('matchesTextReplaceValidation', () => {
		test('literal "all": matches any content', () => {
			const validation: InkValidationInfo = { type: 'literal', value: 'all' };
			assert.strictEqual(matchesTextReplaceValidation('anything at all', validation, characterIds), true);
			assert.strictEqual(matchesTextReplaceValidation('', validation, characterIds), true);
		});

		test('literal "characterId": matches only a registered character id, exactly', () => {
			const validation: InkValidationInfo = { type: 'literal', value: 'characterId' };
			assert.strictEqual(matchesTextReplaceValidation('sly', validation, characterIds), true);
			assert.strictEqual(matchesTextReplaceValidation('unknown_char', validation, characterIds), false);
			// Exact match only — no partial/case-insensitive matching.
			assert.strictEqual(matchesTextReplaceValidation('Sly', validation, characterIds), false);
		});

		test('literal: any other value never matches (the real type only ever produces "all"/"characterId")', () => {
			const validation = { type: 'literal', value: 'something-else' } as InkValidationInfo;
			assert.strictEqual(matchesTextReplaceValidation('something-else', validation, characterIds), false);
		});

		test('regexp: RegExp#test on the whole content, not anchored implicitly', () => {
			const anchored: InkValidationInfo = { type: 'regexp', source: '^name$', flags: '' };
			assert.strictEqual(matchesTextReplaceValidation('name', anchored, characterIds), true);
			assert.strictEqual(matchesTextReplaceValidation('names', anchored, characterIds), false);

			// Unanchored: substring match, same as a plain `regex.test(key)` call.
			const unanchored: InkValidationInfo = { type: 'regexp', source: 'name', flags: '' };
			assert.strictEqual(matchesTextReplaceValidation('a name here', unanchored, characterIds), true);
		});

		test('regexp: an invalid pattern is caught and treated as no match, not thrown', () => {
			const invalid: InkValidationInfo = { type: 'regexp', source: '(unclosed', flags: '' };
			assert.strictEqual(matchesTextReplaceValidation('anything', invalid, characterIds), false);
		});

		test('zod: validates the raw content string against the JSON Schema, $schema key included', () => {
			// serializeValidation (in @drincs/pixi-vn-ink) always embeds "$schema" from zod's own
			// toJSONSchema — matchesTextReplaceValidation must strip it itself before handing the
			// schema to Ajv, which has no meta-schema registered for that draft-2020-12 URL.
			const validation: InkValidationInfo = {
				type: 'zod',
				schema: {
					$schema: 'https://json-schema.org/draft/2020-12/schema',
					type: 'string',
					enum: ['player', 'npc'],
				},
			};
			assert.strictEqual(matchesTextReplaceValidation('player', validation, characterIds), true);
			assert.strictEqual(matchesTextReplaceValidation('npc', validation, characterIds), true);
			assert.strictEqual(matchesTextReplaceValidation('enemy', validation, characterIds), false);
		});

		test('zod: reuses a cached compiled validator for the same schema content across calls', () => {
			const validation: InkValidationInfo = {
				type: 'zod',
				schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string', minLength: 3 },
			};
			// Calling it repeatedly must not throw or degrade — exercises the schema-content cache.
			for (let i = 0; i < 5; i++) {
				assert.strictEqual(matchesTextReplaceValidation('ok', validation, characterIds), false);
				assert.strictEqual(matchesTextReplaceValidation('okay', validation, characterIds), true);
			}
		});

		test('zod: a malformed schema is caught and treated as no match, not thrown', () => {
			const malformed = { type: 'zod', schema: { type: 'not-a-real-json-schema-type' } } as InkValidationInfo;
			assert.strictEqual(matchesTextReplaceValidation('anything', malformed, characterIds), false);
		});

		test('a missing/null/unrecognized "validation" is caught and treated as no match, not thrown — regression test for a real bug where the dev server\'s wire format for this endpoint (not part of its typed surface) could crash the whole semantic-token/hover request', () => {
			assert.strictEqual(
				matchesTextReplaceValidation('anything', undefined as unknown as InkValidationInfo, characterIds),
				false,
			);
			assert.strictEqual(
				matchesTextReplaceValidation('anything', null as unknown as InkValidationInfo, characterIds),
				false,
			);
			assert.strictEqual(
				matchesTextReplaceValidation('anything', { type: 'some-future-kind' } as unknown as InkValidationInfo, characterIds),
				false,
			);
		});
	});

	suite('findMatchingTextReplace', () => {
		const textReplaces: InkTextReplaceInfo[] = [
			{
				name: 'character-name',
				description: 'Replaces a registered character id with its display name.',
				validation: { type: 'literal', value: 'characterId' },
			},
			{
				name: 'enum-role',
				description: 'A player/npc role token.',
				validation: {
					type: 'zod',
					schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string', enum: ['player', 'npc'] },
				},
			},
		];

		test('returns the first handler whose validation matches', () => {
			assert.strictEqual(findMatchingTextReplace('sly', textReplaces, characterIds)?.name, 'character-name');
			assert.strictEqual(findMatchingTextReplace('player', textReplaces, characterIds)?.name, 'enum-role');
		});

		test('returns undefined when no handler matches', () => {
			assert.strictEqual(findMatchingTextReplace('unknown_char', textReplaces, characterIds), undefined);
			assert.strictEqual(findMatchingTextReplace('enemy', textReplaces, characterIds), undefined);
		});

		test('returns undefined for an empty handler list', () => {
			assert.strictEqual(findMatchingTextReplace('sly', [], characterIds), undefined);
		});

		test('skips malformed entries (missing/null/unrecognized validation) instead of throwing, and still finds a later valid match', () => {
			const withGarbage = [
				{ name: 'no-validation-field' } as unknown as InkTextReplaceInfo,
				{ name: 'null-validation', validation: null } as unknown as InkTextReplaceInfo,
				{ name: 'weird-type', validation: { type: 'unknown-future-kind' } } as unknown as InkTextReplaceInfo,
				{ name: 'character-name', validation: { type: 'literal', value: 'characterId' } } as InkTextReplaceInfo,
			];
			assert.strictEqual(findMatchingTextReplace('sly', withGarbage, characterIds)?.name, 'character-name');
		});
	});

	suite('replaceKnownTextReplaces', () => {
		const textReplaces: InkTextReplaceInfo[] = [
			{
				name: 'character-name',
				description: 'Replaces a registered character id with its display name.',
				validation: { type: 'literal', value: 'characterId' },
			},
		];

		test('a `[key]` matching a known handler is replaced with the bare key, brackets stripped', () => {
			assert.strictEqual(
				replaceKnownTextReplaces('Ooh, [mc]! Nice, firm handshake!', textReplaces, characterIds),
				'Ooh, mc! Nice, firm handshake!',
			);
		});

		test('a `[key]` matching no known handler is left completely untouched', () => {
			assert.strictEqual(
				replaceKnownTextReplaces('Something [unrelated] here.', textReplaces, characterIds),
				'Something [unrelated] here.',
			);
		});

		test('every matching occurrence in the text is replaced', () => {
			assert.strictEqual(
				replaceKnownTextReplaces('[mc] shakes hands with [sly].', textReplaces, characterIds),
				'mc shakes hands with sly.',
			);
		});

		test('an empty handler list leaves the text completely untouched', () => {
			assert.strictEqual(replaceKnownTextReplaces('Hello [mc]!', [], characterIds), 'Hello [mc]!');
		});

		test('text with no `[...]` span at all is returned as-is', () => {
			assert.strictEqual(replaceKnownTextReplaces('Just plain narration.', textReplaces, characterIds), 'Just plain narration.');
		});
	});

	// A real handler list recorded from `GET /__pixi-vn-ink/text-replaces` on a running pixi-vn dev
	// server, exercising the real wire shape (a regexp handler alongside a `characterId` one).
	suite('real dev-server fixture', () => {
		const liveTextReplaces: InkTextReplaceInfo[] = [
			{
				name: 'steph_fullname',
				description: "Replaces the placeholder 'steph_fullname' with the full name of the character Stephanie.",
				validation: { type: 'regexp', source: 'steph_fullname', flags: '' },
				type: 'after-translation',
			},
			{
				name: 'character name',
				description: "Replaces a character ID with the character's name in the game.",
				validation: { type: 'literal', value: 'characterId' },
				type: 'after-translation',
			},
		];

		test('a regexp handler matches regardless of registered character ids', () => {
			assert.strictEqual(
				replaceKnownTextReplaces('Say hi to [steph_fullname].', liveTextReplaces, new Set()),
				'Say hi to steph_fullname.',
			);
		});

		// A `characterId` handler can only match ids `getPixiVnDevCharacterIds()` actually knows
		// about — an empty set (e.g. the dev server hasn't reported any character yet) correctly
		// leaves a character-id `[key]` untouched rather than guessing.
		test('a characterId handler only matches ids present in the given set', () => {
			assert.strictEqual(
				replaceKnownTextReplaces("Don't worry, [mc], she's just giving you the run-down.", liveTextReplaces, new Set()),
				"Don't worry, [mc], she's just giving you the run-down.",
			);
			assert.strictEqual(
				replaceKnownTextReplaces(
					"Don't worry, [mc], she's just giving you the run-down.",
					liveTextReplaces,
					new Set(['mc', 'sly']),
				),
				"Don't worry, mc, she's just giving you the run-down.",
			);
		});
	});
});
