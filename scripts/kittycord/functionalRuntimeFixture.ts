/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "../../src/api/DataStore";
import { KittycordUtility } from "../../src/api/KittycordUtility";
import { createPackageRegistry, parsePackageRegistry } from "../../src/shared/kittycord/packageRegistry";
import { buildStudioPackage, newUtilityProject } from "../../src/shared/kittycord/studio";
import { defineIsolatedJavascript } from "../../src/utils/isolatedPlugin";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function waitFor(test: () => boolean) { for (let i = 0; i < 50; i++) { if (test()) return; await sleep(50); } throw new Error("Functional utility output did not arrive."); }

export async function run() {
    const bundle = await buildStudioPackage(newUtilityProject()); const { id } = bundle.manifest;
    const registry = createPackageRegistry({ read: () => DataStore.get("functional.registry"), async write(next, revision) { await DataStore.update("functional.registry", previous => { assert(parsePackageRegistry(previous).revision === revision, "Stale registry commit"); return next; }); } }, {
        apiVersion: "1.1.0", platform: "windows", recovery: false, define: bundle => defineIsolatedJavascript(bundle, document, () => { void registry.runtimeFailure(bundle.manifest.id, { version: bundle.manifest.version, digest: bundle.manifest.integrity.digest }); }, undefined, KittycordUtility.bridge)
    });
    await registry.initialize(); await registry.install(bundle, bundle.manifest.integrity.digest);
    assert(!KittycordUtility.snapshot(id), "New packages must remain disabled.");
    await registry.enable(id);
    await waitFor(() => KittycordUtility.snapshot(id)?.panel.text === "25:00");
    KittycordUtility.action(id, "start"); await waitFor(() => KittycordUtility.snapshot(id)?.panel.text === "24:59");
    KittycordUtility.action(id, "pause"); await sleep(150); const paused = KittycordUtility.snapshot(id)?.panel.text; await sleep(1100);
    assert(KittycordUtility.snapshot(id)?.panel.text === paused, "Pause must stop the worker timer.");
    await KittycordUtility.save(id, { minutes: 1 }); await waitFor(() => KittycordUtility.snapshot(id)?.panel.text === "1:00");
    await registry.disable(id); assert(!KittycordUtility.snapshot(id) && document.querySelectorAll("iframe").length === 0, "Disable must remove the utility surface and worker owner.");
    await registry.enable(id); await waitFor(() => KittycordUtility.snapshot(id)?.panel.text === "1:00");
    const next = newUtilityProject(); next.metadata.version = "1.1.0"; next.source = next.source.replace("Focus sessions", "Updated focus sessions");
    const update = await buildStudioPackage(next); await registry.install(update, update.manifest.integrity.digest);
    await waitFor(() => KittycordUtility.snapshot(id)?.panel.title === "Updated focus sessions");
    const broken = await buildStudioPackage({ ...next, metadata: { ...next.metadata, version: "2.0.0" }, source: 'globalThis.kittycordPlugin={start(api){api.publishPanel({title:"Bad",text:"",actions:[],settings:[],html:"untrusted"});}};' });
    let rejected = false; try { await registry.install(broken, broken.manifest.integrity.digest); } catch { rejected = true; }
    assert(rejected && registry.snapshot().entries[0].manifest.version === "1.1.0", "Invalid panel update must restore the previous package.");
    await waitFor(() => KittycordUtility.snapshot(id)?.panel.title === "Updated focus sessions");
    assert(document.querySelectorAll("iframe").length === 1, "Hot swap must leave one worker owner.");
    await registry.remove(id);
    assert(!KittycordUtility.snapshot(id) && document.querySelectorAll("iframe,style[data-kittycord-plugin]").length === 0, "Removal must clean all owned resources.");
    return { installedDisabled: true, workerActionRuns: true, timerPause: true, settingsPersisted: true, liveUpdate: true, invalidPanelRollback: true, cleanup: true };
}
