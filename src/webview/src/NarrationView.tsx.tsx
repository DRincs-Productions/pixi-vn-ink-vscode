import { ArrowLeft, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "./components/ui/button";
import { Separator } from "./components/ui/separator";

type Dialogue = {
    id: number;
    type: "line" | "choice";
    text: string;
};

type Choice = {
    id: number;
    text: string;
};

const mockStory: { lines: string[]; choices: Choice[] } = {
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

    const addLine = (text: string) => {
        setDialogues((prev) => [...prev, { id: ++dialogueCounter, type: "line", text }]);
    };

    const makeChoice = (choice: Choice) => {
        setHistory((prev) => [...prev, { dialogues: [...dialogues], choices: [...choices] }]);
        setDialogues((prev) => [...prev, { id: ++dialogueCounter, type: "choice", text: choice.text }]);
        setChoices([]);
        addLine("And so the story continued...");
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
            className='flex flex-col h-screen p-4 font-sans'
            style={{
                backgroundColor: "var(--vscode-editor-background)",
                color: "var(--vscode-editor-foreground)",
            }}
        >
            {/* Top bar: pulsanti Back / Restart */}
            <div className='flex justify-end gap-2 mb-4'>
                <Button
                    onClick={goBack}
                    disabled={history.length === 0}
                    variant='secondary'
                    style={{
                        backgroundColor: "var(--vscode-button-background)",
                        color: "var(--vscode-button-foreground)",
                        borderColor: "var(--vscode-button-border)",
                    }}
                >
                    <ArrowLeft size={16} className='mr-1' /> Back
                </Button>
                <Button
                    onClick={restart}
                    variant='destructive'
                    style={{
                        backgroundColor: "var(--vscode-button-background)",
                        color: "var(--vscode-button-foreground)",
                        borderColor: "var(--vscode-button-border)",
                    }}
                >
                    <RotateCcw size={16} className='mr-1' /> Restart
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
                {dialogues.map((d) => (
                    <div
                        key={d.id}
                        style={{
                            color:
                                d.type === "choice"
                                    ? "var(--vscode-editor-foreground)" // usa il foreground normale
                                    : "var(--vscode-editor-foreground)",
                            fontWeight: d.type === "choice" ? 600 : 400,
                            backgroundColor:
                                d.type === "choice"
                                    ? "var(--vscode-editor-hoverHighlightBackground)" // evidenziato
                                    : "transparent",
                            padding: d.type === "choice" ? "2px 4px" : "0",
                            borderRadius: d.type === "choice" ? "4px" : "0",
                        }}
                    >
                        {d.text}
                    </div>
                ))}
            </div>

            {/* Choices */}
            {choices.length > 0 && (
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
        </div>
    );
}
