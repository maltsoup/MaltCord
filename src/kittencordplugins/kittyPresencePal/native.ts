/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ChildProcess,spawn } from "child_process";
import { randomBytes } from "crypto";
import { app, type IpcMainInvokeEvent } from "electron";
import { copyFile, mkdir, rm } from "fs/promises";
import { dirname, join, resolve, sep } from "path";

// Discord detects games by scanning running processes for a known executable name.
// To show up as that game, an idle, hidden process is started from a file that has the
// game's executable name. The file is a copy of the harmless Windows ping tool, kept in
// this plugin's own folder inside Discord's data directory, and removed again on stop.

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._()+\-[\]'&!,]*$/;
const root = () => join(app.getPath("userData"), "KittyPresencePal");

let child: ChildProcess | null = null;
let dir: string | null = null;

function parseExecutable(value: unknown): string[] | null {
    if (typeof value !== "string" || value.length > 200) return null;
    const segments = value.replace(/^>/, "").replace(/\\/g, "/").split("/");
    if (segments.length > 6) return null;
    if (!segments.every(s => SEGMENT.test(s) && s !== "." && s !== "..")) return null;
    if (!/\.exe$/i.test(segments[segments.length - 1])) return null;
    return segments;
}

async function cleanup(target: string | null) {
    if (!target) return;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            await rm(target, { recursive: true, force: true });
            return;
        } catch {
            await new Promise(r => setTimeout(r, 300));
        }
    }
}

async function stop() {
    const running = child, folder = dir;
    child = null;
    dir = null;
    if (running && running.exitCode === null) {
        await new Promise<void>(done => {
            running.once("exit", () => done());
            running.kill();
            setTimeout(done, 2000);
        });
    }
    await cleanup(folder);
}

export async function startGame(_: IpcMainInvokeEvent, executable: unknown) {
    if (process.platform !== "win32") return { ok: false, error: "Real game detection is only available on Windows." };
    const segments = parseExecutable(executable);
    if (!segments) return { ok: false, error: "This game has no usable Windows executable name." };

    await stop();

    const folder = join(root(), randomBytes(8).toString("hex"));
    const target = resolve(folder, ...segments);
    if (!target.startsWith(folder + sep)) return { ok: false, error: "Executable path was rejected." };

    try {
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "PING.EXE"), target);
        const proc = spawn(target, ["-n", "2147483647", "127.0.0.1"], { stdio: "ignore", windowsHide: true });
        await new Promise<void>((done, fail) => { proc.once("spawn", () => done()); proc.once("error", fail); });
        proc.once("exit", () => { if (child === proc) { child = null; dir = null; void cleanup(folder); } });
        child = proc;
        dir = folder;
        return { ok: true };
    } catch (e) {
        await cleanup(folder);
        return { ok: false, error: `Could not start the game process: ${e instanceof Error ? e.message : String(e)}` };
    }
}

export async function stopGame() {
    await stop();
}

// Remove anything left behind by a previous run that was killed, then stop with Discord.
void cleanup(root());
app.once("before-quit", () => { void stop(); });
