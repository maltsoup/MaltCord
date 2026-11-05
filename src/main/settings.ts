/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";

import type { Settings } from "@api/Settings";
import { IpcEvents } from "@shared/IpcEvents";
import { type RecoveryResult, type RecoveryStatus, unsupportedRecovery } from "@shared/kittycord/recovery";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { ipcMain } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

import { atomicWriteJson } from "./kittycord/files";
import { createDesktopStartupRecovery } from "./kittycord/startup";
import { NATIVE_SETTINGS_FILE, PRESETS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";

mkdirSync(SETTINGS_DIR, { recursive: true });

function readSettings<T = object>(name: string, file: string): Partial<T> {
    try {
        const data: unknown = JSON.parse(readFileSync(file, "utf-8"));
        if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => ["__proto__", "constructor", "prototype"].includes(key)))
            throw new Error("Settings must contain a plain object.");
        return data as Partial<T>;
    } catch (err: unknown) {
        if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
            if (existsSync(file)) {
                try { copyFileSync(file, `${file}.invalid-${randomUUID()}`); } catch {
                    console.error(`Failed to preserve unreadable ${name} settings.`);
                }
            }
            console.error(`Failed to read ${name} settings. Recovery preserves source files when they are readable.`);
        }

        return {};
    }
}

export const RendererSettings = new SettingsStore(readSettings<Settings>("renderer", SETTINGS_FILE));

let startupRecovery: ReturnType<typeof createDesktopStartupRecovery> | undefined;
const unavailableRecovery: RecoveryStatus = { ...unsupportedRecovery, supported: true, reason: "storage-error" };
try {
    if (!process.argv.includes("--vanilla")) startupRecovery = createDesktopStartupRecovery(SETTINGS_DIR, () => ({ ...RendererSettings.plain }), data => {
        atomicWriteJson(SETTINGS_FILE, data);
        RendererSettings.setData(data);
    });
} catch {
    console.error("[Kittycord] Startup history could not be saved. Check access to the settings directory.");
}
ipcMain.on(IpcEvents.KITTYCORD_RECOVERY_STATUS, event => { event.returnValue = startupRecovery?.getStatus() ?? unavailableRecovery; });
ipcMain.on(IpcEvents.KITTYCORD_RECOVERY_MARK, (_, plugin: unknown) => { try { startupRecovery?.mark(plugin); } catch { } });
ipcMain.on(IpcEvents.KITTYCORD_RECOVERY_BLAME, (_, blame: unknown) => { try { startupRecovery?.blame(blame); } catch { } });
function recoveryAction(action: () => RecoveryStatus): RecoveryResult {
    try { return { ok: true, status: action() }; } catch {
        return { ok: false, error: "Recovery changes could not be saved. Check the local settings directory and keep the current configuration backed up." };
    }
}
ipcMain.handle(IpcEvents.KITTYCORD_RECOVERY_COMPLETE, (_, session: string, failures: unknown) => recoveryAction(() => {
    if (!startupRecovery) throw new Error("Recovery storage is unavailable.");
    return startupRecovery.complete(session, failures);
}));
ipcMain.handle(IpcEvents.KITTYCORD_RECOVERY_MODE, (_, enabled: boolean) => recoveryAction(() => {
    if (!startupRecovery) throw new Error("Recovery storage is unavailable.");
    return startupRecovery.setRecovery(enabled);
}));
ipcMain.handle(IpcEvents.KITTYCORD_RECOVERY_ALLOW, (_, id: unknown) => recoveryAction(() => {
    if (!startupRecovery) throw new Error("Recovery storage is unavailable.");
    return startupRecovery.allowPlugin(id);
}));
ipcMain.handle(IpcEvents.KITTYCORD_RECOVERY_RESTORE, () => recoveryAction(() => {
    if (!startupRecovery) throw new Error("Recovery storage is unavailable.");
    return startupRecovery.restoreLastGood();
}));

RendererSettings.addGlobalChangeListener(() => {
    try {
        atomicWriteJson(SETTINGS_FILE, RendererSettings.plain);
    } catch (e) {
        console.error("Failed to write renderer settings", e);
    }
});

ipcMain.handle(IpcEvents.GET_SETTINGS_DIR, () => SETTINGS_DIR);
ipcMain.on(IpcEvents.GET_SETTINGS, e => e.returnValue = RendererSettings.plain);

ipcMain.handle(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    RendererSettings.setData(data, pathToNotify);
});

// Presets live in their own file at the shared (prod-level) dir so they persist
// across build flags, instead of being trapped in the per-build settings.json.
ipcMain.handle(IpcEvents.GET_PRESETS, () => readSettings("presets", PRESETS_FILE));
ipcMain.handle(IpcEvents.SET_PRESETS, (_, data: Record<string, any>) => {
    try {
        // A BigInt plugin setting would make JSON.stringify throw and silently drop
        // the whole write; store it as its string form instead.
        writeFileSync(PRESETS_FILE, JSON.stringify(data, (_, v) => typeof v === "bigint" ? v.toString() : v, 4));
    } catch (e) {
        console.error("Failed to write presets", e);
    }
});

export interface NativeSettings {
    plugins: {
        [plugin: string]: {
            [setting: string]: any;
        };
    };
    customCspRules: Record<string, string[]>;
}

const DefaultNativeSettings: NativeSettings = {
    plugins: {},
    customCspRules: {}
};

const nativeSettings = readSettings<NativeSettings>("native", NATIVE_SETTINGS_FILE);
mergeDefaults(nativeSettings, DefaultNativeSettings);

export const NativeSettings = new SettingsStore(nativeSettings as NativeSettings);

NativeSettings.addGlobalChangeListener(() => {
    try {
        atomicWriteJson(NATIVE_SETTINGS_FILE, NativeSettings.plain);
    } catch (e) {
        console.error("Failed to write native settings", e);
    }
});
