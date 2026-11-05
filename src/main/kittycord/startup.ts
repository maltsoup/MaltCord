/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { beginStartup, blameStartupPlugin, checkedPluginIds, finishStartup, markStartupPlugin, parseStartupJournal, pluginEnablementFlags, type RecoveryStatus, recoveryStatus, restorePluginEnablement } from "@shared/kittycord/recovery";

import { atomicWriteJson, readBoundedJson } from "./files";

export function createDesktopStartupRecovery(directory: string, readSettings: () => Record<string, unknown>, writeSettings: (settings: Record<string, unknown>) => void) {
    if (!isAbsolute(directory)) throw new Error("Recovery requires an absolute Kittycord settings directory.");
    mkdirSync(directory, { recursive: true });
    const file = join(directory, "kittycord-startup.json");
    let previous;
    if (existsSync(file)) {
        try { previous = parseStartupJournal(readBoundedJson(file)); } catch {
            copyFileSync(file, `${file}.invalid-${randomUUID()}`);
        }
    }
    // The launch is recorded on first use, not when the main process loads. A second Discord instance
    // (a tray click or a discord:// link) loads this module and exits without a renderer; writing here
    // would reset the journal to pending and count the next real launch as a failed start.
    let journal: ReturnType<typeof beginStartup> | undefined, bootStatus: RecoveryStatus | undefined;
    function current() {
        if (!journal) {
            journal = beginStartup(previous, randomUUID(), readSettings().safeStart !== false);
            atomicWriteJson(file, journal);
            bootStatus = recoveryStatus(journal);
        }
        return journal;
    }

    function save(next: ReturnType<typeof beginStartup>): RecoveryStatus {
        current();
        atomicWriteJson(file, next);
        journal = next;
        return recoveryStatus(journal);
    }
    return {
        getStatus: () => { const status = recoveryStatus(current()), boot = bootStatus!; return { ...status, mode: boot.mode, reason: boot.reason, allowedPlugins: [...boot.allowedPlugins], blockedPlugins: [...boot.blockedPlugins], ...(boot.suspect ? { suspect: boot.suspect } : {}) }; },
        mark: (plugin: unknown) => { const before = current(), next = markStartupPlugin(before, plugin); if (next !== before) save(next); },
        blame: (blame: unknown) => { const before = current(), next = blameStartupPlugin(before, blame); if (next !== before) save(next); },
        complete: (session: string, failures: unknown) => save(finishStartup(current(), session, pluginEnablementFlags(readSettings()), checkedPluginIds(failures))),
        setRecovery: (enabled: boolean) => {
            if (typeof enabled !== "boolean") throw new Error("Recovery mode must be a boolean.");
            if (enabled) throw new Error("Safe Start has been removed. Manage individual plugins in Plugin Manager.");
            const { activePlugin: _, lastError: __, ...rest } = current();
            return save({ ...rest, recovery: false, reason: "normal", allowedPlugins: [], blockedPlugins: [], phase: "healthy", consecutiveFailures: 0 });
        },
        allowPlugin: (id: unknown) => {
            checkedPluginIds([id]);
            throw new Error("Safe Start trials have been removed. Enable this plugin in Plugin Manager.");
        },
        restoreLastGood: () => {
            const known = current();
            if (!known.lastGood) throw new Error("No last successful plugin configuration is available.");
            const settings = readSettings();
            const restored = restorePluginEnablement(settings, known.lastGood);
            save({ ...known, beforeRestore: pluginEnablementFlags(settings), recovery: false, reason: "normal" });
            writeSettings(restored);
            return recoveryStatus(current());
        }
    };
}
