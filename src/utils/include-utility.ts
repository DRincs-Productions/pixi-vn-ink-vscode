import * as fs from "fs";
import * as path from "path";
import InkFile from "../types/InkFile";

/**
 * Recursively loads a file and all its included files.
 * @param entryPath Path of the starting .ink file
 * @param rootFolder Base folder for relative includes
 * @param visited Prevents infinite loops on cyclic includes
 */
export function loadInkFiles(entryPath: string, rootFolder: string, visited: Set<string> = new Set()): InkFile[] {
    const result: InkFile[] = [];

    // Resolve entry path against rootFolder if relative
    const normalizedPath = path.isAbsolute(entryPath) ? path.resolve(entryPath) : path.resolve(rootFolder, entryPath);

    // Avoid infinite recursion
    if (visited.has(normalizedPath)) {
        return result;
    }
    visited.add(normalizedPath);

    if (!fs.existsSync(normalizedPath)) {
        return result;
    }

    const content = fs.readFileSync(normalizedPath, "utf-8");
    result.push({ path: normalizedPath, content });

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const match = line.match(/^\s*INCLUDE\s+(.+)$/);
        if (match) {
            const includePath = match[1].trim();
            result.push(...loadInkFiles(includePath, rootFolder, visited));
        }
    }

    return result;
}

/**
 * Loads all .ink files from a folder (recursively).
 * @param folderPath Path of the folder to scan
 * @param rootFolder Base folder for resolving relative folderPath
 */
export function loadInkFolder(folderPath: string, rootFolder: string): InkFile[] {
    const result: InkFile[] = [];

    // Resolve folder path against rootFolder if relative
    const resolvedFolder = path.isAbsolute(folderPath)
        ? path.resolve(folderPath)
        : path.resolve(rootFolder, folderPath);

    function scanDir(dir: string) {
        if (!fs.existsSync(dir)) {
            return;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (entry.isFile() && path.extname(entry.name) === ".ink") {
                const content = fs.readFileSync(fullPath, "utf-8");
                result.push({ path: fullPath, content });
            }
        }
    }

    scanDir(resolvedFolder);
    return result;
}
