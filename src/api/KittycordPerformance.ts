/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { PluginProfiler } from "@api/PluginProfiler";
import { defaultPerformancePreferences, parsePerformancePreferences, type PerformancePreferences, profilerOptionsFor } from "@shared/kittycord/performance";

const key = "kittycord.performance.v1";
let preferences = defaultPerformancePreferences();
let error = "";
let revision = 0;
const listeners = new Set<() => void>();

export function subscribePerformancePreferences(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function getPerformancePreferences() {
    return { preferences: structuredClone(preferences), error };
}

export async function loadPerformancePreferences() {
    const current = ++revision;
    try {
        const stored = await DataStore.get<unknown>(key);
        const parsed = stored === undefined ? defaultPerformancePreferences() : parsePerformancePreferences(stored);
        if (current !== revision) return;
        preferences = parsed;
        PluginProfiler.configure(profilerOptionsFor(preferences));
        error = "";
        for (const listener of listeners) listener();
    } catch {
        if (current === revision) {
            error = "Performance preferences could not be loaded. Balanced defaults remain active; the saved record was preserved.";
            for (const listener of listeners) listener();
        }
    }
}

export async function savePerformancePreferences(value: PerformancePreferences) {
    const parsed = parsePerformancePreferences(value);
    revision++;
    await DataStore.set(key, parsed);
    preferences = parsed;
    PluginProfiler.configure(profilerOptionsFor(preferences));
    error = "";
    for (const listener of listeners) listener();
}

export function exportPerformanceReport() {
    return { schemaVersion: 1, timestamp: new Date().toISOString(), options: PluginProfiler.getOptions(),
        limitations: "Timing covers instrumented callbacks only. Sampled counters are observed calls, not extrapolated totals. Async duration is elapsed time, not CPU time. Heap deltas observe the whole renderer and cannot be attributed to a plugin. Timeout, animation-frame and rendering costs are not independently measured.",
        profiles: PluginProfiler.getAllProfiles("session").map(profile => ({ pluginId: profile.pluginName, observedCalls: profile.callCount, synchronousMs: profile.totalCpuTimeMs, maxSynchronousMs: profile.maxCallMs, observedSlowCalls: profile.slowSpikes,
            asyncElapsedMs: profile.asyncTimeMs, activeIntervals: profile.activeIntervals, activeListeners: profile.activeListeners, activeHookLayers: profile.activeHookLayers, callbacks: Object.entries(profile.surfaces).map(([name, stats]) => ({ name, calls: stats.calls, totalMs: stats.totalMs, slowCalls: stats.slowCalls })), measurement: profile.measurement })) };
}
