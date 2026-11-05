/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { IpcEvents } from "@shared/IpcEvents";
import { isNativeProject, nativeProject, type NativeStudioProject,newNativeProject } from "@shared/kittycord/nativeStudio";
import { parseStudioProject, type StudioProject } from "@shared/kittycord/studio";
import { studioTheme, studioThemeAliases } from "@shared/kittycord/studioTheme";
import { BrowserWindow, dialog, ipcMain, session, type WebContents } from "electron";

import { connectNativeStudio } from "./nativeStudio";
import { createStudioPreview } from "./studioRuntime";

let studio: BrowserWindow | undefined;
let studioOwner: WebContents | undefined;
let preview: ReturnType<typeof createStudioPreview> | undefined;
let pendingProject: StudioProject | NativeStudioProject | undefined;
ipcMain.handle(IpcEvents.KITTYCORD_STUDIO_PROJECT, event => {
    if (!studio || studio.isDestroyed() || event.sender !== studio.webContents || event.senderFrame !== studio.webContents.mainFrame) throw new Error("Only the Studio window can read its pending project.");
    const project = pendingProject; pendingProject = undefined; return project;
});
/**
 * Reads Discord's current colors as final rgb() values. Discord defines its theme on an inner element, renamed some
 * variables, and writes colors with calc() inside hsl(); resolving them through a probe element handles all three.
 */
const studioThemeScript = `(()=>{const aliases=${JSON.stringify(studioThemeAliases)};const host=document.querySelector('.theme-dark,.theme-light,.theme-darker,.theme-midnight')||document.body;const probe=document.createElement('span');probe.style.display='none';host.appendChild(probe);const out={};try{for(const [key,names] of Object.entries(aliases)){for(const name of names){if(!getComputedStyle(host).getPropertyValue(name).trim())continue;probe.style.color='';probe.style.color='var('+name+')';const value=getComputedStyle(probe).color;if(value){out[key]=value;break;}}}}finally{probe.remove();}return out;})()`;

ipcMain.handle(IpcEvents.KITTYCORD_STUDIO_COMMAND, (event, command: unknown) => {
    if (!studio || studio.isDestroyed() || event.sender !== studio.webContents || event.senderFrame !== studio.webContents.mainFrame) throw new Error("Only the Studio window can control its preview.");
    // The theme is answered before the preview check: the native Studio has no preview and used to get no colors at all.
    if (command === "theme") {
        if (!studioOwner || studioOwner.isDestroyed()) return {};
        try { return studioOwner.executeJavaScript(studioThemeScript).then(studioTheme, () => ({})); }
        catch { return {}; }
    }
    if (!preview) throw new Error("Only the Studio window can control its preview.");
    return preview.command(command);
});
ipcMain.handle(IpcEvents.KITTYCORD_STUDIO_OPEN, async (event, input: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com", "https://discordapp.com", "https://canary.discordapp.com", "https://ptb.discordapp.com"].includes(new URL(event.sender.getURL()).origin)) throw new Error("Open Studio from Kittycord settings.");
    const project = input === undefined ? newNativeProject() : isNativeProject(input) ? nativeProject(input) : parseStudioProject(input);
    if (studio && !studio.isDestroyed()) {
        studio.show(); studio.focus();
        if (project) { const consent = await dialog.showMessageBox(studio, { type: "question", message: "Replace the current Studio draft with the selected Local project? Export the draft first if needed.", buttons: ["Cancel", "Replace draft"], defaultId: 0, cancelId: 0 }); if (consent.response === 1) { pendingProject = project; void studio.loadFile(join(__dirname, "studio", isNativeProject(project) ? "native-studio.html" : "studio.html")); } }
        return;
    }
    pendingProject = project; studioOwner = event.sender;
    const isolated = session.fromPartition(`kittycord-studio-${randomUUID()}`);
    const assetBase = pathToFileURL(join(__dirname, "studio") + "/").href;
    isolated.setPermissionRequestHandler((_owner, _permission, callback) => callback(false)); isolated.setPermissionCheckHandler(() => false);
    isolated.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (request, callback) => callback({ cancel: !request.url.startsWith(assetBase) && !request.url.startsWith("blob:") && !request.url.startsWith("data:") }));
    const local = createStudioPreview(); preview = local;
    const candidate = new BrowserWindow({ width: 1100, height: 820, autoHideMenuBar: true, backgroundColor: "#1e1e1e", webPreferences: { session: isolated, preload: join(__dirname, "studio-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true } });
    candidate.setTitle("KittenCord Plugin Studio"); studio = candidate; connectNativeStudio(candidate.webContents, event.sender); candidate.webContents.setWindowOpenHandler(() => ({ action: "deny" })); candidate.webContents.on("will-navigate", event => event.preventDefault());
    const ownerClosed = () => { if (!candidate.isDestroyed()) candidate.destroy(); }; event.sender.once("destroyed", ownerClosed);
    candidate.once("closed", () => { local.stop(); event.sender.removeListener("destroyed", ownerClosed); if (studio === candidate) { studio = undefined; studioOwner = undefined; preview = undefined; } });
    try { await candidate.loadFile(join(__dirname, "studio", isNativeProject(project) ? "native-studio.html" : "studio.html")); } catch (problem) { candidate.destroy(); throw problem; }
});
