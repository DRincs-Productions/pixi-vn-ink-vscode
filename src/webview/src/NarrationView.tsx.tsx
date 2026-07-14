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
};

type RuntimeError = {
    message: string;
    line?: number;
};

function parseRuntimeErrorLine(message: string): number | undefined {
    const match = message.match(/line (\d+)/);
    return match ? parseInt(match[1], 10) : undefined;
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
        text: Array.isArray(c.text) ? c.text.join("") : c.text,
    }));
    let text = narration.dialogue?.text;
    let character = narration.dialogue?.character;
    if (typeof character === "object" && character !== null) {
        character = character.id;
    }
    if (Array.isArray(text)) {
        text = text.join("");
    }
    const inputRequest = narration.isRequiredInput
        ? {
              type: narration.inputType as "text" | "number",
              input: narration.inputValue as string | number | undefined,
          }
        : undefined;
    history.push({ dialogue: text, choices, tags, inputRequest, character });
}
async function nextChoicesPixi(
    start: () => Promise<any>,
    history: HistoryItem[] = [],
    oldChoices: number[] = [],
    oldInputs: (string | number)[] = [],
): Promise<HistoryItem[]> {
    const listChoices = [...oldChoices];
    const listInputs = [...oldInputs];
    let isEnd = false;
    let tags: string[] = [];
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
        const tag: string = script.join(" ");
        tags.push(tag);
        return true;
    });
    Game.onEnd(() => {
        isEnd = true;
        history.pop();
    });
    await start();
    pushPixiHistory(history, tags.length > 0 ? tags : null);
    while (
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
                pushPixiHistory(history, tags.length > 0 ? tags : null);
            } else {
                const choiceIndex = listChoices.shift();
                const choice = narration.choices?.find((c) => c.choiceIndex === choiceIndex);
                history[history.length - 1].choice = choiceIndex;
                await narration.selectChoice(choice!, {});
                pushPixiHistory(history, tags.length > 0 ? tags : null);
            }
        }
        tags = [];
        await narration.continue({});
        pushPixiHistory(history, tags.length > 0 ? tags : null);
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
        (number | { type: "input"; value: string | number })[]
    >([]);
    const currentState = history.length > 0 ? history[history.length - 1] : undefined;
    const { choices, inputRequest } = currentState || {};
    const [markup, setMarkup] = useState<"Markdown" | null>(null); // Stato centralizzato del markup
    const [locale, setLocale] = useState<Locale>("en");
    const scrollRef = useRef<HTMLDivElement>(null);

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
        const handler = async (event: MessageEvent) => {
            if (event.data.type === "compiled-story") {
                const storyJson = event.data.data;
                const engine: "Inky" | "pixi-vn" = event.data.engine;
                const characters: any[] | undefined = event.data.characters
                    ? JSON.parse(event.data.characters)
                    : undefined;
                setEngine(engine);
                reportRuntimeError(undefined);
                switch (engine) {
                    case "pixi-vn": {
                        try {
                            Game.clear();
                            RegisteredCharacters.add(characters || []);
                            // storyJson is a JSON string of an already-mapped PixiVNJson
                            // (compilePixiVN runs the ink → PixiVNJson conversion, including
                            // character-dialogue splitting, on the extension host via
                            // @drincs/pixi-vn-ink/converter) — just parse it.
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
                            const history: HistoryItem[] = await nextChoicesPixi(
                                () => narration.call("__pixi_vn_start__", {}),
                                [],
                                tempChoices,
                                tempInputs,
                            );
                            setHistory(history);
                            setLog({ text: "Pixi-VN story loaded" });
                        } catch (e) {
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
                            setStory(story);
                            const { result: history, error: runtimeError } = runInkAction(
                                story,
                                () => nextChoices(story, [], tempChoices),
                            );
                            setHistory(history);
                            reportRuntimeError(runtimeError, tempChoices);
                        } catch (e) {
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
            }
        };
        window.addEventListener("message", handler);
        vscode.postMessage({ type: "ready" });
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
                narration.inputValue = value;
                setOldChoices((values) => [...values, { type: "input", value: value }]);
                newHistory = await nextChoicesPixi(() => narration.continue({}), newHistory);
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
                const newHistory = await nextChoicesPixi(
                    () => narration.call("__pixi_vn_start__", {}),
                    [],
                    tempChoices,
                    tempInputs,
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

                                {item.dialogue?.trim() && (
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
                                )}

                                {item.inputRequest?.input !== undefined && (
                                    <div
                                        key={`input-${idx}`}
                                        style={{
                                            color: "var(--vscode-editor-foreground)",
                                            textAlign: "left",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        {t(locale, "you")}: {item.inputRequest.input}
                                    </div>
                                )}
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
            {inputRequest && (
                <div className="mt-3 flex gap-2">
                    <input
                        type={inputRequest.type}
                        value={inputValue ?? ""}
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
                        className="my-vscode-button"
                        onClick={() => submitInput(inputValue)}
                        variant="default"
                    >
                        {t(locale, "submit")}
                    </Button>
                </div>
            )}
        </div>
    );
}
