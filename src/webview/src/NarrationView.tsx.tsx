import { ArrowLeft, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";

type Dialogue = {
    id: number;
    type: "line" | "choice" | "input";
    text: string;
};

type Choice = {
    id: number;
    text: string;
};

const mockStory = {
    lines: ["Once upon a time...", "The hero stood at the crossroads."],
    choices: [
        { id: 1, text: "Take the left path" },
        { id: 2, text: "Take the right path" },
    ],
};

let dialogueCounter = 0;

export default function NarrationView() {
    const [dialogues, setDialogues] = useState<Dialogue[]>([]);
    const [choices, setChoices] = useState<Choice[]>(mockStory.choices);
    const [history, setHistory] = useState<{ dialogues: Dialogue[]; choices: Choice[] }[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [awaitingInput, setAwaitingInput] = useState(false);

    const addLine = (text: string, type: "line" | "choice" | "input" = "line") => {
        setDialogues((prev) => [...prev, { id: ++dialogueCounter, type, text }]);
    };

    const makeChoice = (choice: Choice) => {
        setHistory((prev) => [...prev, { dialogues: [...dialogues], choices: [...choices] }]);
        addLine(choice.text, "choice");
        setChoices([]);
        // Esempio: richiediamo input dopo la scelta
        setAwaitingInput(true);
    };

    const submitInput = () => {
        if (inputValue.trim() === "") return;
        addLine(inputValue, "input");
        setInputValue("");
        setAwaitingInput(false);
        addLine("And so the story continued...");
        setChoices(mockStory.choices);
    };

    const goBack = () => {
        const lastState = history.pop();
        if (lastState) {
            setDialogues(lastState.dialogues);
            setChoices(lastState.choices);
            setHistory([...history]);
        }
    };

    const restart = () => {
        setDialogues([]);
        setChoices(mockStory.choices);
        setHistory([]);
        dialogueCounter = 0;
        addLine("Once upon a time...");
    };

    return (
        <div
            className='flex flex-col h-full p-4 font-sans'
            style={{ backgroundColor: "var(--vscode-editor-background)", color: "var(--vscode-editor-foreground)" }}
        >
            {/* Top bar */}
            <div className='flex justify-end gap-2 mb-4'>
                <Button
                    onClick={goBack}
                    disabled={history.length === 0}
                    variant='secondary'
                    size='sm'
                    style={{
                        backgroundColor: "var(--vscode-button-background)",
                        color: "var(--vscode-button-foreground)",
                        borderColor: "var(--vscode-button-border)",
                        padding: "2px 6px",
                        height: "28px",
                        fontSize: "0.75rem",
                    }}
                >
                    <ArrowLeft size={14} className='mr-1' /> Back
                </Button>
                <Button
                    onClick={restart}
                    variant='destructive'
                    size='sm'
                    style={{
                        backgroundColor: "var(--vscode-button-background)",
                        color: "var(--vscode-button-foreground)",
                        borderColor: "var(--vscode-button-border)",
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
                {dialogues.map((d) => {
                    const isTag = d.text.startsWith("#");

                    return (
                        <div
                            key={d.id}
                            style={{
                                color: isTag
                                    ? "var(--vscode-editorHint-foreground)" // colore per tag/command
                                    : "var(--vscode-editor-foreground)",
                                fontWeight: d.type === "choice" || d.type === "input" ? 600 : 400,
                                backgroundColor:
                                    d.type === "choice" || d.type === "input"
                                        ? "var(--vscode-editor-hoverHighlightBackground)"
                                        : "transparent",
                                padding: d.type === "choice" || d.type === "input" ? "2px 4px" : "0",
                                borderRadius: d.type === "choice" || d.type === "input" ? "4px" : "0",
                                textAlign: isTag ? "right" : "left",
                                fontStyle: isTag ? "italic" : "normal",
                            }}
                        >
                            {d.text}
                        </div>
                    );
                })}
            </div>

            {/* Choices */}
            {!awaitingInput && choices.length > 0 && (
                <div className='mt-3'>
                    <Separator className='mb-2' />
                    <div className='font-semibold mb-2' style={{ color: "var(--vscode-editor-foreground)" }}>
                        What do you choose?
                    </div>
                    <div className='flex flex-col gap-2'>
                        {choices.map((c, index) => (
                            <Button
                                key={c.id}
                                variant='outline'
                                onClick={() => makeChoice(c)}
                                style={{
                                    color: "var(--vscode-button-foreground)",
                                    borderColor: "var(--vscode-button-border)",
                                    backgroundColor: "var(--vscode-button-background)",
                                    justifyContent: "flex-start",
                                }}
                            >
                                {index + 1}. {c.text}
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
                    <Button
                        onClick={submitInput}
                        variant='default'
                        style={{
                            backgroundColor: "var(--vscode-button-background)",
                            color: "var(--vscode-button-foreground)",
                            borderColor: "var(--vscode-button-border)",
                        }}
                    >
                        Submit
                    </Button>
                </div>
            )}
        </div>
    );
}
