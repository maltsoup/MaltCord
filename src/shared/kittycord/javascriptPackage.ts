/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DESKTOP_PERMISSIONS, isDesktopPlugin } from "./desktopPlugin";
import { checkedObject, parsePluginManifest } from "./manifest";
import { inspectPluginSource, verifyPluginArtifact } from "./safeInstall";
import { parseThemePackage, THEME_PACKAGE_LIMIT, THEME_TOKENS, type ThemePackage, verifyThemePackage } from "./themePackage";

export type ExternalPackage = ThemePackage;

export function parseExternalPackage(value: unknown): ExternalPackage {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > THEME_PACKAGE_LIMIT) throw new Error("Packages must not exceed 128 KiB.");
    const data = checkedObject(value, ["schemaVersion", "manifest", "artifact"], "External package");
    const manifest = parsePluginManifest(JSON.stringify(data.manifest));
    if (manifest.entrypoints.desktop !== "plugin.js") return parseThemePackage(value);
    if (data.schemaVersion !== 1 || typeof data.artifact !== "string" || !data.artifact.trim() || new TextEncoder().encode(data.artifact).byteLength > 65_536)
        throw new Error("JavaScript packages require a nonempty plugin.js artifact up to 64 KiB.");
    if (manifest.loadingMode !== "runtime" || manifest.requiredPatches.length || manifest.entrypoints.browser || manifest.platforms.some(platform => ["chrome", "edge", "firefox"].includes(platform)))
        throw new Error("Only desktop runtime JavaScript without webpack patches is supported. Patch/native source plugins require a reviewed rebuild or restart workflow.");
    const tokens = THEME_TOKENS.map(token => `theme.${token.slice(2)}`);
    const declared = manifest.exclusiveCapabilities;
    const desktop = isDesktopPlugin(manifest);
    if (desktop && (manifest.capabilities.length !== 1 || declared.length || !manifest.permissions.includes("settings") || !manifest.permissions.includes("events") || manifest.permissions.some(permission => !DESKTOP_PERMISSIONS.includes(permission))
        || (manifest.networkOrigins?.length ?? 0) > 0 && !manifest.permissions.includes("network") || manifest.permissions.includes("network") && !manifest.networkOrigins?.length || manifest.permissions.includes("scripts") && !manifest.permissions.includes("network")))
        throw new Error("Desktop plugins need settings/actions, declared supported permissions, and HTTPS origins for network or pinned scripts.");
    if (!desktop && manifest.networkOrigins?.length) throw new Error("Network origins require the Desktop plugin API.");
    const utility = manifest.capabilities.length === 1 && manifest.capabilities[0] === "kittycord.utility-js.v1" && !declared.length
        && JSON.stringify([...manifest.permissions].sort()) === '["events","settings"]';
    if (!desktop && !utility && (manifest.permissions.length !== 1 || manifest.permissions[0] !== "styles" || !declared.length || declared.some(token => !tokens.includes(token))
        || JSON.stringify([...manifest.capabilities].sort()) !== JSON.stringify(["kittycord.isolated-js.v1", ...declared].sort()))
    ) throw new Error("Supported JavaScript APIs grant declared color tokens or local utility panels/settings/actions only. Network, native, filesystem, Discord APIs and general DOM access are unsupported.");
    const findings = inspectPluginSource(data.artifact, manifest.permissions).filter(finding => finding.blocked);
    if (findings.length) throw new Error(`Source needs changes: ${findings.map(finding => finding.message).join(" ")} Open the source in Studio to edit it.`);
    return { schemaVersion: 1, manifest, artifact: data.artifact };
}

export async function verifyExternalPackage(value: unknown): Promise<ExternalPackage> {
    const bundle = parseExternalPackage(value);
    if (bundle.manifest.entrypoints.desktop === "theme.json") return verifyThemePackage(bundle);
    await verifyPluginArtifact(new TextEncoder().encode(bundle.artifact), bundle.manifest.integrity.digest);
    return bundle;
}
