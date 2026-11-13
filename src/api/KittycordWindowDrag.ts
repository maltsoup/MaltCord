/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const INTERACTIVE = "button, a, input, select, textarea, [role='button'], [role='tab'], [role='menuitem'], [class*='winButton'], [class*='trailing_']";
const TOP_BAR = "[class*='titleBar_'], [class*='typeWindows_'], [class*='bar_'][class*='Windows']";

/**
 * The nearest element that sets an app region decides: drag areas move the window, no-drag areas stay clickable.
 * When nothing sets a region, Discord's own top bar still counts as a drag area, except for its buttons.
 */
function isDragArea(target: EventTarget | null) {
    const start = target instanceof Element ? target : null;
    for (let element = start; element && element !== document.documentElement; element = element.parentElement) {
        const style = getComputedStyle(element);
        const region = style.getPropertyValue("-webkit-app-region") || style.getPropertyValue("app-region");
        if (region === "no-drag") return false;
        if (region === "drag") return true;
    }
    return !!start && !start.closest(INTERACTIVE) && !!start.closest(TOP_BAR);
}

/**
 * On Windows, Discord's window can fail to move from its top bar: with "Window transparency" the window has no frame
 * and Windows ignores its CSS drag regions, and a theme or update can also break the regions. This moves the window
 * by hand from Discord's own top bar, and a double click maximizes.
 */
export function installTransparentWindowDrag() {
    if (!IS_DISCORD_DESKTOP || !navigator.userAgent.includes("Windows")) return;
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
