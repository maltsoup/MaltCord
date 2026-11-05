/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type SettingsBackupType = "all" | "plugins" | "css" | "datastore";
export interface SettingsBackup { settings?: Record<string, unknown>; quickCss?: string; dataStore?: [IDBValidKey, unknown][]; }
const credentials = /^(?:(?:access|refresh|auth|discord|bot)[_-]?)?tokens?$|^(?:client[_-]?secret|password|api[_-]?key|authorization|cookies?|session[_-]?cookie|credentials?)$/i;
export function backupKeyAllowed(key: IDBValidKey) { return typeof key !== "string" || !key.split(/[.:/_-]/).some(part => credentials.test(part)) && !/^(?:discord|cloud|oauth|auth).*?(?:token|credentials)$/i.test(key); }

export function backupObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

export function backupWithoutCredentials(value: unknown, depth = 0): unknown {
    if (depth > 80) throw Error("Backup nesting exceeds its limit.");
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(item => backupWithoutCredentials(item, depth + 1));
    if (!backupObject(value)) return value;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (["__proto__", "prototype", "constructor"].includes(key)) throw Error("Backup contains an unsupported property.");
        if (!credentials.test(key)) result[key] = backupWithoutCredentials(item, depth + 1);
    }
    return result;
}

function validKey(value: unknown, depth = 0): value is IDBValidKey {
    return typeof value === "string" || typeof value === "number" && Number.isFinite(value) || Array.isArray(value) && depth < 20 && value.every(item => validKey(item, depth + 1));
}

export function parseSettingsBackup(input: unknown, type: SettingsBackupType, cloud = false): SettingsBackup {
    let parsed: unknown = input;
    if (typeof input === "string") {
        if (new TextEncoder().encode(input).length > 64 * 1024 * 1024) throw Error("Backup exceeds 64 MiB. Import separate sections instead.");
        try { parsed = JSON.parse(input); } catch { throw Error("Use a valid JSON backup."); }
    }
    const data = backupWithoutCredentials(parsed);
    if (!backupObject(data)) throw Error("Use a settings backup object.");
    const result: SettingsBackup = {};
    if (data.settings !== undefined) {
        if (!backupObject(data.settings) || data.settings.plugins !== undefined && !backupObject(data.settings.plugins)) throw Error("Plugin settings must be an object.");
        if (backupObject(data.settings.plugins)) for (const value of Object.values(data.settings.plugins)) {
            if (!backupObject(value) || value.enabled !== undefined && typeof value.enabled !== "boolean") throw Error("Plugin entries require settings with boolean enabled selections.");
        }
        result.settings = data.settings;
    }
    if (data.quickCss !== undefined) {
        if (typeof data.quickCss !== "string") throw Error("QuickCSS must contain text.");
        result.quickCss = data.quickCss;
    }
    if (data.dataStore !== undefined) {
        if (!Array.isArray(data.dataStore) || data.dataStore.length > 100000) throw Error("DataStore backup must contain supported key/value rows.");
        result.dataStore = [];
        for (const row of data.dataStore) {
            if (!Array.isArray(row) || row.length !== 2 || !validKey(row[0])) throw Error("DataStore contains an invalid row.");
            if (!backupKeyAllowed(row[0])) continue;
            if (backupObject(row[1]) && (row[1].__unreadable || row[1].__unserializable)) continue;
            result.dataStore.push([row[0], row[1]]);
        }
    }
    if (type === "all" && !cloud && !result.settings || type === "plugins" && !result.settings?.plugins || type === "css" && result.quickCss === undefined || type === "datastore" && !result.dataStore) throw Error("This backup does not include the selected section.");
    return result;
}
