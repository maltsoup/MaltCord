/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { KittycordUtility } from "../../src/api/KittycordUtility";
import { exclusiveProjects } from "../../src/shared/kittycord/exclusives";
import type { createPackageRegistry } from "../../src/shared/kittycord/packageRegistry";
import { buildStudioPackage, newUtilityProject } from "../../src/shared/kittycord/studio";

interface Host { Api: { KittycordPackages: Pick<ReturnType<typeof createPackageRegistry>, "initialize" | "review" | "install" | "enable" | "remove" | "snapshot">; KittycordUtility: typeof KittycordUtility; }; Components: { openSettingsTabModal(tab: unknown): void; PluginsTab: unknown; }; Webpack: { Common: { UserStore: { getCurrentUser(): unknown; }; }; }; }
export async function run(afterReload = false) {
    const root = globalThis as { Vencord?: Host; __kittyFunctionalProbe?: boolean; };
    if (root.__kittyFunctionalProbe) return { inspectionAlreadyRunning: true };
    root.__kittyFunctionalProbe = true;
    const host = root.Vencord; if (!host || host.Webpack.Common.UserStore.getCurrentUser()) return { kittycordLoaded: !!host, anonymousSession: false };
    const result: Record<string, boolean | string> = { kittycordLoaded: true, anonymousSession: true };
    const packages = host.Api.KittycordPackages; const utilities = host.Api.KittycordUtility; const id = "local.focus-sessions";
    const wait = async (predicate: () => boolean) => { for (let attempt = 0; attempt < 60; attempt++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error("Functional control did not become ready."); };
    let preserve = false;
    try {
        await packages.initialize();
        if (!afterReload) {
            const bundle = await buildStudioPackage(newUtilityProject()); await packages.review(bundle); await packages.install(bundle, bundle.manifest.integrity.digest);
            result.localInstalledDisabled = packages.snapshot().entries.some(entry => entry.manifest.id === id && !entry.enabled);
            await packages.enable(id);
        }
        await wait(() => !!utilities.snapshot(id));
        host.Components.openSettingsTabModal(host.Components.PluginsTab);
        await wait(() => Array.from(document.querySelectorAll("button")).some(button => button.textContent === "Local plugins"));
        Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Local plugins")?.click();
        await wait(() => !!document.querySelector('section[aria-label="Local plugin controls: local.focus-sessions"]'));
        result.localManagerFilter = true;
        if (afterReload) { result.settingsPersistedAfterReload = utilities.snapshot(id)?.values.minutes === 1; return result; }
        const controls = document.querySelector('section[aria-label="Local plugin controls: local.focus-sessions"]');
        controls?.closest("details")?.querySelector("summary")?.click();
        result.localSettingsVisible = !!controls?.getBoundingClientRect().height;
        const start = Array.from(controls?.querySelectorAll("button") ?? []).find(button => button.textContent === "Start"); start?.click();
        await wait(() => utilities.snapshot(id)?.panel.text === "24:59"); result.localActionRuns = true;
        Array.from(controls?.querySelectorAll("button") ?? []).find(button => button.textContent === "Pause")?.click();
        const input = controls?.querySelector<HTMLInputElement>('input[aria-label="Session minutes"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (!input || !setter) throw new Error("Local setting input was unavailable.");
        setter.call(input, "1"); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 150));
        Array.from(controls?.querySelectorAll("button") ?? []).find(button => button.textContent === "Save local settings")?.click();
        await wait(() => utilities.snapshot(id)?.values.minutes === 1); result.localSettingsSaved = true;
        for (const { project } of exclusiveProjects) {
            const bundle = await buildStudioPackage(project);
            await packages.review(bundle); await packages.install(bundle, bundle.manifest.integrity.digest); await packages.enable(project.metadata.id);
            await wait(() => !!utilities.snapshot(project.metadata.id));
            const isLink = project.metadata.id === "local.link-lens";
            const isJson = project.metadata.id === "local.json-workbench";
            await utilities.save(project.metadata.id, isLink ? { url: "https://example.com/?utm_source=test&keep=1", fragment: false } : isJson ? { json: '{"items":[42]}', pointer: "/items/0" } : { date: "2026-12-31T21:00:00Z" });
            await new Promise(resolve => setTimeout(resolve, 100));
            const selector = `section[aria-label="Local plugin controls: ${project.metadata.id}"]`;
            await wait(() => !!document.querySelector(selector));
            const surface = document.querySelector(selector);
            surface?.closest("details")?.querySelector("summary")?.click();
            const label = isLink ? "Remove trackers" : isJson ? "Read pointer" : "Generate timestamps";
            Array.from(surface?.querySelectorAll("button") ?? []).find(button => button.textContent === label)?.click();
            await wait(() => {
                const text = utilities.snapshot(project.metadata.id)?.panel.text ?? "";
                return isLink ? text.includes("https://example.com/?keep=1") && !text.includes("utm_source") : isJson ? text === "42" : text.includes("<t:1798750800:R>");
            });
            result[isLink ? "linkLensAction" : isJson ? "jsonWorkbenchAction" : "timestampStudioAction"] = true;
            await packages.remove(project.metadata.id);
        }
        result.exclusiveCleanup = exclusiveProjects.every(({ project }) => !utilities.snapshot(project.metadata.id));
        preserve = true; result.reloadRequested = true; setTimeout(() => location.reload(), 300);
    } catch (problem) { result.functionalError = problem instanceof Error ? problem.message.slice(0, 250) : "Functional runtime failed."; }
    finally {
        for (const { project } of exclusiveProjects) if (packages.snapshot().entries.some(entry => entry.manifest.id === project.metadata.id)) await packages.remove(project.metadata.id);
        if (!preserve && packages.snapshot().entries.some(entry => entry.manifest.id === id)) { await packages.remove(id); result.localCleanup = !utilities.snapshot(id); }
    }
    return result;
}
