/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/// <reference types="chrome" />

import { assistantAnswer, assistantModels, assistantOrigins, type AssistantProvider } from "@shared/kittycord/assistant";
import { forgePrompt } from "@shared/kittycord/forge";
import { featurePrompt, findFeatures } from "@shared/kittycord/knowledge";
import { parseStudioProject, type StudioProject } from "@shared/kittycord/studio";

declare const browser: typeof chrome | undefined;
const extension = typeof browser === "undefined" ? chrome : browser;
function element<T extends HTMLElement>(id: string, constructor: new () => T): T { const value = document.getElementById(id); if (!(value instanceof constructor)) throw new Error(`Missing assistant control: ${id}.`); return value; }
const provider = element("provider", HTMLSelectElement);
const key = element("key", HTMLInputElement);
const model = element("model", HTMLSelectElement);
const question = element("question", HTMLTextAreaElement);
const mode = element("mode", HTMLSelectElement);
const status = element("status", HTMLElement);
const prompt = element("prompt", HTMLElement);
const answer = element("answer", HTMLElement);
const consent = element("consent", HTMLInputElement);
const send = element("send", HTMLButtonElement);
const exportDraft = element("export", HTMLButtonElement);
let revision = 0;
let connected = false;
let busy = false;
let verifiedTimer: ReturnType<typeof setTimeout> | undefined;
let draft: StudioProject | undefined;
function selectedProvider(): AssistantProvider { if (provider.value !== "gemini" && provider.value !== "openai") throw new Error("Choose a supported provider."); return provider.value; }
function connection(verified: boolean) {
    connected = verified; element("dot", HTMLElement).classList.toggle("verified", verified);
    element("connection-label", HTMLElement).textContent = verified ? `Model access verified at ${new Date().toLocaleTimeString()}` : "Not verified";
    clearTimeout(verifiedTimer); if (verified) verifiedTimer = setTimeout(() => connection(false), 300_000);
    send.disabled = busy || !connected || !consent.checked || !prompt.textContent;
}
function invalidate() { revision++; consent.checked = false; prompt.textContent = ""; element("review", HTMLElement).hidden = true; draft = undefined; exportDraft.disabled = true; send.disabled = true; }
function resetConnection() { invalidate(); connection(false); model.replaceChildren(); model.disabled = true; }
provider.addEventListener("change", () => { key.value = ""; resetConnection(); });
key.addEventListener("input", resetConnection);
model.addEventListener("change", invalidate);
question.addEventListener("input", invalidate);
mode.addEventListener("change", invalidate);
consent.addEventListener("change", () => { send.disabled = busy || !connected || !consent.checked || !prompt.textContent; });
element("disconnect", HTMLButtonElement).addEventListener("click", () => { key.value = ""; answer.textContent = ""; resetConnection(); status.textContent = "Session key forgotten."; });
element("connect", HTMLButtonElement).addEventListener("click", () => {
    if (busy) return;
    const current = revision; const chosen = selectedProvider(); const approvedKey = key.value;
    if (!key.value.trim()) { status.textContent = "Enter your provider API key in this private extension page."; return; }
    busy = true; connection(false); status.textContent = "Requesting permission for the selected provider, then loading models…";
    void (async () => {
        const granted = await extension.permissions.request({ origins: [`${assistantOrigins[chosen]}/*`] });
        if (!granted) throw new Error("Provider permission was not granted. No key was sent.");
        if (current !== revision) throw new Error("Connection settings changed. Connect again.");
        const models = await assistantModels(chosen, approvedKey);
        if (current !== revision) throw new Error("Connection settings changed. Connect again.");
        model.replaceChildren(...models.map(value => { const option = document.createElement("option"); option.value = value.id; option.textContent = value.label; return option; }));
        model.disabled = false; connection(true); status.textContent = `${models.length} actual provider models loaded. Generation access is checked when you send.`;
    })().catch(problem => { connection(false); status.textContent = problem instanceof Error ? problem.message : "Provider connection failed."; }).finally(() => { busy = false; send.disabled = !connected || !consent.checked || !prompt.textContent; });
});
function showMatches() {
    const matches = findFeatures(question.value); const output = element("matches", HTMLElement); output.replaceChildren();
    for (const feature of matches) {
        const row = document.createElement("p"); row.textContent = `${feature.title}: ${feature.path}. ${feature.detail}`;
        const button = document.createElement("button"); button.textContent = `Open ${feature.title}`;
        button.addEventListener("click", () => { void extension.runtime.sendMessage({ action: "assistantNavigate", feature: feature.id }).then(response => {
            status.textContent = response?.ok === true ? "Navigation request delivered to the originating Discord tab." : "The Discord tab is unavailable. Reopen the assistant from Kittencord.";
        }, () => { status.textContent = "Navigation could not be delivered. Reopen the assistant from Kittencord."; }); });
        output.append(row, button);
    }
    if (!matches.length) output.textContent = "No matching documented feature. Try another description; nothing was invented or installed.";
}
element("find", HTMLButtonElement).addEventListener("click", () => { try { showMatches(); } catch (problem) { status.textContent = problem instanceof Error ? problem.message : "Local search failed."; } });
element("preview", HTMLButtonElement).addEventListener("click", () => {
    try { consent.checked = false; send.disabled = true; prompt.textContent = mode.value === "plugin" ? forgePrompt(question.value) : featurePrompt(question.value); element("review", HTMLElement).hidden = false; showMatches(); }
    catch (problem) { status.textContent = problem instanceof Error ? problem.message : "Prompt validation failed."; }
});
send.addEventListener("click", () => {
    if (busy || !connected || !consent.checked) return;
    const current = revision; busy = true; send.disabled = true; draft = undefined; exportDraft.disabled = true; status.textContent = "Sending the reviewed prompt to the selected provider…";
    void assistantAnswer(selectedProvider(), key.value, model.value, prompt.textContent ?? "", consent.checked).then(text => {
        if (current !== revision) throw new Error("The request settings changed. Review again before using the result.");
        answer.textContent = text;
        if (mode.value === "plugin") { draft = parseStudioProject(JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))); exportDraft.disabled = false; }
        connection(true); status.textContent = draft ? "Project schema validated. Review and compile source in Studio before execution." : "Provider answered. Navigation buttons come only from the local feature index.";
    }).catch(problem => { connection(false); status.textContent = problem instanceof Error ? problem.message : "Provider request failed."; }).finally(() => { busy = false; consent.checked = false; send.disabled = true; });
});
exportDraft.addEventListener("click", () => { if (!draft) return; const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 4)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "kittycord-ai.project.json"; link.click(); URL.revokeObjectURL(url); });
window.addEventListener("pagehide", () => { key.value = ""; clearTimeout(verifiedTimer); }, { once: true });
window.addEventListener("offline", () => { connection(false); status.textContent = "Network is offline. Local feature search remains available."; });
