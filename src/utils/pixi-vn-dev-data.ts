import { PIXIVN_DEV_API_ASSETS_MANIFEST, PIXIVN_DEV_API_CHARACTERS, PIXIVN_DEV_API_LABELS } from "@drincs/pixi-vn/vite";
import type { ExtensionContext } from "vscode";
import { workspace } from "vscode";

const ONE_MINUTE_MS = 60_000;
const FOUR_MINUTES_MS = 4 * ONE_MINUTE_MS;
const PERIODIC_INTERVAL_MS = 10 * ONE_MINUTE_MS;
const LABELS_QUICK_FETCH_TIMEOUT_MS = 300;
const LABELS_QUICK_FETCH_COOLDOWN_MS = 2_000;

/**
 * In-memory cache of the pixi-vn Vite dev-server data (characters, narration labels,
 * assets manifest), kept fresh by {@link schedulePixiVnDevDataPolling}. A failed fetch
 * (dev server not running, wrong port, ...) leaves the last known-good value in place
 * rather than clearing it.
 */
export const pixiVnDevData: {
    characters?: unknown;
    labels?: unknown;
    assetsManifest?: unknown;
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

        const [characters, labels, assetsManifest] = await Promise.all([
            fetchDevApi(port, PIXIVN_DEV_API_CHARACTERS),
            fetchDevApi(port, PIXIVN_DEV_API_LABELS),
            fetchDevApi(port, PIXIVN_DEV_API_ASSETS_MANIFEST),
        ]);

        if (characters !== undefined) pixiVnDevData.characters = characters;
        if (labels !== undefined) pixiVnDevData.labels = labels;
        if (assetsManifest !== undefined) pixiVnDevData.assetsManifest = assetsManifest;
    } finally {
        refreshInFlight = false;
    }
}

/**
 * Fetches characters/labels/assets-manifest from the pixi-vn Vite dev server immediately,
 * again after 1 and 4 minutes (the dev server may still be starting up), then every
 * {@link PERIODIC_INTERVAL_MS} afterwards, plus once each time an ink file is opened.
 */
export function schedulePixiVnDevDataPolling(context: ExtensionContext) {
    const timers = [
        setTimeout(() => void refreshPixiVnDevData(), ONE_MINUTE_MS),
        setTimeout(() => void refreshPixiVnDevData(), FOUR_MINUTES_MS),
    ];
    const interval = setInterval(() => void refreshPixiVnDevData(), PERIODIC_INTERVAL_MS);

    const openListener = workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId === "ink") {
            void refreshPixiVnDevData();
        }
    });

    void refreshPixiVnDevData();

    context.subscriptions.push(openListener, {
        dispose() {
            for (const timer of timers) clearTimeout(timer);
            clearInterval(interval);
        },
    });
}
