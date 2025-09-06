import { Compiler } from "inkjs/compiler/Compiler";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";
import InkFile from "../types/InkFile";

export function getErrors(text: string, files: InkFile[] = []) {
    const issues: { message: string; type: ErrorType; line: number }[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                const cleanedMsg = message.replace(/^[A-Z]+: line \d+: ?/, "");
                const lineMatch = message.match(/line (\d+)/);
                issues.push({ message: cleanedMsg, type, line: lineMatch ? parseInt(lineMatch[1]) : -1 });
            },
            countAllVisits: true,
            fileHandler: {
                LoadInkFileContents: (filename: string) => {
                    console.log("Loading file:", filename);
                    const file = files.find((f) => f.path === filename);
                    return file ? file.content : "";
                },
                ResolveInkFilename: (filename: string) => {
                    console.log("Resolving file:", filename);
                    const file = files.find((f) => f.path === filename);
                    return file ? file.path : filename;
                },
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
