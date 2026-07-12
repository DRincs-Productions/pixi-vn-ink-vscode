import { PIXIVN_DEV_API_ASSETS_MANIFEST, PIXIVN_DEV_API_CHARACTERS, PIXIVN_DEV_API_LABELS } from "@drincs/pixi-vn/vite";
import type { ExtensionContext } from "vscode";
import { workspace } from "vscode";

const ONE_MINUTE_MS = 60_000;
const FOUR_MINUTES_MS = 4 * ONE_MINUTE_MS;
const PERIODIC_INTERVAL_MS = 10 * ONE_MINUTE_MS;

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
