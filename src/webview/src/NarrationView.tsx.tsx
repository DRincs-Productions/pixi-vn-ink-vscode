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
        <div className='flex flex-col h-screen p-4 bg-white text-sm font-sans'>
            {/* Dialogues */}
            <div className='flex-1 overflow-y-auto space-y-3 mb-4 border p-3 rounded-md bg-gray-50'>
                {dialogues.map((d) => (
                    <div key={d.id} className={d.type === "choice" ? "text-indigo-600 font-semibold" : "text-gray-800"}>
                        {d.text}
                    </div>
                ))}
            </div>

            {/* Choices */}
            {choices.length > 0 && (
                <div className='mt-3'>
                    <Separator className='mb-2' />
                    <div className='font-semibold text-gray-700 mb-2'>What do you choose?</div>
                    <div className='flex flex-col gap-2'>
                        {choices.map((c, index) => (
                            <Button
                                key={c.id}
                                variant='outline'
                                onClick={() => makeChoice(c)}
                                className='justify-start text-indigo-700'
                            >
                                {index + 1}. {c.text}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className='flex gap-2 mt-4'>
                <Button onClick={goBack} disabled={history.length === 0} variant='secondary'>
                    <ArrowLeft size={16} className='mr-1' /> Back
                </Button>
                <Button onClick={restart} variant='destructive'>
                    <RotateCcw size={16} className='mr-1' /> Restart
                </Button>
            </div>
        </div>
    );
}
