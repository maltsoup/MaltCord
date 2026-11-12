/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { ipcMain } from "electron";

import gitRemote from "~git-remote";

import { serializeErrors } from "./common";

if (!IS_UPDATER_DISABLED) {
    require(IS_STANDALONE ? "./http" : "./git");
} else {
    const unavailable = serializeErrors(() => {
        throw new Error("MaltCord updates are unavailable until an independent verified release source is configured.");
    });
    ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => {
        if (!gitRemote) throw new Error("No public MaltCord repository is configured.");
        return `https://github.com/${gitRemote}`;
    }));
    ipcMain.handle(IpcEvents.GET_UPDATES, unavailable);
    ipcMain.handle(IpcEvents.UPDATE, unavailable);
    ipcMain.handle(IpcEvents.FORCE_UPDATE, unavailable);
    ipcMain.handle(IpcEvents.BUILD, unavailable);
}
