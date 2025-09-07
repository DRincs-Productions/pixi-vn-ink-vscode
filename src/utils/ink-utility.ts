import { Compiler } from "inkjs/compiler/Compiler";
import { IFileHandler } from "inkjs/compiler/IFileHandler";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";

export function getErrors(text: string, fileHandler: IFileHandler | null = null) {
    const issues: { message: string; type: ErrorType; line: number }[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                const cleanedMsg = message.replace(/^[A-Z]+: line \d+: ?/, "");
                const lineMatch = message.match(/line (\d+)/);
                issues.push({ message: cleanedMsg, type, line: lineMatch ? parseInt(lineMatch[1]) : -1 });
            },
            countAllVisits: true,
            fileHandler: fileHandler,
            pluginNames: [],
            sourceFilename: null,
        });
        compiler.Compile();
        return issues;
    } catch (e) {
        return issues;
    }
}
