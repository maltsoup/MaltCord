/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import { IpcEvents } from "@shared/IpcEvents";
import { Kittycord } from "@shared/kittycord";
import channel from "@shared/kittycord/updateChannel.json";
import { hasInstallerUpdateChannel } from "@shared/kittycord/updates";
import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";

import { recordUpdateFailure } from "./diagnostics";
import { createUpdateClient } from "./updateClient";

const configured = process.platform === "win32" && hasInstallerUpdateChannel();
const client = configured ? createUpdateClient({ root: join(DATA_DIR, "verified-updates"), baseUrl: channel.baseUrl, trustRoots: channel.trustRoots, channel: channel.channel as "stable" | "beta" | "development", version: VERSION, apiVersion: Kittycord.apiVersion,
    launch: path => new Promise<void>((resolve, reject) => {
        const child = spawn(path, ["--install", "--discord", dirname(app.getPath("exe")), "--close-discord", "--restart"], { detached: true, windowsHide: true, stdio: "ignore" });
        child.once("error", () => reject(new Error("The verified installer could not start."))); child.once("spawn", () => { child.unref(); resolve(); });
    }) }) : undefined;
let lastNotice = "";
let timer: ReturnType<typeof setInterval> | undefined;
async function check() {
    if (!client) return null;
    const offer = await client.check().catch(error => { recordUpdateFailure(error); throw error; });
    if (offer && offer.version !== lastNotice && Notification.isSupported()) { lastNotice = offer.version; const notification = new Notification({ title: `MaltCord ${offer.version} is available`, body: "Open Settings → About & System → Updates to read the changelog and install the verified release." }); notification.show(); }
    return offer;
}
ipcMain.handle(IpcEvents.KITTYCORD_UPDATES, async (event, action: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com"].includes(new URL(event.sender.getURL()).origin)) return { error: "Open updates from MaltCord settings." };
    if (!client) return { configured: false, error: "This build has no configured signed update channel. Browser extensions update through the browser. Configure a real release URL and pinned signing key before distributing automatic desktop updates." };
    try {
        if (action === "status") return { configured: true, offer: client.offer(), progress: client.progress() };
        if (action === "check") return { configured: true, checked: true, offer: await check() };
        if (action === "stage") return { configured: true, offer: await client.stage() };
        if (action !== "apply") return { error: "Unsupported update action." };
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) return { error: "The settings window closed." };
        const confirmation = await dialog.showMessageBox(window, { type: "question", title: "Install MaltCord update?", message: "The signed installer will close this Discord installation and restart it. Calls will disconnect. Your settings remain local.", buttons: ["Cancel", "Install and restart"], defaultId: 0, cancelId: 0, noLink: true });
        if (confirmation.response !== 1) return { cancelled: true };
        return await client.apply();
    } catch (error) { recordUpdateFailure(error); return { error: "Update verification or installation failed. The current client was retained. Recheck the signed channel and try again." }; }
});
if (client) app.whenReady().then(() => {
    timer = setInterval(() => { void check().catch(() => console.warn("[MaltCord] Update check failed. The current release is retained.")); }, 3600000);
    const initial = setTimeout(() => { void check().catch(() => console.warn("[MaltCord] Initial update check failed.")); }, 15000);
    app.once("before-quit", () => { clearTimeout(initial); if (timer) clearInterval(timer); });
});
