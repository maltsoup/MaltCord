/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { type CloudCatalogItem, parseCloudCatalogItem } from "@shared/kittycord/cloudCatalog";
import config from "@shared/kittycord/cloudConfig.json";
import { cloudOrigin } from "@shared/kittycord/cloudOrigin";
import { verifyExternalPackage } from "@shared/kittycord/javascriptPackage";
import { nativeProject } from "@shared/kittycord/nativeStudio";
import { verifyPluginArtifact } from "@shared/kittycord/safeInstall";

async function receive(path: string, limit: number) {
    if (!config.enabled || !config.origin.startsWith("https://")) throw new Error("The official Cloud service is not configured in this build.");
    const response = await fetch(config.origin + path, { credentials: "omit", referrerPolicy: "no-referrer", redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("The Cloud catalog could not be reached.", { cause: response.status }); }
    const reader = response.body.getReader(); let source = "", size = 0; const decoder = new TextDecoder();
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new Error("The Cloud response exceeds its limit."); source += decoder.decode(part.value, { stream: true }); } return source + decoder.decode(); }
    finally { await reader.cancel(); reader.releaseLock(); }
}
export const KittycordCloudCatalog = {
    enabled: !!cloudOrigin(config),
    origin: config.origin,
    async detail(item: Pick<CloudCatalogItem, "id" | "kind">, before?: number): Promise<CloudCatalogItem> { return parseCloudCatalogItem(JSON.parse(await receive(`/api/v1/${item.kind === "plugin" ? "plugins" : "marketplace"}/${encodeURIComponent(item.id)}${before ? `?before=${before}` : ""}`, 1000000))); },
    async list(visual: boolean, search: string, before?: number, publisher?: string, category?: string, collection?: "kittencord"): Promise<{ items: CloudCatalogItem[]; next: number | null; }> {
        if(publisher&&!/^\d{17,20}$/.test(publisher))throw Error("Use a Discord publisher ID.");
        const value = JSON.parse(await receive(`/api/v1/${visual ? "marketplace" : "plugins"}?limit=20&search=${encodeURIComponent(search)}${before ? `&before=${before}` : ""}${publisher?`&publisher=${publisher}`:""}${category?`&category=${encodeURIComponent(category)}`:""}${collection?`&collection=${collection}`:""}`, 2000000));
        if (!value || !Array.isArray(value.items) || value.items.length > 20) throw new Error("Invalid Cloud catalog response.");
        if(value.next !== null && (typeof value.next !== "number" || !Number.isSafeInteger(value.next) || value.next < 1)) throw new Error("Invalid Cloud catalog cursor.");
        return { items:value.items.map(parseCloudCatalogItem),next:value.next };
    },
    async download(item: CloudCatalogItem, version: CloudCatalogItem["versions"][number]) {
        if (!/^[a-f0-9]{64}$/.test(version.digest) || version.status !== "published") throw new Error("Choose a published version with valid integrity metadata.");
        const source = await receive(`/api/v1/${item.kind === "plugin" ? "plugins" : "marketplace"}/${encodeURIComponent(item.id)}/versions/${encodeURIComponent(version.version)}/download`, 1100000);
        await verifyPluginArtifact(new TextEncoder().encode(source), version.digest);
        const value: unknown = JSON.parse(source);
        if (version.format === "native-project") { const project = nativeProject(value); if (project.metadata.id !== item.id || project.metadata.version !== version.version || (project.metadata.contentType??"plugin") !== (item.kind === "plugin" ? "plugin" : item.metadata.category)) throw new Error("The project does not match this listing."); await DataStore.set(`kittencord.cloud-package-source:${item.id}`,item); return project; }
        const bundle = await verifyExternalPackage(value); if (bundle.manifest.id !== item.id || bundle.manifest.version !== version.version) throw new Error("The package does not match this listing."); return bundle;
    }
};
