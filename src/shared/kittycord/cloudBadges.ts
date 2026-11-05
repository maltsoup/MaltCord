/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type BadgeDisplay, badgeDisplay, defaultBadgeDisplay } from "./badgeDisplay";
import { publicImageUrl } from "./imageSources";

export interface CloudBadge { id: string; label: string; description: string; icon: string; color: string; position: number; }
const empty: readonly CloudBadge[] = [];

export function parseCloudBadges(value: unknown, userId: string, origin: string): CloudBadge[] {
    if (!value || typeof value !== "object" || !("userId" in value) || value.userId !== userId || !("badges" in value) || !Array.isArray(value.badges) || value.badges.length > 100) throw new Error("The badge service returned an invalid response.");
    const result = value.badges.map((badge: unknown) => {
        if (!badge || typeof badge !== "object" || !("id" in badge) || typeof badge.id !== "string" || !/^[a-z][a-z0-9-]{0,59}$/.test(badge.id) || !("label" in badge) || typeof badge.label !== "string" || badge.label.length > 80 || !("description" in badge) || typeof badge.description !== "string" || badge.description.length > 300 || !("icon" in badge) || typeof badge.icon !== "string" || !("color" in badge) || typeof badge.color !== "string" || !/^#[a-f0-9]{6}$/i.test(badge.color) || !("position" in badge) || typeof badge.position !== "number" || !Number.isSafeInteger(badge.position) || badge.position < 0 || badge.position > 10000) throw new Error("The badge service returned invalid badge metadata.");
        const icon = new URL(badge.icon);
        if (icon.origin !== origin) publicImageUrl(icon.href);
        else if (icon.username || icon.password || icon.search || icon.hash || !/^\/api\/v1\/badges\/icons\/(?:builtin\/(?:opal|user|founder)|asset\/[a-f0-9]{64})$/.test(icon.pathname)) throw new Error("The badge service returned an unapproved icon.");
        return { id: badge.id, label: badge.label, description: badge.description, icon: icon.href, color: badge.color, position: badge.position };
    });
    if (new Set(result.map(badge => badge.id)).size !== result.length) throw new Error("The badge service returned duplicate assignments.");
    return result;
}

export function createCloudBadgeCache(options: { enabled: boolean; origin: string; fetcher?: typeof fetch; now?: () => number; }) {
    const now = options.now ?? Date.now;
    let origin = "";
    if (options.enabled) { const parsed = new URL(options.origin); if (parsed.origin !== options.origin || parsed.protocol !== "https:") throw new Error("Configure the official HTTPS badge service."); origin = parsed.origin; }
    const entries = new Map<string, { badges: readonly CloudBadge[]; expires: number; verifiedAt: number; offline: boolean; display: BadgeDisplay; assigned: readonly CloudBadge[]; }>();
    const pending = new Map<string, Promise<void>>(), listeners = new Map<string, Set<() => void>>();
    function peek(id: string) { return entries.get(id)?.badges ?? empty; }
    let generation=0;
    function publish(id: string, badges: readonly CloudBadge[], lifetime: number, offline=false, display=defaultBadgeDisplay(), assigned=badges) {
        const verifiedAt=offline?entries.get(id)?.verifiedAt??0:now();
        entries.delete(id); entries.set(id, { badges, expires: now() + lifetime, verifiedAt, offline, display, assigned });
        if (entries.size > 250) { const oldest = entries.keys().next().value; if (oldest) entries.delete(oldest); }
        listeners.get(id)?.forEach(listener => listener());
    }
    return {
        enabled: options.enabled,
        peek,
        display(id:string){ return entries.get(id)?.display ?? defaultBadgeDisplay(); },
        assigned(id:string){ return entries.get(id)?.assigned ?? empty; },
        state(id:string){ return entries.get(id)?.offline ? "offline" : (entries.get(id)?.expires??0)>now() ? "verified" : "unavailable"; },
        subscribe(id: string, listener: () => void) { const subscriptions = listeners.get(id) ?? new Set(); subscriptions.add(listener); listeners.set(id, subscriptions); return () => { subscriptions.delete(listener); if (!subscriptions.size) listeners.delete(id); }; },
        async load(id: string, force = false): Promise<void> {
            if (!options.enabled || !/^\d{17,20}$/.test(id)) return;
            if (pending.has(id)) return pending.get(id);
            if (!force && (entries.get(id)?.expires ?? 0) > now()) return;
            const revision=generation;
            const job = Promise.resolve().then(async () => {
                try {
                    const response = await (options.fetcher ?? fetch)(`${origin}/api/v1/badges/users/${id}`, { credentials: "omit", redirect: "manual", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(5000) });
                    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error("The badge service is unavailable."); }
                    const reader = response.body.getReader(); let bytes = 0; let source = ""; const decoder = new TextDecoder();
                    try { while (true) { const item = await reader.read(); if (item.done) break; bytes += item.value.length; if (bytes > 65536) throw new Error("Badge response exceeds its limit."); source += decoder.decode(item.value, { stream: true }); } source += decoder.decode(); }
                    finally { await reader.cancel(); reader.releaseLock(); }
                    if(revision!==generation)return;
                    const value=JSON.parse(source);
                    publish(id, parseCloudBadges(value, id, origin), 60000, false, value.display?badgeDisplay(value.display):defaultBadgeDisplay(), value.assigned?parseCloudBadges({ ...value,badges:value.assigned },id,origin):undefined);
                } catch { if(revision!==generation)return;const previous=entries.get(id);publish(id,previous&&now()-previous.verifiedAt<3600000?previous.badges:empty,10000,true,previous?.display,previous?.assigned); }
                finally { if(revision===generation)pending.delete(id); }
            });
            pending.set(id, job); await job;
        },
        clear() { generation++;pending.clear(); for (const id of entries.keys()) { entries.delete(id); listeners.get(id)?.forEach(listener => listener()); } }
    };
}
