/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { packageCompatibility } from "./compatibility";
import { analyzePluginConflicts } from "./conflicts";
import { type ExternalPackage as ThemePackage, parseExternalPackage as parseThemePackage, verifyExternalPackage as verifyThemePackage } from "./javascriptPackage";
import { checkedObject, type PluginManifest } from "./manifest";
import { createPluginRuntime, type RuntimeDefinition, RuntimeOperationError, type RuntimeOptions } from "./runtime";
import { compareVersions } from "./versions";

interface PackageEntry { current: ThemePackage; previous?: ThemePackage; enabled: boolean; pending: boolean; failure?: string; updatedAt?: number; }
export interface PackageRegistry { schemaVersion: 1; revision: number; entries: PackageEntry[]; }
export interface PackageStorage { read(): Promise<unknown>; write(next: PackageRegistry, expectedRevision: number): Promise<void>; }
const failureCodes = ["interrupted", "activation-failed", "update-reverted", "recovery-failed", "cleanup-failed", "admission-failed"];

export function parsePackageRegistry(value: unknown): PackageRegistry {
    if (value === undefined) return { schemaVersion: 1, revision: 0, entries: [] };
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024) throw new Error("The package registry exceeds 4 MiB.");
    const data = checkedObject(value, ["schemaVersion", "revision", "entries"], "Package registry");
    if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || typeof data.revision !== "number" || data.revision < 0
        || !Array.isArray(data.entries) || data.entries.length > 32) throw new Error("Unsupported package registry schema or size.");
    const entries = data.entries.map(value => {
        const item = checkedObject(value, ["current", "previous", "enabled", "pending", "failure", "updatedAt"], "Package record");
        if (item.updatedAt !== undefined && (typeof item.updatedAt !== "number" || !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0)) throw new Error("Invalid package update date.");
        if (typeof item.enabled !== "boolean" || typeof item.pending !== "boolean" || (item.failure !== undefined && (typeof item.failure !== "string" || !failureCodes.includes(item.failure)))) throw new Error("Invalid package activation record.");
        const current = parseThemePackage(item.current);
        const previous = item.previous === undefined ? undefined : parseThemePackage(item.previous);
        if (previous && previous.manifest.id !== current.manifest.id) throw new Error("The backup package identifier does not match.");
        return { current, ...(previous ? { previous } : {}), enabled: item.enabled, pending: item.pending, ...(typeof item.failure === "string" ? { failure: item.failure } : {}), ...(typeof item.updatedAt === "number" ? { updatedAt: item.updatedAt } : {}) };
    });
    if (new Set(entries.map(item => item.current.manifest.id)).size !== entries.length) throw new Error("Duplicate installed package identifiers.");
    return { schemaVersion: 1, revision: data.revision, entries };
}

export function createPackageRegistry(storage: PackageStorage, options: RuntimeOptions & { recovery?: boolean; define(bundle: ThemePackage): RuntimeDefinition; changed?(): void; inspect?(bundle: ThemePackage, purpose?: "review" | "activation"): Promise<void>; checkPackage?(manifest: PluginManifest): Promise<"allowed" | "blocked">; }) {
    const runtime = createPluginRuntime(options);
    let document: PackageRegistry = { schemaVersion: 1, revision: 0, entries: [] };
    let ready = false;
    let initialization: Promise<void> | undefined;
    const startupFailures = new Set<string>();
    let tail = Promise.resolve();
    async function verifyBundle(value: unknown, purpose: "review" | "activation" = "activation") {
        const bundle = await verifyThemePackage(value);
        await options.inspect?.(bundle, purpose);
        if (purpose !== "review" && await options.checkPackage?.(bundle.manifest) === "blocked") throw new Error("This artifact is blocked by trusted catalog metadata. Keep it disabled and choose a reviewed replacement.");
        return bundle;
    }
    function record(id: string) {
        const found = document.entries.find(item => item.current.manifest.id === id);
        if (!found) throw new Error("This external package is not installed.");
        return found;
    }
    function assertCurrent(id: string) {
        const active = runtime.inventory().find(item => item.manifest.id === id);
        const stored = record(id).current.manifest;
        if (active && (active.manifest.version !== stored.version || active.manifest.integrity.digest !== stored.integrity.digest))
            throw new Error("The failed candidate differs from the stored current package. Disable it to finish cleanup, then reload before activation or replacement.");
        return active;
    }
    async function save(entries: PackageEntry[]) {
        const next = parsePackageRegistry({ schemaVersion: 1, revision: document.revision + 1, entries });
        await storage.write(next, document.revision);
        document = next;
    }
    async function change(id: string, values: Partial<PackageEntry>) {
        await save(document.entries.map(item => item.current.manifest.id === id ? { ...item, ...values } : item));
    }
    function operation<T>(action: () => Promise<T>): Promise<T> {
        const result = tail.then(async () => {
            if (!ready) throw new Error("Package storage is unavailable. Reload the client after repairing storage; existing data is preserved.");
            try { return await action(); } finally { options.changed?.(); }
        });
        tail = result.then(() => {}, () => {});
        return result;
    }
    function review(bundle: ThemePackage) {
        if (options.reservedIds?.some(id => id.toLowerCase() === bundle.manifest.id.toLowerCase())) throw new Error("The identifier belongs to a built-in plugin.");
        const findings = analyzePluginConflicts([...document.entries.filter(item => item.current.manifest.id !== bundle.manifest.id).map(item => item.current.manifest), bundle.manifest], options);
        const blocked = findings.filter(finding => finding.plugins.includes(bundle.manifest.id) && finding.classification === "Confirmed conflict");
        if (blocked.length) throw new Error(blocked.map(finding => `${finding.message} ${finding.remediation}`).join(" "));
        if (["chrome", "edge", "firefox"].includes(options.platform)) throw new Error("External installation is unavailable in browser builds. Use reviewed packaged plugins.");
        return findings;
    }
    async function enable(id: string) {
        await verifyBundle(record(id).current);
        assertCurrent(id);
        if (runtime.inventory().find(item => item.manifest.id === id)?.state === "running") return;
        await change(id, { pending: true });
        try {
            await runtime.enable(id, () => change(id, { enabled: true, pending: false, failure: undefined }));
        } catch (problem) {
            await change(id, { enabled: false, pending: false, failure: problem instanceof RuntimeOperationError && problem.code.includes("cleanup") ? "cleanup-failed" : "activation-failed" });
            throw problem;
        }
    }
    return {
        enforcePolicy() {
            return operation(async () => {
                const disabled: string[] = [];
                const affected = new Set<string>();
                for (const item of document.entries) {
                    if (await options.checkPackage?.(item.current.manifest) === "blocked") affected.add(item.current.manifest.id);
                }
                let size = -1;
                while (size !== affected.size) {
                    size = affected.size;
                    for (const item of document.entries) if (item.current.manifest.dependencies.some(dependency => affected.has(dependency.id))) affected.add(item.current.manifest.id);
                }
                const visited = new Set<string>();
                async function disable(id: string) {
                    if (visited.has(id)) return;
                    visited.add(id);
                    for (const item of document.entries) if (affected.has(item.current.manifest.id) && item.current.manifest.dependencies.some(dependency => dependency.id === id)) await disable(item.current.manifest.id);
                    if (runtime.inventory().some(plugin => plugin.manifest.id === id)) await runtime.disable(id);
                    await change(id, { enabled: false, failure: "admission-failed" });
                    disabled.push(id);
                }
                for (const id of affected) await disable(id);
                return { disabled };
            });
        },
        audit() {
            return operation(async () => {
                const stored = parsePackageRegistry(await storage.read());
                const packages = await Promise.all(stored.entries.map(async item => {
                    let integrity = true;
                    try { await verifyThemePackage(item.current); } catch { integrity = false; }
                    let policy: "allowed" | "blocked" | "unavailable" = "allowed";
                    try { policy = await options.checkPackage?.(item.current.manifest) ?? "allowed"; } catch { policy = "unavailable"; }
                    return { id: item.current.manifest.id, version: item.current.manifest.version, integrity, policy,
                        enabled: item.enabled, pending: item.pending, failure: item.failure };
                }));
                return { revision: stored.revision, stale: stored.revision !== document.revision, packages,
                    findings: [...analyzePluginConflicts(stored.entries.map(item => item.current.manifest), options), ...packages.filter(item => item.policy !== "allowed").map(item => ({
                        classification: item.policy === "blocked" ? "Confirmed conflict" as const : "Potential overlap" as const, code: `catalog-${item.policy}`, plugins: [item.id],
                        message: item.policy === "blocked" ? "Trusted catalog metadata blocks this artifact." : "Catalog policy could not be verified.", remediation: "Keep the package disabled and use a verified build or reviewed replacement." }))] };
            });
        },
        initialize() {
            initialization ??= (async () => {
                if (["chrome", "edge", "firefox"].includes(options.platform)) { ready = true; return; }
                document = parsePackageRegistry(await storage.read());
                if (document.entries.some(item => item.pending)) await save(document.entries.map(item => item.pending ? { ...item, enabled: false, pending: false, failure: "interrupted" } : item));
                const remaining = new Map(document.entries.map(item => [item.current.manifest.id, item]));
                const order: string[] = [];
                while (remaining.size) {
                    const available = [...remaining].find(([, item]) => item.current.manifest.dependencies.every(dep => !remaining.has(dep.id)));
                    if (!available) {
                        for (const [id, item] of remaining) {
                            if (item.enabled) startupFailures.add(id);
                            await change(id, { enabled: false, failure: "admission-failed" });
                        }
                        break;
                    }
                    const [id, item] = available;
                    remaining.delete(id);
                    try {
                        const bundle = await verifyBundle(item.current);
                        await runtime.register(options.define(bundle));
                        order.push(id);
                    } catch {
                        if (item.enabled) startupFailures.add(id);
                        await change(id, { enabled: false, failure: "admission-failed" });
                    }
                }
                for (const id of order) {
                    if (record(id).enabled) {
                        try { await enable(id); } catch (problem) {
                            startupFailures.add(id);
                            if (record(id).pending) throw problem;
                        }
                    }
                }
                ready = true;
            })().finally(() => options.changed?.());
            return initialization;
        },
        startupFailures() { return [...startupFailures]; },
        snapshot() {
            const inventory = runtime.inventory();
            return { ready, recovery: false, revision: document.revision, entries: document.entries.map(item => ({ manifest: structuredClone(item.current.manifest), enabled: item.enabled, pending: item.pending,
                failure: item.failure, updatedAt: item.updatedAt, previousVersion: item.previous?.manifest.version, runtime: inventory.find(plugin => plugin.manifest.id === item.current.manifest.id) })) };
        },
        review(value: unknown) {
            return operation(async () => { const bundle = await verifyBundle(value, "review"); const previous = document.entries.find(item => item.current.manifest.id === bundle.manifest.id)?.current; return { bundle, previous: previous ? structuredClone(previous) : undefined, findings: review(bundle), trust: "Unknown source" as const, policyBlocked: await options.checkPackage?.(bundle.manifest) === "blocked",
                compatibility: packageCompatibility(bundle, document.entries.map(item => item.current.manifest), options.platform, options.apiVersion) }; });
        },
        exportPackage(id: string) { return operation(async () => structuredClone(record(id).current)); },
        restart(id: string) {
            return operation(async () => {
                await verifyBundle(record(id).current);
                assertCurrent(id);
                if (runtime.inventory().some(item => item.state === "running" && item.manifest.dependencies.some(dep => dep.id === id))) throw new Error("Disable dependent packages before restarting.");
                await change(id, { enabled: false, pending: true });
                try { await runtime.disable(id); await change(id, { pending: false, failure: undefined }); }
                catch (problem) { await change(id, { pending: false, failure: "cleanup-failed" }); throw problem; }
                await enable(id);
            });
        },
        install(value: unknown, acknowledgedDigest: string, expectedCurrentDigest?: string) {
            return operation(async () => {
                const bundle = await verifyBundle(value);
                if (acknowledgedDigest !== bundle.manifest.integrity.digest) throw new Error("Review and acknowledge the exact package before installing.");
                review(bundle);
                const { id } = bundle.manifest;
                const previous = document.entries.find(item => item.current.manifest.id === id);
                if (expectedCurrentDigest !== undefined && previous?.current.manifest.integrity.digest !== expectedCurrentDigest) throw new Error("The installed package changed since review. Review the replacement again.");
                if (!previous) {
                    await runtime.register(options.define(bundle));
                    try { await save([...document.entries, { current: bundle, enabled: false, pending: false, updatedAt: Date.now() }]); }
                    catch (problem) { await runtime.remove(id); throw problem; }
                    return;
                }
                assertCurrent(id);
                await change(id, { pending: true });
                try {
                    await runtime.replace(id, options.define(bundle), () => change(id, { current: bundle, previous: previous.current, updatedAt: Date.now(), pending: false, failure: undefined }));
                } catch (problem) {
                    const active = runtime.inventory().find(item => item.manifest.id === id);
                    await change(id, { enabled: active?.state === "running", pending: false, failure: problem instanceof RuntimeOperationError && problem.code === "update-and-recovery-failed" ? "recovery-failed" : active?.state === "quarantined" ? "cleanup-failed" : "update-reverted" });
                    throw problem;
                }
            });
        },
        reviewPrevious(id: string) {
            return operation(async () => {
                const { previous } = record(id);
                if (!previous) throw new Error("This package has no stored backup.");
                const bundle = await verifyBundle(previous, "review");
                return { bundle, previous: structuredClone(record(id).current), findings: review(bundle), trust: "Unknown source" as const, policyBlocked: await options.checkPackage?.(bundle.manifest) === "blocked", registryRevision: document.revision,
                    compatibility: packageCompatibility(bundle, document.entries.map(item => item.current.manifest), options.platform, options.apiVersion) };
            });
        },
        restore(id: string, acknowledgedDigest: string, expectedRevision: number) {
            return operation(async () => {
                if (document.revision !== expectedRevision) throw new Error("Packages changed after the backup review. Review the stored backup again before restoring.");
                const previous = record(id);
                if (!previous.previous) throw new Error("This package has no stored backup.");
                const bundle = await verifyBundle(previous.previous);
                if (bundle.manifest.integrity.digest !== acknowledgedDigest) throw new Error("Review and acknowledge the exact backup before restoring.");
                if (compareVersions(bundle.manifest.version, previous.current.manifest.version) === 0) throw new Error("Backup restoration requires a different version.");
                review(bundle);
                const active = assertCurrent(id);
                await change(id, { pending: true });
                if (!active) {
                    try {
                        await runtime.register(options.define(bundle));
                        await change(id, { current: bundle, previous: previous.current, updatedAt: Date.now(), enabled: false, pending: false, failure: undefined });
                    } catch (problem) {
                        if (runtime.inventory().some(item => item.manifest.id === id)) await runtime.remove(id);
                        await change(id, { enabled: false, pending: false, failure: "admission-failed" });
                        throw problem;
                    }
                    return;
                }
                try {
                    await runtime.restore(id, options.define(bundle), () => change(id, { current: bundle, previous: previous.current, updatedAt: Date.now(), enabled: active.state === "running", pending: false, failure: undefined }));
                } catch (problem) {
                    const retained = runtime.inventory().find(item => item.manifest.id === id);
                    await change(id, { enabled: retained?.state === "running", pending: false, failure: problem instanceof RuntimeOperationError && problem.code === "update-and-recovery-failed" ? "recovery-failed" : retained?.state === "quarantined" ? "cleanup-failed" : "update-reverted" });
                    throw problem;
                }
            });
        },
        enable(id: string) {
            return operation(async () => {
                await enable(id);
            });
        },
        disable(id: string) {
            return operation(async () => {
                const dependents = runtime.inventory().filter(item => item.state === "running" && item.manifest.dependencies.some(dep => dep.id === id));
                if (dependents.length) throw new Error("Disable dependent packages first.");
                await change(id, { enabled: false, pending: true });
                try { await runtime.disable(id); await change(id, { pending: false, failure: undefined }); }
                catch (problem) { await change(id, { pending: false, failure: "cleanup-failed" }); throw problem; }
            });
        },
        runtimeFailure(id: string, expected?: { version: string; digest: string; }) {
            return operation(async () => {
                if (expected) {
                    const current = document.entries.find(item => item.current.manifest.id === id)?.current.manifest;
                    const active = runtime.inventory().find(item => item.manifest.id === id);
                    if (!current || current.version !== expected.version || current.integrity.digest !== expected.digest || active?.state !== "running"
                        || active.manifest.version !== expected.version || active.manifest.integrity.digest !== expected.digest) return;
                }
                await change(id, { enabled: false, pending: true });
                try { await runtime.disable(id); await change(id, { pending: false, failure: "activation-failed" }); }
                catch (problem) { await change(id, { pending: false, failure: "cleanup-failed" }); throw problem; }
            });
        },
        remove(id: string) {
            return operation(async () => {
                if (document.entries.some(item => item.current.manifest.dependencies.some(dep => dep.id === id))) throw new Error("Remove dependent packages first.");
                await change(id, { enabled: false, pending: true });
                if (runtime.inventory().some(item => item.manifest.id === id)) await runtime.remove(id);
                await save(document.entries.filter(item => item.current.manifest.id !== id));
            });
        }
    };
}
