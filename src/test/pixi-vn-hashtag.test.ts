import * as assert from 'assert';
import type { InkHashtagCommandInfo } from '@drincs/pixi-vn-ink/parser';
import {
	buildUnknownHashtagCommandIndex,
	findHashtagSegment,
	findMatchingHashtagCommand,
	locateHashtagSegment,
	truncateHashtagCommandForMessage,
} from '../utils/pixi-vn-hashtag';

suite('pixi-vn-hashtag Test Suite', () => {
	suite('truncateHashtagCommandForMessage', () => {
		test('leaves a command of 30 characters or fewer untouched', () => {
			assert.strictEqual(truncateHashtagCommandForMessage('jump target'), 'jump target');
			assert.strictEqual(truncateHashtagCommandForMessage('a'.repeat(30)), 'a'.repeat(30));
		});

		test('truncates a command longer than 30 characters to 30 chars plus "..."', () => {
			const long = 'show image jame m01-boy m01-eyes-smile m01-mouth-neutral01';
			const result = truncateHashtagCommandForMessage(long);
			assert.strictEqual(result, `${long.slice(0, 30)}...`);
			assert.strictEqual(result.length, 33);
		});
	});
	suite('findHashtagSegment', () => {
		test('recognizes a `#` at the very start of the line (after optional leading whitespace)', () => {
			assert.deepStrictEqual(findHashtagSegment('# jump target'), { command: 'jump target', start: 0, end: 13 });
			assert.deepStrictEqual(findHashtagSegment('  # jump target  '), {
				command: 'jump target',
				start: 2,
				end: 15,
			});
		});

		test('recognizes a `#` immediately after a `<>` glue marker anywhere on the line', () => {
			assert.deepStrictEqual(findHashtagSegment('Hello <> # jump target'), {
				command: 'jump target',
				start: 9,
				end: 22,
			});
		});

		test('does not recognize an inline `#` with no preceding glue — that is an ordinary ink tag, not a pixi-vn hashtag command', () => {
			assert.strictEqual(findHashtagSegment('Hello # inline_not_recognized'), undefined);
		});

		test('captures the rest of the line as one command, even if it contains further literal `#` characters', () => {
			assert.deepStrictEqual(findHashtagSegment('# jump a # not_a_separate_command'), {
				command: 'jump a # not_a_separate_command',
				start: 0,
				end: 33,
			});
		});

		test('returns undefined for a `#` with nothing but whitespace after it', () => {
			assert.strictEqual(findHashtagSegment('#'), undefined);
			assert.strictEqual(findHashtagSegment('#   '), undefined);
		});

		test('returns undefined when the line has no `#` at all', () => {
			assert.strictEqual(findHashtagSegment('Not a tag at all'), undefined);
		});
	});

	suite('locateHashtagSegment', () => {
		test('returns the segment when its command text matches', () => {
			assert.deepStrictEqual(locateHashtagSegment('# jump target', 'jump target'), {
				command: 'jump target',
				start: 0,
				end: 13,
			});
		});

		test('returns undefined when the line has a segment but with different command text', () => {
			assert.strictEqual(locateHashtagSegment('# jump target', 'wait 3'), undefined);
		});

		test('returns undefined when the line has no recognizable segment at all', () => {
			assert.strictEqual(locateHashtagSegment('Hello # inline_not_recognized', 'inline_not_recognized'), undefined);
		});
	});

	// `findMatchingHashtagCommand`/`buildUnknownHashtagCommandIndex` are thin wrappers around the
	// real `InkCompiler.getUnknownHashtagCommands` — deliberately, since a from-scratch
	// re-validation of a "zod" `InkValidationInfo` (its `schema`, produced by zod's own
	// `toJSONSchema()`) against `InkCompiler.getSchemaValidator`'s plain (draft-07) Ajv silently
	// drops the 2020-12-only `prefixItems` keyword a tuple schema relies on — confirmed against
	// `@drincs/pixi-vn-ink`'s own built-in commands to make *every* command falsely "match" the
	// first zod-validated one in the list. These tests exercise the real function directly, using
	// `prefixItems`-based schemas exactly like a real project's serialized tuple validation.
	const jumpCommand: InkHashtagCommandInfo = {
		name: 'jump-command',
		description: 'Jumps to a label.',
		validation: { type: 'regexp', source: '^jump\\b', flags: '' },
	};
	const waitCommand: InkHashtagCommandInfo = {
		name: 'wait-command',
		description: 'Waits some seconds.',
		validation: {
			type: 'zod',
			schema: {
				type: 'array',
				prefixItems: [{ type: 'string', const: 'wait' }, { type: 'string' }],
				items: false,
			},
		},
	};
	const commands = [jumpCommand, waitCommand];

	suite('findMatchingHashtagCommand', () => {
		test('returns the first registered command that recognizes the command text', () => {
			assert.strictEqual(findMatchingHashtagCommand('jump target', commands)?.name, 'jump-command');
			assert.strictEqual(findMatchingHashtagCommand('wait 3', commands)?.name, 'wait-command');
		});

		test('returns undefined when no registered command recognizes it', () => {
			assert.strictEqual(findMatchingHashtagCommand('unknown foo', commands), undefined);
			// A `prefixItems`/`items: false` tuple schema correctly rejects a wrong-length array —
			// unlike the broken from-scratch Ajv re-validation this used to rely on, which would
			// have falsely matched here.
			assert.strictEqual(findMatchingHashtagCommand('wait 3 seconds', commands), undefined);
		});

		test('returns undefined for an empty command list', () => {
			assert.strictEqual(findMatchingHashtagCommand('jump target', []), undefined);
		});
	});

	suite('buildUnknownHashtagCommandIndex (backed by the real InkCompiler.getUnknownHashtagCommands)', () => {
		test('a recognized command (matching a registered handler) is absent from the index', () => {
			const source = ['=== knot ===', '# jump target', '-> END'].join('\n');
			const index = buildUnknownHashtagCommandIndex(source, commands);
			assert.strictEqual(index.get(2), undefined);
		});

		test('an unrecognized command (matching no registered handler) is present, keyed by 1-based line number', () => {
			const source = ['=== knot ===', 'Some text <> # unknown foo', '-> END'].join('\n');
			const index = buildUnknownHashtagCommandIndex(source, commands);
			assert.strictEqual(index.get(2)?.has('unknown foo'), true);
		});

		test('a wrong-length match against a prefixItems tuple schema is correctly reported as unknown', () => {
			const source = ['=== knot ===', '# wait 3 seconds', '-> END'].join('\n');
			const index = buildUnknownHashtagCommandIndex(source, commands);
			assert.strictEqual(index.get(2)?.has('wait 3 seconds'), true);
		});

		test('an ordinary inline `#` tag with no preceding glue is invisible to this — never flagged either way', () => {
			const source = ['=== knot ===', 'Some text # not_a_pixi_vn_hashtag_command', '-> END'].join('\n');
			const index = buildUnknownHashtagCommandIndex(source, commands);
			assert.strictEqual(index.size, 0);
		});

		test('empty commands list: everything not otherwise valid ink is still just an ordinary occurrence, reported as unknown', () => {
			const source = ['=== knot ===', '# anything', '-> END'].join('\n');
			const index = buildUnknownHashtagCommandIndex(source, []);
			assert.strictEqual(index.get(2)?.has('anything'), true);
		});
	});
});
