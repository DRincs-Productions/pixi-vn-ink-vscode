import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { FileType, TextDocument, Uri, workspace } from "vscode";
import InkFile from "../types/InkFile";

/**
 * Recursively loads a file and all its included files.
 * @param entryPath Path of the starting .ink file
 * @param rootFolder Base folder for relative includes
 * @param visited Prevents infinite loops on cyclic includes
 */
export async function loadInkFiles(
    entryPath: string,
    rootFolder: string,
    visited: Set<string> = new Set()
): Promise<InkFile[]> {
    const result: InkFile[] = [];

    const resolvedPath = path.isAbsolute(entryPath) ? path.resolve(entryPath) : path.resolve(rootFolder, entryPath);

    if (visited.has(resolvedPath)) {
        return result; // Prevent infinite loops
    }
    visited.add(resolvedPath);

    try {
        const fileUri = Uri.file(resolvedPath);
        const contentBytes = await workspace.fs.readFile(fileUri);
        const content = new TextDecoder("utf-8").decode(contentBytes);

        result.push({ path: resolvedPath, content });

        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            const match = line.match(/^\s*INCLUDE\s+(.+)$/);
            if (match) {
                const includePath = match[1].trim();
                const includedFiles = await loadInkFiles(includePath, rootFolder, visited);
                result.push(...includedFiles);
            }
        }
    } catch {
        // If file does not exist, just skip
    }

    return result;
}

/**
 * Loads all .ink files from a folder (recursively).
 * @param folderPath Path of the folder to scan
 * @param rootFolder Base folder for resolving relative folderPath
 */
export async function loadInkFolder(folderPath: string, rootFolder: string): Promise<InkFile[]> {
    const result: InkFile[] = [];

    const resolvedFolder = path.isAbsolute(folderPath)
        ? path.resolve(folderPath)
        : path.resolve(rootFolder, folderPath);

    async function scanDir(dir: string) {
        try {
            const dirUri = Uri.file(dir);
            const entries = await workspace.fs.readDirectory(dirUri);

            for (const [name, type] of entries) {
                const fullPath = path.join(dir, name);
                if (type === FileType.Directory) {
                    await scanDir(fullPath);
                } else if (type === FileType.File && path.extname(name) === ".ink") {
                    try {
                        const fileUri = Uri.file(fullPath);
                        const contentBytes = await workspace.fs.readFile(fileUri);
                        const content = new TextDecoder("utf-8").decode(contentBytes);
                        result.push({ path: fullPath, content });
                    } catch {
                        // Skip unreadable files
                    }
                }
            }
        } catch {
            // Skip if dir does not exist
        }
    }

    await scanDir(resolvedFolder);
    return result;
}

/**
 * Reads the content of a .ink file synchronously.
 * @param filePath Path of the file (relative or absolute)
 * @param rootFolder Base folder for resolving relative paths
 * @returns File content as string, or null if not found
 */
export function loadInkFileContent(filePath: string, rootFolder: string): string | null {
    const resolvedPath = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(rootFolder, filePath);

    if (!existsSync(resolvedPath)) {
        return null;
    }

    return readFileSync(resolvedPath, "utf-8");
}

export function getInkRootFolder(document: TextDocument): string {
    const workspaceRoot = workspace.getWorkspaceFolder(document.uri)?.uri.fsPath || "";

    // Leggo la configurazione "ink" dal settings.json
    const config = workspace.getConfiguration("ink", document.uri);
    const rootFolderSetting: string = config.get("rootFolder") || "";

    // Se rootFolder è impostato → risolvo rispetto alla workspaceRoot
    return rootFolderSetting ? path.resolve(workspaceRoot, rootFolderSetting) : workspaceRoot;
}
