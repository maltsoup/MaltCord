/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { fetchGithubProfile, fetchGithubReadme } from "@shared/kittycord/githubPublic";
import { githubRepository, githubUsername } from "@shared/kittycord/presentation";
import { ipcMain } from "electron";

const active = new Set<number>();
ipcMain.handle(IpcEvents.KITTYCORD_GITHUB_PUBLIC, async (event, action: unknown, username: unknown, repository: unknown) => {
    try {
        if (event.senderFrame !== event.sender.mainFrame || !["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com"].includes(new URL(event.sender.getURL()).origin)) throw new Error("Untrusted frame.");
        if (active.has(event.sender.id) || active.size >= 2) throw new Error("Public profile request already active.");
        const repo = repository === undefined ? undefined : githubRepository(repository);
        const login = action === "profile" ? githubUsername(username) : undefined;
        if (action !== "profile" && action !== "readme" || action === "readme" && !repo) throw new Error("Unsupported GitHub request.");
        active.add(event.sender.id);
        try { return action === "profile" && login ? { profile: await fetchGithubProfile(login, repo) } : { readme: await fetchGithubReadme(repo ?? "") }; }
        finally { active.delete(event.sender.id); }
    } catch { return { error: "The public GitHub request was unavailable, rate limited or invalid. Your source was retained." }; }
});
