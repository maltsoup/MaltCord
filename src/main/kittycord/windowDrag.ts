/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { BrowserWindow, ipcMain, screen } from "electron";

/**
 * Moves a transparent Discord window by hand. Windows ignores CSS drag regions on transparent windows, so with
 * "Window transparency" on the window could not be moved by its top bar. The renderer reports a press on a drag
 * region and its release; in between the window follows the cursor.
 */
const drags = new Map<number, ReturnType<typeof setInterval>>();

function stop(id: number) {
    clearInterval(drags.get(id));
    drags.delete(id);
}

ipcMain.on(IpcEvents.KITTYCORD_WINDOW_DRAG, (event, action: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || event.senderFrame !== event.sender.mainFrame) return;
    const { id } = win;
    stop(id);
    if (action === "toggle-maximize") {
        if (win.isMaximized()) win.unmaximize(); else win.maximize();
        return;
    }
    if (action !== "start" || win.isMaximized() || win.isFullScreen()) return;
    const start = screen.getCursorScreenPoint();
    const { x, y, width, height } = win.getBounds();
    const timer = setInterval(() => {
        if (win.isDestroyed()) return stop(id);
        const cursor = screen.getCursorScreenPoint();
        // setBounds keeps the size fixed; setPosition can grow a window across monitors with different scaling.
        win.setBounds({ x: x + cursor.x - start.x, y: y + cursor.y - start.y, width, height });
    }, 8);
    drags.set(id, timer);
    // A lost release (for example when focus moves to another app) never leaves the window following the cursor.
    setTimeout(() => { if (drags.get(id) === timer) stop(id); }, 30000);
    win.once("blur", () => { if (drags.get(id) === timer) stop(id); });
});
