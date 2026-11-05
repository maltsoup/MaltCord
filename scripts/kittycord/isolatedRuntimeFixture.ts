/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "../../src/api/DataStore";
import { createPackageRegistry, parsePackageRegistry } from "../../src/shared/kittycord/packageRegistry";
import { defineIsolatedJavascript } from "../../src/utils/isolatedPlugin";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function run() {
    const store = DataStore.createStore("KittycordJavaScriptFixture", "packages");
    const registry = createPackageRegistry({ read: () => DataStore.get("registry", store), write: async (next, revision) => { await DataStore.update("registry", previous => { if (parsePackageRegistry(previous).revision !== revision) throw new Error("Revision conflict."); return next; }, store); } }, {
        platform: "windows", apiVersion: "1.0.0", recovery: false, define: bundle => defineIsolatedJavascript(bundle, document, () => { void registry.runtimeFailure(bundle.manifest.id); })
    });
    async function bundle(source: string, version: string) {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
        const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
        return { schemaVersion: 1, artifact: source, manifest: { schemaVersion: 1, id: "fixture.javascript", name: "Fixture", version, description: "Isolated test.", author: "Fixture", publisher: "Fixture", minApiVersion: "1.0.0", platforms: ["windows"], loadingMode: "runtime", dependencies: [], optionalDependencies: [], capabilities: ["kittycord.isolated-js.v1", "theme.brand-500"], exclusiveCapabilities: ["theme.brand-500"], permissions: ["styles"], requiredPatches: [], incompatibleWith: [], entrypoints: { desktop: "plugin.js" }, provenance: { source: "https://example.invalid/fixture", revision: "fixture" }, integrity: { algorithm: "sha256", digest } } };
    }
    await registry.initialize();
    const first = await bundle(`globalThis.kittycordPlugin={async start(api,state){let denied=false;try{await globalThis["fet"+"ch"]("${location.origin}/escape");}catch{denied=true;}if(!denied||typeof document!=="undefined"||typeof require!=="undefined")throw Error("Boundary failure");api.checkpoint({visits:(state?.visits||0)+1});api.setColors({"--brand-500":"#abcdef"});}};`, "1.0.0");
    const review = await registry.review(first);
    await registry.install(review.bundle, review.bundle.manifest.integrity.digest);
    assert(document.querySelectorAll("iframe").length === 0, "Installation must remain inactive.");
    await registry.enable(first.manifest.id);
    assert(getComputedStyle(document.body).getPropertyValue("--brand-500").trim() === "#abcdef", "Isolated JavaScript must apply declared colors.");
    assert(document.querySelector("iframe")?.getAttribute("sandbox") === "allow-scripts", "Frame must keep an opaque origin.");
    const second = await bundle('globalThis.kittycordPlugin={start(api,state){if(!state||state.visits<1)throw Error("Lost state");api.checkpoint({visits:state.visits+1});api.setColors({"--brand-500":"#123456"});}};', "1.1.0");
    await registry.install(second, second.manifest.integrity.digest);
    assert(document.querySelectorAll("iframe").length === 1, "Hot swap must retire the old worker owner.");
    assert(getComputedStyle(document.body).getPropertyValue("--brand-500").trim() === "#123456", "Hot swap must apply new JavaScript.");
    const failed = await bundle('globalThis.kittycordPlugin={start(){throw Error("Fixture failure");}};', "2.0.0");
    let rejected = false;
    try { await registry.install(failed, failed.manifest.integrity.digest); } catch { rejected = true; }
    assert(rejected && registry.snapshot().entries[0].runtime?.state === "running" && registry.snapshot().entries[0].manifest.version === "1.1.0", "Failed update must restore previous JavaScript.");
    const hostile = await bundle('globalThis.kittycordPlugin={start(){postMessage({type:"colors",colors:{"--text-muted":"#abcdef"}});}};', "3.0.0");
    rejected = false;
    try { await registry.install(hostile, hostile.manifest.integrity.digest); } catch { rejected = true; }
    assert(rejected && document.querySelectorAll("iframe").length === 1, "Undeclared host access must fail and clean up.");
    const hanging = await bundle("globalThis.kittycordPlugin={start(){while(true){}}};", "4.0.0");
    let heartbeat = false;
    const pulse = setTimeout(() => { heartbeat = true; }, 30);
    rejected = false;
    try { await registry.install(hanging, hanging.manifest.integrity.digest); } catch { rejected = true; }
    clearTimeout(pulse);
    assert(rejected && heartbeat && registry.snapshot().entries[0].runtime?.state === "running", "A blocked worker must time out without blocking the host and restore its predecessor.");
    const invalid = await bundle("not valid JavaScript !!!", "5.0.0");
    rejected = false;
    try { await registry.install(invalid, invalid.manifest.integrity.digest); } catch { rejected = true; }
    assert(rejected && registry.snapshot().entries[0].runtime?.state === "running", "Syntax failures must restore the previous runtime.");
    const spoof = await bundle('postMessage({type:"ready"});globalThis.kittycordPlugin={start(){while(true){}}};', "6.0.0");
    rejected = false;
    try { await registry.install(spoof, spoof.manifest.integrity.digest); } catch { rejected = true; }
    assert(rejected && registry.snapshot().entries[0].runtime?.state === "running", "Untrusted source must not forge lifecycle readiness.");
    await registry.disable(first.manifest.id);
    assert(document.querySelectorAll("iframe").length === 0 && !document.querySelector("style[data-kittycord-plugin]"), "Disable must remove worker owner and styles.");
    await registry.remove(first.manifest.id);
    assert(registry.snapshot().entries.length === 0, "Removal must clear persistent package metadata.");
    const policy = document.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy"; policy.content = "script-src 'self'; worker-src 'none'";
    document.head.appendChild(policy);
    await registry.install(first, first.manifest.integrity.digest);
    rejected = false;
    try { await registry.enable(first.manifest.id); } catch { rejected = true; }
    assert(rejected && registry.snapshot().entries[0].enabled === false && document.querySelectorAll("iframe").length === 0, "Restrictive host policies must fail closed without changing security or retaining frames.");
    return { disabledInstall: true, opaqueFrame: true, workerNetworkBlocked: true, noDomOrNode: true, actualJavaScriptColors: true, hotSwap: true, stateTransfer: true, failedUpdateRecovery: true, permissionDenial: true, cleanup: true, durableRemoval: true, hangingWorkerRecovery: true, hostResponsive: true, syntaxFailureRecovery: true, strictHostPolicyFailClosed: true, forgedReadinessRejected: true };
}
