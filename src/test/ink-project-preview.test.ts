import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildProjectAwareSource, compile } from '../utils/ink-utility';

suite('buildProjectAwareSource Test Suite', () => {
	let root: string;

	function write(relPath: string, content: string) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
		return full;
	}

	setup(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-project-preview-'));
	});

	teardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('current file starting directly with a knot (no leading content): diverts straight to that knot, does not wrap it', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter1.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter1Path = write('chapter1.ink', '== Chapter1 ==\nUses {sharedVar}.\n-> END\n');
		const text = fs.readFileSync(chapter1Path, 'utf-8');

		const { source, fileHandler, lineOffset } = buildProjectAwareSource(text, chapter1Path, root, 'main.ink');
		// A synthetic knot immediately followed by the file's own knot header would be empty —
		// inkjs rejects that outright — so this must not throw.
		assert.doesNotThrow(() => compile(source, fileHandler));
		assert.strictEqual(lineOffset, 3);
	});

	test('current file with leading loose content before its first knot: wraps that content in a synthetic entry knot', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter2.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter2Path = write(
			'chapter2.ink',
			'Leading line uses {sharedVar}.\n\n== Chapter2 ==\nMore text.\n-> END\n',
		);
		const text = fs.readFileSync(chapter2Path, 'utf-8');

		const { source, fileHandler, lineOffset } = buildProjectAwareSource(text, chapter2Path, root, 'main.ink');
		assert.doesNotThrow(() => compile(source, fileHandler));
		assert.strictEqual(lineOffset, 4);
	});

	test('current file with no knots at all (pure root content): wraps the whole thing in a synthetic entry knot', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter3.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter3Path = write('chapter3.ink', 'Just some prose using {sharedVar}, no knots at all.\n-> END\n');
		const text = fs.readFileSync(chapter3Path, 'utf-8');

		const { source, fileHandler, lineOffset } = buildProjectAwareSource(text, chapter3Path, root, 'main.ink');
		assert.doesNotThrow(() => compile(source, fileHandler));
		assert.strictEqual(lineOffset, 4);
	});

	test('only blank lines/comments before the first knot: still diverts straight to it, does not wrap', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter4.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter4Path = write(
			'chapter4.ink',
			'// just a comment\n\n== Chapter4 ==\nText here using {sharedVar}.\n-> END\n',
		);
		const text = fs.readFileSync(chapter4Path, 'utf-8');

		const { source, fileHandler, lineOffset } = buildProjectAwareSource(text, chapter4Path, root, 'main.ink');
		assert.doesNotThrow(() => compile(source, fileHandler));
		assert.strictEqual(lineOffset, 3);
	});

	test('diamond: current file not reachable from mainFile but shares an INCLUDE mainFile-tree already has: no double-declare, compiles fine', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE included_by_main.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		write('included_by_main.ink', '=== reachable_knot ===\nUses {sharedVar}.\n-> END\n');
		const orphanPath = write('orphan.ink', 'INCLUDE shared.ink\n=== orphan_knot ===\nUses {sharedVar}.\n-> END\n');
		const text = fs.readFileSync(orphanPath, 'utf-8');

		const { source, fileHandler } = buildProjectAwareSource(text, orphanPath, root, 'main.ink');
		assert.doesNotThrow(() => compile(source, fileHandler));
	});

	test('entryKnot given: diverts straight to it regardless of the current file\'s own shape, no wrapper knot involved', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter1.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter1Path = write('chapter1.ink', '== Chapter1 ==\nUses {sharedVar}.\n-> END\n');
		const text = fs.readFileSync(chapter1Path, 'utf-8');

		const { source, fileHandler, lineOffset } = buildProjectAwareSource(text, chapter1Path, root, 'main.ink', 'Chapter1');
		assert.match(source, /^-> Chapter1\n/);
		assert.doesNotThrow(() => compile(source, fileHandler));
		assert.strictEqual(lineOffset, 3);
	});

	test('current file is mainFile itself: unaffected, compiled as-is with no divert/wrapper', () => {
		write('shared.ink', 'VAR sharedVar = 42\n');
		write('chapter1.ink', '== Chapter1 ==\nUses {sharedVar}.\n-> END\n');
		const mainPath = write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter1.ink\n-> END\n');
		const text = fs.readFileSync(mainPath, 'utf-8');

		const { source, lineOffset } = buildProjectAwareSource(text, mainPath, root, 'main.ink');
		assert.strictEqual(source, text);
		assert.strictEqual(lineOffset, 0);
	});

	test('misconfigured mainFile (points to a nonexistent file): falls back to compiling the current file standalone', () => {
		const filePath = write('chapter1.ink', '== Chapter1 ==\nHello.\n-> END\n');
		const text = fs.readFileSync(filePath, 'utf-8');

		const { source, lineOffset } = buildProjectAwareSource(text, filePath, root, 'does_not_exist.ink');
		assert.strictEqual(source, text);
		assert.strictEqual(lineOffset, 0);
	});

	test('mainFile not set at all: unaffected, optionally still honors entryKnot the old way', () => {
		const filePath = write('chapter1.ink', '== Chapter1 ==\nHello.\n-> END\n');
		const text = fs.readFileSync(filePath, 'utf-8');

		const withoutEntry = buildProjectAwareSource(text, filePath, root, '');
		assert.strictEqual(withoutEntry.source, text);
		assert.strictEqual(withoutEntry.lineOffset, 0);

		const withEntry = buildProjectAwareSource(text, filePath, root, '', 'Chapter1');
		assert.strictEqual(withEntry.source, `-> Chapter1\n${text}`);
		assert.strictEqual(withEntry.lineOffset, 1);
	});
});
