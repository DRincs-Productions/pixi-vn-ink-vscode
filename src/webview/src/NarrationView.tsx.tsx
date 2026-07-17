import { Game, narration, RegisteredCharacters } from "@drincs/pixi-vn";
import { importJson, onInkHashtagScript } from "@drincs/pixi-vn-ink";
import { Story } from "inkjs/compiler/Compiler";
import { ErrorType } from "inkjs/engine/Error";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { type Locale, resolveLocale, t } from "./i18n";
import { vscode } from "./vscode";

type HistoryItem = {
    dialogue?: string | null;
    choices?: Choice[];
    inputRequest?: InputRequest;
    /** A bare `# pause` was hit right after this step — narration is blocked until the player clicks Continue. */
    pauseRequest?: boolean;
    tags: string[] | null;
    choice?: number;
    character?: string;
};

type Choice = {
    index: number;
    text: string;
};

type InputRequest = {
    type: "text" | "number";
    input?: string | number;
    /** The ink tag's `default ...` value, if any — pre-fills the editable field, but isn't itself a confirmed answer. */
    defaultValue?: string | number;
};

type RuntimeError = {
    message: string;
    line?: number;
};

// A dialogue step whose `character` is one of these ids isn't real narration — it's a notice the
// extension host injected (see `markUnresolvableLabelCalls` in src/utils/pixi-vn-utility.ts) for
// a `call`/`jump` to a label absent from every compiled project file (e.g. one only ever defined
// in the app's own TypeScript code). Rendered centered, localized, instead of as normal dialogue.
// Must stay in sync with the matching constants on the extension host (separate bundles, can't
// share a literal import).
const NON_INK_LABEL_CALL_CHARACTER = "__non_ink_label_call__";
const NON_INK_LABEL_JUMP_CHARACTER = "__non_ink_label_jump__";

function parseRuntimeErrorLine(message: string): number | undefined {
    const match = message.match(/line (\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
}

const NOTICE_MAX_LENGTH = 10;

/** Shortens text for the "(You chose: ...)" / "(You answered: ...)" notices. */
function truncateNoticeText(text: string): string {
    return text.length > NOTICE_MAX_LENGTH ? `${text.slice(0, NOTICE_MAX_LENGTH)}...` : text;
}

// inkjs reports runtime errors (out-of-bound divert, missing content, etc.) via
// `story.onError` instead of throwing, so callers must inspect the returned
// errors after each step rather than relying solely on try/catch.
function runInkAction<T>(story: Story, action: () => T): { result: T; error?: RuntimeError } {
    let error: RuntimeError | undefined;
    story.onError = (message, type) => {
        if (type === ErrorType.Error && !error) {
            error = { message, line: parseRuntimeErrorLine(message) };
        }
    };
    const result = action();
    return { result, error };
}

function nextChoices(
    story: Story,
    history: HistoryItem[] = [],
    oldChoices: number[] = [],
): HistoryItem[] {
    const list = [...oldChoices];
    while (story.canContinue || (!story.canContinue && list.length > 0)) {
        if (!story.canContinue && list.length > 0) {
            const choice = list.shift();
            if (history.length > 0) history[history.length - 1].choice = choice;
            story.ChooseChoiceIndex(choice!);
        }
        const text = story.Continue();
        const choices = story.currentChoices;
        const tags = story.currentTags;
        history.push({ dialogue: text, choices, tags });
    }
    return history;
}

function pushPixiHistory(history: HistoryItem[], tags: string[] | null) {
    const choices: Choice[] | undefined = narration.choices?.map((c) => ({
        index: c.choiceIndex,
        // pixi-vn's own glue handling (unlike raw inkjs) hands us each glued fragment as its own
        // array entry without folding adjacent whitespace back together, so a plain "" join can
        // run words together — " " keeps them apart, at the cost of an occasional doubled space
        // where a fragment already carried its own trailing/leading whitespace.
        text: Array.isArray(c.text) ? c.text.join(" ") : c.text,
    }));
    let text = narration.dialogue?.text;
    let character = narration.dialogue?.character;
    if (typeof character === "object" && character !== null) {
        character = character.id;
    }
    if (Array.isArray(text)) {
        text = text.join(" ");
    }
    // `narration.inputValue` may already hold the ink tag's `default ...` value the moment the
    // pause happens (before the player has typed or submitted anything) — that's surfaced as
    // `defaultValue` (to pre-fill the editable field), but left out of `input` so the "you
    // answered X" line doesn't render before the player actually has. `input` is filled in once
    // the answer is truly confirmed: by `submitInput` for a live answer, or by the replay branch
    // below when replaying an already-answered input from history.
    const inputRequest = narration.isRequiredInput
        ? {
              type: narration.inputType as "text" | "number",
              defaultValue: narration.inputValue as string | number | undefined,
          }
        : undefined;
    history.push({ dialogue: text, choices, tags, inputRequest, character });
}
async function nextChoicesPixi(
    start: () => Promise<any>,
    history: HistoryItem[] = [],
    oldChoices: number[] = [],
    oldInputs: (string | number)[] = [],
    oldPauseCount = 0,
): Promise<HistoryItem[]> {
    const listChoices = [...oldChoices];
    const listInputs = [...oldInputs];
    // How many bare `# pause`s to sail straight through without stopping — the ones a previous
    // run already stopped at and the player already clicked Continue for (replayed via
    // `goBack`/reloading the preview), mirroring how `listChoices`/`listInputs` replay past
    // already-answered choices/inputs. Only a count is needed (not, say, their original relative
    // order against choices/inputs): which queue to consume from is always unambiguous from the
    // live narration state at the time (`isRequiredInput` for input, "this step raised `paused`"
    // for a pause), exactly like the existing choice-vs-input disambiguation below.
    let pausesToSkip = oldPauseCount;
    let isEnd = false;
    let paused = false;
    let tags: string[] = [];
    onInkHashtagScript((script) => {
        if (script.length === 0) return true;
        if (script.length === 1 && script[0] === "pause") {
            paused = true;
            // Still shown as an ordinary tag chip (right-aligned, alongside any other tags on
            // this step, same as every other tag below — no leading "#") — the centered
            // "narrative pause" notice + Continue button below are additional, not a replacement.
            tags.push(script.join(" "));
            return true;
        }
        if (script.length > 1) {
            switch (script[1]) {
                case "input":
                    // Shown as an ordinary tag chip like every other tag below (right-aligned,
                    // no leading "#") — `false` still lets the built-in "Request input" mapper
                    // run so the input prompt itself keeps working.
                    tags.push(script.join(" "));
                    return false;
            }
        }
        switch (script[0]) {
            case "continue":
                return false;
        }
        const tag: string = script.join(" ");
        tags.push(tag);
        return true;
    });
    Game.onEnd(() => {
        isEnd = true;
        history.pop();
    });

    // Pushes the step just completed and reports whether the loop should stop right here: a
    // fresh bare `# pause` (no arguments — `# pause all sounds`/`# pause video ...`/etc. are
    // unrelated sound/video commands, already handled generically as inert display tags above)
    // blocks narration until the player clicks Continue, unless it's one already resolved in an
    // earlier run (see `pausesToSkip` above).
    const recordStep = (): boolean => {
        pushPixiHistory(history, tags.length > 0 ? tags : null);
        const wasPaused = paused;
        paused = false;
        if (!wasPaused) return false;
        // A bare `# pause` produces no dialogue of its own — `narration.dialogue` was just left
        // holding whatever the previous real dialogue line set, so `pushPixiHistory` above would
        // otherwise re-display that stale text alongside the pause tag/notice.
        history[history.length - 1].dialogue = undefined;
        if (pausesToSkip > 0) {
            pausesToSkip--;
            return false;
        }
        history[history.length - 1].pauseRequest = true;
        return true;
    };

    await start();
    let stopped = recordStep();
    while (
        !stopped &&
        !isEnd &&
        (narration.canContinue ||
            (!narration.canContinue && (listChoices.length > 0 || listInputs.length > 0)))
    ) {
        tags = [];
        if (!narration.canContinue && (listChoices.length > 0 || listInputs.length > 0)) {
            if (narration.isRequiredInput) {
                const input = listInputs.shift();
                narration.inputValue = input;
                history[history.length - 1].inputRequest = {
                    type: narration.inputType as "text" | "number",
                    input: input,
                };
                await narration.continue({});
            } else {
                const choiceIndex = listChoices.shift();
                const choice = narration.choices?.find((c) => c.choiceIndex === choiceIndex);
                history[history.length - 1].choice = choiceIndex;
                await narration.selectChoice(choice!, {});
            }
            stopped = recordStep();
            if (stopped) break;
        }
        tags = [];
        await narration.continue({});
        stopped = recordStep();
    }
    return history;
}

function Text({ children, markup }: { children: string; markup: "Markdown" | null }) {
    if (markup === "Markdown") {
        return (
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {children}
            </ReactMarkdown>
        );
    }
    return <>{children}</>;
}

export default function NarrationView() {
    const [engine, setEngine] = useState<"Inky" | "pixi-vn">();
    const [log, setLog] = useState<{ text: string; data?: any }>();
    const [story, setStory] = useState<Story>();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [error, setError] = useState<RuntimeError>();
    const [inputValue, setInputValue] = useState<string | number>();
    const [oldChoices, setOldChoices] = useState<
        (number | { type: "input"; value: string | number } | { type: "pause" })[]
    >([]);
    const currentState = history.length > 0 ? history[history.length - 1] : undefined;
    const { choices, inputRequest, pauseRequest } = currentState || {};
    const [markup, setMarkup] = useState<"Markdown" | null>(null); // Stato centralizzato del markup
    const [locale, setLocale] = useState<Locale>("en");
    const scrollRef = useRef<HTMLDivElement>(null);
    // `Game`/`narration` are pixi-vn singletons, so two overlapping "compiled-story" loads (e.g.
    // React StrictMode's dev-only double effect invocation, or a stray extra "ready"/save event)
    // must never run their `Game.clear()` + `importJson()` + `nextChoicesPixi()` concurrently —
    // that corrupts the shared engine state mid-run. `loadChainRef` serializes them one at a
    // time; `loadTokenRef` lets a superseded run discard its result instead of overwriting a
    // newer one that already finished.
    const loadChainRef = useRef<Promise<void>>(Promise.resolve());
    const loadTokenRef = useRef(0);

    // The extension host can't see the exact runtime error line: the compiled JSON
    // handed to this webview has no DebugMetadata (inkjs strips it on serialization), so
    // `story.onError` here never carries a line number. It replays the same choice path
    // against an in-memory (non-JSON) compile of the source, which does keep line info.
    const reportRuntimeError = useCallback(
        (runtimeError?: RuntimeError, choicePath: number[] = []) => {
            setError(runtimeError);
            vscode.postMessage({
                type: "runtime-error-line",
                hasError: !!runtimeError,
                choices: choicePath,
            });
        },
        [],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls to bottom whenever history changes
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.scrollTo({
                top: el.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [history]);

    // Clears any leftover typed value from a previous input request whenever a new one appears,
    // so the new request's own default (rendered as a fallback below) shows instead of stale text.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs only when inputRequest changes, not on every render
    useEffect(() => {
        setInputValue(undefined);
    }, [inputRequest]);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data.type === "set-markup") {
                setMarkup(event.data.data);
            }
            if (event.data.type === "set-locale") {
                setLocale(resolveLocale(event.data.data));
            }
        };
        window.addEventListener("message", handler);
        vscode.postMessage({ type: "ready" });
        return () => window.removeEventListener("message", handler);
    }, []);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data.type !== "compiled-story") return;

            const myToken = ++loadTokenRef.current;
            const isStale = () => myToken !== loadTokenRef.current;

            // Chained onto the previous run (not just awaited) so two overlapping
            // "compiled-story" messages still touch the shared pixi-vn `Game`/`narration`
            // singleton one at a time, never concurrently.
            loadChainRef.current = loadChainRef.current
                .then(async () => {
                    const storyJson = event.data.data;
                    const engine: "Inky" | "pixi-vn" = event.data.engine;
                    const characters: any[] | undefined = event.data.characters
                        ? JSON.parse(event.data.characters)
                        : undefined;
                    if (isStale()) return;
                    setEngine(engine);
                    reportRuntimeError(undefined);
                    switch (engine) {
                        case "pixi-vn": {
                            try {
                                Game.clear();
                                // The two sentinel ids alongside the real characters so pixi-vn
                                // doesn't log a "character not found" warning when a synthetic
                                // "non-ink label" notice (see NON_INK_LABEL_*_CHARACTER above)
                                // sets one of them as its dialogue's character.
                                RegisteredCharacters.add([
                                    ...(characters || []),
                                    NON_INK_LABEL_CALL_CHARACTER,
                                    NON_INK_LABEL_JUMP_CHARACTER,
                                ]);
                                // storyJson is a JSON string of an array of already-mapped
                                // PixiVNJson — one per compiled project file, the previewed file
                                // plus every other project file it transitively references
                                // (compilePixiVNProject runs the ink → PixiVNJson conversion,
                                // including character-dialogue splitting, on the extension host
                                // via @drincs/pixi-vn-ink/converter) — importJson accepts an
                                // array directly, so this just parses it.
                                await importJson(JSON.parse(storyJson));
                                const tempChoices = oldChoices
                                    .map((c) => (typeof c === "number" ? c : undefined))
                                    .filter((c): c is number => c !== undefined);
                                const tempInputs = oldChoices
                                    .map((c) =>
                                        typeof c === "object" && c.type === "input"
                                            ? c.value
                                            : undefined,
                                    )
                                    .filter((c): c is string | number => c !== undefined);
                                const tempPauseCount = oldChoices.filter(
                                    (c) => typeof c === "object" && c.type === "pause",
                                ).length;
                                const history: HistoryItem[] = await nextChoicesPixi(
                                    () => narration.call("__pixi_vn_start__", {}),
                                    [],
                                    tempChoices,
                                    tempInputs,
                                    tempPauseCount,
                                );
                                if (isStale()) return;
                                setHistory(history);
                                setLog({ text: "Pixi-VN story loaded" });
                            } catch (e) {
                                if (isStale()) return;
                                const message = (e as any).toString();
                                setLog({ text: "Error loading Pixi-VN story", data: message });
                                reportRuntimeError({ message });
                            }
                            break;
                        }
                        default: {
                            const tempChoices = oldChoices
                                .map((c) => (typeof c === "number" ? c : undefined))
                                .filter((c): c is number => c !== undefined);
                            try {
                                const story = new Story(storyJson);
                                if (isStale()) return;
                                setStory(story);
                                const { result: history, error: runtimeError } = runInkAction(
                                    story,
                                    () => nextChoices(story, [], tempChoices),
                                );
                                setHistory(history);
                                reportRuntimeError(runtimeError, tempChoices);
                            } catch (e) {
                                if (isStale()) return;
                                const message = (e as any).toString();
                                setLog({ text: "Error running Ink story", data: message });
                                reportRuntimeError(
                                    { message, line: parseRuntimeErrorLine(message) },
                                    tempChoices,
                                );
                            }
                            break;
                        }
                    }
                })
                .catch((e) => {
                    // A rejection here would otherwise permanently wedge `loadChainRef` — every
                    // future "compiled-story" message chains off of it and a `.then()` callback
                    // never runs once its predecessor has rejected.
                    console.error("Failed to handle compiled-story message", e);
                });
        };
        // No `vscode.postMessage({ type: "ready" })` here: the effect above already sends it
        // once on mount. This effect re-runs on every `oldChoices` change (i.e. after every
        // choice/input the player makes) only to keep the listener's closure fresh — sending
        // "ready" again here would make the extension host re-post "compiled-story" after every
        // single interaction, racing this handler's own `Game.clear()` + `importJson()` +
        // `nextChoicesPixi()` against whichever of `makeChoice`/`submitInput` triggered the
        // re-run, corrupting the shared pixi-vn `narration`/`Game` singleton state — this is
        // what caused the preview to intermittently stop partway through a story.
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [oldChoices, reportRuntimeError]);

    useEffect(() => {
        vscode.postMessage({ type: "log", message: log?.text, data: log?.data });
    }, [log]);

    const makeChoice = async (choice: Choice) => {
        switch (engine) {
            case "pixi-vn": {
                let newHistory = [...history];
                const pixiChoice = narration.choices?.find((c) => c.choiceIndex === choice.index);
                if (!pixiChoice) return;
                if (newHistory.length > 0) {
                    newHistory[newHistory.length - 1].choice = choice.index;
                }
                setOldChoices((oldChoices) => [...oldChoices, choice.index]);
                newHistory = await nextChoicesPixi(
                    () => narration.selectChoice(pixiChoice, {}),
                    newHistory,
                );
                setHistory(newHistory);
                break;
            }
            default: {
                if (!story) return;
                const choicePath = [
                    ...oldChoices.filter((c): c is number => typeof c === "number"),
                    choice.index,
                ];
                try {
                    const newHistory = [...history];
                    if (newHistory.length > 0) {
                        newHistory[newHistory.length - 1].choice = choice.index;
                    }
                    story.ChooseChoiceIndex(choice.index);
                    setOldChoices((oldChoices) => [...oldChoices, choice.index]);
                    const { result, error: runtimeError } = runInkAction(story, () =>
                        nextChoices(story, newHistory),
                    );
                    setHistory(result);
                    reportRuntimeError(runtimeError, choicePath);
                } catch (e) {
                    const message = (e as any).toString();
                    reportRuntimeError(
                        { message, line: parseRuntimeErrorLine(message) },
                        choicePath,
                    );
                }
            }
        }
    };

    const submitInput = async (value: string | number = "") => {
        switch (engine) {
            case "pixi-vn": {
                let newHistory = [...history];
                const lastItem = newHistory[newHistory.length - 1];
                if (lastItem?.inputRequest) {
                    newHistory[newHistory.length - 1] = {
                        ...lastItem,
                        inputRequest: { type: lastItem.inputRequest.type, input: value },
                    };
                }
                narration.inputValue = value;
                setOldChoices((values) => [...values, { type: "input", value: value }]);
                newHistory = await nextChoicesPixi(() => narration.continue({}), newHistory);
                setHistory(newHistory);
                break;
            }
        }
    };

    const resumeFromPause = async () => {
        switch (engine) {
            case "pixi-vn": {
                setOldChoices((values) => [...values, { type: "pause" }]);
                const newHistory = await nextChoicesPixi(
                    () => narration.continue({}),
                    [...history],
                );
                setHistory(newHistory);
                break;
            }
        }
    };

    const goBack = async () => {
        switch (engine) {
            case "pixi-vn": {
                Game.clear();
                oldChoices.pop();
                const tempChoices = oldChoices
                    .map((c) => (typeof c === "number" ? c : undefined))
                    .filter((c): c is number => c !== undefined);
                const tempInputs = oldChoices
                    .map((c) => (typeof c === "object" && c.type === "input" ? c.value : undefined))
                    .filter((c): c is string | number => c !== undefined);
                const tempPauseCount = oldChoices.filter(
                    (c) => typeof c === "object" && c.type === "pause",
                ).length;
                const newHistory = await nextChoicesPixi(
                    () => narration.call("__pixi_vn_start__", {}),
                    [],
                    tempChoices,
                    tempInputs,
                    tempPauseCount,
                );
                setHistory(newHistory);
                break;
            }
            default: {
                if (!story || history.length === 0) return;

                oldChoices.pop();
                const tempChoices = oldChoices
                    .map((c) => (typeof c === "number" ? c : undefined))
                    .filter((c): c is number => c !== undefined);
                try {
                    story.ResetState();
                    const { result: newHistory, error: runtimeError } = runInkAction(story, () =>
                        nextChoices(story, [], tempChoices),
                    );
                    setHistory(newHistory);
                    reportRuntimeError(runtimeError, tempChoices);
                } catch (e) {
                    const message = (e as any).toString();
                    reportRuntimeError(
                        { message, line: parseRuntimeErrorLine(message) },
                        tempChoices,
                    );
                }
            }
        }
    };

    const restart = async () => {
        switch (engine) {
            case "pixi-vn": {
                Game.clear();
                const newHistory = await nextChoicesPixi(
                    () => narration.call("__pixi_vn_start__", {}),
                    [],
                );
                setHistory(newHistory);
                setOldChoices([]);
                break;
            }
            default: {
                if (!story) return;
                try {
                    story.ResetState();
                    const { result: newHistory, error: runtimeError } = runInkAction(story, () =>
                        nextChoices(story),
                    );
                    setHistory(newHistory);
                    setOldChoices([]);
                    reportRuntimeError(runtimeError, []);
                } catch (e) {
                    const message = (e as any).toString();
                    reportRuntimeError({ message, line: parseRuntimeErrorLine(message) }, []);
                }
            }
        }
    };

    return (
        <div
            className="flex flex-col h-full p-4 font-sans"
            style={{
                backgroundColor: "var(--vscode-editor-background)",
                color: "var(--vscode-editor-foreground)",
            }}
        >
            {/* Top bar */}
            <div className="flex justify-end gap-2 mb-4">
                <Button
                    className="my-vscode-button"
                    onClick={goBack}
                    disabled={oldChoices.length === 0}
                    variant="secondary"
                    size="sm"
                    style={{
                        padding: "2px 6px",
                        height: "28px",
                        fontSize: "0.75rem",
                    }}
                >
                    <ArrowLeft size={14} className="mr-1" /> {t(locale, "back")}
                </Button>
                <Button
                    className="my-vscode-button"
                    onClick={restart}
                    variant="destructive"
                    size="sm"
                    style={{
                        padding: "2px 6px",
                        height: "28px",
                        fontSize: "0.75rem",
                    }}
                >
                    <RotateCcw size={14} className="mr-1" /> {t(locale, "restart")}
                </Button>
            </div>

            {/* Dialogues */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto space-y-3 mb-4 p-3 rounded-md border flex flex-col"
                style={{
                    backgroundColor: "var(--vscode-editor-background)",
                    borderColor: "var(--vscode-editorWidget-border)",
                }}
            >
                {history.length === 0 ? (
                    error ? (
                        // Error (nothing rendered yet, e.g. failure on initial load)
                        <div
                            className="flex flex-col justify-center items-center w-full h-full text-center gap-2"
                            style={{
                                color: "var(--vscode-errorForeground)",
                            }}
                        >
                            <div style={{ fontWeight: "bold" }}>
                                {t(locale, "errorRunningStory")}
                            </div>
                            {error.line !== undefined && (
                                <div>{t(locale, "lineNumber", error.line)}</div>
                            )}
                            <div style={{ fontStyle: "italic" }}>{error.message}</div>
                        </div>
                    ) : (
                        // Loader
                        <div
                            className="flex justify-center items-center w-full h-full"
                            style={{
                                color: "var(--vscode-editorHint-foreground)",
                                fontStyle: "italic",
                            }}
                        >
                            {t(locale, "loadingStory")}
                        </div>
                    )
                ) : (
                    <>
                        {history.map((item, idx) => (
                            <div
                                key={`block-${idx}-${item.dialogue}-${item.tags?.join("-")}`}
                                className="animate-in fade-in slide-in-from-bottom duration-500"
                            >
                                {item.tags?.map((tag, tIdx) => (
                                    <div
                                        key={`tag-${idx}-${tIdx}`}
                                        style={{
                                            color: "var(--vscode-editorHint-foreground)",
                                            textAlign: "right",
                                            fontStyle: "italic",
                                            fontSize: "0.8em",
                                            opacity: 0.7,
                                        }}
                                    >
                                        {tag}
                                    </div>
                                ))}

                                {item.dialogue?.trim() &&
                                    (item.character === NON_INK_LABEL_CALL_CHARACTER ||
                                    item.character === NON_INK_LABEL_JUMP_CHARACTER ? (
                                        <div
                                            key={`dialogue-${idx}`}
                                            style={{
                                                color: "var(--vscode-editorHint-foreground)",
                                                textAlign: "center",
                                                fontStyle: "italic",
                                            }}
                                        >
                                            {t(
                                                locale,
                                                item.character === NON_INK_LABEL_CALL_CHARACTER
                                                    ? "nonInkLabelCall"
                                                    : "nonInkLabelJump",
                                                item.dialogue,
                                            )}
                                        </div>
                                    ) : (
                                        <div
                                            key={`dialogue-${idx}`}
                                            style={{
                                                color: "var(--vscode-editor-foreground)",
                                                textAlign: "left",
                                                fontStyle: "normal",
                                                display: "flex",
                                                flexDirection: "row", // affianca chip e testo
                                                gap: "8px",
                                                alignItems: "flex-start",
                                            }}
                                        >
                                            {/* Character chip */}
                                            {item.character && (
                                                <span
                                                    style={{
                                                        display: "inline-block",
                                                        backgroundColor:
                                                            "var(--vscode-button-background)",
                                                        color: "var(--vscode-button-foreground)",
                                                        padding: "2px 6px",
                                                        borderRadius: "12px",
                                                        fontSize: "0.75rem",
                                                        fontWeight: "bold",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {item.character}
                                                </span>
                                            )}

                                            {/* Dialogue text */}
                                            <Text markup={markup}>{item.dialogue}</Text>
                                        </div>
                                    ))}

                                {item.inputRequest?.input !== undefined && (
                                    <div
                                        key={`input-answer-${idx}`}
                                        style={{
                                            color: "var(--vscode-editorHint-foreground)",
                                            textAlign: "center",
                                            fontStyle: "italic",
                                        }}
                                    >
                                        {t(
                                            locale,
                                            "youAnswered",
                                            truncateNoticeText(String(item.inputRequest.input)),
                                        )}
                                    </div>
                                )}

                                {item.pauseRequest && (
                                    <div
                                        key={`pause-${idx}`}
                                        style={{
                                            color: "var(--vscode-editorHint-foreground)",
                                            textAlign: "center",
                                            fontStyle: "italic",
                                        }}
                                    >
                                        {t(locale, "narrativePause")}
                                    </div>
                                )}

                                {item.choice !== undefined &&
                                    (() => {
                                        const chosenText = item.choices?.find(
                                            (c) => c.index === item.choice,
                                        )?.text;
                                        if (chosenText === undefined) return null;
                                        return (
                                            <div
                                                key={`choice-${idx}`}
                                                style={{
                                                    color: "var(--vscode-editorHint-foreground)",
                                                    textAlign: "center",
                                                    fontStyle: "italic",
                                                }}
                                            >
                                                {t(
                                                    locale,
                                                    "youChose",
                                                    truncateNoticeText(chosenText),
                                                )}
                                            </div>
                                        );
                                    })()}
                            </div>
                        ))}
                        {error && (
                            <div
                                className="text-center"
                                style={{
                                    color: "var(--vscode-errorForeground)",
                                }}
                            >
                                <div style={{ fontWeight: "bold" }}>
                                    {t(locale, "errorRunningStory")}
                                </div>
                                {error.line !== undefined && (
                                    <div>{t(locale, "lineNumber", error.line)}</div>
                                )}
                                <div style={{ fontStyle: "italic" }}>{error.message}</div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Pause (bare `# pause`): narration is blocked until the player clicks Continue */}
            {!inputRequest && !choices?.length && pauseRequest && (
                <div className="mt-3">
                    <Separator className="mb-2" />
                    <Button
                        className="my-vscode-button"
                        onClick={resumeFromPause}
                        variant="default"
                        style={{ width: "100%" }}
                    >
                        {t(locale, "continue")}
                    </Button>
                </div>
            )}

            {/* Choices */}
            {!inputRequest && choices && choices?.length > 0 && (
                <div className="mt-3">
                    <Separator className="mb-2" />
                    <div
                        className="font-semibold mb-2"
                        style={{ color: "var(--vscode-editor-foreground)" }}
                    >
                        {t(locale, "whatDoYouChoose")}
                    </div>
                    <div className="flex flex-col gap-2">
                        {choices.map((c, index) => (
                            <Button
                                className="my-vscode-button"
                                key={c.index}
                                variant="outline"
                                onClick={() => makeChoice(c)}
                                style={{
                                    justifyContent: "flex-start",
                                }}
                            >
                                {index + 1}. <Text markup={markup}>{c.text}</Text>
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input text */}
            {inputRequest &&
                (() => {
                    const effectiveInputValue = inputValue ?? inputRequest.defaultValue ?? "";
                    const canSubmit = String(effectiveInputValue).trim() !== "";
                    return (
                        <form
                            className="mt-3 flex gap-2"
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (canSubmit) submitInput(effectiveInputValue);
                            }}
                        >
                            <input
                                type={inputRequest.type}
                                value={effectiveInputValue}
                                onChange={(e) => {
                                    let value: string | number = e.target.value;
                                    if (inputRequest.type === "number") {
                                        value = Number(value);
                                    }
                                    setInputValue(value);
                                }}
                                className="flex-1 px-3 py-2 rounded-md border"
                                placeholder={
                                    inputRequest.type === "number"
                                        ? t(locale, "enterANumber")
                                        : t(locale, "typeYourResponse")
                                }
                                style={{
                                    backgroundColor: "var(--vscode-input-background)",
                                    color: "var(--vscode-input-foreground)",
                                    borderColor: "var(--vscode-input-border)",
                                }}
                            />
                            <Button
                                type="submit"
                                className="my-vscode-button"
                                disabled={!canSubmit}
                                variant="default"
                            >
                                {t(locale, "submit")}
                            </Button>
                        </form>
                    );
                })()}
        </div>
    );
}
