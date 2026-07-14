// Drives a compiled pixi-vn ink story through the same setup NarrationView.tsx.tsx uses for the
// interactive preview: `addBaseHashtagCommands()` registered once (main.tsx), the same
// `onInkHashtagScript` filter `nextChoicesPixi` installs (swallowing every tag as inert display
// text except `input`/`continue`, which are left to pixi-vn-ink's own built-in handling), then
// `call` the synthetic entry label and repeatedly `narration.continue()` while `canContinue`,
// auto-picking the first choice whenever one appears. Prints a JSON summary of where it ended up.
// Used by pixi-vn-preview-runtime.test.ts to reproduce, in the real (non-mocked) engine, what the
// interactive preview actually does — including cases where it silently stalls instead of
// finishing or surfacing an error.
//
// The ink source is read from stdin so multi-line snippets don't need shell escaping. An optional
// first CLI argument supplies the answer to give the *first* `# request input ...` the story
// hits (mirroring a player typing a value and pressing submit) — without it, the run stops right
// at that pause, same as a fresh preview waiting for the player.
//
// Runs in its own process (one story per invocation) because the pixi-vn engine keeps
// module-level singleton state that isn't fully reset between imports within the same process.

import { convertInkToJson } from "@drincs/pixi-vn-ink/converter";
import { addBaseHashtagCommands, importJson, onInkHashtagScript } from "@drincs/pixi-vn-ink";
import { Game, narration } from "@drincs/pixi-vn";

const PIXI_VN_START_LABEL = "__pixi_vn_start__";
const MAX_STEPS = 200;
const inputAnswer = process.argv[2];

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
}

const source = await readStdin();

const compileErrors = [];
const json = convertInkToJson(`=== ${PIXI_VN_START_LABEL} ===\n${source}`, {
    errorHandler: (message, type) => compileErrors.push({ type, message }),
});

addBaseHashtagCommands();
await Game.init();
await importJson(json);

let tags = [];
// Mirrors NarrationView.tsx.tsx's `nextChoicesPixi` filter exactly: every tag is swallowed as an
// inert display tag except `... input ...` and `continue`, which are left to pixi-vn-ink's own
// built-in hashtag-command handling (registered above by `addBaseHashtagCommands`).
onInkHashtagScript((script) => {
    if (script.length === 0) return true;
    if (script.length > 1) {
        switch (script[1]) {
            case "input":
                return false;
        }
    }
    switch (script[0]) {
        case "continue":
            return false;
    }
    tags.push(script.join(" "));
    return true;
});

let isEnd = false;
Game.onEnd(() => {
    isEnd = true;
});

await narration.call(PIXI_VN_START_LABEL, {});

let steps = 0;
let maxChoiceCountSeen = narration.choices?.length ?? 0;
// What `narration.inputValue` already held (e.g. the ink tag's `default ...`) the very first time
// the story paused for input, before any answer was supplied — this is what a fresh preview must
// not mistake for an already-confirmed answer.
let defaultValueAtFirstPause;
let pausedForUnansweredInput = false;

while (!isEnd && narration.canContinue && steps < MAX_STEPS) {
    await narration.continue({});
    steps++;
    maxChoiceCountSeen = Math.max(maxChoiceCountSeen, narration.choices?.length ?? 0);

    if (!isEnd && !narration.canContinue && narration.isRequiredInput) {
        if (defaultValueAtFirstPause === undefined) {
            defaultValueAtFirstPause = narration.inputValue;
        }
        if (inputAnswer === undefined) {
            pausedForUnansweredInput = true;
            break;
        }
        narration.inputValue = inputAnswer;
        continue;
    }

    if (!isEnd && !narration.canContinue && narration.choices?.length) {
        const choice = narration.choices[0];
        await narration.selectChoice(choice, {});
        steps++;
    }
}

const text = narration.dialogue?.text;
console.log(
    JSON.stringify({
        compileErrors,
        steps,
        hitStepCap: steps >= MAX_STEPS,
        isEnd,
        canContinue: narration.canContinue,
        isRequiredInput: narration.isRequiredInput,
        pausedForUnansweredInput,
        defaultValueAtFirstPause: defaultValueAtFirstPause ?? null,
        choiceCount: narration.choices?.length ?? null,
        maxChoiceCountSeen,
        lastText: Array.isArray(text) ? text.join("") : (text ?? null),
        lastTags: tags,
    }),
);
