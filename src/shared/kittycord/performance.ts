/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PerformancePreferences {
    schemaVersion: 1;
    mode: "balanced" | "super" | "custom";
    custom: { enabled: boolean; sampleEvery: number; observeHeap: boolean; };
}

export function defaultPerformancePreferences(): PerformancePreferences {
    return { schemaVersion: 1, mode: "balanced", custom: { enabled: true, sampleEvery: 1, observeHeap: true } };
}

export function parsePerformancePreferences(value: unknown): PerformancePreferences {
    if (!value || typeof value !== "object") throw new Error("Invalid performance preferences.");
    const candidate = value as Record<string, unknown>;
    const { custom } = candidate;
    if (candidate.schemaVersion !== 1 || !["balanced", "super", "custom"].includes(String(candidate.mode)) || !custom || typeof custom !== "object")
        throw new Error("Unsupported performance preferences.");
    const options = custom as Record<string, unknown>;
    if (typeof options.enabled !== "boolean" || typeof options.observeHeap !== "boolean" || typeof options.sampleEvery !== "number" || !Number.isInteger(options.sampleEvery) || options.sampleEvery < 1 || options.sampleEvery > 1000)
        throw new Error("Invalid custom profiler options.");
    return { schemaVersion: 1, mode: candidate.mode as PerformancePreferences["mode"], custom: { enabled: options.enabled, observeHeap: options.observeHeap, sampleEvery: options.sampleEvery } };
}

export function profilerOptionsFor(preferences: PerformancePreferences) {
    switch (preferences.mode) {
        case "balanced": return { enabled: true, sampleEvery: 1, observeHeap: true };
        case "super": return { enabled: true, sampleEvery: 10, observeHeap: false };
        case "custom": return { ...preferences.custom };
    }
}
