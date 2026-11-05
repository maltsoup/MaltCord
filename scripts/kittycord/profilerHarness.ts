/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { build } from "esbuild";

interface FixtureOptions { enabled: boolean; sampleEvery: number; observeHeap: boolean; }
interface FixtureProfile {
    pluginName: string; callCount: number; totalCpuTimeMs: number; asyncTimeMs: number; maxCallMs: number; activeIntervals: number; slowSpikes: number; measurement: FixtureOptions;
    surfaces: Record<string, { calls: number; totalMs: number; maxMs: number; slowCalls: number; asyncMs: number; }>;
}
interface FixtureProfiler {
    init(): void;
    configure(options: FixtureOptions): void;
    profileExecution<T>(plugin: string, category: string, callback: () => T): T;
    profileAsyncExecution<T>(plugin: string, category: string, callback: () => Promise<T>): Promise<T>;
    subscribe(listener: () => void): () => void;
    getProfile(plugin: string, scope?: "window" | "session"): FixtureProfile;
    getAllProfiles(scope?: "window" | "session"): FixtureProfile[];
    registerInterval(plugin: string, id: number): void;
    unregisterInterval(plugin: string, id: number): void;
    forgetPlugin(plugin: string): boolean;
}

export async function loadProfiler(source = readFileSync(resolve("src/api/PluginProfiler.ts"), "utf8"), now = () => performance.now()) {
    const timers = new Map<number, () => void>();
    let scheduled = 0;
    let heapReads = 0;
    const intervals = new Map<number, () => void>();
    let intervalId = 0;
    const surface = {
        setInterval(callback: () => void) { const id = ++intervalId; intervals.set(id, callback); return id; },
        clearInterval(id?: number) { if (id !== undefined) intervals.delete(id); }
    };
    const result = await build({ stdin: { contents: source, resolveDir: process.cwd(), sourcefile: "PluginProfiler.ts", loader: "ts" }, bundle: true, platform: "node", format: "cjs", write: false,
        plugins: [{ name: "profiler-environment", setup(plugin) {
            plugin.onResolve({ filter: /Logger|RuntimeInterposition/ }, args => ({ path: args.path, namespace: "fixture" }));
            plugin.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.includes("Logger")
                ? "export class Logger { warn() {} error() {} }"
                : "export const RuntimeInterposition = { getActiveHooks: () => [], register: () => () => {} }; export const RuntimeInterpositionPriority = { DIAGNOSTICS: 0 };" }));
        } }] });
    const container = { exports: {} as { PluginProfiler: FixtureProfiler; } };
    const clock = { now, get memory() { heapReads++; return { usedJSHeapSize: 1_048_576 }; } };
    runInNewContext(`(function(module, exports) {\n${result.outputFiles[0].text}\n})(module, exports);`, { module: container, exports: container.exports, performance: clock, console, window: surface,
        setTimeout(callback: () => void) { const id = ++scheduled; timers.set(id, callback); return id; },
        clearTimeout(id: number) { timers.delete(id); } });
    return { profiler: container.exports.PluginProfiler, get scheduled() { return scheduled; }, get pending() { return timers.size; }, get heapReads() { return heapReads; },
        interval(callback: () => void) { return surface.setInterval(callback); },
        clearInterval(id: number) { surface.clearInterval(id); },
        runInterval(id: number) { intervals.get(id)?.(); },
        flush() { const callbacks = [...timers.values()]; timers.clear(); for (const callback of callbacks) callback(); } };
}
