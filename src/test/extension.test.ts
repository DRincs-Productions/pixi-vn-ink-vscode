import * as assert from 'assert';
import * as fs from 'fs';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import {
	collectCommentAbove,
	DECLARATION_KEYWORD_DOCS,
	findDeclaredSymbol,
	findMatchingBracketsInNormalText,
	getDeclaredSymbolHoverText,
	getDivertArrowHoverKind,
	getMultilineBlockTypeKeywordAt,
	getTunnelCallLineDestination,
	getTunnelReturnDestination,
	isChoiceBracketContext,
	isConditionalBranchDash,
	isDeclarationKeywordContext,
	isDivertTargetValueContext,
	isEndDoneHoverContext,
	isInsideCurlyBraceBlockAtLines,
	isNormalTextLine,
	isPrecededByUnescapedDivert,
	isPrecededByUnescapedDivertToKnot,
	isPrecededByUnescapedThread,
	isPrecededByUnescapedThreadToKnot,
	isRefParameterContext,
	isTildeLogicContext,
	isTunnelReturnArrow,
	isVariableTextTypeSpecifier,
} from '../extension';
import { computeInkFoldingRanges } from '../folding';
import {
	BUILTIN_FUNCTIONS,
	findPixiVnUnimplementedFunctionCalls,
	isBuiltinFunctionCallContext,
} from '../utils/builtin-functions';
import {
	computeIncludeInsertion,
	extractKnotDefinitions,
	extractLabelDefinitions,
	findKnotDefinitionsByName,
	findLabelDefinitionsByName,
	getEnclosingKnotStitch,
} from '../utils/knot-definitions';
import { extractVariableDefinitions, findVariableDefinitionsByName } from '../utils/variable-definitions';
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

	test('getDivertArrowHoverKind: a plain divert, even with a call argument', () => {
		assert.strictEqual(getDivertArrowHoverKind('-> top', 0), 'divert');
		assert.strictEqual(getDivertArrowHoverKind('-> accuse("Hastings")', 0), 'divert');
	});

	test('getDivertArrowHoverKind: a divert target used as a value (function argument, VAR, knot parameter)', () => {
		const callLine = 'FunctionA(-> deskstate)';
		assert.strictEqual(getDivertArrowHoverKind(callLine, callLine.indexOf('->')), 'divertTargetValue');

		const varLine = 'VAR current_epilogue = -> everybody_dies';
		assert.strictEqual(getDivertArrowHoverKind(varLine, varLine.indexOf('->')), 'divertTargetValue');

		const knotParamLine = '=== generic_sleep (-> waking)';
		assert.strictEqual(getDivertArrowHoverKind(knotParamLine, knotParamLine.indexOf('->')), 'divertTargetValue');
	});

	test('getDivertArrowHoverKind: a tunnel call, its return point, and tunnel-onward', () => {
		const bareTunnel = '-> see_prints_on_glass ->';
		assert.strictEqual(getDivertArrowHoverKind(bareTunnel, bareTunnel.indexOf('->')), 'tunnelCall');
		assert.strictEqual(getDivertArrowHoverKind(bareTunnel, bareTunnel.lastIndexOf('->')), 'tunnelReturnPoint');

		const onwardTunnel = '-> see_prints_on_glass -> window_opts';
		assert.strictEqual(getDivertArrowHoverKind(onwardTunnel, onwardTunnel.indexOf('->')), 'tunnelCall');
		assert.strictEqual(getDivertArrowHoverKind(onwardTunnel, onwardTunnel.lastIndexOf('->')), 'tunnelOnward');
	});

	test('getDivertArrowHoverKind: ->-> is a tunnel return, for either half', () => {
		assert.strictEqual(getDivertArrowHoverKind('->->', 0), 'tunnelReturn');
		assert.strictEqual(getDivertArrowHoverKind('->->', 2), 'tunnelReturn');
	});

	test('getDivertArrowHoverKind: ->-> destination leaves the tunnel elsewhere, distinct from a bare ->->', () => {
		const line = '\t\t->-> youre_dead';
		const arrowStart = line.indexOf('->');
		assert.strictEqual(getDivertArrowHoverKind(line, arrowStart), 'tunnelReturnElsewhere');
		assert.strictEqual(getDivertArrowHoverKind(line, arrowStart + 2), 'tunnelReturnElsewhere');

		// still followed only by whitespace/end-of-content: a plain tunnel return
		assert.strictEqual(getDivertArrowHoverKind('->->', 0), 'tunnelReturn');

		const inConditional = '{ shield_generators : ->-> argue }';
		assert.strictEqual(getDivertArrowHoverKind(inConditional, inConditional.indexOf('->->')), 'tunnelReturnElsewhere');
	});

	test('isTunnelReturnArrow: true for either half of a ->-> pair', () => {
		assert.strictEqual(isTunnelReturnArrow('->->', 0), true);
		assert.strictEqual(isTunnelReturnArrow('->->', 2), true);
		assert.strictEqual(isTunnelReturnArrow('-> knot', 0), false);
	});

	test('getTunnelReturnDestination: captures the name after ->->, undefined when there is none', () => {
		assert.strictEqual(getTunnelReturnDestination('->-> youre_dead', 0), 'youre_dead');
		assert.strictEqual(getTunnelReturnDestination('->-> youre_dead', 2), 'youre_dead');
		assert.strictEqual(getTunnelReturnDestination('->->', 0), undefined);
		assert.strictEqual(getTunnelReturnDestination('->-> // a comment, not a destination', 0), undefined);
	});

	test('isDivertTargetValueContext: true right after ( , or =, not after a bare divert', () => {
		assert.strictEqual(isDivertTargetValueContext('FunctionA('), true);
		assert.strictEqual(isDivertTargetValueContext('Foo(x, '), true);
		assert.strictEqual(isDivertTargetValueContext('VAR x = '), true);
		assert.strictEqual(isDivertTargetValueContext(''), false);
	});

	test('getTunnelCallLineDestination: recognizes -> knot -> and -> knot -> destination, not a plain divert', () => {
		assert.deepStrictEqual(getTunnelCallLineDestination('-> see_prints_on_glass ->'), {
			isTunnelCallLine: true,
			destination: undefined,
		});
		assert.deepStrictEqual(getTunnelCallLineDestination('-> see_prints_on_glass -> window_opts'), {
			isTunnelCallLine: true,
			destination: 'window_opts',
		});
		assert.deepStrictEqual(getTunnelCallLineDestination('-> accuse("Hastings")'), { isTunnelCallLine: false });
	});

	test('getMultilineBlockTypeKeywordAt: recognizes each of the four single-word type keywords', () => {
		assert.strictEqual(getMultilineBlockTypeKeywordAt('{ stopping:', '{ stopping:'.indexOf('stopping')), 'stopping');
		assert.strictEqual(getMultilineBlockTypeKeywordAt('{ cycle:', '{ cycle:'.indexOf('cycle')), 'cycle');
		assert.strictEqual(getMultilineBlockTypeKeywordAt('{ once:', '{ once:'.indexOf('once')), 'once');
		assert.strictEqual(getMultilineBlockTypeKeywordAt('{ shuffle:', '{ shuffle:'.indexOf('shuffle')), 'shuffle');
	});

	test('getMultilineBlockTypeKeywordAt: "shuffle once" / "shuffle stopping" are recognized from either word', () => {
		const shuffleOnce = '{ shuffle once:';
		assert.strictEqual(getMultilineBlockTypeKeywordAt(shuffleOnce, shuffleOnce.indexOf('shuffle')), 'shuffle once');
		assert.strictEqual(getMultilineBlockTypeKeywordAt(shuffleOnce, shuffleOnce.indexOf('once')), 'shuffle once');

		const shuffleStopping = '{ shuffle stopping:';
		assert.strictEqual(
			getMultilineBlockTypeKeywordAt(shuffleStopping, shuffleStopping.indexOf('shuffle')),
			'shuffle stopping',
		);
		assert.strictEqual(
			getMultilineBlockTypeKeywordAt(shuffleStopping, shuffleStopping.indexOf('stopping')),
			'shuffle stopping',
		);
	});

	test('getMultilineBlockTypeKeywordAt: undefined for plain narrative text or a keyword not actually typing a block', () => {
		const narrative = 'I visited once before';
		assert.strictEqual(getMultilineBlockTypeKeywordAt(narrative, narrative.indexOf('once')), undefined);

		const conditionalText = '{ x: once told me }';
		assert.strictEqual(getMultilineBlockTypeKeywordAt(conditionalText, conditionalText.indexOf('once')), undefined);

		const noColon = '{once I saw stars}';
		assert.strictEqual(getMultilineBlockTypeKeywordAt(noColon, noColon.indexOf('once')), undefined);

		const escapedBrace = '\\{ stopping: }';
		assert.strictEqual(getMultilineBlockTypeKeywordAt(escapedBrace, escapedBrace.indexOf('stopping')), undefined);
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

	// The structural grammar tests above only inspect the JSON, which can't catch bugs that
	// only show up across multiple lines of *stateful* tokenization (a block that never
	// closes, leaking its scope into everything after it). These tests run the real
	// TextMate tokenizer, one line at a time, carrying the rule stack forward exactly like
	// VS Code does, so they can actually observe that kind of regression.
	async function createInkGrammar() {
		const oniguruma = require('vscode-oniguruma');
		const vsctm = require('vscode-textmate');
		const wasmBin = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer;
		await oniguruma.loadWASM(wasmBin);
		const onigLib = Promise.resolve({
			createOnigScanner: (patterns: string[]) => new oniguruma.OnigScanner(patterns),
			createOnigString: (value: string) => new oniguruma.OnigString(value),
		});
		const grammarSrc = require('../../syntaxes/ink.tmLanguage.json');
		const registry = new vsctm.Registry({
			onigLib,
			loadGrammar: (scopeName: string) =>
				scopeName === 'source.ink' ? Promise.resolve(grammarSrc) : Promise.resolve(null),
		});
		return registry.loadGrammar('source.ink');
	}

	function tokenizeInkLines(grammar: any, lines: string[]) {
		const vsctm = require('vscode-textmate');
		let ruleStack = vsctm.INITIAL;
		return lines.map((line) => {
			const result = grammar.tokenizeLine(line, ruleStack);
			ruleStack = result.ruleStack;
			return result.tokens.map((token: { startIndex: number; endIndex: number; scopes: string[] }) => ({
				text: line.substring(token.startIndex, token.endIndex),
				scopes: token.scopes,
			}));
		});
	}

	test('syntax grammar: an indented closing } of a multiline block ({ stopping: ... }) actually closes it', async () => {
		const grammar = await createInkGrammar();
		const lines = ['{ stopping:', '-\tFirst.', '-\tSecond.', '    }', '-> top'];
		const tokens = tokenizeInkLines(grammar, lines);

		const divertLineTokens = tokens[4];
		assert.ok(
			divertLineTokens.some((t) => t.text === '->' && t.scopes.includes('keyword.other.divert.ink')),
			'-> after the block should be one token, not split into "-" and ">" by a still-open block',
		);
		assert.ok(
			!divertLineTokens.some((t) => t.scopes.includes('meta.multiline.block.ink')),
			'the multiline block should have closed at the indented }, not leaked into the following line',
		);
	});

	test('syntax grammar: a nested { cycle: ... } inside a bulleted line closes independently of its parent block', async () => {
		const grammar = await createInkGrammar();
		// Mirrors examples/tower_of_hanoi.ink's move_post stitch.
		const lines = [
			'{ stopping:',
			'-\tFirst.',
			'-\tSecond.',
			'-\t{cycle:',
			'\t- Third.',
			'\t- Fourth.',
			'\t}',
			'}',
			'-> top',
		];
		const tokens = tokenizeInkLines(grammar, lines);

		const cycleCloseTokens = tokens[6];
		assert.ok(
			cycleCloseTokens.some((t) => t.text === '}' && t.scopes.includes('keyword.other.brackets.conditional.ink')),
			'the cycle block\'s own } should close it, not be swallowed as plain text',
		);

		const divertLineTokens = tokens[8];
		assert.ok(
			divertLineTokens.some((t) => t.text === '->' && t.scopes.includes('keyword.other.divert.ink')),
			'-> after both blocks should be one token, not split apart by a still-open block',
		);
		assert.ok(
			!divertLineTokens.some((t) => t.scopes.includes('meta.multiline.block.ink')),
			'both the cycle block and its parent stopping block should have closed by this point',
		);
	});

	test('extractKnotDefinitions: finds top-level knots, nested stitches, and functions', () => {
		const content = [
			'=== knot_one ===',
			'Text.',
			'= stitch_a',
			'More text.',
			'-> DONE',
			'',
			'=== function knot_two(x) ===',
			'~ return x',
		].join('\n');

		const defs = extractKnotDefinitions('/proj/a.ink', content);

		assert.deepStrictEqual(
			defs.map((d) => d.fullName),
			['knot_one', 'knot_one.stitch_a', 'knot_two'],
		);
		assert.strictEqual(defs[0].line, 0);
		assert.strictEqual(defs[0].stitchName, undefined);
		assert.strictEqual(defs[0].column, 4, 'points at "knot_one" itself, right after "=== "');
		assert.strictEqual(defs[1].knotName, 'knot_one');
		assert.strictEqual(defs[1].line, 2);
		assert.strictEqual(defs[1].column, 2, 'points at "stitch_a", right after "= "');
		assert.strictEqual(defs[2].isFunction, true, 'a === function name === header is a function knot');
		assert.strictEqual(defs[2].column, 13, 'points at "knot_two", right after "=== function "');
	});

	test('findKnotDefinitionsByName: proposes every knot sharing a name across files', () => {
		const defsA = extractKnotDefinitions(
			'/proj/a.ink',
			['=== knot_one ===', '-> DONE'].join('\n'),
		);
		const defsB = extractKnotDefinitions(
			'/proj/b.ink',
			['== knot_one ==', '-> END'].join('\n'),
		);
		const all = [...defsA, ...defsB];

		const matches = findKnotDefinitionsByName(all, 'knot_one');

		assert.strictEqual(matches.length, 2, 'two files each define knot_one, both should be proposed');
		assert.deepStrictEqual(
			matches.map((d) => d.filePath).sort(),
			['/proj/a.ink', '/proj/b.ink'],
		);
	});

	test('findKnotDefinitionsByName: a dotted knot.stitch name only matches that exact stitch', () => {
		const defs = extractKnotDefinitions(
			'/proj/a.ink',
			['=== knot_one ===', '= stitch_a', '-> DONE', '', '=== knot_two ===', '= stitch_a', '-> DONE'].join('\n'),
		);

		const matches = findKnotDefinitionsByName(defs, 'knot_one.stitch_a');

		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].knotName, 'knot_one');
	});

	test('findKnotDefinitionsByName: an unqualified name also matches a stitch with that plain name', () => {
		const defs = extractKnotDefinitions(
			'/proj/a.ink',
			['=== knot_one ===', '= stitch_a', '-> DONE'].join('\n'),
		);

		const matches = findKnotDefinitionsByName(defs, 'stitch_a');

		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].fullName, 'knot_one.stitch_a');
	});

	test('computeIncludeInsertion: adds alongside existing includes at the top, keeping the blank line after them', () => {
		const lines = ['INCLUDE a.ink', 'INCLUDE b.ink', '', '=== knot_one ==='];

		const { line, text } = computeIncludeInsertion(lines, 'c.ink');

		assert.strictEqual(line, 2, 'inserted right after the last existing include, before the blank line');
		assert.strictEqual(text, 'INCLUDE c.ink\n');
	});

	test('computeIncludeInsertion: adds a missing blank line after the include block when there wasn\'t one', () => {
		const lines = ['INCLUDE a.ink', '=== knot_one ==='];

		const { line, text } = computeIncludeInsertion(lines, 'b.ink');

		assert.strictEqual(line, 1);
		assert.strictEqual(text, 'INCLUDE b.ink\n\n', 'a blank line is added since the original file had none');
	});

	test('computeIncludeInsertion: inserts at the very top when the file has no includes yet, with a trailing blank line', () => {
		const lines = ['=== knot_one ===', 'Some text.'];

		const { line, text } = computeIncludeInsertion(lines, 'a.ink');

		assert.strictEqual(line, 0);
		assert.strictEqual(text, 'INCLUDE a.ink\n\n');
	});

	test('computeIncludeInsertion: does not add an extra blank line when the top of the file is already blank', () => {
		const lines = ['', '=== knot_one ==='];

		const { line, text } = computeIncludeInsertion(lines, 'a.ink');

		assert.strictEqual(line, 0);
		assert.strictEqual(text, 'INCLUDE a.ink\n');
	});

	test('computeIncludeInsertion: ignores an INCLUDE that appears later in the file, not part of the leading block', () => {
		const lines = ['=== knot_one ===', 'INCLUDE stray.ink'];

		const { line, text } = computeIncludeInsertion(lines, 'a.ink');

		assert.strictEqual(line, 0, 'the stray INCLUDE further down does not count as the leading block');
		assert.strictEqual(text, 'INCLUDE a.ink\n\n');
	});

	test('extractLabelDefinitions: finds labelled gathers and choices, distinct from plain ones', () => {
		const content = [
			'=== fight ===',
			'- (opts)',
			'*	[Pull a face]',
			'	You pull a face, and the soldier comes at you! -> shove',
			'',
			'*	(shove) [Shove the guard aside] You shove the guard to one side, but he comes back swinging.',
			'',
			'*	{shove} [Grapple and fight] -> fight_the_guard',
			'-	-> opts',
		].join('\n');

		const defs = extractLabelDefinitions('/proj/a.ink', content);

		assert.deepStrictEqual(
			defs.map((d) => d.labelName),
			['opts', 'shove'],
			'only the labelled gather/choice are found, not the plain "* [Pull a face]" or "-\t-> opts"',
		);
		assert.strictEqual(defs[0].knotName, 'fight');
		assert.strictEqual(defs[0].stitchName, undefined);
		assert.deepStrictEqual(defs[0].fullNames, ['opts', 'fight.opts']);
		assert.strictEqual(defs[0].column, 3, 'points at "opts" itself, right after "- ("');
		assert.strictEqual(defs[1].line, 5);
		assert.strictEqual(defs[1].column, 3, 'points at "shove" itself, right after "*\\t("');
	});

	test('extractLabelDefinitions: a label nested in a stitch is addressable as stitch.label and knot.stitch.label', () => {
		const content = ['=== knot ===', '= stitch_one', '\t- (gatherpoint) Some content.'].join('\n');

		const defs = extractLabelDefinitions('/proj/a.ink', content);

		assert.strictEqual(defs.length, 1);
		assert.deepStrictEqual(defs[0].fullNames, ['gatherpoint', 'stitch_one.gatherpoint', 'knot.stitch_one.gatherpoint']);
	});

	test('findLabelDefinitionsByName: resolves a bare label within the same file, proposing every match', () => {
		const content = ['=== fight ===', '- (opts)', '-\t-> opts', '', '=== another_knot ===', '- (opts)'].join('\n');
		const defs = extractLabelDefinitions('/proj/a.ink', content);

		const matches = findLabelDefinitionsByName(defs, 'opts');

		assert.strictEqual(matches.length, 2, 'two knots each label a gather "opts" — both are proposed');
	});

	test('findLabelDefinitionsByName: resolves a dotted stitch.label or knot.label path to just that one label', () => {
		const content = ['=== knot ===', '= stitch_one', '\t- (gatherpoint) Some content.'].join('\n');
		const defs = extractLabelDefinitions('/proj/a.ink', content);

		assert.strictEqual(findLabelDefinitionsByName(defs, 'stitch_one.gatherpoint').length, 1);
		assert.strictEqual(findLabelDefinitionsByName(defs, 'knot.stitch_one.gatherpoint').length, 1);
		assert.strictEqual(findLabelDefinitionsByName(defs, 'knot.gatherpoint').length, 0, 'wrong path does not match');
	});

	test('extractVariableDefinitions: finds VAR, CONST, and every LIST item (parens and explicit values stripped)', () => {
		const content = [
			'VAR knowledge_of_the_cure = false',
			'VAR players_name = "Emilia"',
			'CONST MAX_HEALTH = 100',
			'LIST DoctorsInSurgery = Adams, Bernard, (Cartwright)',
		].join('\n');

		const defs = extractVariableDefinitions(content);

		assert.strictEqual(defs.length, 7, '2 VAR + 1 CONST + 1 LIST + 3 LIST_ITEM');
		assert.strictEqual(defs[0].kind, 'VAR');
		assert.strictEqual(defs[0].column, 4, 'points at the name itself, right after "VAR "');
		assert.strictEqual(defs[2].kind, 'CONST');
		assert.strictEqual(defs[2].column, 6, 'points at the name itself, right after "CONST "');
		assert.strictEqual(defs[3].kind, 'LIST');
		assert.strictEqual(defs[3].name, 'DoctorsInSurgery');
		assert.strictEqual(defs[3].column, 5, 'points at the list name itself, right after "LIST "');
		assert.deepStrictEqual(
			defs.slice(4).map((d) => d.name),
			['Adams', 'Bernard', 'Cartwright'],
			'"(Cartwright)" is still a valid item name once the parens are stripped',
		);
		assert.deepStrictEqual(defs[4].fullNames, ['Adams', 'DoctorsInSurgery.Adams']);
		assert.deepStrictEqual(
			defs.slice(4).map((d) => d.column),
			[24, 31, 41],
			'each item points at its own name, not the parenthesis or a shared offset',
		);
	});

	test('extractVariableDefinitions: strips an explicit item value (e.g. "Alive = 1") down to just the name', () => {
		const defs = extractVariableDefinitions('LIST Status = Alive = 1, Dead');

		assert.deepStrictEqual(
			defs.filter((d) => d.kind === 'LIST_ITEM').map((d) => d.name),
			['Alive', 'Dead'],
		);
	});

	test('findVariableDefinitionsByName: resolves bare and dotted list.item references', () => {
		const defs = extractVariableDefinitions('LIST DoctorsInSurgery = Adams, Bernard, (Cartwright)');

		assert.strictEqual(findVariableDefinitionsByName(defs, 'Adams').length, 1);
		assert.strictEqual(findVariableDefinitionsByName(defs, 'DoctorsInSurgery.Adams').length, 1);
		assert.strictEqual(findVariableDefinitionsByName(defs, 'DoctorsInSurgery.Nope').length, 0);
	});

	test('findVariableDefinitionsByName: an item name shared by two lists proposes both', () => {
		const defs = extractVariableDefinitions(['LIST A = shared, x', 'LIST B = shared, y'].join('\n'));

		const matches = findVariableDefinitionsByName(defs, 'shared');

		assert.strictEqual(matches.length, 2, 'both lists declare an item called "shared"');
	});

	test('extractVariableDefinitions: finds ~ temp declarations, scoped to their enclosing knot', () => {
		const content = [
			'== start',
			'      ~ temp chain = LIST_ALL(x)',
			'      ~ temp statesGained = LIST_RANGE(chain, LIST_MIN(chain), x)',
			'      ~ knowledgeState += statesGained',
		].join('\n');

		const defs = extractVariableDefinitions(content);
		const temps = defs.filter((d) => d.kind === 'TEMP');

		assert.deepStrictEqual(
			temps.map((d) => d.name),
			['chain', 'statesGained'],
		);
		assert.strictEqual(temps[0].knotName, 'start');
		assert.strictEqual(temps[0].stitchName, undefined);
		assert.strictEqual(temps[0].line, 1);
		assert.strictEqual(temps[0].column, 13, 'points at "chain" itself, right after "~ temp "');
	});

	test('findVariableDefinitionsByName: a temp only resolves within the knot/stitch it was declared in', () => {
		const content = [
			'== start',
			'      ~ temp chain = 1',
			'== other_knot',
			'      ~ temp chain = 2',
		].join('\n');
		const defs = extractVariableDefinitions(content);

		const inStart = findVariableDefinitionsByName(defs, 'chain', { knotName: 'start' });
		assert.strictEqual(inStart.length, 1);
		assert.strictEqual(inStart[0].line, 1, 'resolves to the temp declared in the same knot');

		const inOther = findVariableDefinitionsByName(defs, 'chain', { knotName: 'other_knot' });
		assert.strictEqual(inOther.length, 1);
		assert.strictEqual(inOther[0].line, 3, 'a same-named temp in a different knot resolves to its own, not the first one');

		const noScope = findVariableDefinitionsByName(defs, 'chain');
		assert.strictEqual(noScope.length, 0, 'without a matching scope, an out-of-scope temp never matches');
	});

	test('getEnclosingKnotStitch: finds the nearest knot/stitch header at or before a line', () => {
		const content = ['== knot_one', '= stitch_one', 'Text.', '== knot_two', 'Text.'].join('\n');

		assert.deepStrictEqual(getEnclosingKnotStitch(content, 2), { knotName: 'knot_one', stitchName: 'stitch_one' });
		assert.deepStrictEqual(getEnclosingKnotStitch(content, 4), { knotName: 'knot_two', stitchName: undefined });
	});

	test('extractVariableDefinitions: finds parameters in a knot/function header, including a leading ref', () => {
		const content = [
			'=== function move_to_supporter(ref item_state, new_supporter) ===',
			'    ~ item_state -= LIST_ALL(Supporters)',
			'    ~ item_state += new_supporter',
		].join('\n');

		const defs = extractVariableDefinitions(content);
		const params = defs.filter((d) => d.kind === 'PARAM');

		assert.deepStrictEqual(
			params.map((p) => p.name),
			['item_state', 'new_supporter'],
		);
		assert.strictEqual(params[0].isRef, true, 'item_state is declared with a leading ref');
		assert.strictEqual(params[1].isRef, false, 'new_supporter has no ref');
		assert.strictEqual(params[0].column, 35, 'points at "item_state" itself, past the leading "ref "');
		assert.strictEqual(params[1].column, 47, 'points at "new_supporter" itself');
		assert.strictEqual(params[0].knotName, 'move_to_supporter');
		assert.strictEqual(params[0].line, 0, 'a parameter is defined on its header line');
	});

	test('findVariableDefinitionsByName: a parameter only resolves within its own knot/stitch', () => {
		const content = ['=== knot_one(x) ===', '    ~ y = x', '=== knot_two(x) ===', '    ~ z = x'].join('\n');
		const defs = extractVariableDefinitions(content);

		const inKnotOne = findVariableDefinitionsByName(defs, 'x', { knotName: 'knot_one' });
		assert.strictEqual(inKnotOne.length, 1);
		assert.strictEqual(inKnotOne[0].line, 0);

		const inKnotTwo = findVariableDefinitionsByName(defs, 'x', { knotName: 'knot_two' });
		assert.strictEqual(inKnotTwo.length, 1);
		assert.strictEqual(inKnotTwo[0].line, 2, 'resolves to its own knot\'s parameter, not the other one');
	});

	test('isRefParameterContext: true only for ref right after ( or , on a knot/function header line', () => {
		assert.strictEqual(
			isRefParameterContext('=== function move_to_supporter(ref item_state, new_supporter) ===', 32),
			true,
			'ref right after the opening (',
		);
		assert.strictEqual(
			isRefParameterContext('== cook_with(nameOfThing, ref thingToBoil) ==', 27),
			true,
			'ref right after a comma',
		);
		assert.strictEqual(
			isRefParameterContext('He handed her ref card, a document she needed.', 15),
			false,
			'plain narrative text, not a knot/function header line',
		);
		assert.strictEqual(
			isRefParameterContext('=== knot_name ===', 4),
			false,
			'ref keyword requires ( or , right before it, not just any header line',
		);
	});

	test('syntax grammar: ref in a parameter list gets its own scope, distinct from a plain parameter name', async () => {
		const grammar = await createInkGrammar();
		const lines = ['=== function move_to_supporter(ref item_state, new_supporter) ==='];
		const tokens = tokenizeInkLines(grammar, lines)[0];

		const refToken = tokens.find((t) => t.text === 'ref');
		assert.ok(refToken, 'ref should be tokenized as its own token');
		assert.ok(
			refToken!.scopes.includes('keyword.other.ref.ink'),
			'ref should get the keyword.other.ref.ink scope so it can be coloured distinctly',
		);

		const paramToken = tokens.find((t) => t.text === 'new_supporter');
		assert.ok(paramToken, 'the plain parameter should still be tokenized');
		assert.ok(
			!paramToken!.scopes.includes('keyword.other.ref.ink'),
			'a plain parameter name must not be mistaken for the ref keyword',
		);
	});

	test('syntax grammar: an identifier containing "ref" as a substring is not mistaken for the ref keyword', async () => {
		const grammar = await createInkGrammar();
		const lines = ['=== knot_one(ref_count, preferences) ==='];
		const tokens = tokenizeInkLines(grammar, lines)[0];

		for (const name of ['ref_count', 'preferences']) {
			const token = tokens.find((t) => t.text === name);
			assert.ok(token, `${name} should be tokenized as its own token`);
			assert.ok(!token!.scopes.includes('keyword.other.ref.ink'), `${name} must not match the ref keyword`);
		}
	});
});
