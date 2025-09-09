import * as path from "path";
import { commands, ExtensionContext, Uri, ViewColumn, window } from "vscode";
import { getInkRootFolder, loadInkFileContent } from "./utils/include-utility";
import { compile } from "./utils/ink-utility";

export function openWebview(context: ExtensionContext) {
    return commands.registerCommand("ink.preview", async () => {
        const editor = window.activeTextEditor;

        if (!editor) {
            window.showErrorMessage("No active editor found.");
            return;
        }
        const rootFolderSetting = getInkRootFolder(editor.document);

        const document = editor.document;
        const text = document.getText();

        let compiled: string | void;
        try {
            compiled = compile(text, {
                LoadInkFileContents: (filename: string) => loadInkFileContent(filename, rootFolderSetting) || "",
            }).ToJson();
        } catch (err: any) {
            window.showErrorMessage(`Ink compilation failed: ${err.message}`);
            return; // 🔴 non apriamo la preview
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
        panel.webview.postMessage({
            type: "compiled-story",
            data: compiled,
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
