import { existsSync } from "node:fs";
import { InkCompiler } from "@drincs/pixi-vn-ink/parser";
import { ErrorType } from "inkjs/engine/Error";
import path from "node:path";
import { Diagnostic, DiagnosticSeverity, DiagnosticTag, l10n, Range, type TextDocument, Uri, workspace } from "vscode";
import {
    findPixiVnCustomFunctionCalls,
    findPixiVnUnimplementedFunctionCalls,
    PIXI_VN_ISSUES_URL,
} from "./utils/builtin-functions";
import { escapeRegExp } from "./utils/divert-context";
import { getInkRootFolder, loadInkFileContent } from "./utils/include-utility";
import { getErrors, getProjectErrors } from "./utils/ink-utility";
import { extractKnotDefinitions, getAllKnotDefinitions } from "./utils/knot-definitions";
import { getProjectInkFiles } from "./utils/knot-utility";
import {
    findHashtagSegment,
    findMatchingHashtagCommand,
    isDeprecatedHashtagCommand,
    locateHashtagSegment,
    truncateHashtagCommandForMessage,
} from "./utils/pixi-vn-hashtag";
import {
    getPixiVnDevCharacterIds,
    getPixiVnDevHashtagCommands,
    getPixiVnDevLabelNames,
    getPixiVnJsonSchemaValidator,
} from "./utils/pixi-vn-dev-data";
import { compilePixiVNWithResolvedHashtagCommands, getErrorsPixiVN } from "./utils/pixi-vn-utility";

export function updateDiagnostics(doc: TextDocument, diagnostics: Diagnostic[]) {
    const config = workspace.getConfiguration("ink");
    const engine = config.get<"Inky" | "pixi-vn">("engine", "Inky");
    const rootFolderSetting = getInkRootFolder(doc);

    let errors: { message: string; type: ErrorType; line: number }[];

    if (engine === "pixi-vn") {
        errors = getErrorsPixiVN(doc.getText());
    } else {
        const mainFileSetting = config.get<string>("mainFile", "");
        errors = mainFileSetting
            ? getProjectErrors(doc.getText(), doc.uri.fsPath, mainFileSetting, rootFolderSetting)
            : getErrors(doc.getText(), {
                  LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
              });
    }

    for (const issue of errors) {
        if (issue.line >= 0) {
            const lineIndex = issue.line - 1;
            const line = doc.lineAt(lineIndex);
            const range = new Range(line.range.start, line.range.end);

            diagnostics.push({
                severity:
                    issue.type === ErrorType.Error
                        ? DiagnosticSeverity.Error
                        : issue.type === ErrorType.Warning
                          ? DiagnosticSeverity.Warning
                          : DiagnosticSeverity.Information,
                message: issue.message,
                source: "ink",
                range,
            });
        }
    }
}

export function checkPixiVnUnimplementedFunctions(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        for (const { name, start, end } of findPixiVnUnimplementedFunctionCalls(line)) {
            diagnostics.push(
                new Diagnostic(
                    new Range(i, start, i, end),
                    l10n.t(
                        "{0}() is not implemented yet in the pixi-vn engine. Contact the developers to request it: {1}",
                        name,
                        PIXI_VN_ISSUES_URL,
                    ),
                    DiagnosticSeverity.Warning,
                ),
            );
        }
    }
}

const PIXI_VN_FUNCTIONS_DOC_URL = "https://pixi-vn.com/ink/functions";
const PIXI_VN_HASHTAG_DOC_URL = "https://pixi-vn.com/ink/hashtag";

/**
 * Flags every `=== function ... ===` declaration under the pixi-vn engine: ink-native functions
 * are silently ignored there ("if you define a function in ink, it will be ignored by Pixi'VN",
 * {@link PIXI_VN_FUNCTIONS_DOC_URL}) — a function has to be defined in JavaScript/TypeScript
 * (via `StepLabelProps`) instead, or, better, exposed as a Custom Hashtag Command
 * ({@link PIXI_VN_HASHTAG_DOC_URL}).
 */
export function checkPixiVnInkFunctionDeclarations(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    for (const def of extractKnotDefinitions(document.uri.fsPath, document.getText())) {
        if (!def.isFunction) continue;

        const diagnostic = new Diagnostic(
            new Range(def.line, def.column, def.line, def.column + def.knotName.length),
            l10n.t(
                'Functions can\'t be created directly in ink for the pixi-vn engine — "{0}" will be ignored. Define it in JavaScript/TypeScript instead ({1}), or, better, expose it as a Custom Hashtag Command.',
                def.knotName,
                PIXI_VN_FUNCTIONS_DOC_URL,
            ),
            DiagnosticSeverity.Warning,
        );
        // Clickable in the Problems panel/hover — the hashtag-command doc mentioned in the
        // message text above; not repeated as a plain-text URL to avoid showing it twice.
        diagnostic.code = { value: "pixi-vn.com/ink/hashtag", target: Uri.parse(PIXI_VN_HASHTAG_DOC_URL) };
        diagnostics.push(diagnostic);
    }
}

/**
 * Hints, on every call to a function that isn't one of ink's own built-ins, that a Custom
 * Hashtag Command ({@link PIXI_VN_HASHTAG_DOC_URL}) is the recommended way to trigger app-side
 * behavior from ink under the pixi-vn engine, rather than calling a JavaScript function directly
 * (`~ functionName(...)`, defined via `StepLabelProps` — see {@link PIXI_VN_FUNCTIONS_DOC_URL}).
 */
export function checkPixiVnFunctionCallHints(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        for (const { name, start, end } of findPixiVnCustomFunctionCalls(line)) {
            const diagnostic = new Diagnostic(
                new Range(i, start, i, end),
                l10n.t('Consider exposing "{0}" as a Custom Hashtag Command instead of as a function.', name),
                DiagnosticSeverity.Information,
            );
            diagnostic.code = { value: "pixi-vn.com/ink/hashtag", target: Uri.parse(PIXI_VN_HASHTAG_DOC_URL) };
            diagnostics.push(diagnostic);
        }
    }
}

/**
 * Flags `-> target` diverts whose target isn't a knot/stitch anywhere in the project and
 * isn't a label currently registered on the pixi-vn Vite dev server either — the same
 * check `vitePluginInk` runs at build time, passing it the same "known labels" (dev-server
 * labels + project knots) offered as knot-completion suggestions after `->`/`<-` (see
 * knotCompletionProvider). Only runs when the dev server has actually returned some
 * labels: without them there's no reliable way to tell a real typo from a label defined
 * purely in JS, so — same as before this check existed — nothing is flagged.
 */
export async function checkPixiVnUnknownDivertTargets(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const pixiVnLabels = getPixiVnDevLabelNames();
    if (pixiVnLabels.length === 0) return;

    const projectFiles = await getProjectInkFiles(document);
    const knotFullNames = getAllKnotDefinitions(projectFiles).map((def) => def.fullName);
    const knownLabels = [...new Set([...knotFullNames, ...pixiVnLabels])];

    for (const occurrence of InkCompiler.getUnknownDivertTargets(document.getText(), knownLabels)) {
        const lineIndex = occurrence.line - 1;
        if (lineIndex < 0 || lineIndex >= document.lineCount) continue;

        diagnostics.push(
            new Diagnostic(
                document.lineAt(lineIndex).range,
                l10n.t('Divert target "{0}" not found in any known label source.', occurrence.target),
                DiagnosticSeverity.Warning,
            ),
        );
    }
}

/**
 * Flags every `# ...` hashtag command that matches no registered pixi-vn `HashtagCommands`
 * handler — the same check `vitePluginInk`'s `logUnknownHashtagCommands` runs at build/dev time,
 * via the same `InkCompiler.getUnknownHashtagCommands` it calls, given the handlers registered on
 * the pixi-vn dev server. Only runs once the dev server has actually returned some (without them
 * there's no reliable way to tell a real typo from a command registered purely in JS, so — same
 * as {@link checkPixiVnUnknownDivertTargets} — nothing is flagged). The whole `# ...` tag is
 * underlined, not just the command name, mirroring the semantic-token/hover treatment of a
 * *recognized* command (see extension.ts), which only colours the leading `#` itself.
 */
export function checkPixiVnUnknownHashtagCommands(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const hashtagCommands = getPixiVnDevHashtagCommands();
    if (hashtagCommands.length === 0) return;

    for (const occurrence of InkCompiler.getUnknownHashtagCommands(document.getText(), hashtagCommands)) {
        const lineIndex = occurrence.line - 1;
        if (lineIndex < 0 || lineIndex >= document.lineCount) continue;

        const segment = locateHashtagSegment(document.lineAt(lineIndex).text, occurrence.command);
        const range = segment
            ? new Range(lineIndex, segment.start, lineIndex, segment.end)
            : document.lineAt(lineIndex).range;

        diagnostics.push(
            new Diagnostic(
                range,
                l10n.t(
                    'Unknown hashtag command "# {0}": no registered handler matched this command.',
                    truncateHashtagCommandForMessage(occurrence.command),
                ),
                DiagnosticSeverity.Warning,
            ),
        );
    }
}

/**
 * Flags every `# ...` hashtag command that matches a registered handler marked
 * `deprecated: true` (see {@link isDeprecatedHashtagCommand}) — the pixi-vn-ink equivalent of a
 * deprecated JS/TS API. Tagged `DiagnosticTag.Deprecated` rather than plain `Warning`/`Information`,
 * the same mechanism the built-in JavaScript/TypeScript extension itself relies on: VS Code renders
 * the tagged range with a strikethrough and folds this diagnostic's own message into the hover
 * popup shown over it, with no separate decoration or hover-provider wiring needed on top.
 * `DiagnosticSeverity.Hint` keeps it out of the Problems panel by default, matching how the
 * JS/TS extension itself reports deprecations.
 *
 * Matching is done per hashtag-command line, not via {@link buildUnknownHashtagCommandIndex}
 * (built for the opposite question — "no handler matches at all"): duplicate command texts on
 * different lines reuse the same {@link findMatchingHashtagCommand} lookup instead of repeating it.
 */
export function checkPixiVnDeprecatedHashtagCommands(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const hashtagCommands = getPixiVnDevHashtagCommands();
    if (hashtagCommands.length === 0) return;

    const matchCache = new Map<string, ReturnType<typeof findMatchingHashtagCommand>>();
    const resolveMatch = (command: string) => {
        if (!matchCache.has(command)) {
            matchCache.set(command, findMatchingHashtagCommand(command, hashtagCommands));
        }
        return matchCache.get(command);
    };

    for (let i = 0; i < document.lineCount; i++) {
        const segment = findHashtagSegment(document.lineAt(i).text);
        if (!segment) continue;

        const matched = resolveMatch(segment.command);
        if (!matched || !isDeprecatedHashtagCommand(matched)) continue;

        const diagnostic = new Diagnostic(
            new Range(i, segment.start, i, segment.end),
            matched.description
                ? l10n.t(
                      'Hashtag command "# {0}" ({1}) is deprecated: {2}',
                      truncateHashtagCommandForMessage(segment.command),
                      matched.name,
                      matched.description,
                  )
                : l10n.t(
                      'Hashtag command "# {0}" ({1}) is deprecated.',
                      truncateHashtagCommandForMessage(segment.command),
                      matched.name,
                  ),
            DiagnosticSeverity.Hint,
        );
        diagnostic.tags = [DiagnosticTag.Deprecated];
        diagnostics.push(diagnostic);
    }
}

/**
 * Adds Ajv's precise mismatch to the existing unknown-command warning when an unknown `# ...`
 * command is an extremely close match for a registered Zod handler/mapper. This remains pixi-vn
 * only and deliberately runs after {@link checkPixiVnUnknownHashtagCommands}: the broad warning
 * is never replaced, merely made actionable (for example, an invalid enum/property token).
 */
export function checkPixiVnLikelyUnknownHashtagCommandSchemaIssues(
    document: TextDocument,
    diagnostics: Diagnostic[],
) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const hashtagCommands = getPixiVnDevHashtagCommands();
    if (hashtagCommands.length === 0) return;

    // Not present in every published `@drincs/pixi-vn-ink` version this extension might be
    // running against — calling it unconditionally would throw on every diagnostics refresh
    // (every keystroke) and, since `refreshDiagnostics` is invoked fire-and-forget, take down the
    // whole extension host on the resulting unhandled rejection. Skip silently until it's there.
    if (typeof InkCompiler.getLikelyUnknownHashtagCommandSchemaIssues !== "function") return;

    for (const issue of InkCompiler.getLikelyUnknownHashtagCommandSchemaIssues(document.getText(), hashtagCommands)) {
        const lineIndex = issue.line - 1;
        if (lineIndex < 0 || lineIndex >= document.lineCount) continue;

        const segment = locateHashtagSegment(document.lineAt(lineIndex).text, issue.command);
        const range = segment
            ? new Range(lineIndex, segment.start, lineIndex, segment.end)
            : document.lineAt(lineIndex).range;

        diagnostics.push(
            new Diagnostic(
                range,
                l10n.t(
                    'Likely hashtag command "# {0}" ({1}): "{2}" — {3}',
                    truncateHashtagCommandForMessage(issue.command),
                    issue.handlerName,
                    issue.element,
                    issue.message,
                ),
                DiagnosticSeverity.Warning,
            ),
        );
    }
}

/**
 * For every hashtag command that *does* match a registered handler, additionally validates its
 * order-independent keyed sections (e.g. `# show imagecontainer sly props xAlign 0.2 ...`) against
 * that handler's own `keySchemas` — mirroring `vitePluginInk`'s `logHashtagKeySchemaIssues`, via
 * the same `InkCompiler.getHashtagKeySchemaIssues`. Purely additive to
 * {@link checkPixiVnUnknownHashtagCommands}: a command with no matching handler, or a matching one
 * with no `keySchemas`, is simply skipped, never doubly reported.
 */
export function checkPixiVnHashtagKeySchemaIssues(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const hashtagCommands = getPixiVnDevHashtagCommands();
    if (hashtagCommands.length === 0) return;

    for (const issue of InkCompiler.getHashtagKeySchemaIssues(document.getText(), hashtagCommands)) {
        const lineIndex = issue.line - 1;
        if (lineIndex < 0 || lineIndex >= document.lineCount) continue;

        const segment = locateHashtagSegment(document.lineAt(lineIndex).text, issue.command);
        const range = segment
            ? new Range(lineIndex, segment.start, lineIndex, segment.end)
            : document.lineAt(lineIndex).range;

        // `issue.element`/`issue.message` come from Ajv validating the project's own registered
        // JSON Schema — arbitrary text this extension doesn't author, so it's passed through as-is
        // rather than folded fully into the l10n template (same approach as the text-replace hover).
        diagnostics.push(
            new Diagnostic(
                range,
                l10n.t(
                    'Hashtag command "# {0}": "{1}" section — {2}: {3}',
                    truncateHashtagCommandForMessage(issue.command),
                    issue.key,
                    issue.element,
                    issue.message,
                ),
                DiagnosticSeverity.Warning,
            ),
        );
    }
}

/**
 * Locates the exact span of `element` (e.g. an unrecognised property's name) within the document
 * line whose text is (or contains) `origin` — the nearest ink source line
 * `InkCompiler.validateAgainstJsonSchema` could trace a schema mismatch back to. Falls back to
 * underlining the whole line when `origin` can't be matched verbatim (e.g. it was reformatted
 * rather than copied straight from source), or when `element` isn't literally present on it as
 * its own word (e.g. a `"(root)"` element, or one naming something structural rather than a
 * token actually written in the source).
 */
function locateSchemaIssueRange(document: TextDocument, origin: string | undefined, element: string): Range {
    const trimmedOrigin = origin?.trim();
    let lineIndex: number | undefined;
    if (trimmedOrigin) {
        for (let i = 0; i < document.lineCount; i++) {
            if (document.lineAt(i).text.trim() === trimmedOrigin) {
                lineIndex = i;
                break;
            }
        }
        if (lineIndex === undefined) {
            for (let i = 0; i < document.lineCount; i++) {
                if (document.lineAt(i).text.includes(trimmedOrigin)) {
                    lineIndex = i;
                    break;
                }
            }
        }
    }
    if (lineIndex === undefined) return document.lineAt(0).range;

    const line = document.lineAt(lineIndex);
    const match = new RegExp(`\\b${escapeRegExp(element)}\\b`).exec(line.text);
    if (!match) return line.range;

    return new Range(lineIndex, match.index, lineIndex, match.index + element.length);
}

/**
 * Validates the current file, compiled to `PixiVNJson`, against the pixi-vn JSON Schema — the
 * same `InkCompiler.validateAgainstJsonSchema` check `vitePluginInk`'s `validatePixiVNJsonAgainstSchema`
 * runs at build/export time. The schema itself comes from the dev server's `INK_DEV_API_INFO`
 * (`schemaUrl`), or, when no dev server is reachable at all, the latest published schema at
 * https://pixi-vn.com/schemas/latest/schema.json (see {@link getPixiVnJsonSchemaValidator}).
 * Unlike the hashtag-command checks above, this doesn't depend on the dev server's registered
 * commands, so it runs whenever *a* schema (dev-server or fallback) is available.
 *
 * Compiles via {@link compilePixiVNWithResolvedHashtagCommands}, not the plain `compilePixiVN`
 * used elsewhere: without it, every `# show ...`/`# edit ...`/... hashtag command stays an opaque
 * `operationtoconvert` placeholder with no structured properties for the schema to check inside
 * at all — e.g. a mistyped `props` key (`xAlgn` for `xAlign`) would silently compile clean.
 */
export async function checkPixiVnJsonSchemaValidation(document: TextDocument, diagnostics: Diagnostic[]) {
    const engine = workspace.getConfiguration("ink").get<"Inky" | "pixi-vn">("engine", "Inky");
    if (engine !== "pixi-vn") return;

    const validator = getPixiVnJsonSchemaValidator();
    if (!validator) return;

    const json = await compilePixiVNWithResolvedHashtagCommands(document.getText(), new Set(getPixiVnDevCharacterIds()));
    if (!json) return;

    for (const issue of InkCompiler.validateAgainstJsonSchema(json, validator)) {
        diagnostics.push(
            new Diagnostic(
                locateSchemaIssueRange(document, issue.origin, issue.element),
                l10n.t('PixiVN JSON schema: "{0}" - {1}', issue.element, issue.message),
                DiagnosticSeverity.Warning,
            ),
        );
    }
}

export function checkIncludes(document: TextDocument, diagnostics: Diagnostic[]) {
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    const workspaceRoot = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath || "";
    const config = workspace.getConfiguration("ink");
    const rootFolderSetting: string = config.get("rootFolder", "");
    const baseFolder = rootFolderSetting ? path.resolve(workspaceRoot, rootFolderSetting) : workspaceRoot;

    lines.forEach((line, lineIndex) => {
        const match = line.match(/^\s*INCLUDE\s+(.+)$/);
        if (match) {
            const relativePath = match[1].trim();
            const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(baseFolder, relativePath);

            if (!existsSync(fullPath)) {
                diagnostics.push(
                    new Diagnostic(
                        new Range(lineIndex, 0, lineIndex, line.length),
                        l10n.t('Included file "{0}" does not exist (resolved from "{1}").', relativePath, baseFolder),
                        DiagnosticSeverity.Error,
                    ),
                );
            } else if (path.extname(fullPath) !== ".ink") {
                diagnostics.push(
                    new Diagnostic(
                        new Range(lineIndex, 0, lineIndex, line.length),
                        l10n.t('Included file "{0}" is not a .ink file.', relativePath),
                        DiagnosticSeverity.Warning,
                    ),
                );
            }
        }
    });
}
