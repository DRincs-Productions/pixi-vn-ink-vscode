import { Compiler } from "inkjs/compiler/Compiler";
import { IFileHandler } from "inkjs/compiler/IFileHandler";
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
                if (path && path[1]) {
                    return;
                }
                issues.push({ message: cleanedMsg, type, line: lineMatch ? parseInt(lineMatch[1]) : -1 });
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
    } catch (e) {
        return issues;
    }
}
