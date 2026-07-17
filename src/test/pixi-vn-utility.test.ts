import * as assert from 'assert';
import type { InkTextReplaceInfo } from '@drincs/pixi-vn-ink/dev-api';
import {
	NON_INK_LABEL_CALL_CHARACTER,
	NON_INK_LABEL_JUMP_CHARACTER,
	applyKnownTextReplaces,
	collectKnownPixiVnLabels,
	extractReferencedKnotNames,
	markUnresolvableLabelCalls,
} from '../utils/pixi-vn-utility';

suite('pixi-vn-utility Test Suite', () => {
	suite('extractReferencedKnotNames', () => {
		test('finds a divert (->) target', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('-> some_knot\n'), new Set(['some_knot']));
		});

		test('finds a thread (<-) target', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('<- some_knot\n'), new Set(['some_knot']));
		});

		test('reduces a dotted stitch path to its leading knot name', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('-> some_knot.some_stitch\n'), new Set(['some_knot']));
		});

		test('a tunnel-return-elsewhere (->-> destination) still extracts the destination', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('->-> destination\n'), new Set(['destination']));
		});

		test('a bare tunnel return (->->) with nothing after it extracts nothing', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('->->\n'), new Set());
		});

		test('ignores a reference inside a single-line comment', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('// -> some_knot\n'), new Set());
		});

		test('collects every distinct reference across multiple lines, deduplicated', () => {
			const text = ['-> knot_a', '<- knot_b', '-> knot_a', 'Some narrative text with no reference.'].join('\n');
			assert.deepStrictEqual(extractReferencedKnotNames(text), new Set(['knot_a', 'knot_b']));
		});

		test('plain narrative text with no diverts/threads at all yields an empty set', () => {
			assert.deepStrictEqual(extractReferencedKnotNames('Just some prose.\n'), new Set());
		});
	});

	suite('collectKnownPixiVnLabels', () => {
		test('unions label ids across every given json', () => {
			const known = collectKnownPixiVnLabels([{ labels: { a: [], b: [] } }, { labels: { c: [] } }]);
			assert.deepStrictEqual(known, new Set(['a', 'b', 'c']));
		});

		test('a json with no labels at all contributes nothing', () => {
			const known = collectKnownPixiVnLabels([{ labels: { a: [] } }, {}]);
			assert.deepStrictEqual(known, new Set(['a']));
		});
	});

	suite('markUnresolvableLabelCalls', () => {
		test('a call to an unknown label becomes a centered notice naming it, and continues (no `end`)', () => {
			const json = { labels: { main: [{ labelToOpen: { label: 'ghost_label', type: 'call' as const } }] } };

			const result = markUnresolvableLabelCalls(json, new Set(['main']));

			assert.deepStrictEqual(result.labels?.main, [
				{ dialogue: { character: NON_INK_LABEL_CALL_CHARACTER, text: 'ghost_label' } },
			]);
		});

		test('a jump to an unknown label becomes a centered notice naming it, and ends just this label (`label_end`)', () => {
			const json = { labels: { main: [{ labelToOpen: { label: 'ghost_label', type: 'jump' as const } }] } };

			const result = markUnresolvableLabelCalls(json, new Set(['main']));

			assert.deepStrictEqual(result.labels?.main, [
				{ dialogue: { character: NON_INK_LABEL_JUMP_CHARACTER, text: 'ghost_label' }, end: 'label_end' },
			]);
		});

		test('a call/jump to a label present in knownLabels is left completely untouched', () => {
			const step = { labelToOpen: { label: 'real_knot', type: 'call' as const } };
			const json = { labels: { main: [step] } };

			const result = markUnresolvableLabelCalls(json, new Set(['main', 'real_knot']));

			assert.deepStrictEqual(result.labels?.main, [step]);
		});

		test('a step with no labelToOpen at all is left untouched', () => {
			const step = { dialogue: 'Just some narration.' };
			const json = { labels: { main: [step] } };

			const result = markUnresolvableLabelCalls(json, new Set(['main']));

			assert.deepStrictEqual(result.labels?.main, [step]);
		});

		test('other fields on the original step (besides glueEnabled) carry over onto the notice', () => {
			const json = {
				labels: {
					main: [{ goNextStep: true, labelToOpen: { label: 'ghost_label', type: 'call' as const } }],
				},
			};

			const result = markUnresolvableLabelCalls(json, new Set(['main']));

			assert.deepStrictEqual(result.labels?.main, [
				{ goNextStep: true, dialogue: { character: NON_INK_LABEL_CALL_CHARACTER, text: 'ghost_label' } },
			]);
		});

		// Regression: glueEnabled left in place would glue the *next* real dialogue line onto this
		// notice — both visually joining unrelated text and making that narration inherit the
		// notice's sentinel character, silently swallowing it instead of displaying normally.
		test('glueEnabled on the original step is dropped, not carried over onto the notice', () => {
			const json = {
				labels: {
					main: [{ glueEnabled: true, labelToOpen: { label: 'ghost_label', type: 'call' as const } }],
				},
			};

			const result = markUnresolvableLabelCalls(json, new Set(['main']));

			assert.deepStrictEqual(result.labels?.main, [
				{ dialogue: { character: NON_INK_LABEL_CALL_CHARACTER, text: 'ghost_label' } },
			]);
		});

		test('an array-of-entries labelToOpen (not the plain single-entry shape) is left untouched', () => {
			const step = {
				labelToOpen: [
					{ label: 'ghost_label', type: 'call' as const },
					{ label: 'another_ghost', type: 'call' as const },
				],
			};
			const json = { labels: { main: [step] } };

			const result = markUnresolvableLabelCalls(json, new Set(['main']));

			assert.deepStrictEqual(result.labels?.main, [step]);
		});

		test('a json with no labels at all is returned as-is', () => {
			const json = {};
			assert.strictEqual(markUnresolvableLabelCalls(json, new Set()), json);
		});
	});

	suite('applyKnownTextReplaces', () => {
		const characterIds = new Set(['mc']);
		const textReplaces: InkTextReplaceInfo[] = [
			{
				name: 'character-name',
				description: 'Replaces a registered character id with its display name.',
				validation: { type: 'literal', value: 'characterId' },
			},
		];

		test('a plain string dialogue (no character) has its known `[key]` replaced', () => {
			const json = { labels: { main: [{ dialogue: 'I take his hand and shake, [mc].' }] } };

			const result = applyKnownTextReplaces(json, textReplaces, characterIds);

			assert.deepStrictEqual(result.labels?.main, [{ dialogue: 'I take his hand and shake, mc.' }]);
		});

		test('a `{ character, text }` dialogue object has only its `text` rewritten', () => {
			const json = { labels: { main: [{ dialogue: { character: 'james', text: 'Ooh, [mc]! Nice handshake!' } }] } };

			const result = applyKnownTextReplaces(json, textReplaces, characterIds);

			assert.deepStrictEqual(result.labels?.main, [
				{ dialogue: { character: 'james', text: 'Ooh, mc! Nice handshake!' } },
			]);
		});

		test('an array-of-fragments dialogue text has each string fragment rewritten, non-strings left untouched', () => {
			const valueGet = { type: 'value' as const, storageOperationType: 'get' as const, key: 'someVar', storageType: 'storage' as const };
			const json = { labels: { main: [{ dialogue: { character: 'james', text: ['Hi [mc], ', valueGet] } }] } };

			const result = applyKnownTextReplaces(json, textReplaces, characterIds);

			assert.deepStrictEqual(result.labels?.main, [
				{ dialogue: { character: 'james', text: ['Hi mc, ', valueGet] } },
			]);
		});

		test("a choice's text has its known `[key]` replaced", () => {
			const json = { labels: { main: [{ choices: [{ text: 'Greet [mc]', label: 'greet', type: 'call' as const, props: {} }] }] } };

			const result = applyKnownTextReplaces(json, textReplaces, characterIds);

			assert.deepStrictEqual(result.labels?.main, [
				{ choices: [{ text: 'Greet mc', label: 'greet', type: 'call' as const, props: {} }] },
			]);
		});

		test('a `[key]` matching no known handler is left completely untouched', () => {
			const step = { dialogue: 'Something [unrelated] here.' };
			const json = { labels: { main: [step] } };

			const result = applyKnownTextReplaces(json, textReplaces, characterIds);

			assert.deepStrictEqual(result.labels?.main, [step]);
		});

		test('a step with no dialogue/choices at all is left untouched', () => {
			const step = { goNextStep: true };
			const json = { labels: { main: [step] } };

			const result = applyKnownTextReplaces(json, textReplaces, characterIds);

			assert.strictEqual(result.labels?.main[0], step);
		});

		test('an empty text-replaces list returns the json as-is', () => {
			const json = { labels: { main: [{ dialogue: 'Hello [mc]!' }] } };
			assert.strictEqual(applyKnownTextReplaces(json, [], characterIds), json);
		});

		test('a json with no labels at all is returned as-is', () => {
			const json = {};
			assert.strictEqual(applyKnownTextReplaces(json, textReplaces, characterIds), json);
		});
	});

	// End-to-end regression using a real multi-step transcript and a text-replace list recorded
	// from `GET /__pixi-vn-ink/text-replaces` on a live pixi-vn dev server.
	suite('applyKnownTextReplaces — multi-step transcript', () => {
		const liveTextReplaces: InkTextReplaceInfo[] = [
			{
				name: 'character name',
				description: "Replaces a character ID with the character's name in the game.",
				validation: { type: 'literal', value: 'characterId' },
				type: 'after-translation',
			},
		];
		const transcriptJson = {
			labels: {
				main: [
					{ dialogue: { character: 'james', text: "Don't worry, [mc], she's just giving you the run-down." } },
					{ dialogue: '[sly] thrusts her hand out to shake mine.' },
				],
			},
		};

		test('resolves every step once "mc"/"sly" are registered character ids', () => {
			const result = applyKnownTextReplaces(transcriptJson, liveTextReplaces, new Set(['mc', 'sly']));

			assert.strictEqual(
				(result.labels?.main[0].dialogue as { text: string }).text,
				"Don't worry, mc, she's just giving you the run-down.",
			);
			assert.strictEqual(result.labels?.main[1].dialogue, 'sly thrusts her hand out to shake mine.');
		});

		test('leaves every step untouched with no registered character ids', () => {
			const result = applyKnownTextReplaces(transcriptJson, liveTextReplaces, new Set());
			assert.deepStrictEqual(result, transcriptJson);
		});
	});
});
