import { Game, narration, RegisteredCharacters } from "@drincs/pixi-vn";
import { convertInkStoryToJson, importJson, onInkHashtagScript } from "@drincs/pixi-vn-ink";
import { Story } from "inkjs/compiler/Compiler";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
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
    input: string | number;
};

function nextChoices(story: Story, history: HistoryItem[] = [], oldChoices: number[] = []): HistoryItem[] {
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

function pushPixiHystory(history: HistoryItem[], tags: string[] | null) {
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
    history.push({ dialogue: text, choices, tags, character });
}
async function nextChoicesPixi(
    start: () => Promise<any>,
    history: HistoryItem[] = [],
    oldChoices: number[] = [],
    oldInputs: (string | number)[] = []
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
    pushPixiHystory(history, tags.length > 0 ? tags : null);
    while (
        !isEnd &&
        (narration.canContinue || (!narration.canContinue && (listChoices.length > 0 || listInputs.length > 0)))
    ) {
        tags = [];
        if (!narration.canContinue && (listChoices.length > 0 || listInputs.length > 0)) {
            if (narration.isRequiredInput) {
                const input = listInputs.shift();
                narration.inputValue = input;
                await narration.continue({});
                pushPixiHystory(history, tags.length > 0 ? tags : null);
            } else {
                const choiceIndex = listChoices.shift();
                const choice = narration.choices?.find((c) => c.choiceIndex === choiceIndex);
                await narration.selectChoice(choice!, {});
                pushPixiHystory(history, tags.length > 0 ? tags : null);
            }
        }
        tags = [];
        await narration.continue({});
        pushPixiHystory(history, tags.length > 0 ? tags : null);
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
    const [inputValue, setInputValue] = useState<string | number>();
    const [oldChoices, setOldChoices] = useState<(number | { type: "input"; value: string | number })[]>([]);
    const currentState = history.length > 0 ? history[history.length - 1] : undefined;
    const { choices, inputRequest } = currentState || {};
    const [markup, setMarkup] = useState<"Markdown" | null>(null); // Stato centralizzato del markup
    const scrollRef = useRef<HTMLDivElement>(null);

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
                switch (engine) {
                    case "pixi-vn": {
                        try {
                            Game.clear();
                            RegisteredCharacters.add(characters || []);
                            const json = convertInkStoryToJson(storyJson);
                            await importJson(json!);
                            const tempChoices = oldChoices
                                .map((c) => (typeof c === "number" ? c : undefined))
                                .filter((c): c is number => c !== undefined);
                            const tempInputs = oldChoices
                                .map((c) => (typeof c === "object" && c.type === "input" ? c.value : undefined))
                                .filter((c): c is string | number => c !== undefined);
                            const history: HistoryItem[] = await nextChoicesPixi(
                                () => narration.call("__pixi_vn_start__", {}),
                                [],
                                tempChoices,
                                tempInputs
                            );
                            setHistory(history);
                            setLog({ text: "Pixi-VN story loaded" });
                        } catch (e) {
                            setLog({ text: "Error loading Pixi-VN story", data: (e as any).toString() });
                        }
                        break;
                    }
                    case "Inky":
                    default: {
                        const story = new Story(storyJson);
                        setStory(story);
                        const tempChoices = oldChoices
                            .map((c) => (typeof c === "number" ? c : undefined))
                            .filter((c): c is number => c !== undefined);
                        const history: HistoryItem[] = nextChoices(story, [], tempChoices);
                        setHistory(history);
                        break;
                    }
                }
            }
        };
        window.addEventListener("message", handler);
        vscode.postMessage({ type: "ready" });
        return () => window.removeEventListener("message", handler);
    }, [oldChoices]);

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
                newHistory = await nextChoicesPixi(() => narration.selectChoice(pixiChoice, {}), newHistory);
                setHistory(newHistory);
                break;
            }
            case "Inky":
            default: {
                if (!story) return;
                let newHistory = [...history];
                story.ChooseChoiceIndex(choice.index);
                setOldChoices((oldChoices) => [...oldChoices, choice.index]);
                newHistory = nextChoices(story, newHistory);
                setHistory(newHistory);
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
                    tempInputs
                );
                setHistory(newHistory);
                break;
            }
            case "Inky":
            default: {
                if (!story || history.length === 0) return;

                story.ResetState();
                oldChoices.pop();
                const tempChoices = oldChoices
                    .map((c) => (typeof c === "number" ? c : undefined))
                    .filter((c): c is number => c !== undefined);
                const newHistory = nextChoices(story, [], tempChoices);

                setHistory(newHistory);
            }
        }
    };

    const restart = async () => {
        switch (engine) {
            case "pixi-vn": {
                Game.clear();
                const newHistory = await nextChoicesPixi(() => narration.call("__pixi_vn_start__", {}), []);
                setHistory(newHistory);
                setOldChoices([]);
                break;
            }
            case "Inky":
            default: {
                story?.ResetState();
                const newHistory = nextChoices(story!);
                setHistory(newHistory);
                setOldChoices([]);
            }
        }
    };

    return (
        <div
            className='flex flex-col h-full p-4 font-sans'
            style={{ backgroundColor: "var(--vscode-editor-background)", color: "var(--vscode-editor-foreground)" }}
        >
            {/* Top bar */}
            <div className='flex justify-end gap-2 mb-4'>
                <Button
                    className='my-vscode-button'
                    onClick={goBack}
                    disabled={oldChoices.length === 0}
                    variant='secondary'
                    size='sm'
                    style={{
                        padding: "2px 6px",
                        height: "28px",
                        fontSize: "0.75rem",
                    }}
                >
                    <ArrowLeft size={14} className='mr-1' /> Back
                </Button>
                <Button
                    className='my-vscode-button'
                    onClick={restart}
                    variant='destructive'
                    size='sm'
                    style={{
                        padding: "2px 6px",
                        height: "28px",
                        fontSize: "0.75rem",
                    }}
                >
                    <RotateCcw size={14} className='mr-1' /> Restart
                </Button>
            </div>

            {/* Dialogues */}
            <div
                ref={scrollRef}
                className='flex-1 overflow-y-auto space-y-3 mb-4 p-3 rounded-md border flex flex-col'
                style={{
                    backgroundColor: "var(--vscode-editor-background)",
                    borderColor: "var(--vscode-editorWidget-border)",
                }}
            >
                {history.length === 0 ? (
                    // Loader
                    <div
                        className='flex justify-center items-center w-full h-full'
                        style={{ color: "var(--vscode-editorHint-foreground)", fontStyle: "italic" }}
                    >
                        Loading story...
                    </div>
                ) : (
                    history.map((item, idx) => (
                        <div
                            key={`block-${idx}-${item.dialogue}-${item.tags?.join("-")}`}
                            className='motion-preset-slide-up motion-duration-500'
                        >
                            {item.tags?.map((tag, tIdx) => (
                                <div
                                    key={`tag-${idx}-${tIdx}`}
                                    style={{
                                        color: "var(--vscode-editorHint-foreground)",
                                        textAlign: "right",
                                        fontStyle: "italic",
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
                                                backgroundColor: "var(--vscode-button-background)",
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
                                    You: {item.inputRequest.input}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Choices */}
            {!inputRequest && choices && choices?.length > 0 && (
                <div className='mt-3'>
                    <Separator className='mb-2' />
                    <div className='font-semibold mb-2' style={{ color: "var(--vscode-editor-foreground)" }}>
                        What do you choose?
                    </div>
                    <div className='flex flex-col gap-2'>
                        {choices.map((c, index) => (
                            <Button
                                className='my-vscode-button'
                                key={c.index}
                                variant='outline'
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
                <div className='mt-3 flex gap-2'>
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
                        className='flex-1 px-3 py-2 rounded-md border'
                        placeholder={inputRequest.type === "number" ? "Enter a number..." : "Type your response..."}
                        style={{
                            backgroundColor: "var(--vscode-input-background)",
                            color: "var(--vscode-input-foreground)",
                            borderColor: "var(--vscode-input-border)",
                        }}
                    />
                    <Button className='my-vscode-button' onClick={() => submitInput(inputValue)} variant='default'>
                        Submit
                    </Button>
                </div>
            )}
        </div>
    );
}
