/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { ipcRenderer } from "electron";

ipcRenderer.on(IpcEvents.KITTYCORD_SANDBOX_PORT, event => {
    if (event.ports.length === 1) window.postMessage({ type: "connect" }, "*", event.ports);
});
ipcRenderer.send(IpcEvents.KITTYCORD_SANDBOX_READY, { sandboxed: process.sandboxed === true, contextIsolated: process.contextIsolated === true });
