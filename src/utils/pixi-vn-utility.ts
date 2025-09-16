import { convertInkStoryToJson } from "@drincs/pixi-vn-ink";
import { Compiler } from "inkjs/compiler/Compiler";
import { IFileHandler } from "inkjs/compiler/IFileHandler";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";

export function getErrorsPixiVN(text: string, labelToRemove: string[] = [], initialVarsToRemove: string[] = []) {
    const issues: { message: string; type: ErrorType; line: number }[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                const cleanedMsg = message.replace(/^[A-Z]+: line \d+: ?/, "");
                const lineMatch = message.match(/line (\d+)/);
                issues.push({ message: cleanedMsg, type, line: lineMatch ? parseInt(lineMatch[1]) : -1 });
            },
            countAllVisits: true,
            fileHandler: null,
            pluginNames: [],
            sourceFilename: null,
        });
        compiler.Compile();
        return issues;
    } catch (e) {
        const error = issues.find((em) => em.type === ErrorType.Error);
        if (error) {
            if (error.message.includes("Divert target not found")) {
                const match = error.message.match(/Divert target not found: '-> (\w+)'/);
                if (match && match[1]) {
                    const label = match[1];
                    const textToAdd = `\n\n=== ${label} ===\n\n# run ${label}\n\n-> DONE`;
                    text = text.concat(textToAdd);
                    return getErrorsPixiVN(text, [...labelToRemove, label], initialVarsToRemove);
                }
            }
            if (error.message.includes("Unresolved variable")) {
                const match = error.message.match(/Unresolved variable: (\w+)/);
                if (match && match[1]) {
                    const varName = match[1];
                    const textToAdd = `VAR ${varName} = "${varName}_value"\n\n`;
                    text = textToAdd.concat(text);
                    return getErrorsPixiVN(text, labelToRemove, [...initialVarsToRemove, varName]);
                }
            }
        }
        return issues;
    }
}

export function compilePixiVN(
    text: string,
    fileHandler: Partial<IFileHandler> = {},
    labelToRemove: string[] = [],
    initialVarsToRemove: string[] = []
) {
    const issues: { message: string; type: ErrorType; line: number }[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                const cleanedMsg = message.replace(/^[A-Z]+: line \d+: ?/, "");
                const lineMatch = message.match(/line (\d+)/);
                issues.push({ message: cleanedMsg, type, line: lineMatch ? parseInt(lineMatch[1]) : -1 });
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
        const json = JSON.parse(compiler.Compile().ToJson()!);
        if (json && "root" in json && json.root.length === 3) {
            json.root[2] = {
                __pixi_vn_start__: json.root[0],
                ...json.root[2],
            };
        }
        return convertInkStoryToJson(json);
    } catch (e) {
        const error = issues.find((em) => em.type === ErrorType.Error);
        if (error) {
            if (error.message.includes("Divert target not found")) {
                const match = error.message.match(/Divert target not found: '-> (\w+)'/);
                if (match && match[1]) {
                    const label = match[1];
                    const textToAdd = `\n\n=== ${label} ===\n\n# run ${label}\n\n-> DONE`;
                    text = text.concat(textToAdd);
                    return compilePixiVN(text, fileHandler, [...labelToRemove, label], initialVarsToRemove);
                }
            }
            if (error.message.includes("Unresolved variable")) {
                const match = error.message.match(/Unresolved variable: (\w+)/);
                if (match && match[1]) {
                    const varName = match[1];
                    const textToAdd = `VAR ${varName} = "${varName}_value"\n\n`;
                    text = textToAdd.concat(text);
                    return compilePixiVN(text, fileHandler, labelToRemove, [...initialVarsToRemove, varName]);
                }
            }
        }
        if (errors.length > 0) {
            throw new Error(errors[0]);
        }
        throw e;
    }
}
