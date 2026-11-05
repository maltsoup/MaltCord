/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function applySettingsSidebarState(document: Document, states: ReadonlyMap<string, { visible: boolean; order: number; }>) {
    const candidates = [...document.querySelectorAll<HTMLElement>("[data-settings-sidebar-item]")];
    const owned = new Set(candidates.filter(item => states.has(item.getAttribute("data-settings-sidebar-item") ?? "")));
    for (const item of document.querySelectorAll<HTMLElement>(".vc-testcord-managed-settings-tab,.vc-testcord-hidden-settings-tab")) if (!owned.has(item)) {
        item.classList.remove("vc-testcord-managed-settings-tab", "vc-testcord-hidden-settings-tab");
        item.style.removeProperty("order");
    }
    for (const item of owned) {
        const state = states.get(item.getAttribute("data-settings-sidebar-item") ?? "");
        if (!state) continue;
        item.classList.add("vc-testcord-managed-settings-tab");
        item.classList.toggle("vc-testcord-hidden-settings-tab", !state.visible);
        item.style.order = String(state.order);
    }
    return owned.size;
}
