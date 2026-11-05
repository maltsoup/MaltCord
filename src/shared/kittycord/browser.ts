/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject } from "./manifest";

export const DISCORD_ORIGINS = ["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"] as const;
export const QUICK_CSS_CHANNEL = "kittycord:quickcss:v1";
export const QUICK_CSS_LIMIT = 1024 * 1024;
export const BROWSER_COMMANDS = ["TOGGLE_MUTE", "TOGGLE_DEAFEN", "TOGGLE_VOICE_MODE", "TOGGLE_STREAMER_MODE", "TOGGLE_GO_LIVE_STREAMING", "NAVIGATE_BACK", "NAVIGATE_FORWARD", "SAVE_CLIP"];

export function verifyBrowserManifest(value: unknown, target: "chromium" | "firefox") {
    const manifest = checkedObject(value, ["manifest_version", "minimum_chrome_version", "name", "description", "author", "version", "icons", "host_permissions", "permissions", "optional_host_permissions", "optional_permissions", "content_scripts", "web_accessible_resources", "background", "commands", "content_security_policy", "browser_specific_settings"], "Extension manifest");
    const matches = DISCORD_ORIGINS.map(origin => `${origin}/*`);
    function same(actual: unknown, expected: readonly string[]) {
        if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== actual.length || actual.some(item => !expected.includes(item))) throw new Error("Unexpected extension permission, host, command or resource.");
    }
    if (manifest.manifest_version !== (target === "chromium" ? 3 : 2)) throw new Error("Wrong browser manifest version.");
    same(manifest.permissions, target === "chromium" ? [] : matches);
    if (target === "chromium") same(manifest.host_permissions, matches);
    else if (manifest.host_permissions !== undefined) throw new Error("Firefox MV2 uses explicit host permissions.");
    const optionalHosts = ["https://generativelanguage.googleapis.com/*", "https://api.openai.com/*"];
    same(target === "chromium" ? manifest.optional_host_permissions : manifest.optional_permissions, optionalHosts);
    if (target === "chromium" ? manifest.optional_permissions !== undefined : manifest.optional_host_permissions !== undefined) throw new Error("Unexpected optional permission field.");
    const policy = "script-src 'self'; object-src 'none'; connect-src https://generativelanguage.googleapis.com https://api.openai.com;";
    if (target === "chromium") {
        if (checkedObject(manifest.content_security_policy, ["extension_pages"], "Extension CSP").extension_pages !== policy) throw new Error("Packaged pages must retain the reviewed CSP.");
    } else if (manifest.content_security_policy !== policy) throw new Error("Packaged pages must retain the reviewed CSP.");
    const background = checkedObject(manifest.background, [target === "chromium" ? "service_worker" : "scripts"], "Background entry");
    if (target === "chromium" ? background.service_worker !== "keybinds.js" : JSON.stringify(background.scripts) !== '["keybinds.js"]') throw new Error("Only the reviewed shortcut background is packaged.");
    if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 2) throw new Error("Expected isolated metadata and packaged main-world scripts.");
    manifest.content_scripts.forEach((value, index) => {
        const script = checkedObject(value, ["run_at", "matches", "js", "all_frames", "world"], "Content script");
        same(script.matches, matches);
        same(script.js, index === 0 ? ["content.js", "editor-bridge.js"] : ["dist/Kittycord.js"]);
        if (script.run_at !== "document_start" || script.all_frames !== false || script.world !== (index === 0 ? "ISOLATED" : "MAIN")) throw new Error("Content scripts must use the reviewed top-frame execution worlds.");
    });
    const resources = ["dist/Kittycord.css"];
    if (target === "firefox") same(manifest.web_accessible_resources, resources);
    else {
        if (!Array.isArray(manifest.web_accessible_resources) || manifest.web_accessible_resources.length !== 1) throw new Error("Unexpected web-accessible resource groups.");
        const group = checkedObject(manifest.web_accessible_resources[0], ["resources", "matches"], "Web-accessible resources");
        same(group.resources, resources); same(group.matches, matches);
    }
    same(Object.keys(checkedObject(manifest.commands, BROWSER_COMMANDS, "Browser commands")), BROWSER_COMMANDS);
}

export function extensionBaseUrl(value: string) {
    const base = new URL(value);
    if (!((base.protocol === "chrome-extension:" && /^[a-p]{32}$/.test(base.hostname))
        || (base.protocol === "moz-extension:" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(base.hostname)))
        || base.pathname !== "/" || base.port || base.username || base.password || base.search || base.hash) throw new Error("Extension assets must use the packaged extension origin.");
    return base;
}

export function extensionMetadata(value: unknown) {
    const data = checkedObject(value, ["EXTENSION_VERSION", "EXTENSION_BASE_URL", "RENDERER_CSS_URL"], "Extension metadata");
    if (typeof data.EXTENSION_VERSION !== "string" || !/^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(data.EXTENSION_VERSION)
        || data.EXTENSION_VERSION.split(".").some(part => Number(part) > 65535)
        || typeof data.EXTENSION_BASE_URL !== "string" || typeof data.RENDERER_CSS_URL !== "string") throw new Error("Invalid extension metadata.");
    const base = extensionBaseUrl(data.EXTENSION_BASE_URL);
    if (data.RENDERER_CSS_URL !== new URL("dist/Kittycord.css", base).href) throw new Error("The renderer stylesheet must be packaged locally.");
    return { EXTENSION_VERSION: data.EXTENSION_VERSION, EXTENSION_BASE_URL: base.href, RENDERER_CSS_URL: data.RENDERER_CSS_URL };
}

export type QuickCssMessage = { action: "open" | "opened" | "ready" | "reload" | "closed"; }
    | { action: "save"; css: string; revision: number; }
    | { action: "init" | "update"; css: string; theme: "vs-dark" | "vs-light"; }
    | { action: "saved"; revision: number; }
    | { action: "error"; message: string; };

export function readQuickCssTransport(value: unknown) {
    if (typeof value !== "string" || value.length > QUICK_CSS_LIMIT * 6 + 2048) throw new Error("Invalid editor transport size or encoding.");
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { throw new Error("Invalid editor transport JSON."); }
    return checkedObject(parsed, ["channel", "token", "direction", "action", "css", "theme", "revision", "message"], "Editor transport");
}

export function readStudioTransport(value: unknown) {
    if (typeof value !== "string" || value.length > 512 || !value.includes("kittycord:studio:")) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || !("type" in parsed) || typeof parsed.type !== "string" || !parsed.type.startsWith("kittycord:studio:")) return undefined;
    const data = checkedObject(parsed, ["type", "requestId", "ok"], "Studio transport");
    if (typeof data.requestId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.requestId)) throw new Error("Invalid Studio request identifier.");
    if ((data.type === "kittycord:studio:open" || data.type === "kittycord:studio:assistant") && data.ok === undefined) return { type: data.type, requestId: data.requestId };
    if (data.type === "kittycord:studio:result" && typeof data.ok === "boolean") return { type: data.type, requestId: data.requestId, ok: data.ok };
    throw new Error("Invalid Studio message.");
}

export function quickCssMessage(value: unknown, token: string): QuickCssMessage {
    const data = checkedObject(value, ["channel", "token", "direction", "action", "css", "theme", "revision", "message"], "Editor message");
    if (data.channel !== QUICK_CSS_CHANNEL || data.token !== token) throw new Error("This editor message belongs to another session.");
    if (data.action === "open" || data.action === "opened" || data.action === "ready" || data.action === "reload" || data.action === "closed") return { action: data.action };
    if (data.action === "saved" || data.action === "save") {
        if (typeof data.revision !== "number" || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error("Invalid editor revision.");
        if (data.action === "saved") return { action: data.action, revision: data.revision };
    }
    if (data.action === "init" || data.action === "update" || data.action === "save") {
        if (typeof data.css !== "string" || new TextEncoder().encode(data.css).byteLength > QUICK_CSS_LIMIT) throw new Error("QuickCSS exceeds 1 MiB.");
        if (data.action === "save") return { action: data.action, css: data.css, revision: data.revision as number };
        if (data.theme !== "vs-dark" && data.theme !== "vs-light") throw new Error("Invalid editor theme.");
        return { action: data.action, css: data.css, theme: data.theme };
    }
    if (data.action === "error" && typeof data.message === "string" && data.message.length <= 200) return { action: data.action, message: data.message };
    throw new Error("Unsupported editor message.");
}
