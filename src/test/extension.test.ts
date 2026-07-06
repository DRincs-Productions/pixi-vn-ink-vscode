import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { isEndDoneHoverContext, isVariableTextTypeSpecifier } from '../extension';
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
});
