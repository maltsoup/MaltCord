/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const kittenCatPath = "M24 53 18 17 49 36Q64 30 79 36L110 17 104 53Q113 66 108 86Q99 111 64 111Q29 111 20 86Q15 66 24 53Z";
export const kittenFacePath = "M42 64a6 8 0 1 0 0 16a6 8 0 1 0 0-16M86 64a6 8 0 1 0 0 16a6 8 0 1 0 0-16M57 85h14l-7 8Z";
export const kittenBadgeNames = { user: "KITTENCORD USER", owner: "KITTENCORD OWNER", developer: "KITTENCORD DEV", star: "KITTYCORD STAR", opal: "KITTENCORD OPAL", founder: "KITTENCORD FOUNDER", contributor: "KITTENCORD CONTRIBUTOR" } as const;
export const kittenBadgeIds = { user: "testcord_user", owner: "kittencord_owner", developer: "kittencord_dev", star: "kittycord_star", opal: "kittencord_opal", founder: "kittencord_founder", contributor: "kittencord_contributor" } as const;
export type KittenBadgeKind = keyof typeof kittenBadgeNames;

export function kittenBadgeFromId(id: string): KittenBadgeKind {
    return (Object.keys(kittenBadgeIds) as KittenBadgeKind[]).find(kind => kittenBadgeIds[kind] === id) ?? "user";
}

function createBadgeImage(kind: KittenBadgeKind) {
    if (kind === "developer" || kind === "owner" || kind === "founder") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="c" x2=".7" y2="1"><stop stop-color="${kind === "developer" ? "#e9e0ff" : "#ffe9ac"}"/><stop offset=".5" stop-color="${kind === "developer" ? "#b497f3" : "#edbe56"}"/><stop offset="1" stop-color="${kind === "developer" ? "#7862bd" : "#be8533"}"/></linearGradient></defs><path fill="url(#c)" stroke="${kind === "developer" ? "#d8c5ff" : "#f9d485"}" stroke-linejoin="round" d="M5 24 2.5 9.5l8 5L16 4l5.5 10.5 8-5L27 24Z"/><path d="M6 28h20" stroke="${kind === "developer" ? "#b497f3" : "#edbe56"}" stroke-width="2.5" stroke-linecap="round"/><path fill="none" stroke="#342248" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="m13 17-3 3 3 2m6-5 3 3-3 2m-2-7-2 9"/></svg>`)}`;
    if (kind === "opal") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe9fb"/><stop offset=".3" stop-color="#addff4"/><stop offset=".65" stop-color="#c8a5f2"/><stop offset="1" stop-color="#86d9cc"/></linearGradient><linearGradient id="f" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#c5b0f0" stop-opacity=".2"/></linearGradient></defs><path fill="url(#o)" stroke="#e6dffa" stroke-width=".9" stroke-linejoin="round" d="m9 3 14 2 6 10-7 14-15-3-5-13Z"/><path fill="#7969bd" fill-opacity=".7" d="m2 13 8 3-3 10Zm27 2-10 5 3 9Z"/><path fill="#a7edf0" d="m9 3 1 13 10-7Z"/><path fill="url(#f)" d="m9 3 14 2-3 4-10 7-8-3Z"/><path fill="#ecbef4" d="m20 9 9 6-10 5-9-4Z"/><path fill="#bcefe0" fill-opacity=".9" d="m10 16 9 4 3 9-15-3Z"/><path fill="none" stroke="#fff" stroke-opacity=".65" stroke-width=".7" d="m9 3 1 13 9 4 3 9m1-24-3 4 9 6M2 13l8 3L7 26m3-10L20 9l-1 11"/></svg>')}`;
    if (kind === "star") return `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f4c65d" d="m12 1.8 3.1 6.3 7 .9-5.1 5 1.2 7-6.2-3.3L5.8 21l1.2-7-5.1-5 7-.9Z"/></svg>')}`;
    const color = kind === "contributor" ? "#a6c7ff" : "#db61a2";
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path fill="${color}" d="${kittenCatPath}"/><path fill="#1b1225" d="${kittenFacePath}"/></svg>`)}`;
}

const images = { user: createBadgeImage("user"), owner: createBadgeImage("owner"), developer: createBadgeImage("developer"), star: createBadgeImage("star"), opal: createBadgeImage("opal"), founder: createBadgeImage("founder"), contributor: createBadgeImage("contributor") };

export function kittenBadgeImage(kind: KittenBadgeKind) { return images[kind]; }

export function kittenCloudBadgeImage(badge: { id: string; icon: string; }) {
    return badge.icon;
}

export function reorderOwnerBadges<T extends { id: string; }>(badges: readonly T[], preferred: readonly string[]) {
    const order = new Map(preferred.map((id, index) => [id, index]));
    return [...badges].sort((a, b) => (order.get(a.id) ?? (a.id === "kittencord_cloud_opal" ? preferred.length : preferred.length + 1)) - (order.get(b.id) ?? (b.id === "kittencord_cloud_opal" ? preferred.length : preferred.length + 1)));
}

export function kittenSilverBadgeImage() { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="s" x2="1" y2="1"><stop stop-color="#f5f6fa"/><stop offset=".48" stop-color="#aeb6c8"/><stop offset=".52" stop-color="#e4e8f1"/><stop offset="1" stop-color="#7b879f"/></linearGradient></defs><path fill="url(#s)" stroke="#edf0f8" d="m8 3 16 0 5 10-13 17L3 13Z"/><path fill="none" stroke="#7c879b" d="m8 3 3 10 5 17 5-17 3-10M3 13h26M8 3l8 10 8-10"/></svg>')}`; }
