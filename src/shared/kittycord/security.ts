/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginManifest } from "./manifest";

export interface SecurityIndicator { code: string; severity: "review" | "blocked"; line: number; message: string; }
export interface SecurityReport {
    engine: "KittenCord Security Engine";
    policyVersion: 1;
    analyzedAt: number;
    status: "Passed Scan" | "Needs Review" | "Blocked";
    indicators: SecurityIndicator[];
    limitations: string;
}

export const permissionDescriptions = {
    discord: { label: "Read Discord data", risk: "High", description: "Read users, servers, channels, members and messages already available to your account. Authentication data is not exposed by this API." },
    interface: { label: "Discord buttons", risk: "Moderate", description: "Add removable buttons to the channel header, message composer or user area." },
    scripts: { label: "Pinned JavaScript libraries", risk: "High", description: "Load JavaScript from declared HTTPS origins after verifying its SHA-256 digest. Scripts run in the plugin worker." },
    settings: { label: "Plugin settings", risk: "Low", description: "Read and update this utility's own reviewed settings." },
    events: { label: "Utility actions", risk: "Low", description: "Receive explicit local panel actions and owned timers. No Discord event stream." },
    styles: { label: "Appearance", risk: "Moderate", description: "Change declared colors, or apply removable CSS for Desktop plugins. Styling can affect readability and layout." },
    storage: { label: "Plugin storage", risk: "Moderate", description: "Not granted by the current external runtime." },
    network: { label: "HTTPS downloads", risk: "High", description: "Download resources from this Desktop plugin's declared public HTTPS origins, without Discord cookies or credentials." },
    filesystem: { label: "Filesystem", risk: "High", description: "Not granted to external packages." },
    native: { label: "Native integration", risk: "High", description: "Not granted to external packages." },
    process: { label: "Native processes", risk: "High", description: "Not granted to external packages." }
} as const;

export function packageChanges(before: PluginManifest | undefined, after: PluginManifest) {
    return {
        files: [after.entrypoints.desktop ?? after.entrypoints.browser ?? "manifest.json", "manifest.json"],
        permissionsAdded: after.permissions.filter(permission => !before?.permissions.includes(permission)),
        permissionsRemoved: before?.permissions.filter(permission => !after.permissions.includes(permission)) ?? [],
        dependenciesChanged: before ? JSON.stringify(before.dependencies) !== JSON.stringify(after.dependencies) : after.dependencies.length > 0,
        sourceChanged: before ? before.integrity.digest !== after.integrity.digest : true,
        publisherVerified: false as const
    };
}
