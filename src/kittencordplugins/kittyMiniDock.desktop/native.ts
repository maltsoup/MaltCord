/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, type IpcMainInvokeEvent } from "electron";

export function setDockOpacity(_event: IpcMainInvokeEvent, value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < .4 || value > 1) return { available: false, error: "Choose opacity between 40% and 100%." };
    if (process.platform === "linux") return { available: false, error: "Window opacity is unavailable on this platform." };
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed() && window.getTitle() === "Kitty MiniDock");
    if (windows.length !== 1) return { available: false, error: "The native dock window is not identifiable. Opacity was not changed." };
    windows[0].setOpacity(value);
    return { available: true };
}
