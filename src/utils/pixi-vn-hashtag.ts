import { InkCompiler } from "@drincs/pixi-vn-ink/parser";
import type { InkHashtagCommandInfo } from "@drincs/pixi-vn-ink/parser";

/**
 * A pixi-vn hashtag-command marker found on a single ink source line — mirrors
 * `@drincs/pixi-vn-ink`'s own extraction rule (`InkCompiler.getUnknownHashtagCommands`'s internal
 * line scan): a `#` only starts a *hashtag command* (as opposed to an ordinary ink tag, which can
 * appear anywhere) when it's the first thing on the line (after optional leading whitespace), or
 * immediately follows a `<>` glue marker earlier on the same line — everything after it, to the
 * end of the line, is the command's raw text. Consequently at most one hashtag command can ever
 * be recognized per line, no matter how many literal `#` characters it contains.
 */
export interface HashtagSegment {
    /** Raw command text, trimmed — matches `HashtagCommandOccurrence.command`. */
    command: string;
    /** Offset of the marker `#` itself. */
    start: number;
    /** End of the trimmed command text (exclusive). */
    end: number;
}

// Mirrors pixi-vn-ink's own `MC` regex used by `getUnknownHashtagCommands`/`getHashtagKeySchemaIssues`
// to extract hashtag-command occurrences from raw source, one line at a time.
const HASHTAG_COMMAND_MARKER_REGEX = /(?:^|<>)\s*#\s*([^\r\n]+)/;

/**
 * Finds the hashtag-command marker on a single ink source `line`, or `undefined` when the line
 * has no `#` in a position pixi-vn's HashtagCommands system would ever recognize (an ordinary
 * inline ink tag, with no preceding `<>`, is invisible to this — same as the real library). Not
 * comment-aware — `InkCompiler.getUnknownHashtagCommands`'s own line scan isn't either, scanning
 * raw source lines directly with no `//`/`/* *\/` stripping, so neither is this: it exists purely
 * to re-locate the exact range of an occurrence the real function already reported, and must stay
 * consistent with it (a mismatch here would make a diagnostic fail to find its own range).
 */
export function findHashtagSegment(line: string): HashtagSegment | undefined {
    const match = HASHTAG_COMMAND_MARKER_REGEX.exec(line);
    if (!match) return undefined;

    const raw = match[1];
    const command = raw.trim();
    if (!command) return undefined;

    const hashIndex = line.indexOf("#", match.index);
    const contentStart = line.length - raw.length;
    return { command, start: hashIndex, end: contentStart + raw.trimEnd().length };
}

const MAX_COMMAND_LENGTH_IN_MESSAGES = 30;

/**
 * Shortens a raw hashtag-command's text for embedding in a diagnostic message — a `# show
 * imagecontainer ...` command listing every layer/animation argument can run to a full line's
 * worth of text, which would otherwise dominate the Problems panel entry instead of the actual
 * warning. The full, untruncated text is still what's used to locate the underline range (see
 * {@link locateHashtagSegment}) — only the text embedded in a message is shortened.
 */
export function truncateHashtagCommandForMessage(command: string): string {
    return command.length > MAX_COMMAND_LENGTH_IN_MESSAGES
        ? `${command.slice(0, MAX_COMMAND_LENGTH_IN_MESSAGES)}...`
        : command;
}

/**
 * Locates the exact range of a specific hashtag-command occurrence within `line` — a thin
 * `command`-matching wrapper around {@link findHashtagSegment} (which, since at most one
 * occurrence can exist per line, never needs an "already claimed" set the way a multi-occurrence
 * search would).
 */
export function locateHashtagSegment(line: string, command: string): HashtagSegment | undefined {
    const segment = findHashtagSegment(line);
    return segment?.command === command ? segment : undefined;
}

/**
 * Returns the first registered hashtag command that recognizes `command`, or `undefined` if none
 * does — used to show a recognized command's own name/description in a hover, once
 * {@link buildUnknownHashtagCommandIndex} (also backed by this same real function) has already
 * established that *some* registered handler matches it.
 *
 * Deliberately reuses `InkCompiler.getUnknownHashtagCommands` itself — probing one candidate at a
 * time against a synthetic one-line `# <command>` source and taking the first that comes back
 * empty (recognized) — rather than re-validating `command`'s `InkValidationInfo` locally. A
 * `"zod"` validation's `schema` is produced by zod's own `toJSONSchema()`, which for a tuple
 * emits the 2020-12 `prefixItems` keyword; `InkCompiler.getSchemaValidator`/`validateAgainstJsonSchema`
 * compile it with a plain (draft-07) Ajv instance that doesn't recognize `prefixItems` at all and
 * silently ignores it (non-strict mode), so re-validating through that public API here would make
 * *any* tokens array match the first such command in the list — this was tried and confirmed
 * broken against pixi-vn-ink's own built-in commands. `getUnknownHashtagCommands`'s internal
 * matching isn't affected: it uses its own hand-rolled schema-subset check, not Ajv.
 */
export function findMatchingHashtagCommand(
    command: string,
    commands: readonly InkHashtagCommandInfo[],
): InkHashtagCommandInfo | undefined {
    const probeSource = `# ${command}`;
    for (const candidate of commands) {
        if (InkCompiler.getUnknownHashtagCommands(probeSource, [candidate]).length === 0) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Maps each 1-based line number to the set of raw command texts on that line that
 * `InkCompiler.getUnknownHashtagCommands` — the same check `vitePluginInk`'s
 * `logUnknownHashtagCommands` runs at build/dev time — couldn't match to any registered handler.
 * The authoritative source for "recognized vs. unknown", reused by both the unknown-command
 * diagnostic and the semantic-token/hover recognized-command coloring so they never disagree.
 */
export function buildUnknownHashtagCommandIndex(
    documentText: string,
    commands: readonly InkHashtagCommandInfo[],
): Map<number, Set<string>> {
    const index = new Map<number, Set<string>>();
    for (const occurrence of InkCompiler.getUnknownHashtagCommands(documentText, [...commands])) {
        let commandsOnLine = index.get(occurrence.line);
        if (!commandsOnLine) {
            commandsOnLine = new Set();
            index.set(occurrence.line, commandsOnLine);
        }
        commandsOnLine.add(occurrence.command);
    }
    return index;
}
