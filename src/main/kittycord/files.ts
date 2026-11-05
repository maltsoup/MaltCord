/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";

export function readBoundedJson(file: string, maxBytes = 1024 * 1024): unknown {
    if (statSync(file).size > maxBytes) throw new Error("Local metadata exceeds the size limit.");
    const bytes = readFileSync(file);
    if (bytes.length > maxBytes) throw new Error("Local metadata exceeds the size limit.");
    try { return JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Local metadata is not valid JSON."); }
}

export function atomicWriteJson(file: string, value: unknown) {
    const data = JSON.stringify(value, null, 4) + "\n";
    const temporary = `${file}.pending-${randomUUID()}`;
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
        writeFileSync(descriptor, data, "utf8");
        fsyncSync(descriptor);
    } finally {
        closeSync(descriptor);
    }
    renameSync(temporary, file);
}
