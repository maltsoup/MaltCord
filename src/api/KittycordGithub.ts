/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchGithubProfile, fetchGithubReadme } from "@shared/kittycord/githubPublic";

export async function loadPublicProfile(username: string, repository?: string, signal?: AbortSignal) {
    if (IS_WEB || !VencordNative.github) return fetchGithubProfile(username, repository, fetch, signal);
    const result = await VencordNative.github.request("profile", username, repository);
    if (result.error || !result.profile) throw new Error(result.error ?? "Public profile unavailable.");
    return result.profile;
}
export async function loadPublicReadme(repository: string, signal?: AbortSignal) {
    if (IS_WEB || !VencordNative.github) return fetchGithubReadme(repository, fetch, signal);
    const result = await VencordNative.github.request("readme", undefined, repository);
    if (result.error || result.readme === undefined) throw new Error(result.error ?? "Public README unavailable.");
    return result.readme;
}
