/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { githubRepository, githubUsername, README_LIMIT } from "./presentation";

export interface PublicGithubProfile { username: string; profile: string; avatar: string; name: string; repository?: string; description?: string; }
async function receive(path: string, raw: boolean, fetcher: typeof fetch, signal?: AbortSignal) {
    const response = await fetcher(`https://api.github.com${path}`, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]), headers: { Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" } });
    if (!response.ok || !response.body) throw new Error(response.status === 403 || response.status === 429 ? "GitHub rate limit reached. Paste the public information manually or retry later." : "The public GitHub resource is unavailable.");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > (raw ? README_LIMIT : 65536)) throw new Error("The GitHub response exceeds its size limit."); chunks.push(chunk.value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
}
export async function fetchGithubProfile(username: string, repository?: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<PublicGithubProfile> {
    const login = githubUsername(username);
    const data: unknown = JSON.parse(await receive(`/users/${encodeURIComponent(login)}`, false, fetcher, signal));
    if (!data || typeof data !== "object" || !("login" in data) || typeof data.login !== "string" || data.login.toLowerCase() !== login.toLowerCase() || !("id" in data) || typeof data.id !== "number" || !Number.isSafeInteger(data.id) || data.id <= 0) throw new Error("GitHub returned an invalid public profile.");
    const result: PublicGithubProfile = { username: login, name: "name" in data && typeof data.name === "string" ? data.name.slice(0, 200) : login, profile: `https://github.com/${login}`, avatar: `https://avatars.githubusercontent.com/u/${data.id}?s=80` };
    if (repository) {
        const canonical = githubRepository(repository); const { pathname } = new URL(canonical);
        const repo: unknown = JSON.parse(await receive(`/repos${pathname}`, false, fetcher, signal));
        if (!repo || typeof repo !== "object" || !("html_url" in repo) || typeof repo.html_url !== "string" || githubRepository(repo.html_url).toLowerCase() !== canonical.toLowerCase()) throw new Error("GitHub repository information did not match the selected source.");
        result.repository = canonical; result.description = "description" in repo && typeof repo.description === "string" ? repo.description.slice(0, 500) : "";
    }
    return result;
}
export async function fetchGithubReadme(repository: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) { return receive(`/repos${new URL(githubRepository(repository)).pathname}/readme`, true, fetcher, signal); }
