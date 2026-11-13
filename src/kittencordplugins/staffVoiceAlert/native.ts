/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { IpcMainInvokeEvent } from "electron";

const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

// Downloads the alert sound in the main process, so Discord's content security policy
// (which blocks audio from most other sites) does not stop a custom link from working.
export async function fetchSound(_: IpcMainInvokeEvent, url: unknown) {
    let target: URL;
    try {
        target = new URL(String(url));
    } catch {
        return { ok: false as const, error: "That is not a valid link." };
    }
    if (target.protocol !== "https:") return { ok: false as const, error: "The sound link must start with https://." };

    try {
        const res = await fetch(target, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) return { ok: false as const, error: `The server answered ${res.status}.` };
        if (new URL(res.url).protocol !== "https:") return { ok: false as const, error: "The link redirected away from https." };

        const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        if (!type.startsWith("audio/") && type !== "application/ogg" && type !== "application/octet-stream")
            return { ok: false as const, error: "That link is not an audio file." };

        const declared = Number(res.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES) return { ok: false as const, error: "That sound is larger than 4 MB." };

        const buffer = new Uint8Array(await res.arrayBuffer());
        if (buffer.byteLength > MAX_BYTES) return { ok: false as const, error: "That sound is larger than 4 MB." };
        return { ok: true as const, data: buffer, type: type.startsWith("audio/") || type === "application/ogg" ? type : "audio/ogg" };
    } catch (e) {
        return { ok: false as const, error: `Could not download the sound: ${e instanceof Error ? e.message : String(e)}` };
    }
}
