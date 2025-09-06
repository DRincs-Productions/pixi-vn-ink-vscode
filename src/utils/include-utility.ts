import * as fs from "fs";
import * as path from "path";
import InkFile from "../types/InkFile";

export function loadInkFiles(entryPath: string, visited: Set<string> = new Set()): InkFile[] {
    const result: InkFile[] = [];
    const normalizedPath = path.resolve(entryPath);

    // avoid infinite loops in case of cyclic includes
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
            const fullPath = path.isAbsolute(includePath)
                ? includePath
                : path.join(path.dirname(normalizedPath), includePath);

            result.push(...loadInkFiles(fullPath, visited));
        }
    }

    return result;
}

export function loadInkFolder(folderPath: string): InkFile[] {
    const result: InkFile[] = [];

    function scanDir(dir: string) {
        if (!fs.existsSync(dir)) {
            return;
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                scanDir(fullPath); // recurse into subfolder
            } else if (entry.isFile() && path.extname(entry.name) === ".ink") {
                const content = fs.readFileSync(fullPath, "utf-8");
                result.push({ path: fullPath, content });
            }
        }
    }

    scanDir(path.resolve(folderPath));
    return result;
}
