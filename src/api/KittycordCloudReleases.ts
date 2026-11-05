/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Kittycord } from "@shared/kittycord";
import config from "@shared/kittycord/cloudConfig.json";
import { cloudOrigin } from "@shared/kittycord/cloudOrigin";
import { imageReference } from "@shared/kittycord/imageSources";
import { checkedObject } from "@shared/kittycord/manifest";
import { parseReleaseManifest, type ReleaseManifest } from "@shared/kittycord/releaseManifest";

interface CloudRelease extends ReleaseManifest { id: number; screenshots: string[]; important: boolean; }
export async function cloudReleaseHistory(before?: number) {
    const origin = cloudOrigin(config);
    if (!origin) return { items: [] as CloudRelease[], next: null as number | null };
    const response = await fetch(`${origin}/api/v1/releases?limit=20${before ? `&before=${before}` : ""}`, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.body) throw new Error("Release history is temporarily unavailable.");
    const reader = response.body.getReader(), decoder = new TextDecoder(); let text = "", size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 1100000) throw new Error("Release history exceeds its size limit."); text += decoder.decode(chunk.value, { stream: true }); } text += decoder.decode(); }
    finally { await reader.cancel(); reader.releaseLock(); }
    const value = checkedObject(JSON.parse(text), ["items", "next"], "Release history");
    if (!Array.isArray(value.items) || value.items.length > 20 || value.next !== null && (typeof value.next !== "number" || !Number.isSafeInteger(value.next) || value.next < 1)) throw new Error("Invalid release history.");
    const items = value.items.map((input: unknown): CloudRelease => {
        const row = checkedObject(input, ["id", "schemaVersion", "product", "version", "minApiVersion", "channel", "issuedAt", "expiresAt", "notes", "artifacts", "screenshots", "important", "available"], "Cloud release");
        if (typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.important !== "boolean" || !Array.isArray(row.screenshots) || row.screenshots.length > 8 || row.screenshots.some(value => { try{ imageReference(value);return false; }catch{ return true; } }) || !["stable", "beta", "development"].includes(String(row.channel)) || !Array.isArray(row.artifacts)) throw new Error("Invalid release metadata.");
        const artifact: unknown = row.artifacts[0];
        if (!artifact || typeof artifact !== "object" || !("platform" in artifact) || !("target" in artifact) || !["win32", "linux", "darwin"].includes(String(artifact.platform)) || !["desktop", "equibop", "windows-installer"].includes(String(artifact.target))) throw new Error("Invalid release artifact.");
        const { id, screenshots, important, available, ...manifest } = row;
        const parsed = parseReleaseManifest(manifest, { platform: artifact.platform as "win32" | "linux" | "darwin", target: artifact.target as "desktop" | "equibop" | "windows-installer", channel: row.channel as "stable" | "beta" | "development", apiVersion: Kittycord.apiVersion, purpose: "rollback" });
        return { ...parsed.release, id: row.id, screenshots: row.screenshots as string[], important: row.important };
    });
    return { items, next: value.next as number | null };
}
