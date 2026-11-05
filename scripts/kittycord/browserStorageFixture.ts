/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { createPackageRegistry, parsePackageRegistry } from "@shared/kittycord/packageRegistry";
import { defineThemePackage, type ThemePackage } from "@shared/kittycord/themePackage";

const store = DataStore.createStore("KittycordRuntimeFixture", "packages");
function service() {
    return createPackageRegistry({ read: () => DataStore.get<unknown>("registry", store), async write(next, revision) {
        await DataStore.update<unknown>("registry", previous => {
            if (parsePackageRegistry(previous).revision !== revision) throw new Error("Fixture revision conflict");
            return next;
        }, store);
    } }, { platform: "windows", apiVersion: "1.0.0", recovery: false, define: value => defineThemePackage(value, document) });
}
async function bundle(version = "1.0.0", color = "#abcdef"): Promise<ThemePackage> {
    const artifact = JSON.stringify({ schemaVersion: 1, kind: "theme-tokens", colors: { "--brand-500": color } });
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(artifact));
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    return { schemaVersion: 1, artifact, manifest: { schemaVersion: 1, id: "fixture.browser-storage", name: "Browser storage fixture", version, author: "Fixture", publisher: "Fixture", description: "Disposable host fixture.", minApiVersion: "1.0.0", platforms: ["windows"], loadingMode: "runtime", dependencies: [], optionalDependencies: [], capabilities: ["kittycord.theme-tokens.v1", "theme.brand-500"], exclusiveCapabilities: ["theme.brand-500"], permissions: ["styles"], requiredPatches: [], incompatibleWith: [], entrypoints: { desktop: "theme.json" }, provenance: { source: "https://example.invalid/fixture", revision: "fixture" }, integrity: { algorithm: "sha256", digest } } };
}
function assert(value: boolean, message: string) { if (!value) throw new Error(message); }
function styles() { return document.querySelectorAll("style[data-kittycord-plugin]").length; }

export async function firstRound() {
    const runtime = service();
    await runtime.initialize();
    const reviewed = await runtime.review(await bundle());
    await runtime.install(reviewed.bundle, reviewed.bundle.manifest.integrity.digest);
    assert(styles() === 0, "Install must not activate styles.");
    await runtime.enable(reviewed.bundle.manifest.id);
    assert(styles() === 1, "Activation must own one style.");
    assert(getComputedStyle(document.body).getPropertyValue("--brand-500").trim() === "#abcdef", "The color token must apply in the browser DOM.");
    const saved = parsePackageRegistry(await DataStore.get<unknown>("registry", store));
    assert(saved.entries[0].enabled && !saved.entries[0].pending, "Activation must be durably committed.");
    await DataStore.set("fault", 1, store);
    let updaterRejected = false;
    try { await DataStore.update("fault", () => { throw new Error("Fixture updater failure"); }, store); } catch { updaterRejected = true; }
    assert(updaterRejected && await DataStore.get("fault", store) === 1, "Updater failure must reject without changing storage.");
    let abortRejected = false;
    const abortingStore: DataStore.UseStore = (mode, callback) => store(mode, objectStore => {
        const result = callback(objectStore);
        objectStore.transaction.abort();
        return result;
    });
    try { await DataStore.update("fault", () => 2, abortingStore); } catch { abortRejected = true; }
    assert(abortRejected && await DataStore.get("fault", store) === 1, "Aborted reads must reject without hanging or changing storage.");
    return { disabledInstall: true, appliedColor: true, durableActivation: true, updaterAbort: true, readAbort: true };
}

export async function afterReload() {
    const runtime = service();
    await runtime.initialize();
    assert(runtime.snapshot().entries[0].runtime?.state === "running" && styles() === 1, "The committed package must reload from IndexedDB.");
    const { id } = runtime.snapshot().entries[0].manifest;
    await runtime.disable(id);
    assert(styles() === 0 && getComputedStyle(document.body).getPropertyValue("--brand-500").trim() === "", "Disable must remove only the package color override.");
    const saved = parsePackageRegistry(await DataStore.get<unknown>("registry", store));
    await DataStore.set("registry", { ...saved, revision: saved.revision + 1 }, store);
    let staleRejected = false;
    try { await runtime.enable(id); } catch { staleRejected = true; }
    assert(staleRejected && styles() === 0, "Stale revision must fail before activation.");
    const refreshed = service();
    await refreshed.initialize();
    await refreshed.remove(id);
    assert(parsePackageRegistry(await DataStore.get<unknown>("registry", store)).entries.length === 0, "Removal must persist.");
    return { persistedAcrossReload: true, cleanedStyles: true, staleRevisionRejected: true, removalPersisted: true };
}

export async function restoreRound() {
    const runtime = service();
    await runtime.initialize();
    const first = await bundle();
    await runtime.install(first, first.manifest.integrity.digest);
    await runtime.enable(first.manifest.id);
    const next = await bundle("2.0.0", "#123456");
    await runtime.install(next, next.manifest.integrity.digest);
    assert(getComputedStyle(document.body).getPropertyValue("--brand-500").trim() === "#123456", "The update must change the real color token.");
    const previous = await runtime.reviewPrevious(first.manifest.id);
    assert(previous.bundle.manifest.version === "1.0.0", "Backup review must select the previous version.");
    await runtime.restore(first.manifest.id, previous.bundle.manifest.integrity.digest, previous.registryRevision);
    assert(styles() === 1 && getComputedStyle(document.body).getPropertyValue("--brand-500").trim() === "#abcdef", "Restoration must replace, rather than overlap, style resources.");
    const saved = parsePackageRegistry(await DataStore.get<unknown>("registry", store));
    assert(saved.entries[0].current.manifest.version === "1.0.0" && saved.entries[0].previous?.manifest.version === "2.0.0", "Restoration must commit current/previous identities.");
    return { backupReviewed: true, restoredColor: true, backupRotated: true };
}

export async function afterRestoreReload() {
    const runtime = service();
    await runtime.initialize();
    const [entry] = runtime.snapshot().entries;
    assert(entry.manifest.version === "1.0.0" && entry.runtime?.state === "running" && styles() === 1, "The restored package must persist across a real page reload.");
    await runtime.remove(entry.manifest.id);
    assert(styles() === 0 && parsePackageRegistry(await DataStore.get<unknown>("registry", store)).entries.length === 0, "Removal must clean the restored package and registry.");
    return { persistedBackupRestoration: true, removalAfterRestoration: true };
}
