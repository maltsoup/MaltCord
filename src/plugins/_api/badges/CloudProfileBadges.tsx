/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgeRarity, type ProfileBadge } from "@api/Badges";
import { cloudBadges, useCloudBadges } from "@api/KittycordCloud";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { kittenCloudBadgeImage } from "@shared/kittycord/badges";
import type { CloudBadge } from "@shared/kittycord/cloudBadges";
import { UserStore } from "@webpack/common";

import { openOwnerBadgeLayout } from "./OwnerBadgeLayout";

export function cloudProfileBadgeItems(userId: string, badges: readonly CloudBadge[]): ProfileBadge[] {
    const own = userId === UserStore.getCurrentUser()?.id;
    return badges.map(badge => ({
        id: `kittencord_cloud_${badge.id}`,
        name: badge.label,
        description: badge.label,
        detail: badge.description,
        infoLabel: "KittenCord",
        rarity: badge.id === "opal" ? BadgeRarity.MYTHIC : BadgeRarity.COMMON,
        iconSrc: kittenCloudBadgeImage(badge),
        largeIconSrc: kittenCloudBadgeImage(badge),
        onContextMenu: own && !IS_WEB ? event => {
            event.preventDefault(); event.stopPropagation();
            openOwnerBadgeLayout(userId, cloudBadges.assigned(userId).map(badge => ({ id: `kittencord_cloud_${badge.id}`, description: badge.label, iconSrc: kittenCloudBadgeImage(badge) })));
        } : undefined
    }));
}

export const CloudProfileDetails = ErrorBoundary.wrap(function CloudProfileDetails({ userId }:{ userId:string; }) {
    const assigned=useCloudBadges(userId);
    if(!/^\d{17,20}$/.test(userId))return null;
    const own=UserStore.getCurrentUser()?.id===userId;
    if (!assigned.length && !cloudBadges.assigned(userId).length && cloudBadges.state(userId) !== "verified") return own && cloudBadges.state(userId) === "offline" ? <section className="vc-kitten-profile-details" aria-label="KittenCord badges"><Paragraph>The badge service is unavailable. Your saved preferences are kept.</Paragraph><Button size="small" variant="secondary" onClick={() => void cloudBadges.load(userId, true)}>Retry</Button></section> : null;
    if (!assigned.length && !cloudBadges.assigned(userId).length) return own && cloudBadges.enabled ? <section className="vc-kitten-profile-details" aria-label="KittenCord badges"><Paragraph>{IS_WEB ? "Connect your account from KittenCord desktop to save badge preferences." : "Connect your KittenCord account to sync badges and their visibility."}</Paragraph><Button disabled={IS_WEB} size="small" variant="secondary" onClick={() => void import("@components/settings/tabs/kittenNavigation").then(({ openKittenPage }) => openKittenPage("backup", "cloud"))}>Connect account</Button></section> : null;
    // Only your own badge controls are shown here; the account date and display year were removed (owner, 2026-11-04).
    if (!own) return null;
    return <section className="vc-kitten-profile-details" aria-label="KittenCord badges">{IS_WEB && <Paragraph>Badge editing is available in KittenCord desktop.</Paragraph>}<Button disabled={IS_WEB} size="small" variant="secondary" onClick={()=>openOwnerBadgeLayout(userId,cloudBadges.assigned(userId).map(badge=>({ id:`kittencord_cloud_${badge.id}`,description:badge.label,iconSrc:kittenCloudBadgeImage(badge) })))}>Badge appearance</Button></section>;
},{ noop:true });
