/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PlainSettings, SettingsStore } from "@api/Settings";
import { backupKeyAllowed, backupObject, backupWithoutCredentials, parseSettingsBackup, type SettingsBackupType } from "@shared/kittycord/settingsBackup";
import { Logger } from "@utils/Logger";
import { chooseFile, saveFile } from "@utils/web";
import { moment, showToast, Toasts } from "@webpack/common";

import { DataStore } from "..";

type BackupType = SettingsBackupType;

const toastSuccess = () =>
    showToast("Settings successfully imported. Restart to apply changes!", "success");

const toastFailure = (err: unknown) =>
    showToast(`Failed to import settings: ${String(err)}`, "failure");

const logger = new Logger("SettingsSync:Offline", "#39b7e0");

function deepMerge(target: object, source: Record<string, unknown>) {
    for (const [key, value] of Object.entries(source)) {
        const current: unknown = Reflect.get(target, key);
        if (backupObject(value) && backupObject(current)) deepMerge(current, value);
        else Reflect.set(target, key, structuredClone(value));
    }
}

export async function importSettings(data: string | object, type: BackupType = "all", cloud = false) {
    const parsed = parseSettingsBackup(data, type, cloud);
    const hasSettings = (type === "all" || type === "plugins") && parsed.settings !== undefined;
    const hasCss = (type === "all" || type === "css") && parsed.quickCss !== undefined;
    const rows = type === "all" || type === "datastore" ? parsed.dataStore ?? [] : [];
    const beforeSettings = structuredClone(PlainSettings), nextSettings = structuredClone(PlainSettings);
    if (hasSettings) deepMerge(nextSettings, type === "plugins" ? { plugins: parsed.settings?.plugins } : parsed.settings ?? {});
    const beforeCss = hasCss ? await VencordNative.quickCss.get() : undefined;
    const beforeKeys = rows.length ? await DataStore.keys() : [];
    const existing = new Set(beforeKeys.map(key => JSON.stringify(key)));
    const oldValues = rows.length ? await DataStore.getMany<unknown>(rows.map(([key]) => key)) : [];
    const previous: [IDBValidKey, unknown][] = [], added: IDBValidKey[] = [];
    const merged = rows.map(([key, value], index): [IDBValidKey, unknown] => {
        if (existing.has(JSON.stringify(key))) previous.push([key, oldValues[index]]); else added.push(key);
        const old = oldValues[index];
        if (backupObject(old) && backupObject(value)) { const merged = structuredClone(old); deepMerge(merged, value); return [key, merged]; }
        return [key, value];
    });
    let stage = "plugin settings";
    try {
        if (hasSettings) await VencordNative.settings.set(nextSettings);
        stage = "QuickCSS";
        if (hasCss) await VencordNative.quickCss.set(parsed.quickCss ?? "");
        stage = "DataStore";
        for (let index = 0; index < merged.length; index += 500) await DataStore.setMany(merged.slice(index, index + 500));
    } catch {
        let restored = true;
        for (const action of [
            async () => { if (hasSettings) await VencordNative.settings.set(beforeSettings); },
            async () => { if (beforeCss !== undefined) await VencordNative.quickCss.set(beforeCss); },
            async () => { if (previous.length) await DataStore.setMany(previous); },
            async () => { if (added.length) await DataStore.delMany(added); }
        ]) try { await action(); } catch { restored = false; }
        throw Error(`Import failed while saving ${stage}. ${restored ? "Previous data was restored." : "Recovery was incomplete. Keep the application open and preserve your backup."}`);
    }
    if (hasSettings) {
        for (const key of Object.keys(PlainSettings)) Reflect.deleteProperty(PlainSettings, key);
        Object.assign(PlainSettings, nextSettings);
        SettingsStore.markAsChanged();
    }
}

export async function exportSettings({ syncDataStore = true, type = "all", minify, forceDataStore }: { syncDataStore?: boolean; type?: BackupType; minify?: boolean; forceDataStore?: boolean; }) {
    const rawSettings = VencordNative.settings.get();
    const settings = backupWithoutCredentials(type === "plugins" ? { plugins: rawSettings.plugins } : rawSettings);
    const quickCss = await VencordNative.quickCss.get();

    if (!syncDataStore) {
        switch (type) {
            case "all":
            case "plugins": {
                return JSON.stringify({ settings }, null, minify ? undefined : 4);
            }
            case "css": {
                return JSON.stringify({ quickCss }, null, minify ? undefined : 4);
            }
            case "datastore": {
                return "{}";
            }
        }
    }

    const nl = minify ? "" : "\n";
    const ind = minify ? "" : "  ";
    const col = minify ? ":" : ": ";
    const arrSep = minify ? "," : ", ";
    const [hasSettings, hasCss, hasDs] = [type === "all" || type === "plugins", type === "all" || type === "css", type === "all" || type === "datastore"];

    const parts: string[] = [`{${nl}`];

    if (hasSettings) {
        parts.push(`${ind}"settings"${col}${JSON.stringify(settings)}`);
    }

    if (hasCss) {
        if (hasSettings) parts.push(`,${nl}`);
        parts.push(`${ind}"quickCss"${col}${JSON.stringify(quickCss)}`);
    }

    if (hasDs) {
        if (hasSettings || hasCss) parts.push(`,${nl}`);
        let dsStarted = false;
        try {
            parts.push(`${ind}"dataStore"${col}[${nl}`);
            dsStarted = true;

            // One unserializable value must not kill a guaranteed export; keep the
            // row with a marker so restores know the entry existed.
            const serialize = (value: unknown): string => {
                try {
                    return JSON.stringify(backupWithoutCredentials(value)) ?? "null";
                } catch {
                    return JSON.stringify({ __unserializable: true, preview: "This value could not be serialized." });
                }
            };

            if (forceDataStore) {
                const keys = (await DataStore.keys()).filter(backupKeyAllowed);
                const MAX_CHUNK = 200;
                let chunkSize = MAX_CHUNK;
                let index = 0;
                let rowCount = 0;
                const pushRow = (key: IDBValidKey, valueJson: string) => {
                    if (!backupKeyAllowed(key)) return;
                    if (rowCount++ > 0) parts.push(",");
                    parts.push(nl);
                    parts.push(`${ind}${ind}[${JSON.stringify(key)}${arrSep}${valueJson}]`);
                };
                while (index < keys.length) {
                    const chunk = keys.slice(index, index + chunkSize);
                    let values: unknown[];
                    try {
                        values = await DataStore.getMany(chunk);
                    } catch (chunkErr) {
                        if (chunkSize > 1) {
                            // Huge rows can blow up a big getMany; retry the same range
                            // in smaller pieces before giving up.
                            chunkSize = Math.max(1, Math.floor(chunkSize / 4));
                            continue;
                        }
                        // A single key that still fails is an unreadable record
                        // (Chromium refuses to deserialize oversized values). Emit
                        // an explicit marker and keep going - one poisoned row must
                        // not kill a guaranteed export.
                        const message = "This entry could not be read.";
                        logger.warn("A DataStore entry could not be read for export.");
                        pushRow(chunk[0], JSON.stringify({ __unreadable: true, error: message }));
                        index += 1;
                        continue;
                    }
                    for (let j = 0; j < chunk.length; j++) {
                        pushRow(chunk[j], serialize(values[j]));
                    }
                    index += chunk.length;
                    if (chunkSize < MAX_CHUNK && index < keys.length) {
                        // Reads work again - crawl back up so the rest of the
                        // store is not fetched one key at a time.
                        chunkSize = Math.min(MAX_CHUNK, Math.max(1, chunkSize * 4));
                    }
                }
            } else {
                // Resilient read: with one unreadable row this still exports
                // everything else instead of dropping the DataStore entirely.
                const entries = await DataStore.entriesSafe(key =>
                    backupKeyAllowed(key) && logger.warn("Skipping an unreadable DataStore entry in backup")
                );
                let rowCount = 0;
                for (let i = 0; i < entries.length; i++) {
                    if (!backupKeyAllowed(entries[i][0])) continue;
                    if (rowCount++ > 0) parts.push(",");
                    parts.push(nl);
                    const [key, value] = entries[i];
                    parts.push(`${ind}${ind}[${JSON.stringify(key)}${arrSep}${serialize(value)}]`);
                }
            }
            parts.push(`${nl}${ind}]`);
        } catch (err) {
            if (dsStarted) parts.push(`${nl}${ind}]`);
            if (type === "datastore" || forceDataStore) {
                // The Large DataStore Export toggle guarantees a complete export;
                // silently omitting the data would produce a corrupt restore, so
                // fail loudly instead.
                throw new Error(`DataStore export failed: ${err instanceof Error ? err.message : String(err)}`);
            }
            logger.warn("Skipping DataStore in backup due to size.");
            showToast("DataStore too large - exported without it.", Toasts.Type.MESSAGE);
        }
    }

    parts.push(`${nl}}`);
    return parts.join("");
}

export async function downloadSettingsBackup(type: BackupType = "all", { minify, forceDataStore }: { minify?: boolean; forceDataStore?: boolean; } = {}) {
    try {
        const filename = `kittycord-${type}-backup-${moment().format("YYYY-MM-DD")}.json`;
        const syncDataStore = type === "all" || type === "datastore";

        const backup = await exportSettings({ minify, type, syncDataStore, forceDataStore });
        const data = new TextEncoder().encode(backup);
        if (IS_DISCORD_DESKTOP) {
            DiscordNative.fileManager.saveWithDialog(data, filename);
        } else {
            saveFile(new File([data], filename, { type: "application/json" }));
        }
    } catch (err) {
        logger.error("Failed to export settings:", err);
        showToast("Failed to export settings, check console", "failure");
        throw err;
    }
}

export async function uploadSettingsBackup(type: BackupType = "all", showToast = true): Promise<void> {
    const file = await chooseFile("application/json,.json");
    if (!file) return;

    try {
        if (file.size > 64 * 1024 * 1024) throw Error("Backup exceeds 64 MiB. Import separate sections instead.");
        const text = await file.text();
        await importSettings(text, type);
        if (showToast) toastSuccess();
    } catch (err) {
        logger.error(err);
        if (showToast) toastFailure(err);
    }
}
