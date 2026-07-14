// Drives a *multi-file* pixi-vn project through the same lazy compile-and-traverse logic
// `compilePixiVNProject` (src/webview.ts) uses, then the same narration loop shape
// `run-pixi-vn-story.mjs` uses for a single file. Used by
// pixi-vn-preview-runtime.test.ts to verify, against the real engine, that:
//   - a `->`/`<-` to a knot defined only in another project file resolves correctly once that
//     file is lazily discovered and compiled too;
//   - a `->`/`<-` to a label absent from every project file becomes the centered "non-ink label"
//     notice instead of silently stalling/ending, with the right call-vs-jump continuation.
//
// The functions below mirror src/utils/pixi-vn-utility.ts and the knot-header scan
// src/utils/knot-definitions.ts does — kept in sync by hand, since this fixture (a plain .mjs,
// run via child_process) can't import that TypeScript source directly. If either changes, update
// both.
//
// stdin is a JSON payload: `{ files: [{ path, content }], currentPath, inputAnswer? }` — files
// are virtual (paths are just map keys, nothing is read from disk); `currentPath` selects which
// one is "the file being previewed" (gets the synthetic entry-point wrapper); `inputAnswer`, if
// given, answers the first `# request input ...` the story hits (see run-pixi-vn-story.mjs).

import { convertInkToJson } from "@drincs/pixi-vn-ink/converter";
import { addBaseHashtagCommands, importJson, onInkHashtagScript } from "@drincs/pixi-vn-ink";
import { Game, narration } from "@drincs/pixi-vn";

const PIXI_VN_START_LABEL = "__pixi_vn_start__";
const NON_INK_LABEL_CALL_CHARACTER = "__non_ink_label_call__";
const NON_INK_LABEL_JUMP_CHARACTER = "__non_ink_label_jump__";
const MAX_STEPS = 200;

// --- mirrors src/utils/pixi-vn-utility.ts ---

function compilePixiVN(text, errors) {
    return convertInkToJson(`=== ${PIXI_VN_START_LABEL} ===\n${text}`, {
        errorHandler: (message, type) => errors.push({ type, message }),
    });
}

function compilePixiVNLibraryFile(text, errors) {
    return convertInkToJson(text, { errorHandler: (message, type) => errors.push({ type, message }) });
}

const REFERENCE_REGEX = /(?:->|<-)[ \t]+(\w[\w.]*)/g;

function extractReferencedKnotNames(text) {
    const names = new Set();
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.replace(/\/\/.*$/, "");
        for (const match of line.matchAll(REFERENCE_REGEX)) {
            names.add(match[1].split(".")[0]);
        }
    }
    return names;
}

function collectKnownPixiVnLabels(jsons) {
    const known = new Set();
    for (const json of jsons) {
        for (const labelId of Object.keys(json.labels ?? {})) known.add(labelId);
    }
    return known;
}

function isSimpleLabelToOpen(entry) {
    return typeof entry === "object" && entry !== null && typeof entry.label === "string" && (entry.type === "call" || entry.type === "jump");
}

function rewriteStep(step, knownLabels) {
    const entry = step.labelToOpen;
    if (!entry || Array.isArray(entry) || !isSimpleLabelToOpen(entry) || knownLabels.has(entry.label)) {
        return step;
    }
    const { labelToOpen, glueEnabled, ...rest } = step;
    return {
        ...rest,
        dialogue: {
            character: entry.type === "call" ? NON_INK_LABEL_CALL_CHARACTER : NON_INK_LABEL_JUMP_CHARACTER,
            text: entry.label,
        },
        ...(entry.type === "jump" ? { end: "label_end" } : {}),
    };
}

function markUnresolvableLabelCalls(json, knownLabels) {
    if (!json.labels) return json;
    const labels = {};
    for (const [labelId, steps] of Object.entries(json.labels)) {
        labels[labelId] = steps.map((step) => rewriteStep(step, knownLabels));
    }
    return { ...json, labels };
}

// --- mirrors the top-level-knot-header scan in src/utils/knot-definitions.ts ---

const KNOT_HEADER_REGEX = /^\s*(={2,})\s*(?:function\s+)?(\w+)/;

function findTopLevelKnotFile(files) {
    const fileByKnotName = new Map();
    for (const file of files) {
        for (const rawLine of file.content.split(/\r?\n/)) {
            const match = rawLine.match(KNOT_HEADER_REGEX);
            if (match && !fileByKnotName.has(match[2])) fileByKnotName.set(match[2], file.path);
        }
    }
    return fileByKnotName;
}

// --- mirrors compilePixiVNProject in src/webview.ts ---

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
}

const { files, currentPath, inputAnswer } = JSON.parse(await readStdin());

const compileErrors = [];
const contentByPath = new Map(files.map((f) => [f.path, f.content]));
const fileByKnotName = findTopLevelKnotFile(files);

const visited = new Set();
const queue = [{ path: currentPath, text: contentByPath.get(currentPath), isCurrentFile: true }];
const compiledJsons = [];

while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.path)) continue;
    visited.add(next.path);

    const json = next.isCurrentFile
        ? compilePixiVN(next.text, compileErrors)
        : compilePixiVNLibraryFile(next.text, compileErrors);
    if (json) compiledJsons.push(json);

    for (const knotName of extractReferencedKnotNames(next.text)) {
        const targetPath = fileByKnotName.get(knotName);
        if (!targetPath || visited.has(targetPath)) continue;
        const targetContent = contentByPath.get(targetPath);
        if (targetContent === undefined) continue;
        queue.push({ path: targetPath, text: targetContent, isCurrentFile: false });
    }
}

const knownLabels = collectKnownPixiVnLabels(compiledJsons);
const rewrittenJsons = compiledJsons.map((json) => markUnresolvableLabelCalls(json, knownLabels));

addBaseHashtagCommands();
await Game.init();
await importJson(rewrittenJsons);

let tags = [];
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
const notices = [];

function recordNoticeIfAny() {
    const character = narration.dialogue?.character;
    if (character === NON_INK_LABEL_CALL_CHARACTER || character === NON_INK_LABEL_JUMP_CHARACTER) {
        const text = narration.dialogue?.text;
        notices.push({ kind: character === NON_INK_LABEL_CALL_CHARACTER ? "call" : "jump", label: Array.isArray(text) ? text.join("") : text });
    }
}

while (!isEnd && narration.canContinue && steps < MAX_STEPS) {
    await narration.continue({});
    steps++;
    recordNoticeIfAny();

    if (!isEnd && !narration.canContinue && narration.isRequiredInput) {
        if (inputAnswer === undefined) break;
        narration.inputValue = inputAnswer;
        continue;
    }

    if (!isEnd && !narration.canContinue && narration.choices?.length) {
        await narration.selectChoice(narration.choices[0], {});
        steps++;
        recordNoticeIfAny();
    }
}

const text = narration.dialogue?.text;
console.log(
    JSON.stringify({
        compileErrors,
        visitedFiles: [...visited],
        steps,
        hitStepCap: steps >= MAX_STEPS,
        isEnd,
        canContinue: narration.canContinue,
        notices,
        lastText: Array.isArray(text) ? text.join("") : (text ?? null),
    }),
);
