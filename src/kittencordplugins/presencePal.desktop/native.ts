/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ChildProcess, execFile, spawn } from "child_process";
import { createHash } from "crypto";
import { app, type IpcMainInvokeEvent } from "electron";
import { access, copyFile, mkdir, rm, writeFile } from "fs/promises";
import { dirname, join, resolve, sep } from "path";

// Discord detects games by scanning for running programs with a known executable name.
// PresencePal makes Discord see a game by running a small stub program that has the game's
// executable name, in a folder that mirrors the game's real path. The stub is a tiny window
// titled with the game's name. It is compiled once from the source below with the C# compiler
// that ships with Windows, so no prebuilt program is bundled. It exits with Discord.

const RUNNER_SOURCE = `
using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

static class Runner {
    [STAThread]
    static void Main(string[] args) {
        string title = "Game";
        int parent = 0;
        bool minimized = false;
        for (int i = 0; i < args.Length; i++) {
            if (args[i] == "--title" && i + 1 < args.Length) title = args[++i];
            else if (args[i] == "--parent" && i + 1 < args.Length) int.TryParse(args[++i], out parent);
            else if (args[i] == "--minimized") minimized = true;
        }
        Application.EnableVisualStyles();
        Form form = new Form();
        form.Text = title;
        form.ClientSize = new Size(340, 90);
        form.StartPosition = FormStartPosition.CenterScreen;
        form.FormBorderStyle = FormBorderStyle.FixedSingle;
        form.MaximizeBox = false;
        form.ShowInTaskbar = true;
        if (minimized) form.WindowState = FormWindowState.Minimized;
        Label label = new Label();
        label.Dock = DockStyle.Fill;
        label.TextAlign = ContentAlignment.MiddleCenter;
        label.Text = "Showing as " + title + " on Discord." + Environment.NewLine + "Close this window to stop.";
        form.Controls.Add(label);
        if (parent > 0) {
            Timer timer = new Timer();
            timer.Interval = 3000;
            timer.Tick += delegate {
                try { Process.GetProcessById(parent); } catch (ArgumentException) { Application.Exit(); }
            };
            timer.Start();
        }
        Application.Run(form);
    }
}
`;

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._()+\-[\]'&!,]*$/;
const root = () => join(app.getPath("userData"), "PresencePal");
const runners = new Map<string, { proc: ChildProcess; dir: string; }>();
let building: Promise<string> | null = null;

function parseExecutable(value: unknown): string[] | null {
    if (typeof value !== "string" || value.length > 200) return null;
    const segments = value.replace(/^>/, "").replace(/\\/g, "/").split("/");
    if (segments.length > 8) return null;
    if (!segments.every(s => SEGMENT.test(s) && s !== "." && s !== "..")) return null;
    if (!/\.exe$/i.test(segments[segments.length - 1])) return null;
    return segments;
}

const validId = (id: unknown): id is string => typeof id === "string" && /^[\w:.-]{1,64}$/.test(id);
const folderId = (id: string) => id.replace(/[^\w.-]/g, "_");

function compile(csc: string, source: string, out: string) {
    return new Promise<void>((done, fail) => {
        execFile(csc, ["/nologo", "/target:winexe", "/optimize+", "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", `/out:${out}`, source],
            { windowsHide: true, timeout: 60_000 }, (error, stdout) => error ? fail(new Error(stdout || error.message)) : done());
    });
}

async function ensureRunner(): Promise<string> {
    const hash = createHash("sha256").update(RUNNER_SOURCE).digest("hex").slice(0, 12);
    const out = join(root(), `runner-${hash}.exe`);
    try {
        await access(out);
        return out;
    } catch { /* compile below */ }

    building ??= (async () => {
        const windir = process.env.WINDIR ?? "C:\\Windows";
        const source = join(root(), `runner-${hash}.cs`);
        await mkdir(root(), { recursive: true });
        await writeFile(source, RUNNER_SOURCE);
        let lastError: unknown;
        for (const framework of ["Framework64", "Framework"]) {
            try {
                await compile(join(windir, "Microsoft.NET", framework, "v4.0.30319", "csc.exe"), source, out);
                return out;
            } catch (e) { lastError = e; }
        }
        throw lastError;
    })().finally(() => { building = null; });
    return building;
}

async function stopOne(id: string) {
    const entry = runners.get(id);
    if (!entry) return;
    runners.delete(id);
    if (entry.proc.exitCode === null) {
        await new Promise<void>(done => {
            entry.proc.once("exit", () => done());
            entry.proc.kill();
            setTimeout(done, 2000);
        });
    }
    for (let attempt = 0; attempt < 5; attempt++) {
        try { await rm(entry.dir, { recursive: true, force: true }); return; } catch { await new Promise(r => setTimeout(r, 300)); }
    }
}

export async function startGame(_: IpcMainInvokeEvent, appId: unknown, executable: unknown, title: unknown, minimized: unknown) {
    if (process.platform !== "win32") return { ok: false as const, error: "PresencePal only works on Windows." };
    const id = appId;
    const segments = parseExecutable(executable);
    if (!validId(id) || !segments) return { ok: false as const, error: "This game has no usable Windows executable name." };
    const name = typeof title === "string" && title.trim() ? title.trim().slice(0, 100) : "Game";

    await stopOne(id);

    // <data>/games/<id>/<directory part of the executable path, or the name without .exe>/<executable>
    const exeName = segments[segments.length - 1];
    const folders = segments.length > 1 ? segments.slice(0, -1) : [exeName.replace(/\.exe$/i, "")];
    const gameDir = join(root(), "games", folderId(id));
    const target = resolve(gameDir, ...folders, exeName);
    if (!target.startsWith(gameDir + sep)) return { ok: false as const, error: "Executable path was rejected." };

    try {
        const runner = await ensureRunner();
        await mkdir(dirname(target), { recursive: true });
        await copyFile(runner, target);
        const args = ["--title", name, "--parent", String(process.pid), ...(minimized ? ["--minimized"] : [])];
        const proc = spawn(target, args, { cwd: dirname(target), stdio: "ignore", windowsHide: false });
        await new Promise<void>((done, fail) => { proc.once("spawn", () => done()); proc.once("error", fail); });
        proc.once("exit", () => { if (runners.get(id)?.proc === proc) void stopOne(id); });
        runners.set(id, { proc, dir: gameDir });
        return { ok: true as const };
    } catch (e) {
        await rm(gameDir, { recursive: true, force: true }).catch(() => { });
        return { ok: false as const, error: `Could not start the game: ${e instanceof Error ? e.message : String(e)}` };
    }
}

export async function stopGame(_: IpcMainInvokeEvent, appId: unknown) {
    if (validId(appId)) await stopOne(appId);
}

export async function stopAll() {
    await Promise.all([...runners.keys()].map(stopOne));
}

export function running() {
    return [...runners.keys()];
}

// Clear anything left by a run that was killed, then stop every game with Discord.
void rm(join(root(), "games"), { recursive: true, force: true }).catch(() => { });
app.once("before-quit", () => { void stopAll(); });
