/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * KittenCord settings navigation. The owner asked for a detailed sidebar (2026-11-04): every area has its own
 * entry and page, ordered by how often it is used. Pages keep the sidebar keys they had before the redesign,
 * so older deep links and saved sidebar choices land on the same content.
 */
export const kittenPages = {
    home: { key: "testcord_main", title: "KittenCord", segments: [] },
    plugins: { key: "testcord_plugins", title: "Plugins", segments: ["installed", "local", "studio"] },
    themes: { key: "testcord_themes", title: "Themes", segments: ["installed", "library", "snippets"] },
    quickcss: { key: "kittycord_quickcss", title: "QuickCSS", segments: [] },
    presets: { key: "kittycord_presets", title: "Presets", segments: [] },
    badges: { key: "kittycord_badges", title: "Badges", segments: [] },
    profiles: { key: "kittycord_profiles", title: "Profiles & Rules", segments: [] },
    backup: { key: "kittycord_backups", title: "Backup & Sync", segments: ["backup", "cloud"] },
    privacy: { key: "testcord_privacy_security", title: "Privacy & Security", segments: ["privacy", "security"] },
    health: { key: "kittycord_doctor", title: "Health", segments: [] },
    performance: { key: "kittycord_performance", title: "Performance", segments: [] },
    updates: { key: "testcord_changelog", title: "Updates", segments: [] },
    about: { key: "kittycord_system", title: "About", segments: [] },
} as const satisfies Record<string, { key: string; title: string; segments: readonly string[]; }>;

export type KittenPageId = keyof typeof kittenPages;
export type KittenSegment<P extends KittenPageId> = typeof kittenPages[P]["segments"][number];
export interface KittenRoute { page: KittenPageId; segment?: string; }

export const kittenPageOrder = ["home", "plugins", "themes", "quickcss", "presets", "badges", "profiles", "backup", "privacy", "health", "performance", "updates", "about"] as const satisfies readonly KittenPageId[];

/** Keys that no longer have their own entry, and where their content lives now. */
export const legacyRoutes: Readonly<Record<string, KittenRoute>> = {
    kittycord_account: { page: "profiles" },
    testcord_updater: { page: "updates" },
    testcord_backup_restore: { page: "backup", segment: "backup" },
    testcord_cloud: { page: "backup", segment: "cloud" },
    etestcord_cloud: { page: "backup", segment: "cloud" },
    kittycord_notifications: { page: "home" },
    testcord_patch_helper: { page: "plugins", segment: "studio" },
    equicord_theme_library: { page: "themes", segment: "library" },
    // The Theme Market page was removed (owner, 2026-11-04); themes are browsed in Themes > Theme Library.
    kittycord_marketplace: { page: "themes", segment: "library" },
    // The Plugin Market page was removed too (owner, 2026-11-04); plugins live in Plugins.
    kittycord_plugin_market: { page: "plugins", segment: "installed" },
    // Studio moved into Plugins as a tab next to Installed and Local (owner, 2026-11-04).
    kittycord_workshop: { page: "plugins", segment: "studio" },
};

/** Old in-page tab ids and tool shortcuts to their place. */
export const legacyTools: Readonly<Record<string, KittenRoute>> = {
    manager: { page: "plugins", segment: "installed" },
    marketplace: { page: "plugins", segment: "installed" },
    packages: { page: "plugins", segment: "local" },
    safeinstall: { page: "privacy", segment: "security" },
    privacy: { page: "privacy", segment: "privacy" },
    themes: { page: "themes" },
    visualmarket: { page: "themes", segment: "library" },
    presets: { page: "presets" },
    doctor: { page: "health" },
    performance: { page: "performance" },
    changelog: { page: "updates" },
    updater: { page: "updates" },
    about: { page: "about" },
    backup: { page: "backup", segment: "backup" },
    workshop: { page: "plugins", segment: "studio" },
    notifications: { page: "home" },
};

const pageByKey = new Map<string, KittenPageId>(Object.entries(kittenPages).map(([id, page]) => [page.key, id as KittenPageId]));

export function resolveSettingsRoute(key: string): KittenRoute | undefined {
    const base = key.endsWith("_panel") ? key.slice(0, -"_panel".length) : key;
    const page = pageByKey.get(base);
    return page ? { page } : legacyRoutes[base];
}

export function segmentOf<P extends KittenPageId>(page: P, segment: string | undefined): KittenSegment<P> | undefined {
    return segment && (kittenPages[page].segments as readonly string[]).includes(segment) ? segment as KittenSegment<P> : undefined;
}

/** Maps stored sidebar keys (order, visibility, pins) to current keys, keeping unknown custom entries. */
export function migrateTabKeys(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const result: string[] = [];
    for (const key of value) {
        if (typeof key !== "string") continue;
        const route = legacyRoutes[key];
        const next = route ? kittenPages[route.page].key : key;
        if (!result.includes(next)) result.push(next);
    }
    return result;
}

export function migrateTabGroups(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, string> = {};
    for (const [child, parent] of Object.entries(value)) {
        if (typeof parent !== "string") continue;
        const [from, to] = migrateTabKeys([child, parent]);
        if (to && !(from in result)) result[from] = to;
    }
    return result;
}

export function normalizeTabGroups(value: unknown, validKeys: readonly string[]): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const valid = new Set(validKeys.filter(key => key !== kittenPages.home.key));
    const pairs = Object.entries(value).filter((pair): pair is [string, string] => valid.has(pair[0]) && typeof pair[1] === "string" && valid.has(pair[1]) && pair[0] !== pair[1]);
    const parents = new Set(pairs.map(([, parent]) => parent));
    return Object.fromEntries(pairs.filter(([child]) => !parents.has(child)));
}
