/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface KittycordPreferencesImport {
    settings: Record<string, boolean | Record<string, { enabled: boolean; }>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

const booleanPreferences = [
    "useQuickCss", "useTestcordIcon", "hideThemeMarketplace", "hideSnippetMarketplace",
    "enableOnlineThemes", "enableReactDevtools", "mainWindowFrameless", "frameless",
    "transparent", "winCtrlQ", "disableMinSize", "nativeTitleBar"
] as const;

export function prepareKittycordPreferencesImport(input: unknown): KittycordPreferencesImport {
    if (!isRecord(input)) throw new Error("Expected a settings object or an exported settings backup.");
    const source = "settings" in input ? input.settings : input;
    if (!isRecord(source)) throw new Error("The backup does not contain a settings object.");

    const settings: KittycordPreferencesImport["settings"] = { autoUpdate: false };
    for (const key of booleanPreferences) {
        if (typeof source[key] === "boolean") settings[key] = source[key];
    }

    if (source.plugins !== undefined) {
        if (!isRecord(source.plugins)) throw new Error("Plugin preferences must be an object.");
        if (Object.keys(source.plugins).length > 5000) throw new Error("The backup contains too many plugin entries.");
        const plugins: Record<string, { enabled: boolean; }> = {};
        for (const [name, config] of Object.entries(source.plugins)) {
            if (["__proto__", "constructor", "prototype"].includes(name) || name.length > 200)
                throw new Error("The backup contains an invalid plugin identifier.");
            if (!isRecord(config)) throw new Error("Invalid preferences for a plugin entry.");
            if (typeof config.enabled === "boolean") plugins[name] = { enabled: config.enabled };
        }
        settings.plugins = plugins;
    }

    return { settings };
}
