/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/// <reference types="chrome" />

import { DISCORD_ORIGINS, QUICK_CSS_CHANNEL, QUICK_CSS_LIMIT, quickCssMessage, readQuickCssTransport } from "@shared/kittycord/browser";
import * as monaco from "monaco-editor/esm/vs/editor/editor.main.js";

declare const browser: typeof chrome | undefined;
const extensionApi = typeof browser === "undefined" ? chrome : browser;
const parameters = new URLSearchParams(location.hash.slice(1));
const token = parameters.get("token");
const parentOrigin = parameters.get("origin");
const status = document.getElementById("status");
const container = document.getElementById("container");
let editor: monaco.editor.IStandaloneCodeEditor | undefined;
let revision = 0;
let dirty = false;
let conflicted = false;
let applying = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let port: chrome.runtime.Port | undefined;
function show(message: string) { if (status) status.textContent = message; }
function send(message: object) { if (port) port.postMessage(JSON.stringify({ channel: QUICK_CSS_CHANNEL, token, direction: "to-host", ...message })); }
function save() {
    if (!editor) return;
    if (!port) { show("The host connection is closed. Export your edits and reopen from Kittencord settings."); return; }
    if (new TextEncoder().encode(editor.getValue()).byteLength > QUICK_CSS_LIMIT) { show("QuickCSS exceeds 1 MiB. Export your edits and reduce the CSS before saving."); return; }
    clearTimeout(timer);
    conflicted = false;
    send({ action: "save", css: editor.getValue(), revision: ++revision });
    show("Saving QuickCSS locally…");
}
self.MonacoEnvironment = { getWorkerUrl(_moduleId: unknown, label: string) {
    const path = label === "css" ? "language/css/css.worker.js" : "editor/editor.worker.js";
    return new URL(`vendor/monaco/vs/${path}`, location.href).href;
} };
function onMessage(value: unknown) {
    if (!token) return;
    let data: ReturnType<typeof readQuickCssTransport>;
    try { data = readQuickCssTransport(value); } catch { return; }
    if (data.direction !== "to-editor") return;
    let message: ReturnType<typeof quickCssMessage>;
    try { message = quickCssMessage(data, token); } catch { show("The editor received an invalid message. Existing settings were preserved."); return; }
    if (message.action === "error") { editor?.updateOptions({ readOnly: false }); show(message.message); return; }
    if (message.action === "saved") { if (message.revision === revision) { dirty = false; show("QuickCSS saved locally."); } return; }
    if (message.action !== "init" && message.action !== "update") return;
    if (!container) throw new Error("The QuickCSS editor container is missing.");
    if (!editor) {
        editor = monaco.editor.create(container, { value: message.css, language: "css", theme: message.theme, automaticLayout: true });
        editor.onDidChangeModelContent(() => {
            if (applying) return;
            dirty = true; revision++;
            clearTimeout(timer);
            if (!conflicted) timer = setTimeout(save, 350);
            show(conflicted ? "Saved QuickCSS changed elsewhere. Your edits are retained; Save replaces the saved value." : "Unsaved changes. Autosave is pending.");
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, save);
    } else if (message.action === "update" && dirty && message.css !== editor.getValue()) {
        conflicted = true; clearTimeout(timer);
        show("Saved QuickCSS changed elsewhere. Your edits are retained; Save replaces the saved value."); return;
    } else {
        applying = true; editor.setValue(message.css); applying = false;
    }
    if (message.action === "init") { dirty = false; conflicted = false; clearTimeout(timer); editor?.updateOptions({ readOnly: false }); }
    show("QuickCSS loaded locally. Changes autosave after editing.");
}
function button(id: string, action: () => void) { document.getElementById(id)?.addEventListener("click", action); }
button("save", save);
button("select", () => { const model = editor?.getModel(); if (model) editor?.setSelection(model.getFullModelRange()); editor?.focus(); });
button("undo", () => editor?.trigger("kittycord", "undo", undefined));
button("redo", () => editor?.trigger("kittycord", "redo", undefined));
button("copy", () => { if (editor) void navigator.clipboard.writeText(editor.getValue()).then(() => show("QuickCSS copied."), () => show("Copy failed. Select the text and use your browser's copy command.")); });
button("export", () => {
    if (!editor) return;
    const url = URL.createObjectURL(new Blob([editor.getValue()], { type: "text/css" }));
    const link = document.createElement("a"); link.href = url; link.download = "kittycord-quickcss.css"; link.click(); URL.revokeObjectURL(url);
});
button("reload", () => { if (!dirty || confirm("Discard unsaved editor changes and reload saved QuickCSS?")) { editor?.updateOptions({ readOnly: true }); send({ action: "reload" }); } });
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => { clearTimeout(timer); send({ action: "closed" }); port?.disconnect(); editor?.dispose(); }, { once: true });
const tab = Number(parameters.get("tab"));
if (token && /^[a-f0-9-]{36}$/i.test(token) && parentOrigin && DISCORD_ORIGINS.some(origin => origin === parentOrigin) && Number.isSafeInteger(tab) && tab >= 0) {
    port = extensionApi.tabs.connect(tab, { name: `${QUICK_CSS_CHANNEL}:${token}`, frameId: 0 });
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => { void extensionApi.runtime.lastError; port = undefined; clearTimeout(timer); show("The host connection is closed. Export unsaved edits and reopen from Kittencord settings."); });
    send({ action: "ready" });
} else show("Open this packaged editor from Kittencord settings. No external data was loaded.");
