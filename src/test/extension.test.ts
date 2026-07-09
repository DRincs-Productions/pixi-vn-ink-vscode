import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {
	collectCommentAbove,
	DECLARATION_KEYWORD_DOCS,
	findDeclaredSymbol,
	findMatchingBracketsInNormalText,
	getDeclaredSymbolHoverText,
	isChoiceBracketContext,
	isConditionalBranchDash,
	isDeclarationKeywordContext,
	isEndDoneHoverContext,
	isInsideCurlyBraceBlockAtLines,
	isNormalTextLine,
	isPrecededByUnescapedDivert,
	isPrecededByUnescapedDivertToKnot,
	isPrecededByUnescapedThread,
	isPrecededByUnescapedThreadToKnot,
	isTildeLogicContext,
	isVariableTextTypeSpecifier,
} from '../extension';
import { computeInkFoldingRanges } from '../folding';
import {
	BUILTIN_FUNCTIONS,
	findPixiVnUnimplementedFunctionCalls,
	isBuiltinFunctionCallContext,
} from '../utils/builtin-functions';
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
		assert.strictEqual(isEndDoneHoverContext('\\-> END', 4), false, 'escaped \\-> is literal text, not a divert');
	});

	test('isPrecededByUnescapedDivert: false for an escaped \\-> (literal text, not a real divert)', () => {
		assert.strictEqual(isPrecededByUnescapedDivert('-> as_fast_as_we_could', '-> '), true);
		assert.strictEqual(
			isPrecededByUnescapedDivert('We hurried home -> as_fast_as_we_could', 'We hurried home -> '),
			true,
			'mid-sentence divert',
		);
		assert.strictEqual(
			isPrecededByUnescapedDivert('\\-> as_fast_as_we_could', '\\-> '),
			false,
			'escaped arrow is literal text',
		);
		assert.strictEqual(isPrecededByUnescapedDivert('Hello world', 'Hello world'), false, 'no arrow at all');
	});

	test('isPrecededByUnescapedDivertToKnot: true when hovering the stitch half of -> knot.stitch', () => {
		const line = '\t-> the_orient_express.in_first_class';
		assert.strictEqual(
			isPrecededByUnescapedDivertToKnot(line, '\t-> the_orient_express.'),
			true,
			'stitch part right after "knot."',
		);
		assert.strictEqual(
			isPrecededByUnescapedDivertToKnot(line, '\t-> the_orient_express'),
			false,
			'no dot yet: still hovering the knot part, handled by isPrecededByUnescapedDivert instead',
		);
		assert.strictEqual(
			isPrecededByUnescapedDivertToKnot('\\-> the_orient_express.in_first_class', '\\-> the_orient_express.'),
			false,
			'escaped arrow is literal text',
		);
		assert.strictEqual(
			isPrecededByUnescapedDivertToKnot('Hello world.class', 'Hello world.'),
			false,
			'no divert arrow at all',
		);
	});

	test('isPrecededByUnescapedThread: true for a real <- (but not an escaped \\<-)', () => {
		assert.strictEqual(isPrecededByUnescapedThread('<- conversation', '<- '), true);
		assert.strictEqual(
			isPrecededByUnescapedThread('I had a headache. <- conversation', 'I had a headache. <- '),
			true,
			'mid-sentence thread',
		);
		assert.strictEqual(
			isPrecededByUnescapedThread('\\<- conversation', '\\<- '),
			false,
			'escaped arrow is literal text',
		);
		assert.strictEqual(isPrecededByUnescapedThread('Hello world', 'Hello world'), false, 'no arrow at all');
	});

	test('isPrecededByUnescapedThreadToKnot: true when hovering the stitch half of <- knot.stitch', () => {
		const line = '<- the_orient_express.in_first_class';
		assert.strictEqual(
			isPrecededByUnescapedThreadToKnot(line, '<- the_orient_express.'),
			true,
			'stitch part right after "knot."',
		);
		assert.strictEqual(
			isPrecededByUnescapedThreadToKnot(line, '<- the_orient_express'),
			false,
			'no dot yet: still hovering the knot part, handled by isPrecededByUnescapedThread instead',
		);
		assert.strictEqual(
			isPrecededByUnescapedThreadToKnot('\\<- the_orient_express.in_first_class', '\\<- the_orient_express.'),
			false,
			'escaped arrow is literal text',
		);
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

	test('DECLARATION_KEYWORD_DOCS: documents VAR, CONST, and LIST', () => {
		for (const name of ['VAR', 'CONST', 'LIST']) {
			assert.ok(DECLARATION_KEYWORD_DOCS[name]?.length, `missing hover text for ${name}`);
			assert.ok(DECLARATION_KEYWORD_DOCS[name].includes(name), `hover text for ${name} should mention its own name`);
		}
	});

	test('isDeclarationKeywordContext: true only when the keyword opens the line', () => {
		assert.strictEqual(isDeclarationKeywordContext('VAR x = 1', 0), true, 'VAR at start of line');
		assert.strictEqual(isDeclarationKeywordContext('  CONST y = 1', 2), true, 'CONST after leading whitespace');
		assert.strictEqual(isDeclarationKeywordContext('\tLIST items = a, b', 1), true, 'LIST after a tab');
		assert.strictEqual(isDeclarationKeywordContext('~ x = VAR', '~ x = '.length), false, 'VAR used later on the line');
	});

	test('isTildeLogicContext: true only when ~ is the first non-whitespace character', () => {
		assert.strictEqual(isTildeLogicContext('~ x = 1', 0), true, 'tilde at start of line');
		assert.strictEqual(isTildeLogicContext('  ~ x = 1', 2), true, 'tilde after leading whitespace');
		assert.strictEqual(isTildeLogicContext('{~Heads|Tails}', 1), false, 'shuffle tilde inside braces is preceded by {');
	});

	test('isChoiceBracketContext: true only for choice lines (* or + bullets)', () => {
		assert.strictEqual(isChoiceBracketContext('*\t[Hello back!]'), true, 'simple choice');
		assert.strictEqual(isChoiceBracketContext('+\t[Eat another donut]'), true, 'sticky choice');
		assert.strictEqual(isChoiceBracketContext('\t* * \t[Nested choice]'), true, 'nested choice');
		assert.strictEqual(isChoiceBracketContext('- (top) [Not a choice]'), false, 'gather line');
		assert.strictEqual(isChoiceBracketContext('Hello [world]!'), false, 'plain narrative text');
	});

	test('isConditionalBranchDash: true for { }-block branch markers, false for weave gathers', () => {
		assert.strictEqual(isConditionalBranchDash('{ - x > 0:', 2), true, 'dash right after the opening {');
		assert.strictEqual(isConditionalBranchDash('- else:', 0), true, 'dash at the very start of the line');
		assert.strictEqual(isConditionalBranchDash('\t- x > 0:', 1), true, 'indented branch dash');
		assert.strictEqual(isConditionalBranchDash('- 0: \tzero', 0), true, 'switch-style branch with a value');
		assert.strictEqual(isConditionalBranchDash('- Gathered text', 0), false, 'no colon on the line: not a branch');
		assert.strictEqual(isConditionalBranchDash('-> knot', 0), false, 'divert arrow is not a branch dash');
		assert.strictEqual(isConditionalBranchDash('Hello - world: yes', 6), false, 'dash mid-line is not a branch');
	});

	test('isInsideCurlyBraceBlockAtLines: tracks { } depth across multiple lines', () => {
		const lines = [
			'{',
			'\t- x > 0:',
			'\t\tText',
			'\t- else:',
			'\t\tText',
			'}',
			'-  Gathered text',
		];
		assert.strictEqual(isInsideCurlyBraceBlockAtLines(lines, 1, 1), true, 'branch dash inside a multi-line block');
		assert.strictEqual(isInsideCurlyBraceBlockAtLines(lines, 3, 1), true, 'else branch further down the same block');
		assert.strictEqual(isInsideCurlyBraceBlockAtLines(lines, 6, 0), false, 'a real gather after the block has closed');
	});

	test('isInsideCurlyBraceBlockAtLines: ignores braces mentioned in comments', () => {
		const lines = ['// a comment mentioning a { brace', '-  Gathered text'];
		assert.strictEqual(isInsideCurlyBraceBlockAtLines(lines, 1, 0), false);
	});

	test('isBuiltinFunctionCallContext: true only when the word is immediately followed by (', () => {
		assert.strictEqual(isBuiltinFunctionCallContext('~ SEED_RANDOM(235)', '~ SEED_RANDOM'.length), true);
		assert.strictEqual(isBuiltinFunctionCallContext('{RANDOM (1, 6)}', '{RANDOM'.length), true, 'whitespace before ( is allowed');
		assert.strictEqual(isBuiltinFunctionCallContext('~ temp x = RANDOM', '~ temp x = RANDOM'.length), false);
		assert.strictEqual(isBuiltinFunctionCallContext('TURNS is a knot name', 'TURNS'.length), false);
	});

	test('BUILTIN_FUNCTIONS: documents every ink built-in game query/function', () => {
		for (const name of [
			'CHOICE_COUNT', 'TURNS', 'TURNS_SINCE', 'SEED_RANDOM', 'RANDOM',
			'INT', 'FLOOR', 'FLOAT', 'POW',
			'LIST_VALUE', 'LIST_COUNT', 'LIST_MIN', 'LIST_MAX', 'LIST_RANDOM', 'LIST_ALL', 'LIST_RANGE', 'LIST_INVERT',
		]) {
			assert.ok(BUILTIN_FUNCTIONS[name]?.length, `missing hover text for ${name}`);
			assert.ok(BUILTIN_FUNCTIONS[name].includes(name), `hover text for ${name} should mention its own name`);
		}
	});

	test('findPixiVnUnimplementedFunctionCalls: locates calls to functions pixi-vn does not implement yet', () => {
		assert.deepStrictEqual(
			findPixiVnUnimplementedFunctionCalls('~ SEED_RANDOM(235)'),
			[{ name: 'SEED_RANDOM', start: 2, end: 13 }],
		);
		assert.deepStrictEqual(
			findPixiVnUnimplementedFunctionCalls('{LIST_COUNT(DoctorsInSurgery)}'),
			[{ name: 'LIST_COUNT', start: 1, end: 11 }],
		);

		// Implemented functions (RANDOM, POW, ...) never show up
		assert.deepStrictEqual(findPixiVnUnimplementedFunctionCalls('~ temp x = RANDOM(1, 6)'), []);

		// Not a call (no parenthesis) — no match
		assert.deepStrictEqual(findPixiVnUnimplementedFunctionCalls('~ temp x = TURNS'), []);

		// Commented-out lines are ignored
		assert.deepStrictEqual(findPixiVnUnimplementedFunctionCalls('// ~ SEED_RANDOM(235)'), []);
	});

	test('computeInkFoldingRanges: folds knot bodies but keeps a trailing top-level divert visible', () => {
		// This mirrors examples/knot.ink line for line.
		const lines = [
			'TEST =',
			'',
			'/**',
			' * Example Ink file',
			' */',
			'=== top_knot ===',
			'Hello world!END',
			'-> END',
			'',
			'=== knot1 === // This is a comment',
			'top_knot',
			'DONE',
			'* {top_knot} test',
			'->DONE',
			'',
			'-> top_knot',
			'',
			' === hurry_home ===',
			'We hurried home to Savile Row ->as_fast_as_we_could',
			'',
			'/**',
			' * Another comment',
			' */',
			'=== as_fast_as_we_could',
			'as fast as we could.',
		];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [
			{ start: 5, end: 6 },   // === top_knot === → folds "Hello world!END", keeps "-> END"
			{ start: 9, end: 12 },  // === knot1 === → folds body, keeps "->DONE"
			{ start: 17, end: 18 }, // === hurry_home === → no top-level divert, folds whole body
			{ start: 23, end: 24 }, // === as_fast_as_we_could → no top-level divert, folds whole body
		]);
	});

	test('computeInkFoldingRanges: knot with no divert exit folds its entire body', () => {
		const lines = [
			'=== top_knot ===',
			'Hello world!END',
			'',
			'=== knot1 === // This is a comment',
			'top_knot',
			'DONE',
			'* {top_knot} test',
			'->DONE',
		];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [
			{ start: 0, end: 1 },
			{ start: 3, end: 6 },
		]);
	});

	test('computeInkFoldingRanges: a divert exit reached after a blank-separated paragraph still stays visible', () => {
		const lines = ['=== top_knot ===', 'Hello world!END', '', '-> END'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 2 }]);
	});

	test('computeInkFoldingRanges: ignores decorative === separators without an identifier', () => {
		const lines = ['===', '==', 'Some text', '=== knot ===', 'Body line', '-> DONE'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 3, end: 4 }]);
	});

	test('computeInkFoldingRanges: does not fold a header whose only body line is the exit divert', () => {
		const lines = ['=== knot ===', '-> DONE'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), []);
	});

	test('computeInkFoldingRanges: does not treat a mid-sentence divert as an exit line', () => {
		const lines = ['=== hurry_home ===', 'We hurried home to Savile Row ->as_fast_as_we_could'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 1 }]);
	});

	test('computeInkFoldingRanges: stitches (single =) fold independently from their parent knot', () => {
		const lines = ['=== knot ===', 'Some text', '= stitch1', 'Inner text', '-> DONE'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [
			{ start: 0, end: 1 },
			{ start: 2, end: 3 },
		]);
	});

	test('computeInkFoldingRanges: a divert nested inside one choice is not mistaken for the whole knot\'s exit', () => {
		// Mirrors examples/labelled_gathers.ink's meet_guard knot: "-> fight_guard" is only
		// reached via one specific choice, and a gather still follows it, so it must not be
		// revealed as if every path through the knot ended there.
		const lines = [
			'=== meet_guard ===',
			'The guard frowns at you.',
			'',
			'*\t(get_out) [Shove him aside]',
			'\tYou shove him sharply.',
			'\t-> fight_guard',
			'',
			"-\t'Mff,' the guard replies.",
			'',
			'=== knot ===',
		];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 7 }]);
	});

	test('computeInkFoldingRanges: a divert at the same indentation as its paragraph still counts as an exit', () => {
		const lines = ['=== knot ===', 'Some text', '-> END'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 1 }]);
	});

	test('computeInkFoldingRanges: a multi-paragraph body with no divert at all folds entirely', () => {
		// Mirrors examples/global_constants.ink's report_progress knot.
		const lines = [
			'=== report_progress ===',
			'{',
			'    -  a == b:',
			'\tThe secret agent grabs the suitcase!',
			'',
			'-  a < b:',
			'\tThe secret agent moves forward.',
			'}',
		];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 7 }]);
	});

	test('computeInkFoldingRanges: a doc-comment for the next knot is not swallowed into this one\'s fold', () => {
		// Mirrors examples/global_variables.ink's the_train knot, followed by an unrelated VAR
		// line and then another knot documented with a /** */ comment.
		const lines = [
			'=== the_train ===',
			'\tThe train jolted and rattled.',
			'\t*\t{ not knows_about_wager } "Why are we travelling?"',
			'\t* \t{ knows_about_wager } Would it be possible?',
			'',
			'VAR current_epilogue = -> everybody_dies',
			'',
			'/**',
			' * Documents the next knot.',
			' */',
			'=== continue_or_quit ===',
			'Give up now?',
		];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [
			{ start: 0, end: 5 },
			{ start: 10, end: 11 },
		]);
	});

	test('computeInkFoldingRanges: a function folds its entire body, never revealing its `~ return`', () => {
		const lines = [
			'=== function say_no_to_nothing ===',
			'\t~ return say_yes_to_everything()',
			'test',
		];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 2 }]);
	});

	test('computeInkFoldingRanges: a function ignores -> DONE / -> END as exit points, unlike a knot', () => {
		const lines = ['=== function say_no_to_nothing ===', 'Some setup', '-> DONE'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 2 }]);
	});

	test('computeInkFoldingRanges: a function diverting to a knot still reveals that divert', () => {
		const lines = ['=== function foo ===', 'Some setup', '-> some_knot'];

		assert.deepStrictEqual(computeInkFoldingRanges(lines), [{ start: 0, end: 1 }]);
	});

	test('syntax grammar: VAR declarations and logic identifiers share constant scope', () => {
		const grammar = require('../../syntaxes/ink.tmLanguage.json');
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

	test('syntax grammar: a divert/thread inside conditional text (e.g. `{ x: <- knot }`) is still tokenized as one', () => {
		const grammar = require('../../syntaxes/ink.tmLanguage.json');
		const conditionalTextBody = grammar.repository.conditionalText.patterns[0].patterns.find(
			(pattern: { name?: string }) => pattern.name === 'meta.conditional.text.ink'
		);

		assert.ok(
			conditionalTextBody?.patterns.some((pattern: { include?: string }) => pattern.include === '#knots'),
			'meta.conditional.text.ink should include #knots so -> and <- are recognized, not just plain text',
		);
	});
});
