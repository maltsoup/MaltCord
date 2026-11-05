/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject } from "./manifest";
import type { UtilityPanel, UtilityValue } from "./utility";

export interface StudioPreviewSnapshot { running: boolean; panel?: UtilityPanel; settings: Record<string, UtilityValue>; colors: Record<string, string>; events: string[]; error?: string; }
export function readStudioCommand(input: unknown) {
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 131_072) throw new Error("Studio request exceeds 128 KiB.");
    const data = checkedObject(input, ["action", "bundle", "id", "settings"], "Studio command");
    if (!["start", "snapshot", "action", "settings", "stop"].includes(String(data.action))) throw new Error("Unsupported Studio command.");
    if (data.action === "start" ? data.bundle === undefined || data.id !== undefined || data.settings !== undefined
        : data.bundle !== undefined || (data.action === "action" ? typeof data.id !== "string" || data.id.length > 100 || data.settings !== undefined : data.id !== undefined)
        || (data.action === "settings" ? data.settings === undefined : data.settings !== undefined)) throw new Error("Invalid fields for this Studio command.");
    return data;
}
