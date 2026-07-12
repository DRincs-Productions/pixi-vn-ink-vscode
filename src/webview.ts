import * as fs from "node:fs";
import * as path from "node:path";
import {
    commands,
    env,
    type ExtensionContext,
    l10n,
    OverviewRulerLane,
    Range,
    type TextDocument,
    TextEditorRevealType,
    ThemeColor,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";
import { getInkRootFolder, loadInkFileContent } from "./utils/include-utility";
import { compile, getRuntimeError } from "./utils/ink-utility";
import { compilePixiVN } from "./utils/pixi-vn-utility";

export function previewCommand(context: ExtensionContext) {
    return commands.registerCommand("ink.preview", async () => {
        const editor = window.activeTextEditor;

        if (!editor) {
            window.showErrorMessage(l10n.t("No active editor found."));
            return;
        }
        const rootFolderSetting = getInkRootFolder(editor.document);
        return await openWebview(context, rootFolderSetting, {
            name: path.basename(editor.document.fileName),
            text: editor.document.getText(),
            uri: editor.document.uri,
        });
    });
}

export function runFromKnotCommand(context: ExtensionContext) {
    return commands.registerCommand("ink.runFromKnot", async (uri: Uri, knotName: string) => {
        const document =
            workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString()) ??
            (await workspace.openTextDocument(uri));

        const rootFolderSetting = getInkRootFolder(document);
        return await openWebview(
            context,
            rootFolderSetting,
            {
                name: path.basename(document.fileName),
                text: document.getText(),
                uri: document.uri,
            },
            knotName,
        );
    });
}

export function runProjectCommand(context: ExtensionContext) {
    return commands.registerCommand("ink.runProject", async () => {
        const config = workspace.getConfiguration("ink");
        const mainFileSetting = config.get<string>("mainFile");

        if (!mainFileSetting) {
            window.showErrorMessage(l10n.t("ink.mainFile is not set in settings."));
            return;
        }

        const editor = window.activeTextEditor;

        if (!editor) {
            window.showErrorMessage(l10n.t("No active editor found."));
            return;
        }

        const rootFolderSetting = getInkRootFolder(editor.document);

        // Risolvi percorso assoluto a partire da rootFolderSetting
        const mainFilePath = path.isAbsolute(mainFileSetting)
            ? mainFileSetting
            : path.join(rootFolderSetting, mainFileSetting);

        if (!fs.existsSync(mainFilePath)) {
            window.showErrorMessage(l10n.t("Main file not found: {0}", mainFilePath));
            return;
        }

        const text = fs.readFileSync(mainFilePath, "utf8");

        return await openWebview(context, rootFolderSetting, {
            name: path.basename(mainFilePath),
            text,
            uri: Uri.file(mainFilePath),
        });
    });
}

export async function openWebview(
    context: ExtensionContext,
    rootFolderSetting: string,
    file: {
        name: string;
        text: string;
        uri: Uri;
    },
    // When set, a `-> entryKnot` divert is prepended to the compiled source
    // (never written back to the file) so the preview starts from that knot
    // instead of the top of the file. See `ink.runFromKnot`.
    entryKnot?: string,
) {
    const { name, text, uri } = file;
    const withEntryKnot = (source: string) => (entryKnot ? `-> ${entryKnot}\n${source}` : source);

    const config = workspace.getConfiguration("ink");
    const engine = config.get<"Inky" | "pixi-vn">("engine", "Inky");
    const markup = config.get<string | null>("markup", null);

    let compiled: string | undefined;
    try {
        if (engine === "pixi-vn") {
            compiled = compilePixiVN(withEntryKnot(text), {
                LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
            });
        } else {
            compiled = compile(withEntryKnot(text), {
                LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
            }).ToJson();
        }
    } catch (err: any) {
        window.showErrorMessage(l10n.t("Ink compilation failed: {0}", err.message));
        return;
    }
    if (!compiled) {
        window.showErrorMessage(l10n.t("Ink compilation failed for an unknown reason."));
        return; // 🔴 do not open the preview
    }

    // 🔹 Get the file name
    const panelTitle = entryKnot ? l10n.t("{0} (Preview from {1})", name, entryKnot) : l10n.t("{0} (Preview)", name);

    // Open webview ONLY if there are no errors
    const panel = window.createWebviewPanel("inkPreview", panelTitle, ViewColumn.Beside, {
        enableScripts: true,
    });

    // Tab icon
    panel.iconPath = Uri.file(path.join(context.extensionPath, "resources/icon.png"));

    const scriptUri = panel.webview.asWebviewUri(Uri.file(path.join(context.extensionPath, "dist/webview/index.js")));
    const styleUri = panel.webview.asWebviewUri(Uri.file(path.join(context.extensionPath, "dist/webview/index.css")));

    // ✅ Pass the title to getWebviewHtml
    panel.webview.html = getWebviewHtml(scriptUri, styleUri, panelTitle);

    // Highlights the source line a runtime error was reported on. The `-> entryKnot`
    // divert prepended by withEntryKnot shifts every reported line down by one, so it
    // must be subtracted back out to map onto the real (unmodified) document.
    const lineOffset = entryKnot ? 1 : 0;
    const errorLineDecoration = window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new ThemeColor("inputValidation.errorBackground"),
        border: "1px solid",
        borderColor: new ThemeColor("inputValidation.errorBorder"),
        overviewRulerColor: new ThemeColor("editorError.foreground"),
        overviewRulerLane: OverviewRulerLane.Full,
    });

    const clearErrorHighlight = () => {
        for (const editor of window.visibleTextEditors) {
            if (editor.document.uri.toString() === uri.toString()) {
                editor.setDecorations(errorLineDecoration, []);
            }
        }
    };

    const getCurrentDocument = async () =>
        workspace.textDocuments.find((d) => d.uri.toString() === uri.toString()) ?? (await workspace.openTextDocument(uri));

    const highlightErrorLine = async (reportedLine: number) => {
        const line = reportedLine - lineOffset;
        if (line < 1) {
            clearErrorHighlight();
            return;
        }
        const doc = await getCurrentDocument();
        const lineIndex = Math.min(line - 1, doc.lineCount - 1);
        const range = doc.lineAt(lineIndex).range;
        const existingEditor = window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString());
        const editor =
            existingEditor ?? (await window.showTextDocument(doc, { viewColumn: ViewColumn.One, preserveFocus: true }));
        editor.setDecorations(errorLineDecoration, [new Range(range.start, range.end)]);
        editor.revealRange(range, TextEditorRevealType.InCenterIfOutsideViewport);
    };

    // ✅ Send the compiled JSON to the webview
    // 🔹 listen for messages from the webview
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.type === "log") {
            console.log("Log from webview:", message.message, message.data);
        }
        if (message.type === "runtime-error-line") {
            const choices: number[] = Array.isArray(message.choices) ? message.choices : [];
            const runtimeError =
                message.hasError && engine !== "pixi-vn"
                    ? getRuntimeError(withEntryKnot((await getCurrentDocument()).getText()), choices, {
                          LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
                      })
                    : undefined;
            if (runtimeError?.line !== undefined) {
                await highlightErrorLine(runtimeError.line);
            } else {
                clearErrorHighlight();
            }
        }
        if (message.type === "ready") {
            console.log("Webview is ready, sending compiled story.");
            let characters: string | undefined;
            if (engine === "pixi-vn") {
                const port = config.get<number>("port", 5173); // legge la porta dalle impostazioni
                try {
                    const res = await fetch(`http://localhost:${port}/pixi-vn/characters`);
                    if (res.ok) {
                        characters = await res.text();
                        console.log("Fetched Pixi-VN characters:", characters);
                    }
                } catch (_err) {}
            }
            panel.webview.postMessage({
                type: "compiled-story",
                engine: engine,
                data: compiled,
                characters: characters,
            });
            panel.webview.postMessage({
                type: "set-markup",
                data: markup,
            });
            panel.webview.postMessage({
                type: "set-locale",
                data: env.language,
            });
        }
    });

    // 🔹 Listen again to save events
    const saveListener = workspace.onDidSaveTextDocument((doc: TextDocument) => {
        if (doc.uri.toString() === uri.toString()) {
            const newText = doc.getText();
            try {
                const engine = config.get<"Inky" | "pixi-vn">("engine") || "Inky";
                let updatedCompiled: string | undefined;
                if (engine === "pixi-vn") {
                    updatedCompiled = compilePixiVN(withEntryKnot(newText), {
                        LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
                    });
                } else {
                    updatedCompiled = compile(withEntryKnot(newText), {
                        LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
                    }).ToJson();
                }

                panel.webview.postMessage({
                    type: "compiled-story",
                    engine: engine,
                    data: updatedCompiled,
                });
            } catch (err: any) {
                window.showErrorMessage(l10n.t("Ink recompilation failed: {0}", err.message));
            }
        }
    });

    // 🔹 Remove listener when the webview is closed
    panel.onDidDispose(() => {
        saveListener.dispose();
        clearErrorHighlight();
        errorLineDecoration.dispose();
    });
}

// 🔹 Added parameter `title`
function getWebviewHtml(scriptUri: Uri, styleUri: Uri, title: string): string {
    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="${styleUri}">
        <title>${title}</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
    </html>
  `;
}
