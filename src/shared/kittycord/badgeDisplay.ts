/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface BadgeDisplay { order: string[]; hidden: string[]; nitro: "default" | "silver" | "opal"; displayYear: number | null; }
export function badgeDisplay(value: unknown): BadgeDisplay {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Choose valid badge display preferences.");
    const record = value as Record<string, unknown>;
    const ids = (value: unknown): string[] => { if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== "string" || !/^[a-z][a-z0-9-]{0,59}$/.test(id))) throw Error("Choose assigned badge identifiers."); return [...new Set(value)] as string[]; };
    if (Object.keys(record).some(key => !["order", "hidden", "nitro", "displayYear"].includes(key)) || !["default", "silver", "opal"].includes(String(record.nitro)) || record.displayYear !== null && (typeof record.displayYear !== "number" || !Number.isInteger(record.displayYear) || record.displayYear < 2015 || record.displayYear > new Date().getUTCFullYear())) throw Error("Choose a valid cosmetic appearance and display year.");
    return { order: ids(record.order), hidden: ids(record.hidden), nitro: record.nitro as BadgeDisplay["nitro"], displayYear: record.displayYear as number | null };
}
export function defaultBadgeDisplay(): BadgeDisplay { return { order: [], hidden: [], nitro: "default", displayYear: null }; }
export function accountCreatedAt(id: string) {
    if (!/^\d{17,20}$/.test(id)) throw Error("A Discord user ID is required.");
    return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
}
export function cosmeticBadgeRow<T extends { id: string; }>(badges: readonly T[], replacement: T | undefined) {
    if (!replacement) return [...badges];
    const index = badges.findIndex(badge => /^premium(?:$|_tenure)/.test(badge.id));
    const result = badges.filter(badge => !/^premium(?:$|_tenure)/.test(badge.id) && badge.id !== replacement.id);
    result.splice(index < 0 ? result.length : Math.min(index, result.length), 0, { ...replacement });
    return result;
}
