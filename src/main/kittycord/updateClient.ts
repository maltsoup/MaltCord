/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type { UpdateOffer } from "@shared/kittycord/updates";
import { compareVersions } from "@shared/kittycord/versions";

import { type ReleaseChannel, verifyArtifact, verifySignedRelease } from "./releases";

export function createUpdateClient(options: { root: string; baseUrl: string; trustRoots: Readonly<Record<string, string>>; channel: ReleaseChannel; version: string; apiVersion: string; fetcher?: typeof fetch; launch(path: string): Promise<void>; }) {
    if (!isAbsolute(options.root)) throw new Error("Update storage must be an absolute path.");
    const endpoint = new URL(options.baseUrl);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith("/") || !Object.keys(options.trustRoots).length) throw new Error("Configure an HTTPS channel directory and pinned release keys.");
    let candidate: ReturnType<typeof verifySignedRelease> | undefined;
    let staged: string | undefined;
    let busy = false;
    let progress: { received: number; total: number; } | undefined;
    const context = { platform: "win32" as const, target: "windows-installer" as const, channel: options.channel, apiVersion: options.apiVersion };
    async function receive(name: string, limit: number, sha256?: string) {
        let url = new URL(name, endpoint);
        if (sha256) url.searchParams.set("sha256", sha256);
        const signal = AbortSignal.timeout(120000);
        let response: Response | undefined;
        for (let redirects = 0; redirects <= 3; redirects++) {
            response = await (options.fetcher ?? fetch)(url, { redirect: "manual", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal });
            if (![301, 302, 303, 307, 308].includes(response.status)) break;
            const location = response.headers.get("location");
            await response.body?.cancel();
            if (!location || redirects === 3) throw new Error("Update redirect chain exceeds its supported limit.");
            const next = new URL(location, url);
            const githubAsset = endpoint.hostname === "github.com" && ["https://release-assets.githubusercontent.com", "https://objects.githubusercontent.com"].includes(next.origin);
            if (next.protocol !== "https:" || next.username || next.password || next.origin !== endpoint.origin && !githubAsset) throw new Error("Update download redirected to an unapproved origin.");
            url = next;
        }
        if (!response?.ok || !response.body) { await response?.body?.cancel(); throw new Error("The release channel could not be reached."); }
        let size = 0; const chunks: Uint8Array[] = []; const reader = response.body.getReader();
        if (sha256) progress = { received: 0, total: limit };
        try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > limit) throw new Error("Release download exceeds its declared limit."); chunks.push(chunk.value); if (sha256) progress = { received: size, total: limit }; } }
        finally { await reader.cancel(); reader.releaseLock(); }
        return Buffer.concat(chunks);
    }
    async function operation<T>(action: () => Promise<T>) { if (busy) throw new Error("An update operation is already running."); busy = true; try { return await action(); } finally { busy = false; } }
    const offer = (): UpdateOffer | null => candidate ? { version: candidate.release.version, notes: candidate.release.notes, issuedAt: candidate.release.issuedAt, sha256: candidate.artifact.sha256, size: candidate.artifact.size, staged: !!staged } : null;
    return {
        offer,
        progress: () => progress,
        check() {
            return operation(async () => {
                progress = undefined;
                const envelope = JSON.parse((await receive("release.json", 131072)).toString("utf8"));
                const verified = verifySignedRelease(envelope, options.trustRoots, context);
                if (compareVersions(verified.release.version, options.version) <= 0) { candidate = undefined; staged = undefined; return null; }
                if (candidate?.artifact.sha256 !== verified.artifact.sha256) staged = undefined;
                candidate = verified; return offer();
            });
        },
        stage() {
            return operation(async () => {
                if (!candidate) throw new Error("Check for a newer signed release first.");
                const verified = verifySignedRelease(candidate.envelope, options.trustRoots, context);
                const bytes = await receive(verified.artifact.filename, verified.artifact.size, verified.artifact.sha256); verifyArtifact(bytes, verified.artifact);
                await mkdir(options.root, { recursive: true });
                if ((await lstat(options.root)).isSymbolicLink()) throw new Error("Update storage cannot redirect through a symbolic link.");
                const filename = join(options.root, `Kittencord-${verified.artifact.sha256}-${randomUUID()}.exe`);
                await writeFile(filename, bytes, { flag: "wx", mode: 0o600 }); staged = filename;
                return offer();
            });
        },
        apply() {
            return operation(async () => {
                if (!candidate || !staged) throw new Error("Download and verify the offered release first.");
                const verified = verifySignedRelease(candidate.envelope, options.trustRoots, context);
                const info = await lstat(staged); if (!info.isFile() || info.isSymbolicLink() || info.size !== verified.artifact.size) throw new Error("Staged installer changed. Download it again.");
                verifyArtifact(await readFile(staged), verified.artifact);
                await options.launch(staged);
                return { launched: true };
            });
        }
    };
}
