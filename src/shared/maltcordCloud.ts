/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * MaltCord's own Supabase project. The publishable key is meant to be public: it only allows what the
 * database's row level security rules allow, which is reading badges and published announcements.
 * Never put the secret (service_role) key in this file.
 */
export const MaltcordCloud = {
    url: "https://krxdvvbxbflznjvietzz.supabase.co",
    publishableKey: "sb_publishable_qQYsFbhKejCzZLemr2ZAjw_-YkNDXTP",
    host: "krxdvvbxbflznjvietzz.supabase.co"
} as const;

export const ANNOUNCEMENTS_FEED = `${MaltcordCloud.url}/rest/v1/announcements?select=id,title,body,url,created_at&published=eq.true&order=created_at.desc&limit=50`;
export const BADGES_FEED = `${MaltcordCloud.url}/rest/v1/badges?select=id,user_id,tooltip,icon&limit=1000`;

/** Reads JSON from a link, sending the project key when the link points at MaltCord's Supabase. */
export async function fetchMaltcordJson(link: string): Promise<unknown> {
    const url = new URL(link);
    if (url.protocol !== "https:") throw new Error("Only https links are allowed.");
    const headers: Record<string, string> = url.hostname === MaltcordCloud.host ? { apikey: MaltcordCloud.publishableKey } : {};
    const res = await fetch(url, { cache: "no-cache", headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}
