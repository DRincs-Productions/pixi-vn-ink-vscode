import { Story } from "inkjs/compiler/Compiler";
import type { Choice } from "inkjs/engine/Choice";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";
import { vscode } from "./vscode";

type HistoryItem = {
    dialogue: string | null;
    choices?: Choice[];
    tags: string[] | null;
    choice?: number;
    input?: string;
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

export default function NarrationView() {
    const [story, setStory] = useState<Story>();
    const [markup, setMarkup] = useState<"Markdown">();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [inputValue, setInputValue] = useState<string>();
    const [awaitingInput, setAwaitingInput] = useState(false);
    const [oldChoices, setOldChoices] = useState<number[]>([]);
    const currentState = history.length > 0 ? history[history.length - 1] : undefined;
    const { choices } = currentState || {};

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data.type === "compiled-story") {
                const storyJson: string = event.data.data;
                const story = new Story(storyJson);
                setStory(story);
                const history: HistoryItem[] = nextChoices(story, [], oldChoices);
                setHistory(history);
                setAwaitingInput(false);
            }
            if (event.data.type === "set-markup") {
                setMarkup(event.data.markup);
            }
        };
        window.addEventListener("message", handler);
        vscode.postMessage({ type: "ready" });
        return () => window.removeEventListener("message", handler);
    }, [oldChoices]);

    const makeChoice = (choice: Choice) => {
        if (!story) return;
        let newHistory = [...history];
        story.ChooseChoiceIndex(choice.index);
        setOldChoices((oldChoices) => [...oldChoices, choice.index]);
        newHistory = nextChoices(story, newHistory);
        setHistory(newHistory);
    };

    const submitInput = () => {};

    const goBack = () => {
        if (!story || history.length === 0) return;

        story.ResetState();
        oldChoices.pop();
        const newHistory = nextChoices(story, [], oldChoices);

        setHistory(newHistory);
    };

    const restart = () => {
        story?.ResetState();
        const newHistory = nextChoices(story!);
        setHistory(newHistory);
        setAwaitingInput(false);
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
                    disabled={history.length === 0}
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
                className='flex-1 overflow-y-auto space-y-3 mb-4 p-3 rounded-md border'
                style={{
                    backgroundColor: "var(--vscode-editor-background)",
                    borderColor: "var(--vscode-editorWidget-border)",
                }}
            >
                {history.map((item, idx) => (
                    <div key={`block-${idx}`}>
                        {item.tags?.map((tag, tIdx) => (
                            <div
                                key={`tag-${idx}-${tIdx}`}
                                style={{
                                    color: "var(--vscode-editorHint-foreground)",
                                    textAlign: "right",
                                    fontStyle: "italic",
                                }}
                            >
                                {markup === "Markdown" ? <ReactMarkdown>{tag}</ReactMarkdown> : tag}
                            </div>
                        ))}

                        {item.dialogue?.trim() && (
                            <div
                                key={`dialogue-${idx}`}
                                style={{
                                    color: "var(--vscode-editor-foreground)",
                                    textAlign: "left",
                                    fontStyle: "normal",
                                }}
                            >
                                {markup === "Markdown" ? <ReactMarkdown>{item.dialogue}</ReactMarkdown> : item.dialogue}
                            </div>
                        )}

                        {item.input && (
                            <div
                                key={`input-${idx}`}
                                style={{
                                    color: "var(--vscode-editor-foreground)",
                                    textAlign: "left",
                                    fontWeight: "bold",
                                }}
                            >
                                You: {item.input}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Choices */}
            {!awaitingInput && choices && choices?.length > 0 && (
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
                                {index + 1}. {markup === "Markdown" ? <ReactMarkdown>{c.text}</ReactMarkdown> : c.text}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {/* Input text */}
            {awaitingInput && (
                <div className='mt-3 flex gap-2'>
                    <input
                        type='text'
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        className='flex-1 px-3 py-2 rounded-md border'
                        placeholder='Type your response...'
                        style={{
                            backgroundColor: "var(--vscode-input-background)",
                            color: "var(--vscode-input-foreground)",
                            borderColor: "var(--vscode-input-border)",
                        }}
                    />
                    <Button className='my-vscode-button' onClick={submitInput} variant='default'>
                        Submit
                    </Button>
                </div>
            )}
        </div>
    );
}
