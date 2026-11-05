/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { recoveryAllowsPlugin, unsupportedRecovery } from "@shared/kittycord/recovery";
import type { Plugin } from "@utils/types";

export const kittycordStartupStatus = IS_WEB || IS_REPORTER || !VencordNative.recovery
    ? unsupportedRecovery : VencordNative.recovery.getStatus();

let tracking = kittycordStartupStatus.supported;

export function isKittycordStartupAllowed(plugin: Pick<Plugin, "id" | "name" | "required" | "isDependency">) {
    return recoveryAllowsPlugin(kittycordStartupStatus, plugin);
}

export function trackStartupPlugin(name: string | null) {
    if (tracking) VencordNative.recovery.markPlugin(name);
}

export function blameStartupPlugin(plugin: string, reason: string) {
    if (tracking) VencordNative.recovery.blamePlugin(plugin, reason);
}

export function stopStartupTracking() {
    tracking = false;
}
