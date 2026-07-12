import { Compiler } from "inkjs/compiler/Compiler";
import type { IFileHandler } from "inkjs/compiler/IFileHandler";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";

export function getErrors(text: string, fileHandler: Partial<IFileHandler> = {}) {
    const issues: { message: string; type: ErrorType; line: number }[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                console.log("ErrorHandler called with message:", message, "and type:", type);
                const cleanedMsg = message.replace(/^[A-Z]+: line \d+: ?/, "");
                const lineMatch = message.match(/line (\d+)/);
                const path = message.match(/: '(.*\.ink)' line/);
                if (path?.[1]) {
                    return;
                }
                issues.push({ message: cleanedMsg, type, line: lineMatch ? parseInt(lineMatch[1], 10) : -1 });
            },
            countAllVisits: true,
            fileHandler: {
                LoadInkFileContents: (filename: string) => filename,
                ResolveInkFilename: (filename: string) => filename,
                ...fileHandler,
            },
            pluginNames: [],
            sourceFilename: null,
        });
        compiler.Compile();
        return issues;
    } catch (_e) {
        return issues;
    }
}

// Runtime errors reported while the compiled story runs (e.g. "ran out of content")
// aren't present in the compiled JSON handed to the preview webview: inkjs strips all
// DebugMetadata during JSON serialization, so `story.onError` there never carries a line
// number. To recover one, recompile in-memory (Compiler.Compile() keeps DebugMetadata,
// unlike Compiler.Compile().ToJson()) and replay the same choice path the user took.
export function getRuntimeError(
    text: string,
    choiceIndices: number[],
    fileHandler: Partial<IFileHandler> = {},
): { message: string; line?: number } | undefined {
    let error: { message: string; line?: number } | undefined;
    try {
        const compiler = new Compiler(text, {
            countAllVisits: true,
            fileHandler: {
                LoadInkFileContents: (filename: string) => filename,
                ResolveInkFilename: (filename: string) => filename,
                ...fileHandler,
            },
            pluginNames: [],
            sourceFilename: null,
        });
        const story = compiler.Compile();
        story.onError = (message: string, type: ErrorType) => {
            if (type === ErrorType.Error && !error) {
                const lineMatch = message.match(/line (\d+)/);
                error = { message, line: lineMatch ? parseInt(lineMatch[1], 10) : undefined };
            }
        };
        const remainingChoices = [...choiceIndices];
        while (story.canContinue || (!story.canContinue && remainingChoices.length > 0)) {
            if (!story.canContinue && remainingChoices.length > 0) {
                story.ChooseChoiceIndex(remainingChoices.shift()!);
            }
            story.Continue();
        }
    } catch (_e) {
        // The user's live choice path can't be replayed deterministically (e.g. it
        // depends on RANDOM()) or the story diverged; just skip the line lookup.
    }
    return error;
}

export function compile(text: string, fileHandler: Partial<IFileHandler> = {}) {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                if (type === ErrorType.Error) {
                    errors.push(message);
                } else {
                    warnings.push(message);
                }
            },
            countAllVisits: true,
            fileHandler: {
                LoadInkFileContents: (filename: string) => filename,
                ResolveInkFilename: (filename: string) => filename,
                ...fileHandler,
            },
            pluginNames: [],
            sourceFilename: null,
        });
        const json = compiler.Compile();
        return json;
    } catch (e) {
        if (errors.length > 0) {
            throw new Error(errors[0]);
        }
        throw e;
    }
}
