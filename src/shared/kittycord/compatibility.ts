/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ConflictPlugin } from "./conflicts";
import { type ExternalPackage } from "./javascriptPackage";
import { type PluginPlatform } from "./manifest";
import { reviewPluginManifest } from "./safeInstall";
import { compareVersions } from "./versions";

export function packageCompatibility(bundle: ExternalPackage, installed: readonly ConflictPlugin[], platform: PluginPlatform, apiVersion: string, blockedDigests: ReadonlySet<string> = new Set()) {
    const { manifest } = bundle;
    const matching = installed.filter(item => item.id.toLowerCase() === manifest.id.toLowerCase());
    const existing = matching.length === 1 ? matching[0] : undefined;
    const review = reviewPluginManifest(manifest, existing ? installed.filter(item => item !== existing) : installed, platform, apiVersion, blockedDigests);
    const action = !existing ? "Install" : existing.version && compareVersions(manifest.version, existing.version) > 0 ? "Update" : "Already installed";
    const older = existing?.version && compareVersions(manifest.version, existing.version) < 0;
    const browser = ["chrome", "edge", "firefox"].includes(platform);
    const blocked = blockedDigests.has(manifest.integrity.digest) || manifest.loadingMode === "quarantined";
    const classification = blocked ? "Unsafe or blocked" : browser || older || manifest.discordBuild || review.findings.some(finding => finding.classification === "Confirmed conflict") ? "Unsupported"
        : manifest.loadingMode !== "runtime" || manifest.requiredPatches.length ? "Requires rebuild or restart" : "Native";
    return { classification, action, findings: review.findings, reasons: [...review.reasons, ...(older ? ["A newer package is installed. Use the reviewed backup workflow for rollback."] : []),
        ...(manifest.discordBuild ? ["This package declares a Discord build constraint that this static report cannot verify."] : [])], platform,
        loading: browser ? "Reviewed extension rebuild required. External installation is unavailable." : classification === "Requires rebuild or restart" ? "Use a reviewed source build and restart." : "Restricted desktop runtime. New packages install disabled; activation requires consent.",
        permissions: [...manifest.permissions], publisherVerified: false as const, canActivate: false as const,
        scope: "Package declarations and installed external dependencies only. No general Discord API adapter or runtime safety certification." };
}
