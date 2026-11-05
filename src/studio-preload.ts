/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("KittyStudio", { native: (action: string, input?: unknown) => ipcRenderer.invoke(IpcEvents.KITTYCORD_NATIVE_STUDIO, action, input), request: (command: unknown) => ipcRenderer.invoke(IpcEvents.KITTYCORD_STUDIO_COMMAND, command), project: () => ipcRenderer.invoke(IpcEvents.KITTYCORD_STUDIO_PROJECT) });
