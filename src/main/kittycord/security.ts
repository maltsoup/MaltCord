/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain } from "electron";

import { scanInWorker } from "./securityWorker";

const active = new Set<number>();
ipcMain.handle(IpcEvents.KITTYCORD_SECURITY_SCAN, async (event, source: unknown, permissions: unknown) => {
    const origins = ["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com", "https://discordapp.com", "https://ptb.discordapp.com", "https://canary.discordapp.com"];
    if (event.senderFrame !== event.sender.mainFrame || !origins.includes(new URL(event.sender.getURL()).origin)) return { error: "Open security scanning from Kittencord settings." };
    if (active.has(event.sender.id) || active.size >= 2) return { error: "A source scan is already running. Wait for a scan slot." };
    if (typeof source !== "string" || source.length > 1_048_576 || !Array.isArray(permissions) || permissions.length > 64 || permissions.some(item => typeof item !== "string" || item.length > 100)) return { error: "Invalid security scan request." };
    const owner = event.sender.id;
    active.add(owner);
    try { return { report: await scanInWorker(source, permissions) }; }
    catch { return { error: "Source analysis failed. Keep the package disabled and review its source." }; }
    finally { active.delete(owner); }
});
