import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getErrors, getProjectErrors } from '../utils/ink-utility';

suite('getProjectErrors Test Suite', () => {
	let root: string;

	function write(relPath: string, content: string) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
		return full;
	}

	setup(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-project-errors-'));
	});

	teardown(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	test('current file reachable directly from mainFile: sees mainFile-tree globals it does not INCLUDE itself', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter1.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter1Path = write('chapter1.ink', 'Uses {sharedVar}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(chapter1Path, 'utf-8'), chapter1Path, 'main.ink', root);
		assert.deepStrictEqual(errors, []);
	});

	test('current file reachable directly: a genuine error in it still reports with a line number relative to itself', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter1.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const chapter1Path = write('chapter1.ink', 'Line one.\nUses {undeclaredVar}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(chapter1Path, 'utf-8'), chapter1Path, 'main.ink', root);
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0].message, /undeclaredVar/);
		assert.strictEqual(errors[0].line, 2);
	});

	test('current file reachable transitively, several INCLUDE hops deep, still sees mainFile-tree globals', () => {
		write('main.ink', 'INCLUDE part1.ink\n-> END\n');
		write('part1.ink', 'INCLUDE part2.ink\n');
		write('part2.ink', 'INCLUDE shared.ink\nINCLUDE deep.ink\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const deepPath = write('deep.ink', '=== deep_knot ===\nUses {sharedVar}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(deepPath, 'utf-8'), deepPath, 'main.ink', root);
		assert.deepStrictEqual(errors, []);
	});

	test('current file is mainFile itself: compiled as the whole project, not appended a second time', () => {
		write('shared.ink', 'VAR sharedVar = 42\n');
		write('chapter1.ink', 'Uses {sharedVar}.\n-> END\n');
		const mainPath = write('main.ink', 'INCLUDE shared.ink\nINCLUDE chapter1.ink\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(mainPath, 'utf-8'), mainPath, 'main.ink', root);
		assert.deepStrictEqual(errors, []);
	});

	test('current file NOT reachable from mainFile: still sees mainFile-tree globals via the appended block', () => {
		write('main.ink', 'INCLUDE shared.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const orphanPath = write('orphan.ink', '=== orphan_knot ===\nUses {sharedVar}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(orphanPath, 'utf-8'), orphanPath, 'main.ink', root);
		assert.deepStrictEqual(errors, []);
	});

	test('current file NOT reachable from mainFile: a genuine error in it reports with a line number relative to itself', () => {
		write('main.ink', 'INCLUDE shared.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		const orphanPath = write('orphan.ink', '=== orphan_knot ===\nUses {sharedVar} and {neverDeclared}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(orphanPath, 'utf-8'), orphanPath, 'main.ink', root);
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0].message, /neverDeclared/);
		assert.strictEqual(errors[0].line, 2);
	});

	test('diamond: current file NOT reachable from mainFile but INCLUDEs a file mainFile-tree already includes — no double-declare error, shared global still resolves', () => {
		write('main.ink', 'INCLUDE shared.ink\nINCLUDE included_by_main.ink\n-> END\n');
		write('shared.ink', 'VAR sharedVar = 42\n');
		write('included_by_main.ink', '=== reachable_knot ===\nUses {sharedVar}.\n-> END\n');
		// orphan.ink is not INCLUDEd by main.ink, but it independently INCLUDEs shared.ink too.
		const orphanPath = write('orphan.ink', 'INCLUDE shared.ink\n=== orphan_knot ===\nUses {sharedVar}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(orphanPath, 'utf-8'), orphanPath, 'main.ink', root);
		assert.deepStrictEqual(errors, []);
	});

	test('current file not reachable and shares nothing with mainFile: a truly undeclared variable is still a genuine error', () => {
		write('main.ink', '-> END\n');
		const orphanPath = write('orphan_only.ink', 'Uses {orphanOnlyVar}.\n-> END\n');

		const errors = getProjectErrors(fs.readFileSync(orphanPath, 'utf-8'), orphanPath, 'main.ink', root);
		assert.strictEqual(errors.length, 1);
		assert.match(errors[0].message, /orphanOnlyVar/);
	});

	test('misconfigured mainFile (points to a nonexistent file): falls back to compiling the current file standalone', () => {
		write('shared.ink', 'VAR sharedVar = 42\n');
		const filePath = write('chapter1.ink', 'INCLUDE shared.ink\nUses {sharedVar}.\n-> END\n');
		const text = fs.readFileSync(filePath, 'utf-8');

		const projectErrors = getProjectErrors(text, filePath, 'does_not_exist.ink', root);
		const standaloneErrors = getErrors(text, {
			LoadInkFileContents: (filename: string) => {
				try {
					return fs.readFileSync(path.resolve(root, filename), 'utf-8');
				} catch {
					return '';
				}
			},
		});
		assert.deepStrictEqual(projectErrors, standaloneErrors);
	});
});
