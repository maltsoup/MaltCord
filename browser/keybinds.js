/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const kittycordCommands = new Set(["TOGGLE_MUTE", "TOGGLE_DEAFEN", "TOGGLE_VOICE_MODE", "TOGGLE_STREAMER_MODE", "TOGGLE_GO_LIVE_STREAMING", "NAVIGATE_BACK", "NAVIGATE_FORWARD", "SAVE_CLIP"]);
const kittycordApi = typeof browser === "undefined" ? chrome : browser;
function kittycordAppUrl(value) {
    try { const url = new URL(value); return !url.username && !url.password && ["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"].includes(url.origin); }
    catch { return false; }
}
kittycordApi.commands.onCommand.addListener(async command => {
    if (!kittycordCommands.has(command)) return;
    try {
        const [tab] = await kittycordApi.tabs.query({ active: true, currentWindow: true });
        if (!Number.isInteger(tab?.id) || !kittycordAppUrl(tab.url)) return;
        await kittycordApi.tabs.sendMessage(tab.id, { command }, { frameId: 0 });
    } catch { console.warn("Kittencord could not deliver the shortcut to the active Discord tab."); }
});
kittycordApi.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id === kittycordApi.runtime.id && sender.frameId === 0 && sender.url?.split("#")[0] === kittycordApi.runtime.getURL("assistant.html") && Number.isInteger(sender.tab?.id)
        && message?.action === "assistantNavigate" && ["voice", "plugins", "packages", "doctor", "marketplace", "performance", "profiles", "studio", "builder", "forge", "discovery", "security", "publishing", "updates"].includes(message.feature)) {
        const parent = new URLSearchParams(sender.url.split("#")[1] ?? "").get("tab");
        if (!parent || !/^\d{1,10}$/.test(parent)) { respond({ ok: false }); return; }
        const tab = Number(parent);
        void kittycordApi.tabs.get(tab).then(target => {
            if (!kittycordAppUrl(target.url)) throw new Error("The originating Discord tab is unavailable.");
            return kittycordApi.tabs.sendMessage(tab, { action: "assistantNavigate", feature: message.feature }, { frameId: 0 });
        }).then(() => kittycordApi.tabs.update(tab, { active: true })).then(() => respond({ ok: true }), () => respond({ ok: false }));
        return true;
    }
    if (sender.id !== kittycordApi.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !kittycordAppUrl(sender.url)) return;
    if (message?.action === "openShortcuts") {
        const url = kittycordApi.runtime.getURL("").startsWith("moz-extension:") ? "about:addons" : /Edg\//.test(navigator.userAgent) ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
        void kittycordApi.tabs.create({ url }).catch(() => console.warn("Kittencord could not open the browser's shortcut settings."));
    } else if (message?.action === "openAssistant") {
        void kittycordApi.tabs.create({ url: `${kittycordApi.runtime.getURL("assistant.html")}#tab=${sender.tab.id}`, active: true }).then(tab => {
            respond({ ok: Number.isInteger(tab.id) });
        }, () => respond({ ok: false }));
        return true;
    } else if (message?.action === "openStudio") {
        void kittycordApi.tabs.create({ url: kittycordApi.runtime.getURL("studio.html"), active: true }).then(() => respond({ ok: true }), () => respond({ ok: false }));
        return true;
    } else if (message?.action === "openEditor" && typeof message.token === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(message.token)) {
        const url = new URL(kittycordApi.runtime.getURL("editor.html"));
        url.hash = new URLSearchParams({ token: message.token, tab: String(sender.tab.id), origin: new URL(sender.url).origin }).toString();
        void kittycordApi.tabs.create({ url: url.href, active: true }).then(() => respond({ ok: true }), () => respond({ ok: false }));
        return true;
    }
});
