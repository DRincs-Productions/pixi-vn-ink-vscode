import * as path from "path";
import { commands, ExtensionContext, TextDocument, Uri, ViewColumn, window, workspace } from "vscode";
import { getInkRootFolder, loadInkFileContent } from "./utils/include-utility";
import { compile } from "./utils/ink-utility";
import { compilePixiVN } from "./utils/pixi-vn-utility";

export function openWebview(context: ExtensionContext) {
    return commands.registerCommand("ink.preview", async () => {
        const editor = window.activeTextEditor;

        if (!editor) {
            window.showErrorMessage("No active editor found.");
            return;
        }

        const document = editor.document;
        const config = workspace.getConfiguration("ink");
        const engine = config.get<"Inky" | "pixi-vn">("engine");
        const rootFolderSetting = getInkRootFolder(document);

        let compiled: string | void;
        try {
            if (engine === "pixi-vn") {
                compiled = compilePixiVN(document.getText(), {
                    LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
                }).ToJson();
            } else {
                compiled = compile(document.getText(), {
                    LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
                }).ToJson();
            }
        } catch (err: any) {
            window.showErrorMessage(`Ink compilation failed: ${err.message}`);
            return;
        }
        if (!compiled) {
            window.showErrorMessage("Ink compilation failed for an unknown reason.");
            return; // 🔴 non apriamo la preview
        }

        // Apri webview SOLO se non ci sono errori
        const panel = window.createWebviewPanel("inkPreview", "Ink Preview", ViewColumn.Beside, {
            enableScripts: true,
        });

        const scriptUri = panel.webview.asWebviewUri(
            Uri.file(path.join(context.extensionPath, "dist/webview/index.js"))
        );
        const styleUri = panel.webview.asWebviewUri(
            Uri.file(path.join(context.extensionPath, "dist/webview/index.css"))
        );

        panel.webview.html = getWebviewHtml(scriptUri, styleUri);

        // ✅ Passiamo il JSON compilato alla webview
        // 🔹 ascolta messaggi dalla webview
        panel.webview.onDidReceiveMessage((message) => {
            if (message.type === "ready") {
                console.log("Webview is ready, sending compiled story.");
                panel.webview.postMessage({
                    type: "compiled-story",
                    data: compiled,
                });
            }
        });

        // 🔹 Riascolta i salvataggi
        const saveListener = workspace.onDidSaveTextDocument((doc: TextDocument) => {
            if (doc.uri.toString() === document.uri.toString()) {
                try {
                    const updatedCompiled = compile(doc.getText(), {
                        LoadInkFileContents: (filename: string) =>
                            loadInkFileContent(filename, rootFolderSetting) || "",
                    }).ToJson();

                    panel.webview.postMessage({
                        type: "compiled-story",
                        data: updatedCompiled,
                    });
                } catch (err: any) {
                    window.showErrorMessage(`Ink recompilation failed: ${err.message}`);
                }
            }
        });

        // 🔹 Rimuovi listener quando chiudi la webview
        panel.onDidDispose(() => {
            saveListener.dispose();
        });
    });
}

function getWebviewHtml(scriptUri: Uri, styleUri: Uri): string {
    return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="${styleUri}">
        <title>Ink Preview</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="${scriptUri}"></script>
      </body>
    </html>
  `;
}
