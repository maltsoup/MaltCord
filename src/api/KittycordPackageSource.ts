/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { KittycordCloudCatalog } from "@api/KittycordCloudCatalog";
import { NativeStudio } from "@api/NativeStudio";
import { type CloudCatalogItem, parseCloudCatalogItem } from "@shared/kittycord/cloudCatalog";
import type { NativeStudioProject } from "@shared/kittycord/nativeStudio";
import { verifyPluginArtifact } from "@shared/kittycord/safeInstall";
import { useEffect, useState } from "@webpack/common";

export const cloudPackageSourceKey = (id: string) => `kittencord.cloud-package-source:${id}`;
type CloudSource = CloudCatalogItem & { verification: "live" | "cached"; };

export async function verifiedNativeSource(id: string): Promise<CloudSource | undefined> {
    if (!KittycordCloudCatalog.enabled) return;
    let project: NativeStudioProject;
    try { project = NativeStudio.project(id); } catch { return; }
    const stored = await DataStore.get<unknown>(cloudPackageSourceKey(id));
    const saved = stored === undefined ? undefined : parseCloudCatalogItem(stored);
    let item: CloudCatalogItem;
    let verification: CloudSource["verification"] = "live";
    try {
        item = await KittycordCloudCatalog.detail({ id, kind: (project.metadata.contentType ?? "plugin") === "plugin" ? "plugin" : "marketplace" });
    } catch (error) {
        if (!saved || error instanceof Error && (error.cause === 404 || error.cause === 403)) return;
        item = saved; verification = "cached";
    }
    if (item.id !== id || item.status !== "approved") return;
    const version = item.versions.find(version => version.version === project.metadata.version && version.status === "published" && version.format === "native-project");
    if (!version) return;
    await verifyPluginArtifact(new TextEncoder().encode(JSON.stringify(project)), version.digest);
    if (verification === "live") await DataStore.set(cloudPackageSourceKey(id), item);
    return { ...item, verification };
}

export function useVerifiedNativeSource(id?: string) {
    const [item, setItem] = useState<CloudSource>();
    useEffect(() => { let active = true; setItem(undefined); if (id) void verifiedNativeSource(id).then(value => { if (active) setItem(value); }, () => undefined); return () => { active = false; }; }, [id]);
    return item;
}

export function verifiedSourceLabel(item: CloudCatalogItem & { verification?: CloudSource["verification"]; }) {
    const source = item.metadata.origin === "original" || item.metadata.origin === "edition" ? "MaltCord" : "MaltCord Cloud";
    return item.verification === "cached" ? `${source} · cached` : source;
}
