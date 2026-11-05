/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import channel from "./updateChannel.json";

export function hasInstallerUpdateChannel() {
    try {
        const url = new URL(channel.baseUrl);
        const keys: unknown[] = Object.values(channel.trustRoots);
        return channel.enabled && ["stable", "beta", "development"].includes(channel.channel) && url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname.endsWith("/") && keys.length > 0 && keys.length <= 8 && keys.every(key => typeof key === "string" && key.length <= 4096 && !key.includes("PRIVATE KEY"));
    } catch { return false; }
}

export interface UpdateOffer { version: string; notes: string; issuedAt: number; sha256: string; size: number; staged: boolean; }
export interface UpdateResult { configured?: boolean; checked?: boolean; offer?: UpdateOffer | null; error?: string; cancelled?: boolean; launched?: boolean; progress?: { received: number; total: number; }; }
