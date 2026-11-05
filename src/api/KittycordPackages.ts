/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { KittycordCatalog } from "@api/KittycordCatalog";
import { KittycordDesktop } from "@api/KittycordDesktop";
import { KittycordUtility } from "@api/KittycordUtility";
import { PluginHealth } from "@api/PluginHealth";
import { PluginProfiler } from "@api/PluginProfiler";
import { Kittycord } from "@shared/kittycord";
import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import { createPackageRegistry, parsePackageRegistry } from "@shared/kittycord/packageRegistry";
import type { SecurityReport } from "@shared/kittycord/security";
import { defineThemePackage } from "@shared/kittycord/themePackage";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { defineIsolatedJavascript } from "@utils/isolatedPlugin";

import plugins from "~plugins";

const key = "kittycord.packages.v1";
const listeners = new Set<() => void>();
let registry: ReturnType<typeof createPackageRegistry> | undefined;
let error = "";
let unsubscribeProfiler: (() => void) | undefined;
let reportedStartup = false;
const scans = new Map<string, { digest: string; permissions: string; report: SecurityReport; }>();
let scanTimer: ReturnType<typeof setTimeout> | undefined;
let intervalHours = 24;
let automaticScans = true;
async function inspect(bundle: ExternalPackage, force = false, purpose: "review" | "activation" = "activation") {
    if (bundle.manifest.entrypoints.desktop !== "plugin.js") return;
    const cached = scans.get(bundle.manifest.id);
    const permissions = JSON.stringify(bundle.manifest.permissions);
    if (!force && cached?.digest === bundle.manifest.integrity.digest && cached.permissions === permissions && cached.report.policyVersion === 1 && Date.now() >= cached.report.analyzedAt && Date.now() - cached.report.analyzedAt < intervalHours * 3600000) {
        if (cached.report.status === "Blocked" && purpose !== "review") throw new Error("This source needs changes before installation. Open its scan details for the affected lines.");
        return;
    }
    if (IS_WEB || typeof VencordNative === "undefined" || !VencordNative.security?.scan) throw new Error("This host needs the current desktop security bridge before installing external JavaScript.");
    const result = await VencordNative.security.scan(bundle.artifact, bundle.manifest.permissions);
    if (!result.report) throw new Error(result.error ?? "The source scan did not complete.");
    scans.set(bundle.manifest.id, { digest: bundle.manifest.integrity.digest, permissions, report: result.report });
    if (scans.size > 64) { const installed = new Set(getRegistry().snapshot().entries.map(item => item.manifest.id)); const oldest = [...scans.keys()].find(id => !installed.has(id)); if (oldest) scans.delete(oldest); }
    if (result.report.status === "Blocked" && purpose !== "review") throw new Error("This source needs changes before installation. Open its scan details for the affected lines.");
}
function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    if (!automaticScans || IS_WEB) return;
    scanTimer = setTimeout(() => {
        void KittycordPackages.scanAll().catch(() => { error = "Scheduled security scanning failed. Review installed packages before enabling new code."; notify(); }).finally(scheduleScan);
    }, intervalHours * 3_600_000);
    if (typeof scanTimer === "object" && "unref" in scanTimer) scanTimer.unref();
}
function notify() { for (const listener of listeners) listener(); }
function getRegistry() {
    registry ??= createPackageRegistry({
        read: () => DataStore.get<unknown>(key),
        async write(next, revision) {
            await DataStore.update<unknown>(key, previous => {
                if (parsePackageRegistry(previous).revision !== revision) throw new Error("Packages changed in another window. Reload before modifying them.");
                return next;
            });
        }
    }, {
        platform: IS_WEB ? "chrome" : IS_WINDOWS ? "windows" : IS_MAC ? "macos" : "linux", apiVersion: Kittycord.apiVersion,
        lifecycleTimeoutMs: 25000, reservedIds: Object.values(plugins).flatMap(plugin => [plugin.id ?? plugin.name, plugin.name]),
        inspect: (bundle, purpose) => inspect(bundle, false, purpose),
        checkPackage: manifest => scans.get(manifest.id)?.digest === manifest.integrity.digest && scans.get(manifest.id)?.report.status === "Blocked" ? Promise.resolve("blocked") : KittycordCatalog.checkPackage(manifest),
        define: bundle => {
            if (bundle.manifest.entrypoints.desktop !== "plugin.js") return defineThemePackage(bundle, document);
            if (typeof VencordNative === "undefined" || !VencordNative.sandbox || typeof VencordNative.sandbox.open !== "function" || typeof VencordNative.sandbox.close !== "function")
                throw new Error("This desktop host lacks the isolated runtime bridge. Update or rebuild a compatible Kittycord host before activating JavaScript.");
            return defineIsolatedJavascript(bundle, document, () => {
            PluginHealth.recordRuntimeError(bundle.manifest.id, "isolated runtime", new Error("Isolated JavaScript failed or exceeded protocol limits. Open External Plugin Manager for recovery."));
            void getRegistry().runtimeFailure(bundle.manifest.id, { version: bundle.manifest.version, digest: bundle.manifest.integrity.digest }).catch(() => {
                error = "Isolated runtime cleanup or storage failed. Reload and inspect this package in External Plugin Manager.";
                notify();
            });
            }, VencordNative.sandbox, KittycordUtility.bridge, KittycordDesktop.bridge);
        }, changed: notify,
        measure: (id, surface, action) => PluginProfiler.profileExecution(id, surface, action)
    });
    return registry;
}

async function track<T>(operation: string, action: () => Promise<T>, id = "KittycordPackages"): Promise<T> {
    try { return await action(); }
    catch (problem) {
        const owner = getRegistry().snapshot().entries.some(item => item.manifest.id === id) ? id : "KittycordPackages";
        PluginHealth.recordRuntimeError(owner, operation, new Error(`External package ${operation} failed. Open External Plugin Manager for details and recovery controls.`));
        throw problem;
    }
}

export const KittycordPackages = {
    async initialize() {
        try {
            await getRegistry().initialize();
            if (!reportedStartup) {
                reportedStartup = true;
                const config = IS_WEB ? undefined : await DataStore.get<unknown>("kittycord.security.schedule.v1");
                if (config && typeof config === "object" && "hours" in config && typeof config.hours === "number" && Number.isInteger(config.hours) && config.hours >= 1 && config.hours <= 168) intervalHours = config.hours;
                if (config && typeof config === "object" && "enabled" in config && typeof config.enabled === "boolean") automaticScans = config.enabled;
                scheduleScan();
                if (!IS_WEB && typeof window !== "undefined") window.addEventListener("pagehide", KittycordPackages.shutdown, { once: true });
                for (const item of getRegistry().snapshot().entries) if (item.failure)
                    PluginHealth.recordRuntimeError(item.manifest.id, "external startup", new Error(`External package startup finding: ${item.failure}. Open External Plugin Manager for recovery controls.`));
            }
        }
        catch {
            error = "External package storage or startup recovery failed. The registry was preserved. Repair local storage and reload the client.";
            PluginHealth.recordRuntimeError("KittycordPackages", "startup", new Error(error));
            notify();
        }
    },
    snapshot() {
        const snapshot = getRegistry().snapshot();
        return { ...snapshot, error, securitySchedule: { hours: intervalHours, enabled: automaticScans }, entries: snapshot.entries.map(item => {
            const profile = PluginProfiler.getProfile(item.manifest.id, "session");
            return { ...item, security: scans.get(item.manifest.id)?.digest === item.manifest.integrity.digest ? scans.get(item.manifest.id)?.report : undefined, performance: { observedCalls: profile.callCount, synchronousMs: profile.totalCpuTimeMs, maxSynchronousMs: profile.maxCallMs,
                observedSlowCalls: profile.slowSpikes, asyncElapsedMs: profile.asyncTimeMs, measurement: { ...profile.measurement },
                surfaces: Object.fromEntries(["start", "stop", "captureState", "dispose", "event", "interval", "timeout"].filter(surface => profile.surfaces[surface]).map(surface => [surface, { ...profile.surfaces[surface] }])) } };
        }) };
    },
    startupFailures() {
        return [...(error ? ["KittycordPackages"] : []), ...getRegistry().startupFailures()];
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        unsubscribeProfiler ??= PluginProfiler.subscribe(notify);
        return () => {
            listeners.delete(listener);
            if (!listeners.size) { unsubscribeProfiler?.(); unsubscribeProfiler = undefined; }
        };
    },
    review(value: unknown) { return track("review", async () => { const result = await getRegistry().review(value); return { ...result, security: scans.get(result.bundle.manifest.id)?.report }; }); },
    exportPackage(id: string) { return track("export", () => getRegistry().exportPackage(id), id); },
    exportSnapshots() { return DataStore.get<unknown>("kittycord.package.snapshots.v1"); },
    clearSnapshots() { return DataStore.del("kittycord.package.snapshots.v1"); },
    restart(id: string) { return track("restart", () => getRegistry().restart(id), id); },
    async configureScanning(hours: number, enabled: boolean) {
        if (!Number.isInteger(hours) || hours < 1 || hours > 168 || typeof enabled !== "boolean") throw new Error("Choose a scan interval from 1 to 168 hours.");
        await DataStore.set("kittycord.security.schedule.v1", { hours, enabled }); intervalHours = hours; automaticScans = enabled; scheduleScan(); notify();
    },
    async scanAll() {
        const failures: string[] = [];
        for (const item of getRegistry().snapshot().entries) {
            const bundle = await getRegistry().exportPackage(item.manifest.id);
            try { await inspect(bundle, true); } catch { failures.push(item.manifest.id); }
        }
        const enforced = await getRegistry().enforcePolicy(); notify();
        if (failures.some(id => scans.get(id)?.report.status !== "Blocked")) throw new Error("One or more package scans could not finish. Previous reports were retained.");
        return enforced;
    },
    async scan(id: string) { const bundle = await getRegistry().exportPackage(id); try { await inspect(bundle, true); } finally { await getRegistry().enforcePolicy(); notify(); } },
    shutdown() { if (scanTimer) clearTimeout(scanTimer); scanTimer = undefined; if (typeof window !== "undefined") window.removeEventListener("pagehide", KittycordPackages.shutdown); },
    audit() { return track("local integrity audit", () => getRegistry().audit()); },
    enforceCatalogPolicy() { return track("catalog quarantine", () => getRegistry().enforcePolicy()); },
    reviewPrevious(id: string) { return track("backup review", async () => { const result = await getRegistry().reviewPrevious(id); return { ...result, security: scans.get(id)?.report }; }, id); },
    install(value: unknown, digest: string, expectedCurrentDigest?: string) {
        return track("installation", async () => {
            if (expectedCurrentDigest) {
                const previous = getRegistry().snapshot().entries.find(item => item.manifest.integrity.digest === expectedCurrentDigest);
                if (!previous) throw new Error("The installed package changed after review.");
                const bundle = await getRegistry().exportPackage(previous.manifest.id);
                await DataStore.update<unknown>("kittycord.package.snapshots.v1", current => {
                    if (current !== undefined && !Array.isArray(current)) throw new Error("Source snapshot storage needs repair. Export it before editing.");
                    const list: unknown[] = current ?? [];
                    if (list.some(item => item && typeof item === "object" && "digest" in item && item.digest === expectedCurrentDigest)) return list;
                    if (list.length >= 32) throw new Error("The 32 source snapshot slots are full. Export them and review retention before editing again.");
                    return [...list, { savedAt: Date.now(), id: bundle.manifest.id, digest: expectedCurrentDigest, bundle }];
                });
            }
            await getRegistry().install(value, digest, expectedCurrentDigest);
        });
    },
    restore(id: string, digest: string, revision: number) { return track("backup restoration", () => getRegistry().restore(id, digest, revision), id); },
    enable(id: string) { return track("activation", () => getRegistry().enable(id), id); },
    disable(id: string) { return track("deactivation", () => getRegistry().disable(id), id); },
    remove(id: string) {
        return track("removal", async () => {
            await getRegistry().remove(id);
            if (!PluginProfiler.forgetPlugin(id)) PluginHealth.recordRuntimeError(id, "external cleanup", new Error("Profiler resource observations remain after package removal. Reload to clear the renderer and inspect Plugin Health."));
        }, id);
    }
};
