import * as path from "node:path";
import {
    CompletionItem,
    CompletionItemKind,
    type CompletionItemProvider,
    type DefinitionProvider,
    type Disposable,
    type LocationLink,
    Position,
    Range,
    type TextDocument,
    Uri,
    WorkspaceEdit,
    commands,
    workspace,
} from "vscode";
import {
    escapeRegExp,
    isDeclaredSymbolHoverContext,
    isEscaped,
    isKnotReferenceContext,
    isPrecededByUnescapedDivertToKnot,
    isPrecededByUnescapedThreadToKnot,
    isVariableReferenceContext,
} from "./divert-context";
import { getInkRootFolder, loadInkFolder } from "./include-utility";
import {
    type KnotDefinition,
    type LabelDefinition,
    computeIncludeInsertion,
    extractLabelDefinitions,
    findKnotDefinitionsByName,
    findLabelDefinitionsByName,
    getAllKnotDefinitions,
    getEnclosingKnotStitch,
} from "./knot-definitions";
import { type VariableDefinition, extractVariableDefinitions, findVariableDefinitionsByName } from "./variable-definitions";
import type InkFile from "../types/InkFile";

export {
    computeIncludeInsertion,
    extractKnotDefinitions,
    extractLabelDefinitions,
    findKnotDefinitionsByName,
    findLabelDefinitionsByName,
    getAllKnotDefinitions,
    getEnclosingKnotStitch,
} from "./knot-definitions";
export type { KnotDefinition, LabelDefinition } from "./knot-definitions";
export { extractVariableDefinitions, findVariableDefinitionsByName } from "./variable-definitions";
export type { VariableDefinition } from "./variable-definitions";

const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";

/**
 * Loads every .ink file the project considers part of the story: everything
 * under `ink.rootFolder` (recursively), or the whole workspace when that
 * setting is empty. Currently-open documents are overlaid with their live
 * (possibly unsaved) buffer instead of the on-disk contents.
 */
export async function getProjectInkFiles(document: TextDocument): Promise<InkFile[]> {
    const rootFolder = getInkRootFolder(document);
    if (!rootFolder) {
        return [{ path: document.uri.fsPath, content: document.getText() }];
    }

    const files = await loadInkFolder(rootFolder, rootFolder);

    const openContentByPath = new Map<string, string>();
    for (const doc of workspace.textDocuments) {
        if (doc.languageId === "ink") {
            openContentByPath.set(path.resolve(doc.uri.fsPath), doc.getText());
        }
    }
    openContentByPath.set(path.resolve(document.uri.fsPath), document.getText());

    const result = files.map((file) => {
        const liveContent = openContentByPath.get(path.resolve(file.path));
        return liveContent === undefined ? file : { path: file.path, content: liveContent };
    });

    if (!result.some((file) => path.resolve(file.path) === path.resolve(document.uri.fsPath))) {
        result.push({ path: document.uri.fsPath, content: document.getText() });
    }

    return result;
}

/**
 * Given the word right before which a divert/thread arrow sits (e.g. `-> knot.`
 * right before `stitch` in `-> knot.stitch`), returns the dotted `knot.word`
 * name to resolve, or just `word` when it isn't the stitch half of a dotted
 * target.
 */
function resolveReferencedName(line: string, beforeWord: string, word: string): string {
    if (isPrecededByUnescapedDivertToKnot(line, beforeWord) || isPrecededByUnescapedThreadToKnot(line, beforeWord)) {
        const parentMatch = beforeWord.match(new RegExp(`(?:->|<-)\\s*(${IDENTIFIER})\\.\\s*$`));
        if (parentMatch) return `${parentMatch[1]}.${word}`;
    }
    return word;
}

// Same idea as resolveReferencedName, but for a dotted `list.item` value
// reference (e.g. `DoctorsInSurgery.Adams`) rather than a divert/thread arrow
// target — the dot isn't preceded by `->`/`<-` here, just another identifier.
function resolveVariableReferenceName(beforeWord: string, word: string): string {
    const parentMatch = beforeWord.match(new RegExp(`(${IDENTIFIER})\\.\\s*$`));
    return parentMatch ? `${parentMatch[1]}.${word}` : word;
}

/**
 * Ctrl+Click / Go to Definition for:
 * - knot/stitch references (`-> knot`, `<- knot`, `-> knot.stitch`, `{knot}`,
 *   tunnel calls, divert-target values, …), searched across every .ink file
 *   in the project;
 * - labelled gathers/choices (`-> opts` targeting a `- (opts)` or
 *   `* (opts) [...]`), and
 * - declared `VAR`/`CONST`/`LIST`/`temp` symbols (including individual list
 *   items, e.g. `Adams` or `DoctorsInSurgery.Adams`), referenced in logic
 *   lines, `{ }`, or the declaration itself — a `~ temp` only resolves within
 *   the knot/stitch it was declared in (its value doesn't exist anywhere
 *   else, per the official docs).
 *
 * Labels and variables are only ever looked up in the *current* document —
 * unlike a knot/stitch, neither is addressable across an INCLUDE boundary
 * from just its bare name, so there's no project-wide file to jump to. When
 * more than one match shares the referenced name (e.g. two files each define
 * a knot called the same thing, or two lists each declare an item of the
 * same name), all of them are returned so the editor offers a peek list
 * instead of picking one arbitrarily.
 *
 * Returns `LocationLink[]` (not plain `Location[]`) with an explicit
 * `originSelectionRange` set to just the identifier — ink's
 * `language-configuration.json` intentionally sets a very permissive
 * `wordPattern` (so double-clicking selects a whole multi-word phrase), but
 * that same pattern is what VS Code falls back to for the Ctrl+hover
 * underline range when a provider returns plain `Location`s, which would
 * otherwise underline far more than just the clicked word (e.g. the whole
 * of `<- compare_prints(-> top)` instead of just `compare_prints`/`top`).
 */
export function knotDefinitionProvider(): DefinitionProvider {
    return {
        async provideDefinition(document, position) {
            const line = document.lineAt(position.line).text;
            const range = document.getWordRangeAtPosition(position, new RegExp(IDENTIFIER));
            if (!range) return;

            const word = document.getText(range);
            const beforeWord = line.substring(0, range.start.character);
            const currentPath = path.resolve(document.uri.fsPath);

            const results: { filePath: string; line: number }[] = [];

            if (isKnotReferenceContext(document, position, line, beforeWord)) {
                const fullName = resolveReferencedName(line, beforeWord, word);

                const projectFiles = await getProjectInkFiles(document);
                results.push(...findKnotDefinitionsByName(getAllKnotDefinitions(projectFiles), fullName));

                const labelDefinitions = extractLabelDefinitions(document.uri.fsPath, document.getText());
                results.push(...findLabelDefinitionsByName(labelDefinitions, fullName));
            }

            if (isDeclaredSymbolHoverContext(document, position, line)) {
                const variableName = resolveVariableReferenceName(beforeWord, word);
                const content = document.getText();
                const variableDefinitions = extractVariableDefinitions(content);
                const scope = getEnclosingKnotStitch(content, position.line);
                for (const def of findVariableDefinitionsByName(variableDefinitions, variableName, scope)) {
                    results.push({ filePath: document.uri.fsPath, line: def.line });
                }
            }

            const definitions = results.filter(
                (def) => !(path.resolve(def.filePath) === currentPath && def.line === position.line),
            );
            if (!definitions.length) return;

            const links: LocationLink[] = definitions.map((def) => ({
                originSelectionRange: range,
                targetUri: Uri.file(def.filePath),
                targetRange: new Range(def.line, 0, def.line, 0),
                targetSelectionRange: new Range(def.line, 0, def.line, 0),
            }));
            return links;
        },
    };
}

export const INSERT_INCLUDE_COMMAND = "ink._insertIncludeForKnot";

/**
 * Registers the internal command a completion item runs after the user
 * accepts a knot/stitch suggestion that lives in another file: adds an
 * `INCLUDE` for that file if one isn't already present. Only meaningful for
 * the Inky engine — the pixi-vn engine compiles each file independently
 * (see diagnostics.ts) and doesn't resolve INCLUDE at all.
 */
export function registerInsertIncludeCommand(): Disposable {
    return commands.registerCommand(INSERT_INCLUDE_COMMAND, async (docUri: Uri, targetFilePath: string) => {
        const document = await workspace.openTextDocument(docUri);
        if (path.resolve(document.uri.fsPath) === path.resolve(targetFilePath)) return;

        const rootFolder = getInkRootFolder(document);
        if (!rootFolder) return;

        const relativePath = path.relative(rootFolder, targetFilePath).split(path.sep).join("/");
        const alreadyIncluded = new RegExp(`^\\s*INCLUDE\\s+${escapeRegExp(relativePath)}\\s*$`, "m").test(
            document.getText(),
        );
        if (alreadyIncluded) return;

        const lines: string[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            lines.push(document.lineAt(i).text);
        }
        const { line, text } = computeIncludeInsertion(lines, relativePath);

        const edit = new WorkspaceEdit();
        edit.insert(docUri, new Position(line, 0), text);
        await workspace.applyEdit(edit);
    });
}

function knotCompletionItemKind(def: KnotDefinition): CompletionItemKind {
    if (def.isFunction) return CompletionItemKind.Function;
    return def.stitchName ? CompletionItemKind.Field : CompletionItemKind.Class;
}

/**
 * Builds the completion item for a label (`(name)` on a gather/choice line).
 * Always in the current file, so — unlike a knot/stitch suggestion — it
 * never needs registerInsertIncludeCommand's auto-INCLUDE.
 */
function labelCompletionItem(def: LabelDefinition, range: Range): CompletionItem {
    const item = new CompletionItem(def.labelName, CompletionItemKind.Reference);
    item.insertText = def.labelName;
    item.range = range;
    item.detail = def.stitchName ? `${def.knotName}.${def.stitchName}` : def.knotName;
    return item;
}

function variableCompletionItemKind(def: VariableDefinition): CompletionItemKind {
    switch (def.kind) {
        case "VAR":
        case "TEMP":
            return CompletionItemKind.Variable;
        case "CONST":
            return CompletionItemKind.Constant;
        case "LIST":
            return CompletionItemKind.Enum;
        case "LIST_ITEM":
            return CompletionItemKind.EnumMember;
    }
}

/**
 * Builds the completion item for a declared VAR/CONST/LIST/temp symbol (or
 * one of a LIST's own items). Always in the current file, so — like a label
 * suggestion — it never needs registerInsertIncludeCommand's auto-INCLUDE.
 */
function variableCompletionItem(def: VariableDefinition, range: Range): CompletionItem {
    const item = new CompletionItem(def.name, variableCompletionItemKind(def));
    item.insertText = def.name;
    item.range = range;
    item.detail = def.listName ?? (def.stitchName ? `${def.knotName}.${def.stitchName}` : def.knotName);
    return item;
}

/**
 * Attaches the auto-INCLUDE command to `item` when `def` lives in a different
 * file than the one being edited and the engine actually resolves INCLUDE
 * (i.e. not pixi-vn).
 */
function attachIncludeCommand(item: CompletionItem, document: TextDocument, def: KnotDefinition): void {
    const engine = workspace.getConfiguration("ink", document.uri).get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine === "pixi-vn") return;
    if (path.resolve(def.filePath) === path.resolve(document.uri.fsPath)) return;

    item.command = {
        command: INSERT_INCLUDE_COMMAND,
        title: "",
        arguments: [document.uri, def.filePath],
    };
}

const ARROW_DOTTED_REGEX = new RegExp(`(->|<-)\\s*(${IDENTIFIER})\\.(${IDENTIFIER})?$`);
const ARROW_WORD_REGEX = new RegExp(`(->|<-)\\s*(${IDENTIFIER})?$`);
// A dotted `list.item` value reference, e.g. `DoctorsInSurgery.Ad` — unlike
// ARROW_DOTTED_REGEX, not preceded by a divert/thread arrow.
const VARIABLE_DOTTED_REGEX = new RegExp(`(${IDENTIFIER})\\.(${IDENTIFIER})?$`);
const TRAILING_IDENTIFIER_REGEX = new RegExp(`(${IDENTIFIER})$`);

/**
 * Suggests knots/stitches right after a divert (`->`) or thread (`<-`) arrow
 * is typed — including a `->->  destination` tunnel return — so writing a
 * divert doesn't require remembering (or misspelling) every knot name by
 * hand. Typing `-> knot.` narrows the list to that knot's own stitches.
 * When the chosen knot/stitch lives in a different file, accepting the
 * suggestion also inserts an `INCLUDE` for that file (see
 * registerInsertIncludeCommand). Also suggests declared VAR/CONST/LIST/temp
 * symbols (and a LIST's own items, e.g. `DoctorsInSurgery.Ad` → `Adams`)
 * inside a logic/variable-text context — these are always local to the
 * current file, unlike knots/stitches, and a `temp` is further scoped to the
 * knot/stitch it was declared in.
 */
export function knotCompletionProvider(): CompletionItemProvider {
    return {
        async provideCompletionItems(document, position) {
            const line = document.lineAt(position).text;
            const beforeCursor = line.substring(0, position.character);

            const dottedMatch = beforeCursor.match(ARROW_DOTTED_REGEX);
            if (dottedMatch?.index !== undefined) {
                if (isEscaped(line, dottedMatch.index)) return undefined;

                const knotName = dottedMatch[2];
                const typedPrefix = dottedMatch[3] ?? "";
                const range = new Range(
                    position.line,
                    position.character - typedPrefix.length,
                    position.line,
                    position.character,
                );

                const projectFiles = await getProjectInkFiles(document);
                const stitches = getAllKnotDefinitions(projectFiles).filter(
                    (def) =>
                        def.knotName === knotName &&
                        def.stitchName &&
                        def.stitchName.toLowerCase().startsWith(typedPrefix.toLowerCase()),
                );
                const stitchItems = stitches.map((def) => {
                    const item = new CompletionItem(def.stitchName ?? "", knotCompletionItemKind(def));
                    item.insertText = def.stitchName;
                    item.range = range;
                    item.detail = path.basename(def.filePath);
                    attachIncludeCommand(item, document, def);
                    return item;
                });

                // `knotName` (the text before the dot) may itself be a stitch name
                // (-> stitch.label, same knot) or a knot name (-> knot.label, a
                // label directly in that knot's own top-level weave) — either way
                // it addresses a label, per the doc's addressing examples.
                const labelDefinitions = extractLabelDefinitions(document.uri.fsPath, document.getText());
                const labelItems = labelDefinitions
                    .filter(
                        (def) =>
                            (def.stitchName === knotName || (!def.stitchName && def.knotName === knotName)) &&
                            def.labelName.toLowerCase().startsWith(typedPrefix.toLowerCase()),
                    )
                    .map((def) => labelCompletionItem(def, range));

                return [...stitchItems, ...labelItems];
            }

            const arrowMatch = beforeCursor.match(ARROW_WORD_REGEX);
            if (arrowMatch?.index !== undefined && !isEscaped(line, arrowMatch.index)) {
                const typedPrefix = arrowMatch[2] ?? "";
                const range = new Range(
                    position.line,
                    position.character - typedPrefix.length,
                    position.line,
                    position.character,
                );

                const projectFiles = await getProjectInkFiles(document);
                const definitions = getAllKnotDefinitions(projectFiles).filter((def) =>
                    def.fullName.toLowerCase().startsWith(typedPrefix.toLowerCase()),
                );
                const knotItems = definitions.map((def) => {
                    const item = new CompletionItem(def.fullName, knotCompletionItemKind(def));
                    item.insertText = def.fullName;
                    item.range = range;
                    item.detail = path.basename(def.filePath);
                    attachIncludeCommand(item, document, def);
                    return item;
                });

                // Labels are only ever local to the current file (see
                // knotDefinitionProvider's doc comment), so they're sourced
                // straight from `document` rather than getProjectInkFiles.
                const labelItems = extractLabelDefinitions(document.uri.fsPath, document.getText())
                    .filter((def) => def.labelName.toLowerCase().startsWith(typedPrefix.toLowerCase()))
                    .map((def) => labelCompletionItem(def, range));

                return [...knotItems, ...labelItems];
            }

            // Not right after a divert/thread arrow — try a dotted `list.item`
            // value reference first (e.g. `DoctorsInSurgery.Ad`), narrowing to
            // that specific list's own items.
            const listDotMatch = beforeCursor.match(VARIABLE_DOTTED_REGEX);
            if (listDotMatch) {
                const listName = listDotMatch[1];
                const typedItemPrefix = listDotMatch[2] ?? "";
                const range = new Range(
                    position.line,
                    position.character - typedItemPrefix.length,
                    position.line,
                    position.character,
                );

                const itemItems = extractVariableDefinitions(document.getText())
                    .filter(
                        (def) =>
                            def.kind === "LIST_ITEM" &&
                            def.listName === listName &&
                            def.name.toLowerCase().startsWith(typedItemPrefix.toLowerCase()),
                    )
                    .map((def) => variableCompletionItem(def, range));
                if (itemItems.length) return itemItems;
            }

            // Otherwise, suggest declared VAR/CONST/LIST/temp symbols (and
            // every list's own items) when the position looks like it could
            // reference one — a `~` logic line, inside `{ }`, or a VAR/CONST/
            // LIST declaration's own value expression.
            if (!isVariableReferenceContext(document, position, line)) return undefined;

            const trailingIdentifierMatch = beforeCursor.match(TRAILING_IDENTIFIER_REGEX);
            const typedPrefix = trailingIdentifierMatch ? trailingIdentifierMatch[0] : "";
            const range = new Range(
                position.line,
                position.character - typedPrefix.length,
                position.line,
                position.character,
            );

            const content = document.getText();
            const scope = getEnclosingKnotStitch(content, position.line);
            return extractVariableDefinitions(content)
                .filter(
                    (def) =>
                        def.name.toLowerCase().startsWith(typedPrefix.toLowerCase()) &&
                        (def.kind !== "TEMP" || (def.knotName === scope.knotName && def.stitchName === scope.stitchName)),
                )
                .map((def) => variableCompletionItem(def, range));
        },
    };
}
