/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { IpcEvents } from "@shared/IpcEvents";
import { isolatedFrameHtml } from "@shared/kittycord/isolatedFrame";
import { BrowserWindow, ipcMain, MessageChannelMain, session, type WebContents } from "electron";

const windows = new Map<string, { owner: WebContents; window: BrowserWindow; }>();
const preparations = new Map<number, (safe: boolean) => void>();
let sandboxSession: ReturnType<typeof session.fromPartition> | undefined;
ipcMain.on(IpcEvents.KITTYCORD_SANDBOX_READY, (event, value: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame) return;
    const safe = !!value && typeof value === "object" && "sandboxed" in value && value.sandboxed === true && "contextIsolated" in value && value.contextIsolated === true;
    preparations.get(event.sender.id)?.(safe);
});
function key(owner: WebContents, token: unknown) {
    if (typeof token !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(token)) throw new Error("Invalid isolated runtime identifier.");
    const { origin } = new URL(owner.getURL());
    if (!["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com", "https://discordapp.com", "https://canary.discordapp.com", "https://ptb.discordapp.com"].includes(origin)) throw new Error("Isolated runtime requires a Discord host window.");
    return `${owner.id}:${token}`;
}

ipcMain.handle(IpcEvents.KITTYCORD_SANDBOX_OPEN, async (event, token: unknown) => {
    const id = key(event.sender, token);
    if (event.senderFrame !== event.sender.mainFrame || windows.has(id) || windows.size >= 32 || [...windows.values()].filter(item => item.owner === event.sender).length >= 8)
        throw new Error("Isolated runtime capacity or sender validation failed.");
    if (!sandboxSession) {
        sandboxSession = session.fromPartition(`kittycord-runtime-${randomUUID()}`);
        sandboxSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        sandboxSession.setPermissionCheckHandler(() => false);
        sandboxSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (request, callback) => callback({ cancel: !request.url.startsWith("data:") && !request.url.startsWith("blob:") }));
    }
    const isolatedSession = sandboxSession;
    const window = new BrowserWindow({ show: false, webPreferences: { session: isolatedSession, preload: join(__dirname, "isolated-preload.js"), sandbox: true, contextIsolation: true,
        nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true, backgroundThrottling: false } });
    const contents = window.webContents;
    const preferences: unknown = "getLastWebPreferences" in contents && typeof contents.getLastWebPreferences === "function" ? contents.getLastWebPreferences() : null;
    const expected = { sandbox: true, contextIsolation: true, webSecurity: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, preload: join(__dirname, "isolated-preload.js") };
    if (window.webContents.session !== isolatedSession || (preferences !== null && (typeof preferences !== "object" || Object.entries(expected).some(([key, value]) => Reflect.has(preferences, key) && Reflect.get(preferences, key) !== undefined && Reflect.get(preferences, key) !== value)))) {
        window.destroy(); throw new Error("The host changed or cannot confirm isolated runtime security settings. Activation was blocked.");
    }
    windows.set(id, { owner: event.sender, window });
    window.setTitle("Kittycord isolated plugin runtime");
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", navigation => navigation.preventDefault());
    let expectedClose = false;
    const runtimeGone = () => {
        preparations.get(contents.id)?.(false);
        if (!window.isDestroyed()) window.destroy();
    };
    contents.on("render-process-gone", runtimeGone);
    const ownerClosed = () => { expectedClose = true; if (!window.isDestroyed()) window.destroy(); };
    const ownerNavigating = (details: unknown, _url: string, inPlace: boolean, isMainFrame: boolean) => {
        const modern = !!details && typeof details === "object" && "isMainFrame" in details;
        if (modern ? Reflect.get(details, "isMainFrame") === true && Reflect.get(details, "isSameDocument") !== true : isMainFrame && !inPlace) ownerClosed();
    };
    event.sender.once("destroyed", ownerClosed);
    event.sender.once("render-process-gone", ownerClosed);
    event.sender.on("did-start-navigation", ownerNavigating);
    window.once("closed", () => {
        contents.removeListener("render-process-gone", runtimeGone);
        windows.delete(id); event.sender.removeListener("destroyed", ownerClosed); event.sender.removeListener("render-process-gone", ownerClosed); event.sender.removeListener("did-start-navigation", ownerNavigating);
        if (!expectedClose && !event.sender.isDestroyed()) event.sender.send(IpcEvents.KITTYCORD_SANDBOX_PORT, token, true);
    });
    try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const prepared = new Promise<void>((resolve, reject) => {
            preparations.set(window.webContents.id, safe => { if (safe) resolve(); else reject(new Error("The isolated preload did not confirm sandbox and context isolation.")); });
            timer = setTimeout(() => reject(new Error("The isolated preload did not attest its security context.")), 7000);
        });
        try { await Promise.all([prepared, window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(isolatedFrameHtml(randomUUID().replaceAll("-", "")))}`)]); }
        finally { clearTimeout(timer); preparations.delete(window.webContents.id); }
        const { port1, port2 } = new MessageChannelMain();
        window.webContents.postMessage(IpcEvents.KITTYCORD_SANDBOX_PORT, token, [port1]);
        event.sender.mainFrame.postMessage(IpcEvents.KITTYCORD_SANDBOX_PORT, token, [port2]);
    } catch (problem) { if (!window.isDestroyed()) window.destroy(); throw problem; }
});

ipcMain.handle(IpcEvents.KITTYCORD_SANDBOX_CLOSE, (event, token: unknown) => {
    const id = key(event.sender, token);
    if (event.senderFrame !== event.sender.mainFrame) throw new Error("Only the owner can close the isolated runtime.");
    const window = windows.get(id)?.window;
    if (window && !window.isDestroyed()) window.destroy();
});
