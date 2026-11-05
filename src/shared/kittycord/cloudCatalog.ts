/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { imageReference } from "./imageSources";
import { checkedObject, checkedPluginIdentifier, checkedText } from "./manifest";
import { githubRepository, githubUsername } from "./presentation";
import { checkedVersion } from "./validation";

export const CLOUD_ORIGINS = { original: "KittenCord Original", edition: "KittenCord Edition", "ported-testcord": "Ported from TestCord", "ported-vencord": "Ported from Vencord", "ported-equicord": "Ported from Equicord", community: "Community Plugin" } as const;
export const MARKET_CATEGORIES = ["theme", "css-snippet", "icon-pack", "animation-pack", "ui-customization", "visual-effect", "layout-preset", "appearance-enhancement", "interface-component"] as const;
export interface CloudListing {
    id: string; name: string; description: string; readme: string; author: string;
    category: string; github: string; repository: string; icon: string; screenshots: string[];
    origin: keyof typeof CLOUD_ORIGINS; source: { project: string; author: string; repository: string; } | null;
}
export interface CloudCatalogItem {
    id: string; kind: "plugin" | "marketplace"; publisher_id: string; metadata: CloudListing;
    status: "draft" | "approved" | "suspended"; updated_at: number; nextVersion?: number | null;
    publisher: { username: string; avatar: string | null; }; downloads: number;
    authorGithub?: { id: string; login: string; verifiedAt: number; avatar: string; url: string; verification: "discord-connection"; } | null;
    versions: { id: number; version: string; digest: string; size: number; format: "native-project" | "package"; permissions: string[]; changelog: string; compatibility: string; status: string; downloads: number; created_at: number; }[];
}
export function parseCloudListing(value: unknown, kind: "plugin" | "marketplace"): CloudListing {
    const data = checkedObject(value, ["id", "name", "description", "readme", "author", "category", "github", "repository", "icon", "screenshots", "origin", "source"], "Cloud listing");
    const origin = Object.keys(CLOUD_ORIGINS).find(key => key === data.origin) as keyof typeof CLOUD_ORIGINS | undefined;
    if (!origin) throw new Error("Choose a source origin.");
    if (typeof data.readme !== "string" || data.readme.length > 24000) throw new Error("Use a README up to 24,000 characters.");
    const category = checkedText(data.category, "Category", 60);
    if (kind === "marketplace" && !MARKET_CATEGORIES.some(item => item === category)) throw new Error("Choose a visual marketplace category.");
    const asset = imageReference;
    if (!Array.isArray(data.screenshots) || data.screenshots.length > 8) throw new Error("Choose up to eight screenshots.");
    let source: CloudListing["source"] = null;
    if (origin !== "original" && origin !== "community") { const item = checkedObject(data.source, ["project", "author", "repository"], "Source attribution"); source = { project: checkedText(item.project, "Source project"), author: checkedText(item.author, "Original author"), repository: githubRepository(item.repository) }; }
    return { id: checkedPluginIdentifier(data.id), name: checkedText(data.name, "Name", 100), description: checkedText(data.description, "Description", 500), readme: data.readme, author: checkedText(data.author, "Author"), category, github: data.github ? githubUsername(data.github) : "", repository: data.repository ? githubRepository(data.repository) : "", icon: data.icon ? asset(data.icon) : "", screenshots: data.screenshots.map(asset), origin, source };
}

export function parseCloudCatalogItem(value: unknown): CloudCatalogItem {
    if (!value || typeof value !== "object") throw new Error("Invalid catalog item.");
    const data = value as Record<string, unknown>;
    if (data.kind !== "plugin" && data.kind !== "marketplace" || typeof data.publisher_id !== "string" || !/^\d{17,20}$/.test(data.publisher_id) || !["draft", "approved", "suspended"].includes(String(data.status)) || !Array.isArray(data.versions) || data.versions.length > 20 || typeof data.downloads !== "number" || !Number.isSafeInteger(data.downloads) || data.downloads < 0 || typeof data.updated_at !== "number" || !Number.isSafeInteger(data.updated_at)) throw new Error("Invalid catalog metadata.");
    const metadata = parseCloudListing(data.metadata, data.kind), id = checkedPluginIdentifier(data.id);
    if (metadata.id !== id) throw new Error("Catalog identity mismatch.");
    const publisher = checkedObject(data.publisher, ["username", "avatar"], "Publisher");
    if (publisher.avatar !== null && (typeof publisher.avatar !== "string" || !new RegExp(`^https://cdn\\.discordapp\\.com/avatars/${data.publisher_id}/[a-z0-9_]+\\.png\\?size=64$`).test(publisher.avatar))) throw new Error("Invalid publisher avatar.");
    let authorGithub: CloudCatalogItem["authorGithub"] = null;
    if (data.authorGithub) {
        const github = checkedObject(data.authorGithub, ["id", "login", "verifiedAt", "avatar", "url", "verification"], "Verified GitHub author");
        const login = githubUsername(github.login);
        if (typeof github.id !== "string" || !/^[1-9]\d{0,19}$/.test(github.id) || typeof github.verifiedAt !== "number" || !Number.isSafeInteger(github.verifiedAt) || github.verifiedAt < 1 || github.verification !== "discord-connection" || github.avatar !== `https://avatars.githubusercontent.com/u/${github.id}?s=96` || github.url !== `https://github.com/${login}`) throw new Error("Invalid verified author identity.");
        authorGithub = { id: github.id, login, verifiedAt: github.verifiedAt, avatar: github.avatar, url: github.url, verification: github.verification };
    }
    const versions = data.versions.map((value: unknown) => {
        if (!value || typeof value !== "object") throw new Error("Invalid catalog version.");
        const version = value as Record<string, unknown>;
        if (typeof version.id !== "number" || !Number.isSafeInteger(version.id) || typeof version.digest !== "string" || !/^[a-f0-9]{64}$/.test(version.digest) || typeof version.size !== "number" || !Number.isSafeInteger(version.size) || version.size < 1 || version.size > 1100000 || !["native-project", "package"].includes(String(version.format)) || !Array.isArray(version.permissions) || version.permissions.length > 32 || version.permissions.some(value => typeof value !== "string" || value.length > 150) || !["pending", "published", "disabled", "deprecated"].includes(String(version.status)) || typeof version.downloads !== "number" || !Number.isSafeInteger(version.downloads) || typeof version.created_at !== "number" || !Number.isSafeInteger(version.created_at) || typeof version.changelog !== "string" || version.changelog.length > 16000) throw new Error("Invalid version metadata.");
        return { id: version.id, version: checkedVersion(version.version, "Plugin version"), digest: version.digest, size: version.size, format: version.format as "native-project" | "package", permissions: version.permissions as string[], changelog: version.changelog, compatibility: checkedText(version.compatibility, "Compatibility", 500), status: String(version.status), downloads: version.downloads, created_at: version.created_at };
    });
    if (data.nextVersion !== null && data.nextVersion !== undefined && (typeof data.nextVersion !== "number" || !Number.isSafeInteger(data.nextVersion) || data.nextVersion < 1)) throw new Error("Invalid version cursor.");
    return { id, authorGithub, kind: data.kind, publisher_id: data.publisher_id, metadata, status: data.status as CloudCatalogItem["status"], updated_at: data.updated_at, publisher: { username: checkedText(publisher.username, "Publisher", 100), avatar: publisher.avatar as string | null }, downloads: data.downloads, versions, nextVersion: data.nextVersion as number | null | undefined };
}
