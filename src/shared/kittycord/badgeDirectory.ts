/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { DirectoryBadge, ProfileBadge } from "@api/Badges";

/** The Vencord BadgeAPI contract consumed by Discord's own badge cards. */
export function nativeDirectoryBadge(badge: ProfileBadge, userId: string): DirectoryBadge | undefined {
    if (!badge.iconSrc || !/^\d{17,20}$/.test(userId)) return;
    return {
        badge_id: `vc-${userId}-${badge.id}`,
        name: badge.name ?? badge.description ?? badge.id,
        description: badge.detail ?? badge.description ?? badge.name ?? "",
        info_label: badge.infoLabel ?? (badge.id.startsWith("kittencord_") ? "MaltCord" : "Vencord"),
        rarity: badge.rarity ?? 1,
        simple_icon_url: badge.iconSrc,
        complex_icon_static_url: badge.largeIconSrc ?? badge.iconSrc,
        obtained_at: badge.obtainedAt,
        is_earnable: false,
        owned: true,
        hidden: false,
        tiers: []
    };
}
