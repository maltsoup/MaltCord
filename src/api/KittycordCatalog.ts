/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { verifyPluginCatalog } from "@shared/kittycord/catalog";
import keys from "@shared/kittycord/catalogKeys.json";
import { type PluginManifest } from "@shared/kittycord/manifest";
import envelope from "@shared/kittycord/signedCatalog.json";

let verified: ReturnType<typeof verifyPluginCatalog> | undefined;
function catalog() { return verified ??= verifyPluginCatalog(envelope, keys); }

export const KittycordCatalog = {
    async load() { const result = structuredClone(await catalog()); result.expired = Date.now() >= result.catalog.expiresAt; return result; },
    async reviewEntry(id: string, digest: string) {
        const { catalog: source } = await catalog();
        if (Date.now() >= source.expiresAt) throw new Error("The signed catalog has expired. No marketplace review was approved.");
        const entry = source.entries.find(entry => entry.bundle.manifest.id === id && entry.bundle.manifest.integrity.digest === digest);
        if (!entry || source.blockedDigests.includes(digest)) throw new Error("The selected artifact is absent or blocked in this catalog.");
        return structuredClone(entry.bundle);
    },
    async checkPackage(manifest: PluginManifest): Promise<"allowed" | "blocked"> {
        return (await catalog()).catalog.blockedDigests.includes(manifest.integrity.digest) ? "blocked" : "allowed";
    }
};
