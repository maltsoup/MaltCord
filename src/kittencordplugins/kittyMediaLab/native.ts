/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import type { IpcMainInvokeEvent } from "electron";

let busy = false;
function execute(args: string[], timeout: number) {
    return new Promise<void>((done, reject) => {
        const child = spawn("ffmpeg", args, { windowsHide: true, stdio: "ignore", shell: false });
        const timer = setTimeout(() => { child.kill(); reject(new Error("Video processing timed out.")); }, timeout);
        child.once("error", () => { clearTimeout(timer); reject(new Error("FFmpeg is unavailable.")); });
        child.once("exit", code => { clearTimeout(timer); if (code === 0) done(); else reject(new Error("FFmpeg could not process this video.")); });
    });
}
export async function capabilities() {
    try { await execute(["-version"], 3000); return { video: true }; }
    catch { return { video: false }; }
}
export async function processVideo(_event: IpcMainInvokeEvent, input: unknown) {
    if (busy) return { success: false as const, error: "Wait for the current video to finish." };
    if (!input || typeof input !== "object") return { success: false as const, error: "Choose a video and a valid trim range." };
    const bytes = Reflect.get(input, "bytes"), start = Reflect.get(input, "start"), duration = Reflect.get(input, "duration");
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 67_108_864 || typeof start !== "number" || !Number.isFinite(start) || start < 0 || start > 86400 || typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0 || duration > 600) return { success: false as const, error: "Choose a video up to 64 MiB and a trim range up to ten minutes." };
    if (!(bytes[4] === 102 && bytes[5] === 116 && bytes[6] === 121 && bytes[7] === 112) && ![26, 69, 223, 163].every((value, index) => bytes[index] === value)) return { success: false as const, error: "Choose an MP4 or WebM video." };
    const root = resolve(DATA_DIR, "kitty-media-lab"); let temporary: string | undefined;
    busy = true;
    try {
        await mkdir(root, { recursive: true }); temporary = await mkdtemp(join(root, "video-"));
        const source = join(temporary, "input.video"), output = join(temporary, "output.mp4");
        await writeFile(source, bytes);
        await execute(["-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", source, "-ss", String(start), "-t", String(duration), "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=w=min(1280\\,iw):h=min(1280\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-c:a", "aac", "-b:a", "128k", "-map_metadata", "-1", "-movflags", "+faststart", "-fs", "67108864", output], 120000);
        if ((await stat(output)).size > 67_108_864) throw new Error("Output exceeds 64 MiB.");
        return { success: true as const, bytes: new Uint8Array(await readFile(output)) };
    } catch { return { success: false as const, error: "Video processing failed. Check the file, trim range and local FFmpeg installation." }; }
    finally { busy = false; if (temporary && resolve(temporary).startsWith(root + sep)) await rm(temporary, { recursive: true, force: true }); }
}
