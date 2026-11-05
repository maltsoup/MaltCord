/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getPluginRuntimeState, isPluginSelected } from "@api/PluginManager";
import type { Plugin } from "@utils/types";

import Plugins, { PluginMeta } from "~plugins";

/**
 * The one definition of plugin numbers shown in KittenCord (spec §5). Optional plugins exclude required
 * core plugins, hidden plugins and API helpers. "enabled" is the saved selection; "running" means started
 * in this session.
 */
export function isOptionalPlugin(plugin: Plugin) {
    // local.native.patch is the hidden Patch Studio project; the Plugins list does not show it either.
    return !plugin.required && !plugin.hidden && !plugin.name.endsWith("API") && plugin.id !== "local.native.patch";
}

export function pluginCounts() {
    let available = 0, bundled = 0, local = 0, enabled = 0, running = 0, paused = 0, failed = 0, quarantined = 0;
    for (const plugin of Object.values(Plugins)) {
        if (!isOptionalPlugin(plugin)) continue;
        available++;
        if (PluginMeta[plugin.name]?.userPlugin) local++; else bundled++;
        if (isPluginSelected(plugin.name)) enabled++;
        const state = getPluginRuntimeState(plugin.name);
        if (state?.running) running++;
        if (state?.paused) paused++;
        if (state?.failed) failed++;
        if (state?.quarantined) quarantined++;
    }
    return { available, bundled, local, enabled, running, paused, failed, quarantined, issues: failed + quarantined };
}
