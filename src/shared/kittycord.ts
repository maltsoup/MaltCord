/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const Kittycord = {
    name: "MaltCord",
    id: "kittencord",
    channel: "beta",
    communityUrl: "https://discord.gg/XfyH3Qcwgp",
    maintainer: { name: "xtufa7", url: "https://github.com/xtufa7" },
    apiVersion: "1.1.0",
    profileSchema: 1,
    manifestSchema: 1,
    catalogSchema: 1,
    artifactSchema: 1,
    upstream: "https://github.com/TestcordDev/TestCord",
    upstreamCommit: "af92dbaec665c7e7106c3503cfb6691248d03623",
    webSettingsKey: "KittycordSettings",
    webPresetsKey: "KittycordPresets",
    databasePrefix: "Kittycord:"
} as const;

export function kittycordDatabaseName(name: string) {
    return name.startsWith(Kittycord.databasePrefix) ? name : Kittycord.databasePrefix + name;
}
