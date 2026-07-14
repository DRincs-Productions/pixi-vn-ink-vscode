import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as path from 'path';

// Regression tests for the interactive preview (NarrationView.tsx.tsx) silently going quiet
// partway through a `pixi-vn` engine story, reported against examples/pixi-vn/start.ink (which
// has a `<- animation_01` thread call to a label that only exists in the real app's own
// TypeScript code, not in any .ink file — so the preview, which only ever compiles .ink source,
// can never resolve it).
//
// These run the real @drincs/pixi-vn / @drincs/pixi-vn-ink engine (not a mock) through the same
// call → continue-while-canContinue → auto-pick-first-choice loop shape `nextChoicesPixi` uses,
// via a child process per story (see fixtures/run-pixi-vn-story.mjs) — pixi-vn keeps module-level
// singleton state that doesn't fully reset between imports in the same process, so process
// isolation is what actually gives each scenario a clean slate.

const runnerPath = path.join(__dirname, '..', '..', 'src', 'test', 'fixtures', 'run-pixi-vn-story.mjs');

interface RunResult {
	compileErrors: { type: string; message: string }[];
	steps: number;
	hitStepCap: boolean;
	isEnd: boolean;
	canContinue: boolean;
	isRequiredInput: boolean;
	pausedForUnansweredInput: boolean;
	defaultValueAtFirstPause: string | number | null;
	choiceCount: number | null;
	maxChoiceCountSeen: number;
	lastText: string | null;
	lastTags: string[];
}

// `inputAnswer`, when given, is the answer supplied to the *first* `# request input ...` the
// story hits (mirroring a player typing a value and pressing submit) — see
// fixtures/run-pixi-vn-story.mjs for exactly how it's applied.
function runPixiVnStory(inkSource: string, inputAnswer?: string): RunResult {
	const stdout = execFileSync(process.execPath, [runnerPath, ...(inputAnswer !== undefined ? [inputAnswer] : [])], {
		input: inkSource,
		encoding: 'utf-8',
		cwd: path.join(__dirname, '..', '..'),
	});
	return JSON.parse(stdout);
}

suite('pixi-vn preview runtime Test Suite', function () {
	// Spawns a real Node process running the actual pixi-vn/pixi-vn-ink engine per scenario.
	this.timeout(20000);

	test('a thread (<-) to a label unknown to the compiled story silently stalls: no error, no choices, not ended', () => {
		const result = runPixiVnStory('Hello there.\n<- missing_thread_target\nAfter the thread call.\n-> END\n');

		assert.deepStrictEqual(result.compileErrors, [], 'compiles fine — the missing target is only a runtime problem');
		assert.strictEqual(result.lastText, 'Hello there.', 'never reaches the text after the thread call');
		assert.strictEqual(result.canContinue, false, 'narration reports nothing left to continue');
		assert.strictEqual(result.choiceCount, null, 'not stopped for a real choice');
		assert.strictEqual(result.isRequiredInput, false, 'not stopped for a real input request');
		assert.strictEqual(result.isEnd, false, 'not a real, recognized end of story either — it just goes quiet');
	});

	test('a divert (->) to a label unknown to the compiled story ends the story abruptly instead of continuing', () => {
		const result = runPixiVnStory('Hello there.\n-> missing_divert_target\n');

		assert.deepStrictEqual(result.compileErrors, []);
		assert.strictEqual(result.lastText, 'Hello there.');
		// Unlike the thread case, the engine treats this failure as the story ending — still no
		// visible error message to the player, but at least distinguishable from a mid-story stall.
		assert.strictEqual(result.isEnd, true);
	});

	test('control: a normal story with a real choice point offers it (the preview auto-picks the first option, same as a player click)', () => {
		const result = runPixiVnStory('Hello there.\n* Choice A\n\t-> END\n* Choice B\n\t-> END\n');

		assert.deepStrictEqual(result.compileErrors, []);
		assert.strictEqual(result.maxChoiceCountSeen, 2, 'the choice point must expose both options at some point');
		assert.strictEqual(result.lastText, 'Choice A', 'auto-picks the first option and follows it');
		assert.strictEqual(result.isEnd, true);
	});

	test('control: a normal linear story with no missing targets runs to -> END', () => {
		const result = runPixiVnStory('Line one.\nLine two.\n-> END\n');

		assert.deepStrictEqual(result.compileErrors, []);
		assert.strictEqual(result.lastText, 'Line two.', 'reaches the final line');
		assert.strictEqual(result.isEnd, true);
		assert.strictEqual(result.hitStepCap, false);
	});

	test('reproduces the exact examples/pixi-vn/start.ink shape: dialogue, then a thread call to a label only the app defines', () => {
		// Mirrors the structure around start.ink's `<- animation_01` (a label registered in the
		// real pixi-vn app's own code, not in any .ink file the preview can see).
		const result = runPixiVnStory(
			[
				'james: Looks like you baked way too much again.',
				'# play sound sfx_whoosh delay 0.1',
				'<- animation_01',
				'<>and returns with a HUGE tinfoil-covered platter.',
				'-> END',
			].join('\n'),
		);

		assert.deepStrictEqual(result.compileErrors, []);
		assert.strictEqual(result.lastText, 'james: Looks like you baked way too much again.');
		assert.strictEqual(result.canContinue, false);
		assert.strictEqual(result.choiceCount, null);
		assert.strictEqual(result.isEnd, false);
	});

	// `main.tsx` now calls `addBaseHashtagCommands()` once at startup (alongside `Game.init()`) —
	// without it, `# request input ...` fails its internal validation ("The operation is not
	// valid") and the preview sails straight past the pause instead of waiting for the player.
	test('a `# request input ...` tag actually pauses the narration for the player, instead of silently failing and continuing', () => {
		const result = runPixiVnStory(
			'Hello there.\n# request input type string default Peter\nWhat is your name?\nNice to meet you.\n-> END\n',
		);

		assert.deepStrictEqual(result.compileErrors, []);
		assert.strictEqual(result.lastText, 'What is your name?', 'stops right at the question, does not sail past it');
		assert.strictEqual(result.pausedForUnansweredInput, true);
		assert.strictEqual(result.isRequiredInput, true);
		assert.strictEqual(result.canContinue, false);
	});

	// The moment the pause happens, `narration.inputValue` already holds the ink tag's own
	// `default ...` value — before the player has typed or submitted anything. NarrationView's
	// `pushPixiHistory`/`submitInput` must treat that as a pre-fill, not a confirmed answer (see
	// the `defaultValue` vs `input` split on `InputRequest`) — this documents exactly the engine
	// behavior that split exists to handle.
	test('the default value from `default ...` is already set on a fresh, unanswered pause', () => {
		const result = runPixiVnStory(
			'Hello there.\n# request input type string default Peter\nWhat is your name?\nNice to meet you.\n-> END\n',
		);

		assert.strictEqual(result.pausedForUnansweredInput, true);
		assert.strictEqual(result.defaultValueAtFirstPause, 'Peter');
	});

	test('supplying an answer unblocks the pause and the story continues past it', () => {
		const result = runPixiVnStory(
			'Hello there.\n# request input type string default Peter\nWhat is your name?\nNice to meet you.\n-> END\n',
			'Alice',
		);

		assert.deepStrictEqual(result.compileErrors, []);
		assert.strictEqual(result.pausedForUnansweredInput, false, 'the supplied answer unblocked the pause');
		assert.strictEqual(result.lastText, 'Nice to meet you.', 'continues past the question');
		assert.strictEqual(result.isEnd, true);
	});
});
