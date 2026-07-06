import * as assert from 'assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {
	collectCommentAbove,
	findDeclaredSymbol,
	findMatchingBracketsInNormalText,
	getDeclaredSymbolHoverText,
	isEndDoneHoverContext,
	isNormalTextLine,
	isVariableTextTypeSpecifier,
} from '../extension';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});

	test('END/DONE hover only shows after divert arrow', () => {
		assert.strictEqual(isEndDoneHoverContext('-> END', 3), true);
		assert.strictEqual(isEndDoneHoverContext('->DONE', 2), true);
		assert.strictEqual(isEndDoneHoverContext('text ->DONE', 7), true);
		assert.strictEqual(isEndDoneHoverContext('DONE', 0), false);
		assert.strictEqual(isEndDoneHoverContext('  DONE', 2), false);
		assert.strictEqual(isEndDoneHoverContext('top_knot', 0), false);
		assert.strictEqual(isEndDoneHoverContext('Hello world!END', 12), false);
	});

	test('isVariableTextTypeSpecifier: returns true only for the first non-whitespace char after {', () => {
		// Standard type specifiers immediately after {
		assert.strictEqual(isVariableTextTypeSpecifier('{&Monday|Tuesday|Wednesday}', 1), true,  '& directly after {');
		assert.strictEqual(isVariableTextTypeSpecifier('{~Heads|Tails}', 1), true,               '~ directly after {');
		assert.strictEqual(isVariableTextTypeSpecifier('{!I laughed.|I smiled.}', 1), true,      '! directly after {');

		// Type specifier with leading whitespace inside {
		assert.strictEqual(isVariableTextTypeSpecifier('{ &Monday|Tuesday}', 2), true,  '& after { with space');
		assert.strictEqual(isVariableTextTypeSpecifier('{  ~Heads|Tails}', 3), true,    '~ after { with two spaces');

		// Characters that are NOT type specifiers (preceded by text)
		// {TEST~|TEST&|TEST!}
		//  0123456789...
		assert.strictEqual(isVariableTextTypeSpecifier('{TEST~|TEST&|TEST!}', 5),  false, '~ after TEST is plain text');
		assert.strictEqual(isVariableTextTypeSpecifier('{TEST~|TEST&|TEST!}', 11), false, '& after TEST is plain text');
		assert.strictEqual(isVariableTextTypeSpecifier('{TEST~|TEST&|TEST!}', 17), false, '! after TEST is plain text');

		// Nested block: inner ~ is the specifier of the inner {
		// {outer|{~inner|other}}
		//  0     6 78
		assert.strictEqual(isVariableTextTypeSpecifier('{outer|{~inner|other}}', 8), true, '~ at start of nested block is a specifier');
	});

	test('isNormalTextLine: correctly classifies lines', () => {
		// Normal text lines → true
		assert.strictEqual(isNormalTextLine('Hello world'),           true,  'plain narrative text');
		assert.strictEqual(isNormalTextLine('  Indented text'),       true,  'indented narrative text');
		assert.strictEqual(isNormalTextLine('- Some gather text'),    true,  'gather line with text');
		assert.strictEqual(isNormalTextLine('TODO: fix later'),       true,  'TODO line');
		assert.strictEqual(isNormalTextLine('# a tag line'),          true,  'tag line');

		// Non-normal lines → false
		assert.strictEqual(isNormalTextLine(''),                      false, 'empty line');
		assert.strictEqual(isNormalTextLine('   '),                   false, 'whitespace-only line');
		assert.strictEqual(isNormalTextLine('// comment'),            false, 'single-line comment');
		assert.strictEqual(isNormalTextLine('/* block'),              false, 'block comment opener');
		assert.strictEqual(isNormalTextLine('* choice'),              false, 'choice *');
		assert.strictEqual(isNormalTextLine('+ sticky choice'),       false, 'sticky choice +');
		assert.strictEqual(isNormalTextLine('=== knot ==='),          false, 'knot declaration');
		assert.strictEqual(isNormalTextLine('= stitch'),              false, 'stitch declaration');
		assert.strictEqual(isNormalTextLine('~ x = 1'),               false, 'tilde logic');
		assert.strictEqual(isNormalTextLine('INCLUDE other.ink'),     false, 'INCLUDE');
		assert.strictEqual(isNormalTextLine('VAR x = 0'),             false, 'VAR declaration');
		assert.strictEqual(isNormalTextLine('CONST y = 1'),           false, 'CONST declaration');
		assert.strictEqual(isNormalTextLine('LIST items = a, b'),     false, 'LIST declaration');
	});

	test('findMatchingBracketsInNormalText: returns positions of matched bracket pairs', () => {
		// Simple matched pair
		assert.deepStrictEqual(
			findMatchingBracketsInNormalText('Hello [world]'),
			[6, 12],
			'single matched pair'
		);

		// Unmatched open bracket → nothing
		assert.deepStrictEqual(
			findMatchingBracketsInNormalText('Hello [world'),
			[],
			'unmatched open bracket'
		);

		// Unmatched close bracket → nothing
		assert.deepStrictEqual(
			findMatchingBracketsInNormalText('Hello world]'),
			[],
			'unmatched close bracket'
		);

		// No brackets
		assert.deepStrictEqual(
			findMatchingBracketsInNormalText('Hello world'),
			[],
			'no brackets'
		);

		// Nested brackets — innermost resolved first
		// "Hello [a [b] c]"
		//        6  9 11 14
		const nested = findMatchingBracketsInNormalText('Hello [a [b] c]');
		assert.ok(nested.includes(9),  'inner [ at 9');
		assert.ok(nested.includes(11), 'inner ] at 11');
		assert.ok(nested.includes(6),  'outer [ at 6');
		assert.ok(nested.includes(14), 'outer ] at 14');
		assert.strictEqual(nested.length, 4, 'four positions for two nested pairs');

		// Escaped brackets are not matched
		assert.deepStrictEqual(
			findMatchingBracketsInNormalText('Hello \\[world\\]'),
			[],
			'escaped brackets are ignored'
		);

		// Multiple independent pairs
		assert.deepStrictEqual(
			findMatchingBracketsInNormalText('[a] and [b]'),
			[0, 2, 8, 10],
			'two independent pairs'
		);
	});

	test('collectCommentAbove: collects /** ... */ block comments above a knot', () => {
		const lines = [
			'/**',
			' * Example comment',
			' */',
			'=== my_knot ===',
		];
		// The function trims each line before storing, so leading spaces are removed
		assert.deepStrictEqual(
			collectCommentAbove(lines, 3),
			['/**', '* Example comment', '*/'],
			'standard multi-line JSDoc block'
		);
	});

	test('collectCommentAbove: does not collect ink choice lines starting with *', () => {
		const lines = [
			'*\t{ not visit_paris }\t[Go to Paris] -> visit_paris',
			'+\t{ visit_paris }\t\t[Return to Paris] -> visit_paris',
			'*\t{ not (visit_paris or visit_rome) && (visit_london || visit_new_york) } [ Wait. Go where? ] -> visit_someplace',
			'',
			'=== visit_paris ===',
		];
		assert.deepStrictEqual(
			collectCommentAbove(lines, 4),
			[],
			'ink choice lines must not be treated as comments'
		);
	});

	test('collectCommentAbove: collects single-line /** ... */ comment', () => {
		const lines = [
			'/** A quick description */',
			'=== my_knot ===',
		];
		assert.deepStrictEqual(
			collectCommentAbove(lines, 1),
			['/** A quick description */'],
			'single-line block comment'
		);
	});

	test('collectCommentAbove: skips blank lines between comment and knot', () => {
		const lines = [
			'/**',
			' * Comment with blank line below',
			' */',
			'',
			'=== my_knot ===',
		];
		// The function trims each line before storing, so leading spaces are removed
		assert.deepStrictEqual(
			collectCommentAbove(lines, 4),
			['/**', '* Comment with blank line below', '*/'],
			'blank line between comment and knot is skipped'
		);
	});

	test('collectCommentAbove: returns empty when no comment above', () => {
		const lines = [
			'=== another_knot ===',
			'Some narrative text.',
			'',
			'=== my_knot ===',
		];
		assert.deepStrictEqual(
			collectCommentAbove(lines, 3),
			[],
			'no comment means empty result'
		);
	});

	test('collectCommentAbove: does not collect * line outside a /** block', () => {
		// A lone `* text` line (ink choice) with no enclosing /** */ block
		const lines = [
			'* some choice text',
			'=== my_knot ===',
		];
		assert.deepStrictEqual(
			collectCommentAbove(lines, 1),
			[],
			'lone * line (ink choice) is not a comment'
		);
	});

	test('findDeclaredSymbol: finds VAR and CONST declarations', () => {
		const lines = [
			'VAR x = 1',
			'CONST answer = 42',
		];

		assert.deepStrictEqual(findDeclaredSymbol(lines, 'x'), {
			kind: 'VAR',
			lineNumber: 0,
		});
		assert.deepStrictEqual(findDeclaredSymbol(lines, 'answer'), {
			kind: 'CONST',
			lineNumber: 1,
		});
		assert.strictEqual(findDeclaredSymbol(lines, 'missing'), undefined);
	});

	test('getDeclaredSymbolHoverText: returns declaration comments and CONST note', () => {
		const lines = [
			'/**',
			' * Loop counter',
			' */',
			'VAR x = 1',
			'/**',
			' * Never changes',
			' */',
			'CONST answer = 42',
		];

		assert.strictEqual(getDeclaredSymbolHoverText(lines, 'x'), 'Loop counter');
		assert.strictEqual(
			getDeclaredSymbolHoverText(lines, 'answer'),
			'Never changes\n\n_Declared as `CONST`: this value is constant._'
		);
	});

	test('syntax grammar: VAR declarations and logic identifiers share constant scope', () => {
		const grammarPath = path.resolve(__dirname, '../../syntaxes/ink.tmLanguage.json');
		const grammar = JSON.parse(fs.readFileSync(grammarPath, 'utf8'));
		const logicVariablePattern = grammar.repository.logic.patterns.find(
			(pattern: { name?: string; match?: string }) =>
				pattern.match === '\\b[a-zA-Z_][a-zA-Z0-9_]*\\b'
		);
		const varDeclarationPattern = grammar.repository.declarations.patterns[0].patterns.find(
			(pattern: { name?: string; match?: string }) =>
				pattern.match === '(?<=VAR\\s+)[a-zA-Z_][a-zA-Z0-9_]*'
		);

		assert.strictEqual(logicVariablePattern?.name, 'variable.other.constant.ink');
		assert.strictEqual(varDeclarationPattern?.name, 'variable.other.constant.ink');
	});
});
