/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { analyzePluginConflicts } from "./conflicts";
import { parsePluginManifest, type PluginManifest, type PluginPlatform } from "./manifest";
import { createPluginResources, type PluginResources } from "./resources";
import { compareVersions } from "./versions";

export type RuntimeState = "installed" | "loading" | "running" | "stopping" | "disabled" | "failed" | "quarantined" | "update-pending";
export interface RuntimeContext { resources: PluginResources; signal: AbortSignal; previousState?: unknown; }
export interface RuntimeDefinition {
    manifest: PluginManifest;
    start(context: RuntimeContext): void | Promise<void>;
    stop?(): void | Promise<void>;
    captureState?(): unknown;
}
interface RuntimeEntry { definition: RuntimeDefinition; state: RuntimeState; resources?: PluginResources; cancellation?: AbortController; pending?: Set<Promise<unknown>>; failure?: string; }
export interface RuntimeOptions {
    platform: PluginPlatform; apiVersion: string; reservedIds?: readonly string[]; lifecycleTimeoutMs?: number;
    measure?<T>(pluginId: string, surface: string, action: () => T): T;
}

export class RuntimeOperationError extends Error {
    constructor(public readonly pluginId: string, public readonly code: string, public readonly recovered: boolean, cause?: unknown) {
        super(`Runtime operation failed for ${pluginId}: ${code}.`, { cause });
    }
}

const transitions: Record<RuntimeState, readonly RuntimeState[]> = {
    installed: ["loading", "disabled", "update-pending"], loading: ["running", "failed", "quarantined"], running: ["stopping", "update-pending"],
    stopping: ["disabled", "quarantined", "update-pending"], disabled: ["loading", "update-pending"], failed: ["loading", "disabled", "update-pending"],
    quarantined: ["stopping"], "update-pending": ["stopping", "disabled", "running", "failed", "quarantined"]
};

export function createPluginRuntime(options: RuntimeOptions) {
    const timeoutMs = options.lifecycleTimeoutMs ?? 10_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("Lifecycle deadlines must be between 1 and 60000 milliseconds.");
    const entries = new Map<string, RuntimeEntry>();
    let tail = Promise.resolve();
    function transaction<T>(action: () => Promise<T>): Promise<T> {
        const result = tail.then(action);
        tail = result.then(() => {}, () => {});
        return result;
    }
    function entry(id: string) {
        const found = entries.get(id);
        if (!found) throw new Error("The runtime plugin is not installed.");
        return found;
    }
    function transition(plugin: RuntimeEntry, state: RuntimeState) {
        if (!transitions[plugin.state].includes(state)) throw new Error(`Invalid runtime transition: ${plugin.state} to ${state}.`);
        plugin.state = state;
    }
    function validate(definition: RuntimeDefinition, replacing?: string): RuntimeDefinition {
        const manifest = parsePluginManifest(JSON.stringify(definition.manifest));
        if (["chrome", "edge", "firefox"].includes(options.platform)) throw new Error("External runtime activation is unavailable in browser extensions. Use the packaged review workflow.");
        if (manifest.loadingMode !== "runtime") throw new Error("This lifecycle only accepts reviewed runtime definitions. Patch/native plugins need the build workflow.");
        if (options.reservedIds?.some(id => id.toLowerCase() === manifest.id.toLowerCase())) throw new Error("The identifier is reserved by an existing built-in plugin.");
        const installed = [...entries.values()].filter(plugin => plugin.definition.manifest.id !== replacing).map(plugin => plugin.definition.manifest);
        const findings = analyzePluginConflicts([...installed, manifest], options).filter(finding => finding.plugins.includes(manifest.id) && finding.classification === "Confirmed conflict");
        if (findings.length) throw new Error(findings.map(finding => `${finding.message} ${finding.remediation}`).join(" "));
        return { ...definition, manifest };
    }
    function dependents(id: string, runningOnly: boolean) {
        return [...entries.values()].filter(plugin => (!runningOnly || plugin.state === "running") && plugin.definition.manifest.dependencies.some(dependency => dependency.id === id));
    }
    async function deadline<T>(plugin: RuntimeEntry, phase: string, action: () => T | Promise<T>): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const operation = Promise.resolve().then(() => options.measure && phase !== "resource-cleanup" ? options.measure(plugin.definition.manifest.id, phase, action) : action());
        const pending = plugin.pending ??= new Set();
        pending.add(operation);
        void operation.then(() => { pending.delete(operation); }, () => { pending.delete(operation); });
        try {
            return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new RuntimeOperationError(plugin.definition.manifest.id, `${phase}-timeout`, false)), timeoutMs);
            })]);
        } finally { if (timer !== undefined) clearTimeout(timer); }
    }
    async function cleanup(plugin: RuntimeEntry) {
        try {
            const result = await deadline(plugin, "resource-cleanup", async () => plugin.resources?.dispose());
            return { failed: !!result?.remaining, errors: result?.errors };
        } catch (problem) { return { failed: true, errors: [problem] }; }
    }
    async function start(plugin: RuntimeEntry, previousState?: unknown, commit?: () => Promise<void>) {
        for (const dependency of plugin.definition.manifest.dependencies) {
            if (entries.get(dependency.id)?.state !== "running") throw new Error(`Enable required dependency ${dependency.id} first.`);
        }
        transition(plugin, "loading");
        const { measure } = options;
        const resources = createPluginResources(measure ? (surface, action) => measure(plugin.definition.manifest.id, surface, action) : undefined);
        const cancellation = new AbortController();
        plugin.resources = resources;
        plugin.cancellation = cancellation;
        let started = false;
        try {
            await deadline(plugin, "start", () => plugin.definition.start({ resources, signal: cancellation.signal, previousState }));
            started = true;
            if (commit) await commit();
            transition(plugin, "running");
            plugin.failure = undefined;
        } catch (problem) {
            cancellation.abort();
            let stopFailed = false;
            let stopFailure: unknown;
            if (started) {
                try { await deadline(plugin, "stop", () => plugin.definition.stop?.()); } catch (problem) { stopFailed = true; stopFailure = problem; }
            }
            const disposed = await cleanup(plugin);
            const timedOut = problem instanceof RuntimeOperationError && problem.code === "start-timeout";
            plugin.failure = disposed.failed || stopFailed ? "startup-cleanup-failed" : timedOut ? "startup-timeout" : started ? "activation-commit-failed" : "startup-failed";
            transition(plugin, disposed.failed || stopFailed || timedOut ? "quarantined" : "failed");
            throw new RuntimeOperationError(plugin.definition.manifest.id, plugin.failure, false, disposed.failed || stopFailed ? { startup: problem, stop: stopFailure, cleanup: disposed.errors } : problem);
        }
    }
    async function stop(plugin: RuntimeEntry, next: "disabled" | "update-pending" = "disabled") {
        transition(plugin, "stopping");
        plugin.cancellation?.abort();
        let stopFailure: unknown;
        let failedStop = false;
        try { await deadline(plugin, "stop", () => plugin.definition.stop?.()); } catch (problem) { stopFailure = problem; failedStop = true; }
        const disposed = await cleanup(plugin);
        if (failedStop || disposed.failed || plugin.pending?.size) {
            plugin.failure = "cleanup-failed";
            transition(plugin, "quarantined");
            throw new RuntimeOperationError(plugin.definition.manifest.id, plugin.failure, false, stopFailure ?? disposed.errors);
        }
        plugin.resources = undefined;
        plugin.cancellation = undefined;
        transition(plugin, next);
    }
    function replaceDefinition(id: string, definition: RuntimeDefinition, commit?: () => Promise<void>, restoring = false) {
        return transaction(async () => {
            const previous = entry(id);
            if (dependents(id, true).length) throw new Error("Disable running dependent plugins before replacing their dependency.");
            const reviewed = validate(definition, id);
            if (reviewed.manifest.id !== id) throw new Error("An update must retain the plugin identifier.");
            const comparison = compareVersions(reviewed.manifest.version, previous.definition.manifest.version);
            if (restoring ? comparison === 0 : comparison <= 0) throw new Error(restoring ? "Backup restoration requires a different version." : "Runtime updates require a newer version.");
            if (previous.state === "quarantined") throw new Error("Repair cleanup before updating a quarantined plugin.");
            const wasRunning = previous.state === "running";
            const capture = () => previous.definition.captureState?.();
            const savedState: unknown = wasRunning ? structuredClone(options.measure ? options.measure(id, "captureState", capture) : capture()) : undefined;
            transition(previous, "update-pending");
            if (wasRunning) await stop(previous, "update-pending");
            const candidate: RuntimeEntry = { definition: reviewed, state: "installed" };
            if (!wasRunning) {
                try { if (commit) await commit(); }
                catch (problem) { transition(previous, "disabled"); throw new RuntimeOperationError(id, "update-commit-failed", true, problem); }
                transition(candidate, "disabled"); entries.set(id, candidate); return;
            }
            try {
                await start(candidate, structuredClone(savedState), commit);
                entries.set(id, candidate);
            } catch (problem) {
                if (candidate.state === "quarantined") {
                    entries.set(id, candidate);
                    throw new RuntimeOperationError(id, "update-cleanup-failed", false, problem);
                }
                transition(previous, "disabled");
                try { await start(previous, structuredClone(savedState)); }
                catch (rollbackFailure) { throw new RuntimeOperationError(id, "update-and-recovery-failed", false, rollbackFailure); }
                previous.failure = "update-reverted";
                throw new RuntimeOperationError(id, "update-reverted", true, problem);
            }
        });
    }
    return {
        inventory() {
            return [...entries.values()].map(plugin => ({ manifest: structuredClone(plugin.definition.manifest), state: plugin.state, activeResources: plugin.resources?.size ?? 0, pendingLifecycleOperations: plugin.pending?.size ?? 0, failure: plugin.failure }));
        },
        register(definition: RuntimeDefinition) {
            return transaction(async () => {
                const reviewed = validate(definition);
                entries.set(reviewed.manifest.id, { definition: reviewed, state: "installed" });
            });
        },
        enable(id: string, commit?: () => Promise<void>) {
            return transaction(async () => {
                const plugin = entry(id);
                if (plugin.state === "running") return;
                if (plugin.state === "quarantined") throw new Error("Cleanup is incomplete. Disable and repair the quarantined plugin before retrying.");
                validate(plugin.definition, id);
                await start(plugin, undefined, commit);
            });
        },
        disable(id: string) {
            return transaction(async () => {
                const plugin = entry(id);
                if (dependents(id, true).length) throw new Error("Disable running dependent plugins first.");
                if (plugin.state === "disabled") return;
                if (plugin.state === "installed" || plugin.state === "failed") transition(plugin, "disabled");
                else await stop(plugin);
            });
        },
        remove(id: string) {
            return transaction(async () => {
                const plugin = entry(id);
                if (dependents(id, false).length) throw new Error("Remove or update dependent plugins first.");
                if (plugin.state === "running" || plugin.state === "quarantined") await stop(plugin);
                entries.delete(id);
            });
        },
        replace(id: string, definition: RuntimeDefinition, commit?: () => Promise<void>) { return replaceDefinition(id, definition, commit); },
        restore(id: string, definition: RuntimeDefinition, commit?: () => Promise<void>) { return replaceDefinition(id, definition, commit, true); }
    };
}
