import * as assert from 'assert';
import * as vscode from 'vscode';
import {
	getPixiVnDevCharacterIds,
	getPixiVnDevHashtagCommands,
	getPixiVnDevLabelNames,
	getPixiVnJsonSchemaValidator,
	isVersionOlderThan,
	pixiVnDevData,
	refreshPixiVnDevData,
} from '../utils/pixi-vn-dev-data';

suite('pixi-vn-dev-data Test Suite', () => {
	test('isVersionOlderThan: numeric (not lexicographic) a.b.c comparison', () => {
		assert.strictEqual(isVersionOlderThan('1.1.4', '1.1.5'), true);
		assert.strictEqual(isVersionOlderThan('1.1.5', '1.1.5'), false);
		assert.strictEqual(isVersionOlderThan('1.2.0', '1.1.5'), false);
		// A plain string compare would read "1.10.0" as older than "1.1.5" ("1" < "1.1" char-by-char) — wrong.
		assert.strictEqual(isVersionOlderThan('1.10.0', '1.1.5'), false);
		// A missing trailing segment is treated as 0.
		assert.strictEqual(isVersionOlderThan('1.1', '1.1.5'), true);
	});

	test('getPixiVnDevLabelNames: normalizes strings and {id}/{name} objects, dedupes, and drops synthetic "_|_" labels', () => {
		pixiVnDevData.labels = ['start', { id: 'chapter1' }, { name: 'chapter1' }, 'start_|_g-0'];
		assert.deepStrictEqual(getPixiVnDevLabelNames().sort(), ['chapter1', 'start']);
		pixiVnDevData.labels = undefined;
	});

	test('getPixiVnDevCharacterIds: normalizes strings and {id} objects', () => {
		pixiVnDevData.characters = ['mc', { id: 'bob' }];
		assert.deepStrictEqual(getPixiVnDevCharacterIds().sort(), ['bob', 'mc']);
		pixiVnDevData.characters = undefined;
	});

	test('getPixiVnDevLabelNames/getPixiVnDevCharacterIds: empty when the cache holds anything other than an array', () => {
		pixiVnDevData.labels = undefined;
		pixiVnDevData.characters = { not: 'an array' };
		assert.deepStrictEqual(getPixiVnDevLabelNames(), []);
		assert.deepStrictEqual(getPixiVnDevCharacterIds(), []);
		pixiVnDevData.characters = undefined;
	});

	test('getPixiVnDevHashtagCommands: keeps well-formed entries, drops malformed ones, tolerates a non-array cache', () => {
		pixiVnDevData.hashtagCommands = [
			{ name: 'jump-command', validation: { type: 'regexp', source: '^jump\\b', flags: '' } },
			{ description: 'missing its name' },
			null,
			'not an object',
		];
		assert.deepStrictEqual(
			getPixiVnDevHashtagCommands().map((c) => c.name),
			['jump-command'],
		);

		pixiVnDevData.hashtagCommands = { not: 'an array' };
		assert.deepStrictEqual(getPixiVnDevHashtagCommands(), []);
		pixiVnDevData.hashtagCommands = undefined;
	});

	suite('getPixiVnJsonSchemaValidator', () => {
		test('returns undefined when no schema has been cached yet', () => {
			pixiVnDevData.inkJsonSchema = undefined;
			assert.strictEqual(getPixiVnJsonSchemaValidator(), undefined);
		});

		test('compiles and reuses a validator for the currently cached schema', () => {
			pixiVnDevData.inkJsonSchema = { type: 'object', properties: { labels: { type: 'object' } }, required: ['labels'] };
			const validator = getPixiVnJsonSchemaValidator();
			assert.ok(validator);
			assert.strictEqual(validator, getPixiVnJsonSchemaValidator(), 'same schema reference reuses the compiled validator');
			assert.strictEqual(validator?.({ labels: {} }), true);
			assert.strictEqual(validator?.({}), false);
			pixiVnDevData.inkJsonSchema = undefined;
		});

		test('returns undefined instead of throwing for a malformed schema', () => {
			pixiVnDevData.inkJsonSchema = 'not a schema object';
			assert.strictEqual(getPixiVnJsonSchemaValidator(), undefined);
			pixiVnDevData.inkJsonSchema = undefined;
		});
	});

	suite('refreshPixiVnDevData (mocked dev server)', () => {
		const config = vscode.workspace.getConfiguration('ink');
		let originalFetch: typeof fetch;

		suiteSetup(async () => {
			originalFetch = global.fetch;
			await config.update('engine', 'pixi-vn', vscode.ConfigurationTarget.Global);
			await config.update('port', 59321, vscode.ConfigurationTarget.Global);
		});

		suiteTeardown(async () => {
			global.fetch = originalFetch;
			await config.update('engine', undefined, vscode.ConfigurationTarget.Global);
			await config.update('port', undefined, vscode.ConfigurationTarget.Global);
		});

		test(
			'a malformed INK_DEV_API_INFO response (e.g. a Vite SPA-fallback 200 with an HTML body, from a ' +
				'pixi-vn-ink too old to have this route) must not stop characters/labels from being cached — ' +
				'regression test for a real bug where that one bad fetch failed the whole Promise.all and silently ' +
				'dropped every other already-successful result',
			async () => {
				global.fetch = (async (url: string | URL) => {
					const u = String(url);
					if (u.includes('/__pixi-vn/characters')) {
						return { ok: true, json: async () => ['mc'] } as Response;
					}
					if (u.includes('/__pixi-vn/labels')) {
						return { ok: true, json: async () => ['start'] } as Response;
					}
					if (u.includes('/__pixi-vn-ink/info')) {
						return {
							ok: true,
							json: async () => {
								throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
							},
						} as unknown as Response;
					}
					return { ok: false } as Response;
				}) as typeof fetch;

				pixiVnDevData.characters = undefined;
				pixiVnDevData.labels = undefined;

				await refreshPixiVnDevData();

				assert.deepStrictEqual(pixiVnDevData.characters, ['mc']);
				assert.deepStrictEqual(pixiVnDevData.labels, ['start']);
			},
		);

		test('falls back to the public pixi-vn.com schema when INK_DEV_API_INFO cannot be obtained from the dev server', async () => {
			global.fetch = (async (url: string | URL) => {
				const u = String(url);
				if (u.includes('pixi-vn.com/schemas/latest/schema.json')) {
					return { ok: true, json: async () => ({ type: 'object', fromFallback: true }) } as Response;
				}
				if (u.includes('/__pixi-vn-ink/info')) {
					throw new Error('connection refused');
				}
				return { ok: true, json: async () => [] } as Response;
			}) as typeof fetch;

			pixiVnDevData.inkJsonSchema = undefined;

			await refreshPixiVnDevData();

			assert.deepStrictEqual(pixiVnDevData.inkJsonSchema, { type: 'object', fromFallback: true });
		});
	});
});
