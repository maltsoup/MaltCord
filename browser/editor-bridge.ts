/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/// <reference types="chrome" />

import { QUICK_CSS_CHANNEL, quickCssMessage, readQuickCssTransport, readStudioTransport } from "@shared/kittycord/browser";
import { validFeatureId } from "@shared/kittycord/knowledge";

declare const browser: typeof chrome | undefined;
const extensionApi = typeof browser === "undefined" ? chrome : browser;
const sessions = new Map<string, { port?: chrome.runtime.Port; timer?: ReturnType<typeof setTimeout>; }>();
let activationUntil = 0;
function recordActivation(event: Event) { if (event.isTrusted) activationUntil = Date.now() + 5000; }
window.addEventListener("click", recordActivation, { capture: true });
window.addEventListener("keydown", recordActivation, { capture: true });
function post(token: string, message: object) { window.postMessage(JSON.stringify({ channel: QUICK_CSS_CHANNEL, token, direction: "to-host", ...message }), location.origin); }
function close(token: string, notify = false) {
    const session = sessions.get(token);
    if (!session) return;
    sessions.delete(token); clearTimeout(session.timer); session.port?.disconnect();
    if (notify) post(token, { action: "closed" });
}
window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    let studio: ReturnType<typeof readStudioTransport>;
    try { studio = readStudioTransport(event.data); } catch { return; }
    if (studio?.type === "kittycord:studio:open" || studio?.type === "kittycord:studio:assistant") {
        const { requestId } = studio;
        const respond = (ok: boolean) => window.postMessage(JSON.stringify({ type: "kittycord:studio:result", requestId, ok }), location.origin);
        if (Date.now() > activationUntil) { respond(false); return; }
        activationUntil = 0;
        void extensionApi.runtime.sendMessage({ action: studio.type === "kittycord:studio:assistant" ? "openAssistant" : "openStudio" }).then(response => respond(response?.ok === true), () => respond(false));
        return;
    }
    let data: ReturnType<typeof readQuickCssTransport>;
    try { data = readQuickCssTransport(event.data); } catch { return; }
    if (data.direction !== "to-editor" || typeof data.token !== "string") return;
    const { token } = data;
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)) return;
    let message: ReturnType<typeof quickCssMessage>;
    try { message = quickCssMessage(data, token); } catch { return; }
    if (message.action === "open") {
        if (sessions.has(token)) return;
        if (Date.now() > activationUntil) { post(token, { action: "error", message: "Open the QuickCSS editor with its Kittencord settings button or keyboard control." }); return; }
        activationUntil = 0;
        for (const previous of sessions.keys()) close(previous, true);
        const timer = setTimeout(() => { post(token, { action: "error", message: "The packaged editor did not connect. Existing QuickCSS was preserved." }); close(token); }, 10_000);
        sessions.set(token, { timer });
        void extensionApi.runtime.sendMessage({ action: "openEditor", token }).then(response => {
            if (response?.ok !== true && sessions.has(token)) { post(token, { action: "error", message: "The browser could not open the packaged QuickCSS editor." }); close(token); }
        }, () => { post(token, { action: "error", message: "The browser could not open the packaged QuickCSS editor." }); close(token); });
    } else if (message.action === "closed") close(token);
    else if (["init", "update", "saved", "error"].includes(message.action)) {
        try { sessions.get(token)?.port?.postMessage(JSON.stringify(data)); } catch { close(token, true); }
    }
});
extensionApi.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== extensionApi.runtime.id || message?.action !== "assistantNavigate" || !validFeatureId(message.feature)) return;
    window.postMessage(JSON.stringify({ type: "kittycord:help:navigate", feature: message.feature }), location.origin);
    respond({ ok: true });
});
extensionApi.runtime.onConnect.addListener(port => {
    const token = port.name.startsWith(`${QUICK_CSS_CHANNEL}:`) ? port.name.slice(QUICK_CSS_CHANNEL.length + 1) : "";
    const session = sessions.get(token);
    const editorUrl = extensionApi.runtime.getURL("editor.html");
    if (!session || session.port || port.sender?.id !== extensionApi.runtime.id || port.sender.url?.split("#")[0] !== editorUrl) { port.disconnect(); return; }
    session.port = port; clearTimeout(session.timer); session.timer = undefined;
    port.onMessage.addListener((value: unknown) => {
        let data: ReturnType<typeof readQuickCssTransport>;
        try { data = readQuickCssTransport(value); } catch { return; }
        if (data.direction !== "to-host") return;
        let message: ReturnType<typeof quickCssMessage>;
        try { message = quickCssMessage(data, token); } catch { return; }
        if (!["ready", "reload", "save", "closed"].includes(message.action)) return;
        post(token, message);
        if (message.action === "closed") close(token);
    });
    port.onDisconnect.addListener(() => { void extensionApi.runtime.lastError; close(token, true); });
});
window.addEventListener("pagehide", () => {
    for (const token of sessions.keys()) close(token);
    window.removeEventListener("click", recordActivation, true);
    window.removeEventListener("keydown", recordActivation, true);
}, { once: true });
