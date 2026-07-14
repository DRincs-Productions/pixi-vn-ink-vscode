import * as assert from 'assert';
import {
	NON_INK_LABEL_CALL_CHARACTER,
	NON_INK_LABEL_JUMP_CHARACTER,
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
});
