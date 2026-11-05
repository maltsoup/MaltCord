/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import type { StudioProject } from "@shared/kittycord/studio";
import type { StudioPreviewSnapshot } from "@shared/kittycord/studioPreview";
import type { UtilityValue } from "@shared/kittycord/utility";

export function initializeStudioPreview(bundle: () => ExternalPackage | undefined, project: () => StudioProject) {
    const section = document.getElementById("runtime-preview");
    const bridge: unknown = Reflect.get(globalThis, "KittyStudio");
    if (!section || location.protocol !== "file:" || !bridge || typeof bridge !== "object" || !("request" in bridge) || typeof bridge.request !== "function") return { invalidate() {} };
    const invoke = bridge.request;
    const request: (value: object) => Promise<StudioPreviewSnapshot> = value => invoke(value);
    section.hidden = false;
    const output = document.getElementById("runtime-output"); const status = document.getElementById("runtime-status"); const log = document.getElementById("runtime-log");
    const consent = document.getElementById("runtime-consent");
    let timer: ReturnType<typeof setTimeout> | undefined; let generation = 0; let refreshing = false; let currentPanel = "";
    const values: Record<string, UtilityValue> = {};
    async function command(value: object): Promise<StudioPreviewSnapshot> {
        return request(value);
    }
    function error(problem: unknown) { if (status) status.textContent = problem instanceof Error ? problem.message : "Preview failed."; }
    function render(snapshot: StudioPreviewSnapshot) {
        if (!output) return;
        if (log) log.textContent = snapshot.events.join("\n");
        if (snapshot.error) { error(new Error(snapshot.error)); clearTimeout(timer); }
        if (!snapshot.running) { output.textContent = "Preview stopped."; return; }
        for (const [token, value] of Object.entries(snapshot.colors)) output.style.setProperty(token, value);
        const panel = snapshot.panel;
        if (!panel) { output.textContent = snapshot.running ? "Isolated startup passed. Declared colors apply only to this preview." : "Preview stopped."; return; }
        const schema = JSON.stringify({ ...panel, text: "" });
        if (schema !== currentPanel) {
            currentPanel = schema; output.replaceChildren(); const heading = document.createElement("h3"); heading.textContent = panel.title;
            const text = document.createElement("p"); text.id = "preview-text"; output.append(heading, text);
            for (const action of panel.actions) {
                const button = document.createElement("button"); button.textContent = action.label; button.type = "button";
                button.addEventListener("click", () => { void command({ action: "action", id: action.id }).then(() => refresh()).catch(error); }); output.append(button);
            }
            for (const field of panel.settings) {
                const label = document.createElement("label"); label.textContent = field.label;
                const input = document.createElement("input"); input.type = field.type === "boolean" ? "checkbox" : field.type === "number" ? "number" : "text"; input.setAttribute("aria-label", field.label);
                const value = snapshot.settings[field.id] ?? field.default; values[field.id] = value;
                if (field.type === "boolean") input.checked = value === true; else input.value = String(value);
                if (field.min !== undefined) input.min = String(field.min); if (field.max !== undefined) input.max = String(field.max);
                input.addEventListener("input", () => { values[field.id] = field.type === "boolean" ? input.checked : field.type === "number" ? Number(input.value) : input.value; }); label.append(input); output.append(label);
            }
            const save = document.createElement("button"); save.textContent = "Apply preview settings"; save.addEventListener("click", () => { void command({ action: "settings", settings: values }).then(() => refresh()).catch(error); }); output.append(save);
        }
        const text = document.getElementById("preview-text"); if (text) text.textContent = panel.text;
    }
    async function refresh() { if (refreshing) return; refreshing = true; const revision = generation; try { const snapshot = await command({ action: "snapshot" }); if (revision === generation) { render(snapshot); clearTimeout(timer); if (snapshot.running) timer = setTimeout(() => { void refresh(); }, 500); } } catch (problem) { error(problem); } finally { refreshing = false; } }
    function invalidate() { generation++; clearTimeout(timer); currentPanel = ""; if (consent instanceof HTMLInputElement) consent.checked = false; if (status) status.textContent = "Source changed. Validate, review and start again."; void command({ action: "stop" }).then(render).catch(error); }
    document.getElementById("runtime-start")?.addEventListener("click", () => {
        if (!(consent instanceof HTMLInputElement) || !consent.checked) { error(new Error("Review the source and allow this isolated preview first.")); return; }
        const artifact = bundle(); if (!artifact) { error(new Error("Run static checks before starting a preview.")); return; }
        const revision = ++generation; clearTimeout(timer); currentPanel = "";
        if (status) status.textContent = "Starting isolated preview…";
        void command({ action: "start", bundle: artifact }).then(async snapshot => {
            if (revision !== generation) { await command({ action: "stop" }); return; }
            render(snapshot); const tests = project().tests;
            const failed = tests.filter(test => snapshot.colors[test.token]?.toLowerCase() !== test.equals.toLowerCase());
            if (failed.length) throw new Error(`${failed.length} declared color assertions failed.`);
            if (status) status.textContent = `Isolated startup passed. ${tests.length} color assertions passed. Actions and settings can be tested below. Desktop data is simulated here; Discord buttons and downloads run after installing to Local.`;
            await refresh();
        }).catch(error);
    });
    document.getElementById("runtime-stop")?.addEventListener("click", invalidate);
    window.addEventListener("pagehide", () => { generation++; clearTimeout(timer); }, { once: true });
    return { invalidate };
}
