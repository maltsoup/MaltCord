/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface ProbePackages {
    initialize(): Promise<void>;
    review(value: unknown): Promise<unknown>;
    install(value: unknown, digest: string): Promise<void>;
    enable(id: string): Promise<void>;
    disable(id: string): Promise<void>;
    remove(id: string): Promise<void>;
    snapshot(): { entries: { manifest: { id: string; version: string; }; enabled: boolean; pending: boolean; failure?: string; runtime?: { state: string; }; }[]; };
}

interface RuntimeHost {
    Api: { KittycordPackages: ProbePackages; };
    Components: { openSettingsTabModal(tab: unknown): void; KittycordPackagesTab: unknown; HealthTab: unknown; };
    Webpack: { Common: { UserStore: { getCurrentUser(): unknown; }; }; };
}

export async function run(afterReload = false) {
    const scope = globalThis as typeof globalThis & { __kittycordDisposableProbeStarted?: boolean; };
    if (scope.__kittycordDisposableProbeStarted) return { inspectionAlreadyRunning: true };
    scope.__kittycordDisposableProbeStarted = true;
    const host = globalThis as { Vencord?: RuntimeHost; VencordNative?: unknown; };
    const result: Record<string, boolean | string> = { kittycordLoaded: !!host.Vencord, nativeBridge: !!host.VencordNative, managerDialog: false, javascriptLifecycle: false, hotSwap: false, failureRollback: false, cleanup: false };
    if (!host.Vencord) return result;
    result.anonymousSession = !host.Vencord.Webpack.Common.UserStore.getCurrentUser();
    if (!result.anonymousSession) return result;
    const api = host.Vencord.Api.KittycordPackages;
    const id = "kittycord.test.javascript";
    let preserveForReload = false;
    async function bundle(artifact: string, version: string) {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(artifact));
        const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
        return { schemaVersion: 1, artifact, manifest: { schemaVersion: 1, id, name: "Disposable JavaScript fixture", version, description: "Temporary local runtime test.", author: "Fixture", publisher: "Fixture", minApiVersion: "1.0.0", platforms: ["windows"], loadingMode: "runtime", dependencies: [], optionalDependencies: [], capabilities: ["kittycord.isolated-js.v1", "theme.brand-500"], exclusiveCapabilities: ["theme.brand-500"], permissions: ["styles"], requiredPatches: [], incompatibleWith: [], entrypoints: { desktop: "plugin.js" }, provenance: { source: "https://example.invalid/fixture", revision: "fixture" }, integrity: { algorithm: "sha256", digest } } };
    }
    const applied = (color: string) => Array.from(document.querySelectorAll(".theme-dark,.theme-light")).some(element => getComputedStyle(element).getPropertyValue("--brand-500").trim() === color);
    try {
        await api.initialize();
        const first = await bundle('globalThis.kittycordPlugin={start(api){api.checkpoint({visits:1});api.setColors({"--brand-500":"#abcdef"});}};', "1.0.0");
        const retainedAcrossReload = api.snapshot().entries.find(item => item.manifest.id === id);
        if (!retainedAcrossReload) {
            await api.review(first);
            await api.install(first, first.manifest.integrity.digest);
            await api.enable(id);
        }
        result.javascriptLifecycle = api.snapshot().entries.find(item => item.manifest.id === id)?.runtime?.state === "running" && applied("#abcdef");
        if (!afterReload) {
            preserveForReload = true;
            result.reloadRequested = true;
            setTimeout(() => location.reload(), 300);
            return result;
        }
        result.persistedEnabled = retainedAcrossReload?.enabled === true && retainedAcrossReload.runtime?.state === "running";
        const second = await bundle('globalThis.kittycordPlugin={start(api,state){const resumed=state&&state.visits>=1;api.checkpoint({visits:resumed?state.visits+1:1});api.setColors({"--brand-500":resumed?"#123456":"#654321"});}};', "1.1.0");
        await api.install(second, second.manifest.integrity.digest);
        result.hotSwap = api.snapshot().entries.find(item => item.manifest.id === id)?.manifest.version === "1.1.0" && applied("#123456");
        const broken = await bundle('globalThis.kittycordPlugin={start(){throw Error("Deliberate fixture failure");}};', "2.0.0");
        let rejected = false;
        try { await api.install(broken, broken.manifest.integrity.digest); } catch { rejected = true; }
        const retained = api.snapshot().entries.find(item => item.manifest.id === id);
        result.failureRollback = rejected && retained?.manifest.version === "1.1.0" && retained.runtime?.state === "running" && applied("#123456");
        result.crashRequested = true;
        preserveForReload = true;
    } catch (problem) {
        result.javascriptError = problem instanceof Error ? problem.message.slice(0, 240) : "Runtime activation failed.";
        if (problem instanceof Error && problem.cause instanceof Error) result.javascriptCause = problem.cause.message.slice(0, 240);
    } finally {
        if (!preserveForReload && api.snapshot().entries.some(item => item.manifest.id === id)) await api.remove(id);
    }
    try {
        host.Vencord.Components.openSettingsTabModal(host.Vencord.Components.KittycordPackagesTab);
        await new Promise(resolve => setTimeout(resolve, 1000));
        result.managerDialog = Array.from(document.querySelectorAll('[role="dialog"]')).some(element => element.textContent?.includes("Review local package"));
    } catch { result.settingsProbeUnavailable = true; }
    return result;
}

export async function recoverAfterCrash() {
    const client = (globalThis as { Vencord?: RuntimeHost; }).Vencord;
    if (!client || client.Webpack.Common.UserStore.getCurrentUser()) return { crashRecovery: false };
    const api = client.Api.KittycordPackages;
    const id = "kittycord.test.javascript";
    try {
        for (let attempt = 0; attempt < 50; attempt++) {
            const entry = api.snapshot().entries.find(item => item.manifest.id === id);
            if (entry?.failure === "activation-failed" && !entry.enabled && !entry.pending) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const disabled = api.snapshot().entries.find(item => item.manifest.id === id);
        const crashRecovery = disabled?.enabled === false && disabled.failure === "activation-failed" && !document.querySelector(`style[data-kittycord-plugin="${id}"]`);
        client.Components.openSettingsTabModal(client.Components.HealthTab);
        await new Promise(resolve => setTimeout(resolve, 600));
        const card = Array.from(document.querySelectorAll<HTMLElement>(".vc-plugin-health-card")).find(element => element.textContent?.includes(id));
        if (card && !card.querySelector(".vc-plugin-health-card-body")) card.querySelector<HTMLElement>('[role="button"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 200));
        const doctorFinding = !!card?.textContent?.includes("isolated runtime");
        await api.enable(id);
        const manualRecovery = api.snapshot().entries.find(item => item.manifest.id === id)?.runtime?.state === "running";
        await api.disable(id);
        await api.remove(id);
        const cleanup = !api.snapshot().entries.some(item => item.manifest.id === id) && !document.querySelector(`style[data-kittycord-plugin="${id}"]`);
        return { crashRecovery, doctorFinding, manualRecovery, cleanup };
    } finally {
        if (api.snapshot().entries.some(item => item.manifest.id === id)) await api.remove(id);
    }
}
