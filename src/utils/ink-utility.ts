import { Compiler } from "inkjs/compiler/Compiler";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";

export function getErrors(text: string) {
    const issues: { message: string; type: ErrorType; line: number }[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                const line = message.match(/line (\d+)/)!;
                issues.push({ message, type, line: line ? parseInt(line[1]) : -1 });
            },
            countAllVisits: true,
            fileHandler: null,
            pluginNames: [],
            sourceFilename: null,
        });
        compiler.Compile();
        return issues;
    } catch (e) {
        return issues;
    }
}
