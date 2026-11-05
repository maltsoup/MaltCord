/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseVersion } from "./versions";

export function checkedObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object.`);
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.some(key => ["__proto__", "prototype", "constructor"].includes(key))) throw new Error(`${label} contains a reserved object key.`);
    const unsupported = keys.filter(key => !fields.includes(key));
    if (unsupported.length) throw new Error(`${label} has unsupported fields: ${unsupported.slice(0, 5).map(key => key.slice(0, 60)).join(", ")}. Check the selected file format.`);
    return record;
}

export function checkedText(value: unknown, label: string, max = 200): string {
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
        throw new Error(`${label} must be a nonempty bounded string.`);
    return value;
}

export function checkedHttps(value: unknown, label: string): string {
    const text = checkedText(value, label, 2048);
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
        throw new Error(`${label} must be an HTTPS URL without credentials, query or fragment.`);
    return text;
}

export function checkedVersion(value: unknown, label: string) {
    const version = checkedText(value, label, 128);
    parseVersion(version);
    return version;
}
