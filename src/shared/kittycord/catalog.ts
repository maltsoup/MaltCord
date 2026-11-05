/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ExternalPackage, verifyExternalPackage } from "./javascriptPackage";
import { checkedObject, checkedText, checkedVersion } from "./manifest";

export interface CatalogKey { id: string; publicKey: string; minimumRevision: number; development: boolean; }
export interface CatalogEntry { bundle: ExternalPackage; category: "Appearance" | "Utilities" | "Development"; history: { version: string; notes: string; }[]; }
export interface PluginCatalog { schemaVersion: 1; revision: number; name: string; issuedAt: number; expiresAt: number; entries: CatalogEntry[]; blockedDigests: string[]; }
export const CATALOG_LIMIT = 1024 * 1024;

export function catalogBase64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function decode(value: unknown, length: number) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length !== Math.ceil(length * 4 / 3)) throw new Error("Catalog signature encoding is invalid.");
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4)), character => character.charCodeAt(0));
    if (bytes.length !== length || catalogBase64(bytes) !== value) throw new Error("Catalog signature encoding is invalid.");
    return bytes;
}

export async function verifyPluginCatalog(input: unknown, keys: readonly CatalogKey[], now = Date.now()) {
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > CATALOG_LIMIT) throw new Error("Catalog exceeds 1 MiB.");
    const envelope = checkedObject(input, ["schemaVersion", "keyId", "payload", "signature"], "Signed catalog");
    if (envelope.schemaVersion !== 1 || typeof envelope.payload !== "string") throw new Error("Unsupported signed catalog schema.");
    const signer = keys.find(key => key.id === envelope.keyId);
    if (!signer) throw new Error("Catalog signer is not trusted by this build.");
    const key = await crypto.subtle.importKey("raw", decode(signer.publicKey, 32), { name: "Ed25519" }, false, ["verify"]);
    if (!await crypto.subtle.verify("Ed25519", key, decode(envelope.signature, 64), new TextEncoder().encode(envelope.payload))) throw new Error("Catalog signature verification failed.");
    const data = checkedObject(JSON.parse(envelope.payload), ["schemaVersion", "revision", "name", "issuedAt", "expiresAt", "entries", "blockedDigests"], "Catalog");
    if (data.schemaVersion !== 1 || typeof data.revision !== "number" || !Number.isSafeInteger(data.revision) || data.revision < signer.minimumRevision) throw new Error("Catalog revision is unsupported or older than this build allows.");
    if (typeof data.issuedAt !== "number" || typeof data.expiresAt !== "number" || !Number.isSafeInteger(data.issuedAt) || !Number.isSafeInteger(data.expiresAt)
        || data.issuedAt < 0 || data.issuedAt > now + 300_000 || data.expiresAt <= data.issuedAt) throw new Error("Catalog validity dates are invalid. Check the local clock.");
    if (!Array.isArray(data.entries) || data.entries.length > 100 || !Array.isArray(data.blockedDigests) || data.blockedDigests.length > 1024) throw new Error("Catalog entries or blocklist exceed supported limits.");
    const blockedDigests = data.blockedDigests.map(value => {
        if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid blocked artifact digest.");
        return value;
    });
    if (new Set(blockedDigests).size !== blockedDigests.length) throw new Error("Duplicate blocked artifact digest.");
    const entries: CatalogEntry[] = [];
    for (const value of data.entries) {
        const item = checkedObject(value, ["bundle", "category", "history"], "Catalog entry");
        const category = ["Appearance", "Utilities", "Development"].find(category => category === item.category);
        if (!category || !Array.isArray(item.history) || item.history.length > 20) throw new Error("Invalid catalog category or release history.");
        const bundle = await verifyExternalPackage(item.bundle);
        const history = item.history.map(value => {
            const release = checkedObject(value, ["version", "notes"], "Catalog release");
            return { version: checkedVersion(release.version, "Release version"), notes: checkedText(release.notes, "Release notes", 2000) };
        });
        if (!history.some(release => release.version === bundle.manifest.version) || new Set(history.map(release => release.version)).size !== history.length) throw new Error("Release history must include the current version without duplicates.");
        entries.push({ bundle, category: category as CatalogEntry["category"], history });
    }
    if (new Set(entries.map(entry => entry.bundle.manifest.id)).size !== entries.length) throw new Error("Duplicate catalog plugin identifier.");
    const catalog: PluginCatalog = { schemaVersion: 1, revision: data.revision, name: checkedText(data.name, "Catalog name"), issuedAt: data.issuedAt, expiresAt: data.expiresAt, entries, blockedDigests };
    return { catalog, signer: { id: signer.id, development: signer.development }, expired: now >= catalog.expiresAt, signatureVerified: true as const };
}
