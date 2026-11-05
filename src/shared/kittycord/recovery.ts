/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject } from "./manifest";

export interface StartupJournal {
    schemaVersion: 1;
    session: string;
    phase: "pending" | "healthy" | "failed";
    consecutiveFailures: number;
    recovery: boolean;
    reason: "normal" | "requested" | "repeated-startup-failure" | "plugin-crash" | "invalid-journal" | "storage-error";
    allowedPlugins: string[];
    blockedPlugins?: string[];
    failedPlugins: string[];
    activePlugin?: string;
    lastError?: StartupBlame;
    suspect?: StartupSuspect;
    lastGood?: Record<string, boolean>;
    beforeRestore?: Record<string, boolean>;
}
export interface StartupBlame { plugin: string; reason: string; }
export interface StartupSuspect extends StartupBlame { crashes: number; }
export interface RecoveryStatus {
    supported: boolean;
    persistent: boolean;
    session: string;
    mode: "normal" | "recovery";
    reason: StartupJournal["reason"];
    consecutiveFailures: number;
    allowedPlugins: string[];
    blockedPlugins: string[];
    failedPlugins: string[];
    suspect?: StartupSuspect;
    lastGoodAvailable: boolean;
}
export type RecoveryResult = { ok: true; status: RecoveryStatus; } | { ok: false; error: string; };

export const unsupportedRecovery: RecoveryStatus = {
    supported: false, persistent: false, session: "", mode: "normal", reason: "normal", consecutiveFailures: 0,
    allowedPlugins: [], blockedPlugins: [], failedPlugins: [], lastGoodAvailable: false
};

export const startingPluginReason = "Discord closed or froze while this plugin was starting.";

function checkedBlame(value: unknown): StartupBlame {
    const data = checkedObject(value, ["plugin", "reason"], "Startup blame");
    const [plugin] = checkedPluginIds([data.plugin]);
    if (typeof data.reason !== "string") throw new Error("Invalid startup blame.");
    return { plugin, reason: data.reason.replace(/[\u0000-\u001f]+/g, " ").slice(0, 300) };
}

function checkedSuspect(value: unknown): StartupSuspect {
    const data = checkedObject(value, ["plugin", "reason", "crashes"], "Startup suspect");
    if (typeof data.crashes !== "number" || !Number.isSafeInteger(data.crashes) || data.crashes < 1 || data.crashes > 1000) throw new Error("Invalid startup suspect.");
    return { ...checkedBlame({ plugin: data.plugin, reason: data.reason }), crashes: data.crashes };
}

export function checkedPluginIds(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 2048 || value.some(id => typeof id !== "string" || !id.length || id.length > 200 || /[\u0000-\u001f]/.test(id) || ["__proto__", "constructor", "prototype"].includes(id)))
        throw new Error("Invalid recovery plugin identifiers.");
    return [...new Set<string>(value)];
}

function checkedFlags(value: unknown): Record<string, boolean> {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 5000) throw new Error("Invalid plugin enablement snapshot.");
    const result: Record<string, boolean> = {};
    for (const [key, enabled] of Object.entries(value)) {
        checkedPluginIds([key]);
        if (typeof enabled !== "boolean") throw new Error("Invalid plugin enablement snapshot.");
        result[key] = enabled;
    }
    return result;
}

export function parseStartupJournal(value: unknown): StartupJournal {
    const data = checkedObject(value, ["schemaVersion", "session", "phase", "consecutiveFailures", "recovery", "reason", "allowedPlugins", "blockedPlugins", "failedPlugins", "activePlugin", "lastError", "suspect", "lastGood", "beforeRestore"], "Startup journal");
    if (data.schemaVersion !== 1 || typeof data.session !== "string" || !/^[\w-]{1,100}$/.test(data.session)
        || !["pending", "healthy", "failed"].includes(String(data.phase)) || typeof data.consecutiveFailures !== "number"
        || !Number.isSafeInteger(data.consecutiveFailures) || data.consecutiveFailures < 0 || data.consecutiveFailures > 1000
        || typeof data.recovery !== "boolean" || !["normal", "requested", "repeated-startup-failure", "plugin-crash", "invalid-journal", "storage-error"].includes(String(data.reason)))
        throw new Error("Invalid startup journal.");
    return {
        schemaVersion: 1, session: data.session, phase: data.phase as StartupJournal["phase"],
        consecutiveFailures: data.consecutiveFailures, recovery: data.recovery, reason: data.reason as StartupJournal["reason"],
        allowedPlugins: checkedPluginIds(data.allowedPlugins), failedPlugins: checkedPluginIds(data.failedPlugins),
        ...(data.blockedPlugins === undefined ? {} : { blockedPlugins: checkedPluginIds(data.blockedPlugins) }),
        ...(data.activePlugin === undefined ? {} : { activePlugin: checkedPluginIds([data.activePlugin])[0] }),
        ...(data.lastError === undefined ? {} : { lastError: checkedBlame(data.lastError) }),
        ...(data.suspect === undefined ? {} : { suspect: checkedSuspect(data.suspect) }),
        ...(data.lastGood === undefined ? {} : { lastGood: checkedFlags(data.lastGood) }),
        ...(data.beforeRestore === undefined ? {} : { beforeRestore: checkedFlags(data.beforeRestore) })
    };
}

/**
 * A launch that never reported a clean boot counts as a failed launch. After two in a row,
 * Safe Start blocks only the plugin that was starting or throwing when Discord stopped. When
 * no plugin can be blamed, it pauses every optional plugin for one launch instead. Any clean
 * boot returns the next launch to normal.
 */
export function beginStartup(previous: StartupJournal | undefined, session: string, safeStart = true): StartupJournal {
    const crashed = !!previous && previous.phase !== "healthy";
    const failures = crashed ? Math.min(previous.consecutiveFailures + 1, 1000) : 0;
    const culprit = !crashed ? undefined : previous.activePlugin ? { plugin: previous.activePlugin, reason: startingPluginReason } : previous.lastError;
    const suspect = culprit ? { ...culprit, crashes: previous?.suspect?.plugin === culprit.plugin ? Math.min(previous.suspect.crashes + 1, 1000) : 1 } : crashed ? previous.suspect : undefined;
    const stillFailing = crashed && previous.recovery;
    const priorBlocked = stillFailing ? previous.blockedPlugins ?? [] : [];
    let reason: StartupJournal["reason"] = "normal", blockedPlugins: string[] = [];
    if (safeStart && (failures >= 2 || stillFailing)) {
        const target = stillFailing ? previous.reason === "plugin-crash" && culprit && !priorBlocked.includes(culprit.plugin) ? culprit : undefined : suspect;
        if (target) { reason = "plugin-crash"; blockedPlugins = [...priorBlocked, target.plugin]; }
        else reason = "repeated-startup-failure";
    }
    return parseStartupJournal({
        schemaVersion: 1, session, phase: "pending", consecutiveFailures: failures, recovery: reason !== "normal",
        reason, allowedPlugins: [], blockedPlugins, failedPlugins: previous?.failedPlugins ?? [],
        ...(suspect ? { suspect } : {}),
        ...(previous?.lastGood ? { lastGood: previous.lastGood } : {}), ...(previous?.beforeRestore ? { beforeRestore: previous.beforeRestore } : {})
    });
}

export function markStartupPlugin(journal: StartupJournal, plugin: unknown): StartupJournal {
    if (journal.phase !== "pending") return journal;
    if (plugin === null) { const { activePlugin: _, ...rest } = journal; return rest; }
    return { ...journal, activePlugin: checkedPluginIds([plugin])[0] };
}

export function blameStartupPlugin(journal: StartupJournal, blame: unknown): StartupJournal {
    return journal.phase === "pending" ? { ...journal, lastError: checkedBlame(blame) } : journal;
}

export function pluginEnablementFlags(settings: unknown): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    if (!settings || typeof settings !== "object" || !("plugins" in settings) || !settings.plugins || typeof settings.plugins !== "object") return result;
    for (const [id, config] of Object.entries(settings.plugins)) {
        if (config && typeof config === "object" && "enabled" in config && typeof config.enabled === "boolean") {
            checkedPluginIds([id]);
            result[id] = config.enabled;
        }
    }
    return result;
}

export function finishStartup(journal: StartupJournal, session: string, flags: Record<string, boolean>, failedPlugins: string[]): StartupJournal {
    if (session !== journal.session) throw new Error("A stale renderer cannot complete this startup.");
    if (journal.phase === "healthy") return journal;
    const failures = checkedPluginIds(failedPlugins);
    const { activePlugin: _, lastError: __, ...rest } = journal;
    return { ...rest, phase: "healthy", failedPlugins: failures,
        consecutiveFailures: 0,
        ...(!failures.length && !journal.recovery ? { lastGood: checkedFlags(flags) } : {}) };
}

export function recoveryStatus(journal: StartupJournal): RecoveryStatus {
    return { supported: true, persistent: true, session: journal.session, mode: journal.recovery ? "recovery" : "normal", reason: journal.reason,
        consecutiveFailures: journal.consecutiveFailures, allowedPlugins: [...journal.allowedPlugins], blockedPlugins: [...journal.blockedPlugins ?? []], failedPlugins: [...journal.failedPlugins],
        ...(journal.suspect ? { suspect: { ...journal.suspect } } : {}), lastGoodAvailable: journal.lastGood !== undefined };
}

export function recoveryAllowsPlugin(status: RecoveryStatus, plugin: { id?: string; name: string; required?: boolean; isDependency?: boolean; }): boolean {
    if (status.mode !== "recovery" || plugin.required === true) return true;
    const ids = [plugin.id ?? plugin.name, plugin.name];
    if (status.reason === "plugin-crash") return !ids.some(id => status.blockedPlugins.includes(id));
    return plugin.isDependency === true || ids.some(id => status.allowedPlugins.includes(id));
}

export function restorePluginEnablement(settings: Record<string, unknown>, flags: Record<string, boolean>): Record<string, unknown> {
    const current = settings.plugins && typeof settings.plugins === "object" && !Array.isArray(settings.plugins) ? settings.plugins : {};
    const plugins: Record<string, unknown> = {};
    for (const [id, config] of Object.entries(current)) {
        checkedPluginIds([id]);
        if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid plugin settings cannot be restored automatically.");
        plugins[id] = { ...config, enabled: flags[id] ?? false };
    }
    for (const [id, enabled] of Object.entries(checkedFlags(flags))) if (!(id in plugins)) plugins[id] = { enabled };
    return { ...settings, plugins };
}
