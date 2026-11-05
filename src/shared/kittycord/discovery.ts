/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface DiscoveryItem { id: string; name: string; description: string; keywords: string[]; installed: boolean; status: string; permissions?: string[]; exclusiveCapabilities?: string[]; }
const synonyms: Record<string, string[]> = {
    voice: ["audio", "microphone", "sound", "mute"], lag: ["performance", "cpu", "latency", "memory"], theme: ["color", "appearance", "accent"],
    صوت: ["voice", "audio", "sound"], مايك: ["microphone", "mute"], بطء: ["performance", "latency"], أداء: ["performance", "cpu"], ثيم: ["theme", "color", "accent"], ألوان: ["color", "accent"]
};

export function discoverPlugins(query: string, items: readonly DiscoveryItem[]) {
    if (query.length > 500 || items.length > 2048) throw new Error("Discovery accepts a query up to 500 characters and at most 2048 items.");
    const words = [...new Set((query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 1))].slice(0, 40);
    const terms = [...new Set(words.flatMap(word => [word, ...(synonyms[word] ?? [])]))];
    const ranked = items.filter(item => item.status !== "Unsafe or blocked").map(item => {
        const text = `${item.name} ${item.description} ${item.keywords.join(" ")}`.toLowerCase();
        const matched = terms.filter(term => text.includes(term));
        return { ...item, matched, score: matched.length * 10 + (item.installed ? 3 : 0) };
    }).filter(item => item.matched.length).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const ids = new Set<string>();
    const capabilities = new Set<string>();
    return ranked.filter(item => {
        if (ids.has(item.id.toLowerCase()) || item.exclusiveCapabilities?.some(capability => capabilities.has(capability))) return false;
        ids.add(item.id.toLowerCase());
        for (const capability of item.exclusiveCapabilities ?? []) capabilities.add(capability);
        return true;
    }).slice(0, 12);
}
