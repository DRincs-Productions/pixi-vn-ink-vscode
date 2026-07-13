import { existsSync } from "node:fs";
import * as path from "node:path";
import { Compiler } from "inkjs/compiler/Compiler";
import type { IFileHandler } from "inkjs/compiler/IFileHandler";
import { ErrorType } from "inkjs/compiler/Parser/ErrorType";
import { loadInkFileContent } from "./include-utility";
import { HEADER_REGEX } from "./knot-definitions";

interface RawIssue {
    message: string;
    type: ErrorType;
    line: number;
    // The literal text written after `INCLUDE` in whichever file's inclusion first reached this
    // content, exactly as inkjs itself tags it in the error message — `undefined` for an issue in
    // the root text handed directly to `Compiler`, which has no filename of its own.
    fileTag?: string;
}

function compileAndCollectIssues(text: string, fileHandler: Partial<IFileHandler> = {}): RawIssue[] {
    const issues: RawIssue[] = [];
    try {
        const compiler = new Compiler(text, {
            errorHandler: (message: string, type: ErrorType) => {
                const fileMatch = message.match(/: '(.*\.ink)' line/);
                const cleanedMsg = message.replace(/^[A-Z]+: '.*\.ink' line \d+: ?/, "").replace(/^[A-Z]+: line \d+: ?/, "");
                const lineMatch = message.match(/line (\d+)/);
                issues.push({
                    message: cleanedMsg,
                    type,
                    line: lineMatch ? parseInt(lineMatch[1], 10) : -1,
                    fileTag: fileMatch?.[1],
                });
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
    } catch {
        // Issues were already collected via errorHandler above even when Compile() itself throws.
    }
    return issues;
}

/**
 * Compiles `text` in isolation (following its own `INCLUDE`s via `fileHandler`, if any) and
 * returns only the issues that belong to `text` itself — anything reported inside an included
 * file is discarded, since there's no document here to attach it to.
 */
export function getErrors(text: string, fileHandler: Partial<IFileHandler> = {}) {
    return compileAndCollectIssues(text, fileHandler)
        .filter((issue) => issue.fileTag === undefined)
        .map((issue) => ({ message: issue.message, type: issue.type, line: issue.line }));
}

function resolveMainFilePath(mainFileSetting: string, rootFolder: string): string {
    return path.isAbsolute(mainFileSetting) ? path.resolve(mainFileSetting) : path.resolve(rootFolder, mainFileSetting);
}

/**
 * Compiles `currentText` (the document actually being edited, kept live even if unsaved) the way
 * it would really compile once the whole project runs: starting from `ink.mainFile`, not from the
 * current file in isolation. A global `VAR`/`CONST`/knot declared in some *other* file that only
 * `mainFile`'s own `INCLUDE` tree reaches (not the current file's own) must not be flagged as
 * "unresolved" just because the current file doesn't happen to `INCLUDE` it directly itself.
 *
 * - If the current file is itself somewhere in `mainFile`'s `INCLUDE` tree — directly, nested
 *   several `INCLUDE`s deep, or `mainFile` itself — it's compiled in place there, substituting
 *   this live text for whatever's on disk, and only *its own* issues are kept: inkjs tags every
 *   issue from an included file with the exact `INCLUDE` text that reached it, so that's used to
 *   pick out just this file's own issues (with their line numbers already relative to it).
 * - Otherwise (the file isn't reachable from `mainFile` at all — e.g. a work-in-progress file not
 *   wired into the project yet), it's appended as its own extra root block right after
 *   `mainFile`'s whole tree, so it still sees every global `mainFile` declares. Its issues are the
 *   ones with no file tag at all (same as `getErrors`), remapped back to its own line numbers by
 *   subtracting the couple of lines the prepended `INCLUDE mainFile` occupies.
 *
 * Either way, no single file is ever loaded (and its knots/`VAR`s declared) more than once in the
 * same compile, however many different `INCLUDE` paths lead to it — including the current file
 * itself, guarded separately in the second case so a cyclic `INCLUDE` back to it can't reload a
 * second, stale copy from disk.
 */
export function getProjectErrors(currentText: string, currentFilePath: string, mainFileSetting: string, rootFolder: string) {
    const resolvedCurrentPath = path.resolve(currentFilePath);
    const resolvedMainPath = resolveMainFilePath(mainFileSetting, rootFolder);

    // Misconfigured `ink.mainFile` (points nowhere) — fall back to the current file alone,
    // exactly like when `ink.mainFile` isn't set at all.
    if (!existsSync(resolvedMainPath)) {
        return getErrors(currentText, {
            LoadInkFileContents: (filename) => loadInkFileContent(filename, rootFolder) || "",
        });
    }

    const visited = new Set<string>();
    let currentFileTag: string | undefined;

    const treeIssues = compileAndCollectIssues(`INCLUDE ${mainFileSetting}`, {
        LoadInkFileContents: (filename) => {
            const resolved = path.isAbsolute(filename) ? path.resolve(filename) : path.resolve(rootFolder, filename);
            if (visited.has(resolved)) return "";
            visited.add(resolved);
            if (resolved === resolvedCurrentPath) {
                currentFileTag = filename;
                return currentText;
            }
            return loadInkFileContent(filename, rootFolder) || "";
        },
    });

    if (currentFileTag !== undefined) {
        return treeIssues
            .filter((issue) => issue.fileTag === currentFileTag)
            .map((issue) => ({ message: issue.message, type: issue.type, line: issue.line }));
    }

    // Not reachable from mainFile — append it as its own root block right after mainFile's tree.
    // This is a brand new Compiler instance (compileAndCollectIssues above is a separate, already-
    // finished compile), so it needs its own fresh `visited` set: reusing the one above would make
    // this second pass think mainFile's tree — and everything in it — was "already loaded" and skip
    // loading it at all, even though nothing has actually been loaded in *this* compile yet.
    const appendVisited = new Set<string>([resolvedCurrentPath]); // guards against a cyclic INCLUDE reloading it a second time
    const prefix = `INCLUDE ${mainFileSetting}\n\n`;
    const prefixLineCount = prefix.split("\n").length - 1;

    return getErrors(prefix + currentText, {
        LoadInkFileContents: (filename) => {
            const resolved = path.isAbsolute(filename) ? path.resolve(filename) : path.resolve(rootFolder, filename);
            if (appendVisited.has(resolved)) return "";
            appendVisited.add(resolved);
            return loadInkFileContent(filename, rootFolder) || "";
        },
    })
        .map((issue) => ({ ...issue, line: issue.line - prefixLineCount }))
        .filter((issue) => issue.line >= 1);
}

// Synthetic knot the current file's own content is wrapped in when compiling it as part of the
// whole project (see `buildProjectAwareSource`) — needed because a plain `-> knot` divert can only
// target an existing named knot, and the file being previewed may itself start with loose root
// content rather than a knot.
export const PROJECT_PREVIEW_ENTRY_KNOT = "__ink_project_preview_entry__";

// A top-level knot header (2+ `=`), with its char offset in the searched text and its name.
function findFirstTopLevelKnot(text: string): { index: number; name: string } | undefined {
    const regex = new RegExp(HEADER_REGEX.source, "gm");
    for (const match of text.matchAll(regex)) {
        if (match[1].length >= 2) return { index: match.index, name: match[3] };
    }
    return undefined;
}

// Whether `text.slice(0, endIndex)` has any real content — i.e. isn't just blank lines and/or
// `//`/`/* */` comments. Used to tell whether wrapping `text` in a synthetic knot (see below)
// would leave that knot's body empty, which inkjs rejects outright.
function hasRealContentBefore(text: string, endIndex: number): boolean {
    const leading = text
        .slice(0, endIndex)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    return /\S/.test(leading);
}

/**
 * Builds the source text and `LoadInkFileContents` handler to actually run/preview `currentText`
 * (the document actually being edited, kept live even if unsaved) as part of the whole project —
 * same motivation as `getProjectErrors`, but for compiling a runnable story instead of collecting
 * diagnostics, so entry-point line numbers matter and there's no "just this file's issues" filter.
 *
 * When `ink.mainFile` isn't set, doesn't exist, or the file being previewed *is* mainFile itself,
 * this just reproduces the previous behavior unchanged: `currentText` compiled alone (optionally
 * preceded by a `-> entryKnot` divert), following only its own `INCLUDE`s.
 *
 * Otherwise, the current file's own content is appended after an `INCLUDE ink.mainFile` — giving
 * it every global/knot the real project declares — with an initial divert so the story actually
 * starts running the previewed file's own content, not whatever mainFile's own root flow happens
 * to do first:
 * - If the caller asked to start from a specific knot (`entryKnot`, see `ink.runFromKnot`), divert
 *   straight there — it's already a valid, addressable target once the whole tree is compiled in.
 * - Otherwise, if `currentText` itself starts directly with a knot header (nothing but blank lines
 *   and/or comments before it — the common case for a file meant to be `INCLUDE`d, not run
 *   standalone), divert straight to *that* knot. It can't be wrapped in a synthetic entry knot
 *   instead: inkjs requires real content between one knot header and the next, and a wrapper
 *   knot immediately followed by the file's own first knot header would have none.
 * - Otherwise `currentText` has its own real root-level content (prose/logic before its first
 *   knot, or no knots at all) — that content is what a standalone preview would run first, so
 *   it's wrapped in a synthetic knot and diverted to, exactly reproducing that.
 *
 * If mainFile's own `INCLUDE` tree already reaches the current file on disk, that on-disk copy is
 * skipped (the live text supplied here is the only copy of it that ends up compiled), so its
 * knots/`VAR`s are never declared twice.
 *
 * `lineOffset` is how many lines were prepended before `currentText` itself begins — subtract it
 * from any reported line (compile error or runtime error) to map back onto the real document.
 */
export function buildProjectAwareSource(
    currentText: string,
    currentFilePath: string,
    rootFolder: string,
    mainFileSetting: string,
    entryKnot?: string,
): { source: string; fileHandler: Partial<IFileHandler>; lineOffset: number } {
    const resolvedCurrentPath = path.resolve(currentFilePath);
    const resolvedMainPath = mainFileSetting ? resolveMainFilePath(mainFileSetting, rootFolder) : undefined;
    const isProjectAware =
        resolvedMainPath !== undefined && existsSync(resolvedMainPath) && resolvedMainPath !== resolvedCurrentPath;

    if (!isProjectAware) {
        return {
            source: entryKnot ? `-> ${entryKnot}\n${currentText}` : currentText,
            fileHandler: { LoadInkFileContents: (filename) => loadInkFileContent(filename, rootFolder) || "" },
            lineOffset: entryKnot ? 1 : 0,
        };
    }

    let divertTarget = entryKnot;
    let wrapperKnotHeader = "";
    if (!divertTarget) {
        const firstKnot = findFirstTopLevelKnot(currentText);
        if (firstKnot && !hasRealContentBefore(currentText, firstKnot.index)) {
            divertTarget = firstKnot.name;
        } else {
            divertTarget = PROJECT_PREVIEW_ENTRY_KNOT;
            wrapperKnotHeader = `=== ${PROJECT_PREVIEW_ENTRY_KNOT} ===\n`;
        }
    }

    const visited = new Set<string>([resolvedCurrentPath]);
    const prefix = `-> ${divertTarget}\nINCLUDE ${mainFileSetting}\n\n${wrapperKnotHeader}`;

    return {
        source: prefix + currentText,
        fileHandler: {
            LoadInkFileContents: (filename) => {
                const resolved = path.isAbsolute(filename) ? path.resolve(filename) : path.resolve(rootFolder, filename);
                if (visited.has(resolved)) return "";
                visited.add(resolved);
                return loadInkFileContent(filename, rootFolder) || "";
            },
        },
        lineOffset: prefix.split("\n").length - 1,
    };
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
