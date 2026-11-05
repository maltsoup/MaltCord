/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function parseVersion(value: string) {
    if (value.length > 128) throw new Error("Version is too long.");
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value);
    if (!match) throw new Error("Expected a semantic version.");
    const numbers = match.slice(1, 4).map(Number);
    const pre = match[4]?.split(".") ?? [];
    if (numbers.some(n => !Number.isSafeInteger(n)) || pre.some(p => /^0\d+$/.test(p)))
        throw new Error("Invalid version number.");
    return { numbers, pre };
}

export function compareVersions(left: string, right: string): number {
    const a = parseVersion(left);
    const b = parseVersion(right);
    for (let i = 0; i < 3; i++) {
        if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] < b.numbers[i] ? -1 : 1;
    }
    if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
        const x = a.pre[i];
        const y = b.pre[i];
        if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
        if (x === y) continue;
        const xn = /^\d+$/.test(x);
        const yn = /^\d+$/.test(y);
        if (xn && yn) return BigInt(x) < BigInt(y) ? -1 : 1;
        if (xn !== yn) return xn ? -1 : 1;
        return x < y ? -1 : 1;
    }
    return 0;
}

export interface VersionInterval {
    minVersion: string;
    maxVersionExclusive?: string;
}

export function versionInInterval(version: string, interval: VersionInterval) {
    return compareVersions(version, interval.minVersion) >= 0
        && (!interval.maxVersionExclusive || compareVersions(version, interval.maxVersionExclusive) < 0);
}
