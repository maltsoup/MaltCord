/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const kittycordBannerFormat = "[{kittycordChannel}] {kittycordIcon} {kittycordName} {kittycordVersion} ({kittycordHash})";

export function migrateBannerFormat(format: string) {
    if (format === "[{testcordBranch}] {testcordIcon} Testcord {testcordVersion} ({testcordHash})"
        || format === "[{equicordBranch}] {equicordIcon} Equicord {equicordVersion} ({equicordHash})"
        || /^\[release\]\s+Testcord 2\.3\.0 \(af92dbaec\)$/.test(format)) return kittycordBannerFormat;
    return format;
}
