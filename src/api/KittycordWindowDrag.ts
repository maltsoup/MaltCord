/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";

/** The nearest element that sets an app region decides: drag areas move the window, no-drag areas stay clickable. */
function isDragArea(target: EventTarget | null) {
    for (let element = target instanceof Element ? target : null; element && element !== document.documentElement; element = element.parentElement) {
        const style = getComputedStyle(element);
        const region = style.getPropertyValue("-webkit-app-region") || style.getPropertyValue("app-region");
        if (region === "no-drag") return false;
        if (region === "drag") return true;
    }
    return false;
}

/**
 * With "Window transparency" on Windows, the Discord window has no frame and Windows ignores its CSS drag regions,
 * so the window could not be moved. This moves it by hand from Discord's own top bar, and a double click maximizes.
 */
export function installTransparentWindowDrag() {
    if (!IS_DISCORD_DESKTOP || !Settings.transparent || !navigator.userAgent.includes("Windows")) return;
    const send = (action: "start" | "end" | "toggle-maximize") => VencordNative.native.windowDrag(action);
    document.addEventListener("pointerdown", event => {
        if (event.button !== 0 || !isDragArea(event.target)) return;
        event.preventDefault();
        if (event.detail === 2) { send("toggle-maximize"); return; }
        try { (event.target as Element).setPointerCapture(event.pointerId); } catch { }
        send("start");
        const end = () => {
            send("end");
            window.removeEventListener("pointerup", end, true);
            window.removeEventListener("pointercancel", end, true);
            window.removeEventListener("blur", end);
        };
        window.addEventListener("pointerup", end, true);
        window.addEventListener("pointercancel", end, true);
        window.addEventListener("blur", end);
    }, true);
}
