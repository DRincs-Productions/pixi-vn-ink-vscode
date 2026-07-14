import {
    INK_DEV_API_HASHTAG_COMMANDS,
    INK_DEV_API_INFO,
    INK_DEV_API_TEXT_REPLACES,
    type InkHashtagCommandInfo,
    type InkLibraryInfo,
    type InkTextReplaceInfo,
} from "@drincs/pixi-vn-ink/dev-api";
import { InkCompiler } from "@drincs/pixi-vn-ink/parser";
import { PIXIVN_DEV_API_ASSETS_MANIFEST, PIXIVN_DEV_API_CHARACTERS, PIXIVN_DEV_API_LABELS } from "@drincs/pixi-vn/vite";
import type { ExtensionContext } from "vscode";
import { l10n, window, workspace } from "vscode";

const ONE_MINUTE_MS = 60_000;
const FOUR_MINUTES_MS = 4 * ONE_MINUTE_MS;
const PERIODIC_INTERVAL_MS = 10 * ONE_MINUTE_MS;
const LABELS_QUICK_FETCH_TIMEOUT_MS = 300;
const LABELS_QUICK_FETCH_COOLDOWN_MS = 2_000;

// Oldest @drincs/pixi-vn-ink known to serve INK_DEV_API_INFO at all, and to support every
// feature this extension relies on — a dev server that answers with anything other than 404 for
// it, but reports an older version, is missing whatever that version's release actually added, so
// it's flagged the same way as a 404.
const MIN_SUPPORTED_INK_VERSION = "1.1.5";

// Used to validate an exported PixiVNJson against a schema even when no pixi-vn Vite dev server
// is reachable at all (so `INK_DEV_API_INFO`'s own `schemaUrl` can never be learned) — the latest
// published schema is still a reasonable, if slightly less version-precise, stand-in.
const PIXI_VN_PUBLIC_SCHEMA_FALLBACK_URL = "https://pixi-vn.com/schemas/latest/schema.json";

/**
 * In-memory cache of the pixi-vn Vite dev-server data (characters, narration labels, assets
 * manifest, registered hashtag commands / text-replace handlers), kept fresh by
 * {@link schedulePixiVnDevDataPolling}. A failed fetch (dev server not running, wrong port, ...)
 * leaves the last known-good value in place rather than clearing it.
 *
 * `inkLibraryInfo` and `inkJsonSchema` are the odd ones out: both are static per dev-server
 * instance (a library version and its matching JSON Schema never change while it's running), so
 * once either is actually obtained there is nothing to refresh — see
 * {@link refreshInkLibraryInfo}.
 */
export const pixiVnDevData: {
    characters?: unknown;
    labels?: unknown;
    assetsManifest?: unknown;
    hashtagCommands?: unknown;
    textReplaces?: unknown;
    inkLibraryInfo?: InkLibraryInfo;
    inkJsonSchema?: unknown;
} = {};

async function fetchDevApi(port: number, apiPath: string): Promise<unknown> {
    try {
        const res = await fetch(`http://localhost:${port}${apiPath}`);
        if (!res.ok) return undefined;
        return await res.json();
    } catch {
        return undefined;
    }
}

/** Numeric (non-lexicographic) `a.b.c` comparison — "1.10.0" must not read as older than "1.1.5". */
export function isVersionOlderThan(version: string, minVersion: string): boolean {
    const a = version.split(".").map(Number);
    const b = minVersion.split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        if (diff !== 0) return diff < 0;
    }
    return false;
}

let inkVersionWarningShown = false;

function warnOutdatedInkVersion(): void {
    if (inkVersionWarningShown) return;
    inkVersionWarningShown = true;
    window.showWarningMessage(
        l10n.t(
            "The running pixi-vn dev server uses a version of @drincs/pixi-vn-ink older than {0}, which may not support all of this extension's features. Update it to {0} or later for full support.",
            MIN_SUPPORTED_INK_VERSION,
        ),
    );
}

let inkLibraryInfoResolved = false;
let inkJsonSchemaResolved = false;

/**
 * Fetches the latest publicly published PixiVNJson schema as a stand-in for a `schemaUrl` this
 * extension has no way to learn (no dev server reachable at all, or one too old to serve
 * `INK_DEV_API_INFO`). Never overrides a schema already obtained from a real dev server's own
 * `schemaUrl` ({@link inkJsonSchemaResolved}) — that one is preferred whenever it's available, so
 * this is only ever a fallback for as long as it stays unavailable.
 */
async function fetchPublicSchemaFallback(): Promise<void> {
    if (inkJsonSchemaResolved || pixiVnDevData.inkJsonSchema !== undefined) return;
    try {
        const res = await fetch(PIXI_VN_PUBLIC_SCHEMA_FALLBACK_URL);
        if (res.ok) {
            pixiVnDevData.inkJsonSchema = await res.json();
        }
    } catch {
        // Public schema host unreachable too — try again on the next poll.
    }
}

/**
 * One-shot (not periodic) fetch of `INK_DEV_API_INFO` and, once that's known, the JSON Schema
 * it points to — both are static for the lifetime of the running dev server, so once actually
 * obtained there is nothing to refresh and this becomes a no-op.
 *
 * Unlike the rest of {@link refreshPixiVnDevData}, a *reachable* dev server that answers with
 * anything other than a successful response for `INK_DEV_API_INFO` means an @drincs/pixi-vn-ink
 * old enough to not serve that endpoint at all — that's flagged with
 * {@link warnOutdatedInkVersion} (it may simply not support every feature this extension expects)
 * and never retried (an old server won't grow the endpoint while it keeps running). An
 * *unreachable* dev server (connection refused, not started yet, ...) isn't evidence of anything:
 * it's silently retried on the normal schedule, same as the rest. Either way, since there's no
 * telling *when* (or if) a dev server will become reachable/support this endpoint, the JSON
 * Schema itself falls back to {@link fetchPublicSchemaFallback} so schema validation still works
 * without one.
 */
async function refreshInkLibraryInfo(port: number): Promise<void> {
    if (!inkLibraryInfoResolved) {
        let res: Response;
        try {
            res = await fetch(`http://localhost:${port}${INK_DEV_API_INFO}`);
        } catch {
            await fetchPublicSchemaFallback();
            return; // Dev server unreachable — not evidence of anything, retry on the next poll.
        }

        // A dev server old enough to not have this route can still answer 200 for it (e.g. Vite's
        // own SPA "index.html" fallback for an unmatched path) with something that isn't real
        // InkLibraryInfo JSON — treat that exactly like an explicit 404 below: an outdated
        // @drincs/pixi-vn-ink, warn once, and never ask again.
        let info: InkLibraryInfo | undefined;
        if (res.ok) {
            try {
                const parsed = (await res.json()) as InkLibraryInfo;
                if (typeof parsed?.version === "string") info = parsed;
            } catch {
                // Not real InkLibraryInfo JSON — falls through to the "outdated" branch below.
            }
        }

        if (!info) {
            inkLibraryInfoResolved = true;
            warnOutdatedInkVersion();
            await fetchPublicSchemaFallback();
            return;
        }

        pixiVnDevData.inkLibraryInfo = info;
        inkLibraryInfoResolved = true;

        if (isVersionOlderThan(info.version, MIN_SUPPORTED_INK_VERSION)) {
            warnOutdatedInkVersion();
        }
    } else if (!pixiVnDevData.inkLibraryInfo) {
        // Already determined (in a previous poll) that this dev server won't ever provide
        // INK_DEV_API_INFO (outdated version / malformed response) — keep retrying the public
        // fallback on every poll, since `inkLibraryInfoResolved` alone would otherwise mean this
        // function returns above without ever giving the fallback a second try.
        await fetchPublicSchemaFallback();
    }

    const schemaUrl = pixiVnDevData.inkLibraryInfo?.schemaUrl;
    if (!inkJsonSchemaResolved && schemaUrl) {
        try {
            const schemaRes = await fetch(schemaUrl);
            if (schemaRes.ok) {
                pixiVnDevData.inkJsonSchema = await schemaRes.json();
                inkJsonSchemaResolved = true;
            }
        } catch {
            // Schema host unreachable, or its body wasn't valid JSON — try again on the next poll.
        }
    }
}

// pixi-vn-ink's compiler uses "_|_" as an internal separator for synthetic label
// names it generates itself (flattened stitches, gathers, ...) — never something a
// user would type as a divert target, so these are filtered out of suggestions.
const SYNTHETIC_LABEL_MARKER = "_|_";

/**
 * Normalizes a dev-server response into a deduplicated list of ids. The dev server's
 * exact wire format isn't part of its public type surface, so this tolerates both a
 * bare `string[]` and an array of `{ id }` / `{ name }` objects.
 */
function normalizeDevApiIds(data: unknown): string[] {
    if (!Array.isArray(data)) return [];

    const ids = new Set<string>();
    for (const entry of data) {
        if (typeof entry === "string") {
            ids.add(entry);
        } else if (entry && typeof entry === "object") {
            const id = (entry as { id?: unknown }).id ?? (entry as { name?: unknown }).name;
            if (typeof id === "string") ids.add(id);
        }
    }
    return [...ids];
}

/**
 * Normalizes the cached pixi-vn labels response into a deduplicated list of label names.
 */
export function getPixiVnDevLabelNames(): string[] {
    return normalizeDevApiIds(pixiVnDevData.labels).filter((name) => !name.includes(SYNTHETIC_LABEL_MARKER));
}

/**
 * Normalizes the cached pixi-vn characters response into a deduplicated list of character ids.
 */
export function getPixiVnDevCharacterIds(): string[] {
    return normalizeDevApiIds(pixiVnDevData.characters);
}

/**
 * Returns the registered hashtag-command handlers, tolerating anything malformed in the cached
 * response (the dev server's wire format for this endpoint isn't part of its typed surface).
 */
export function getPixiVnDevHashtagCommands(): InkHashtagCommandInfo[] {
    if (!Array.isArray(pixiVnDevData.hashtagCommands)) return [];
    return pixiVnDevData.hashtagCommands.filter(
        (entry): entry is InkHashtagCommandInfo =>
            Boolean(entry) && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string",
    );
}

/**
 * Compiles (and caches, by reference — the cache is only ever replaced wholesale by
 * {@link refreshInkLibraryInfo}/{@link fetchPublicSchemaFallback}, never mutated in place) an Ajv
 * validator for the currently cached PixiVNJson schema, or `undefined` when none has been
 * obtained yet (no reachable dev server and the public fallback also failed).
 */
let cachedSchemaValidator: { schema: unknown; validator: ReturnType<typeof InkCompiler.getSchemaValidator> } | undefined;

export function getPixiVnJsonSchemaValidator(): ReturnType<typeof InkCompiler.getSchemaValidator> | undefined {
    const schema = pixiVnDevData.inkJsonSchema;
    if (!schema || typeof schema !== "object") return undefined;

    if (cachedSchemaValidator?.schema === schema) return cachedSchemaValidator.validator;
    try {
        const validator = InkCompiler.getSchemaValidator(schema);
        cachedSchemaValidator = { schema, validator };
        return validator;
    } catch {
        return undefined;
    }
}

/**
 * Returns the registered text-replace handlers, tolerating anything malformed in the cached
 * response (the dev server's wire format for this endpoint isn't part of its typed surface).
 */
export function getPixiVnDevTextReplaces(): InkTextReplaceInfo[] {
    if (!Array.isArray(pixiVnDevData.textReplaces)) return [];
    return pixiVnDevData.textReplaces.filter(
        (entry): entry is InkTextReplaceInfo =>
            Boolean(entry) && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string",
    );
}

let lastLabelsQuickFetchAt = 0;

/**
 * Best-effort, short-timeout refresh of just the labels endpoint, meant to be
 * awaited right before showing knot/label completions so they're as fresh as
 * possible without noticeably delaying typing. Throttled so that completions
 * requested in quick succession (e.g. while typing) don't each trigger their
 * own request against the dev server.
 */
export async function ensureFreshPixiVnLabels(): Promise<void> {
    const config = workspace.getConfiguration("ink");
    if (config.get<"Inky" | "pixi-vn">("engine", "Inky") !== "pixi-vn") return;

    const now = Date.now();
    if (now - lastLabelsQuickFetchAt < LABELS_QUICK_FETCH_COOLDOWN_MS) return;
    lastLabelsQuickFetchAt = now;

    const port = config.get<number>("port", 5173);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LABELS_QUICK_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(`http://localhost:${port}${PIXIVN_DEV_API_LABELS}`, { signal: controller.signal });
        if (res.ok) pixiVnDevData.labels = await res.json();
    } catch {
        // Dev server unreachable or too slow within the timeout — keep the last known-good cache.
    } finally {
        clearTimeout(timeout);
    }
}

let refreshInFlight = false;

export async function refreshPixiVnDevData(): Promise<void> {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
        const config = workspace.getConfiguration("ink");
        if (config.get<"Inky" | "pixi-vn">("engine", "Inky") !== "pixi-vn") return;
        const port = config.get<number>("port", 5173);

        const [characters, labels, assetsManifest, hashtagCommands, textReplaces] = await Promise.all([
            fetchDevApi(port, PIXIVN_DEV_API_CHARACTERS),
            fetchDevApi(port, PIXIVN_DEV_API_LABELS),
            fetchDevApi(port, PIXIVN_DEV_API_ASSETS_MANIFEST),
            fetchDevApi(port, INK_DEV_API_HASHTAG_COMMANDS),
            fetchDevApi(port, INK_DEV_API_TEXT_REPLACES),
            refreshInkLibraryInfo(port),
        ]);

        if (characters !== undefined) pixiVnDevData.characters = characters;
        if (labels !== undefined) pixiVnDevData.labels = labels;
        if (assetsManifest !== undefined) pixiVnDevData.assetsManifest = assetsManifest;
        if (hashtagCommands !== undefined) pixiVnDevData.hashtagCommands = hashtagCommands;
        if (textReplaces !== undefined) pixiVnDevData.textReplaces = textReplaces;
    } finally {
        refreshInFlight = false;
    }
}

/**
 * Fetches characters/labels/assets-manifest/hashtag-commands/text-replaces from the pixi-vn Vite
 * dev server immediately, again after 1 and 4 minutes (the dev server may still be starting up),
 * then every {@link PERIODIC_INTERVAL_MS} afterwards, plus once each time an ink file is opened.
 *
 * `onUpdated`, when given, is called after every poll (successful or not) — semantic tokens and
 * hover both read straight from {@link pixiVnDevData} on every request, so they already reflect
 * fresh data on their own; what they *don't* get for free is a nudge to actually re-run. Without
 * one, a document opened (and its semantic tokens computed, e.g. with no hashtag commands known
 * yet) before the first successful poll keeps showing that first, now-stale result until VS Code
 * decides to re-request tokens for some unrelated reason (e.g. the next edit) — the same staleness
 * would affect diagnostics. Called unconditionally rather than only on an actual data change: a
 * poll only happens a handful of times per file open plus every 10 minutes, so re-rendering even
 * when nothing changed is cheap, and detecting "did anything change" would need a deep comparison
 * for little benefit.
 */
export function schedulePixiVnDevDataPolling(context: ExtensionContext, onUpdated?: () => void) {
    const poll = async () => {
        await refreshPixiVnDevData();
        onUpdated?.();
    };

    const timers = [setTimeout(() => void poll(), ONE_MINUTE_MS), setTimeout(() => void poll(), FOUR_MINUTES_MS)];
    const interval = setInterval(() => void poll(), PERIODIC_INTERVAL_MS);

    const openListener = workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "ink") {
            void poll();
        }
    });

    void poll();

    context.subscriptions.push(openListener, {
        dispose() {
            for (const timer of timers) clearTimeout(timer);
            clearInterval(interval);
        },
    });
}
