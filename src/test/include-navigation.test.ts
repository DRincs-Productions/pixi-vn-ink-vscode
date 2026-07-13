import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { includeCtrlClick, suggestionsInclude } from '../utils/include-utility';

suite('INCLUDE autocompletion & Ctrl+Click Test Suite', () => {
	let root: string;
	const config = vscode.workspace.getConfiguration('ink');

	function write(relPath: string, content: string) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
		return full;
	}

	function makeDocument(text: string, filePath: string): vscode.TextDocument {
		const lines = text.split(/\r?\n/);
		return {
			uri: vscode.Uri.file(filePath),
			lineAt: (lineOrPos: number | vscode.Position) => {
				const line = typeof lineOrPos === 'number' ? lineOrPos : lineOrPos.line;
				return { text: lines[line] } as vscode.TextLine;
			},
		} as unknown as vscode.TextDocument;
	}

	suiteSetup(async () => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'ink-include-nav-'));
		vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, null, {
			uri: vscode.Uri.file(root),
		});
		await config.update('rootFolder', '', vscode.ConfigurationTarget.Global);
	});

	suiteTeardown(async () => {
		await config.update('rootFolder', undefined, vscode.ConfigurationTarget.Global);
		fs.rmSync(root, { recursive: true, force: true });
	});

	suite('suggestionsInclude (autocompletion after "INCLUDE ")', () => {
		const provider = suggestionsInclude();

		setup(() => {
			write('shared.ink', 'VAR sharedVar = 42\n');
			write('chapter1.ink', '== Chapter1 ==\nHi.\n');
			write('sub/nested.ink', '== Nested ==\nHi.\n');
		});

		teardown(() => {
			fs.rmSync(root, { recursive: true, force: true });
			fs.mkdirSync(root, { recursive: true });
		});

		test('right after "INCLUDE " suggests every file/folder at the project root', async () => {
			const text = 'INCLUDE ';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const items = await provider.provideCompletionItems(
				doc,
				new vscode.Position(0, text.length),
				undefined as unknown as vscode.CancellationToken,
				undefined as unknown as vscode.CompletionContext,
			);
			const labels = (items as vscode.CompletionItem[]).map((i) => i.label).sort();
			assert.deepStrictEqual(labels, ['chapter1.ink', 'shared.ink', 'sub/']);
		});

		test('typing a subfolder path ("INCLUDE sub/") suggests that subfolder\'s own contents', async () => {
			const text = 'INCLUDE sub/';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const items = await provider.provideCompletionItems(
				doc,
				new vscode.Position(0, text.length),
				undefined as unknown as vscode.CancellationToken,
				undefined as unknown as vscode.CompletionContext,
			);
			const labels = (items as vscode.CompletionItem[]).map((i) => i.label);
			assert.deepStrictEqual(labels, ['nested.ink']);
		});

		test('a partial prefix ("INCLUDE sh") only suggests entries starting with it', async () => {
			const text = 'INCLUDE sh';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const items = await provider.provideCompletionItems(
				doc,
				new vscode.Position(0, text.length),
				undefined as unknown as vscode.CancellationToken,
				undefined as unknown as vscode.CompletionContext,
			);
			const labels = (items as vscode.CompletionItem[]).map((i) => i.label);
			assert.deepStrictEqual(labels, ['shared.ink']);
		});

		test('does nothing on a line that is not an INCLUDE statement', async () => {
			const text = 'Just narrative text.';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const items = await provider.provideCompletionItems(
				doc,
				new vscode.Position(0, text.length),
				undefined as unknown as vscode.CancellationToken,
				undefined as unknown as vscode.CompletionContext,
			);
			assert.strictEqual(items, undefined);
		});
	});

	suite('includeCtrlClick (Go to Definition on the INCLUDE path)', () => {
		const provider = includeCtrlClick();

		setup(() => {
			write('shared.ink', 'VAR sharedVar = 42\n');
			write('sub/nested.ink', '== Nested ==\nHi.\n');
		});

		teardown(() => {
			fs.rmSync(root, { recursive: true, force: true });
			fs.mkdirSync(root, { recursive: true });
		});

		test('cursor on an existing file\'s path resolves to that file', async () => {
			const text = 'INCLUDE shared.ink';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const links = (await provider.provideDefinition(
				doc,
				new vscode.Position(0, 10),
				undefined as unknown as vscode.CancellationToken,
			)) as vscode.LocationLink[] | undefined;
			assert.strictEqual(links?.length, 1);
			assert.strictEqual(links[0].targetUri.fsPath, path.join(root, 'shared.ink'));
		});

		test('cursor on a nested subpath resolves to the file inside that subfolder', async () => {
			const text = 'INCLUDE sub/nested.ink';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const links = (await provider.provideDefinition(
				doc,
				new vscode.Position(0, 15),
				undefined as unknown as vscode.CancellationToken,
			)) as vscode.LocationLink[] | undefined;
			assert.strictEqual(links?.length, 1);
			assert.strictEqual(links[0].targetUri.fsPath, path.join(root, 'sub/nested.ink'));
		});

		test('a path pointing at a file that does not exist resolves to nothing, without throwing', async () => {
			const text = 'INCLUDE missing.ink';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const links = await provider.provideDefinition(
				doc,
				new vscode.Position(0, 10),
				undefined as unknown as vscode.CancellationToken,
			);
			assert.strictEqual(links, undefined);
		});

		test('cursor on the "INCLUDE" keyword itself, before the path, resolves to nothing', async () => {
			const text = 'INCLUDE shared.ink';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const links = await provider.provideDefinition(
				doc,
				new vscode.Position(0, 2),
				undefined as unknown as vscode.CancellationToken,
			);
			assert.strictEqual(links, undefined);
		});

		test('does nothing on a line that is not an INCLUDE statement', async () => {
			const text = 'Just narrative text.';
			const doc = makeDocument(text, path.join(root, 'main.ink'));
			const links = await provider.provideDefinition(
				doc,
				new vscode.Position(0, 5),
				undefined as unknown as vscode.CancellationToken,
			);
			assert.strictEqual(links, undefined);
		});
	});
});
