/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { setStartupCloudState } from "@api/KittycordStartupProgress";
import config from "@shared/kittycord/cloudConfig.json";
import { CLOUD_NOTIFICATION_CATEGORIES, type CloudClientCommand, type CloudFeed, localNotificationFeed, type LocalNotificationState,localNotificationState } from "@shared/kittycord/cloudNotifications";
import { cloudOrigin } from "@shared/kittycord/cloudOrigin";
import { useEffect, UserStore, useState } from "@webpack/common";

let feed: CloudFeed = { items: [], next: null, authenticated: false, categories: [...CLOUD_NOTIFICATION_CATEGORIES] };
let error = "", pending: Promise<void> | undefined, generation=0;
let local = localNotificationState(), localAccount = "";
let source = feed;
let mutation: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());
const account = () => UserStore.getCurrentUser()?.id ?? "";
const stateKey = (id: string) => `kittencord.notifications.v1:${id}`;
async function loadLocal() {
    const id = account();
    if (id === localAccount) return;
    const stored = await DataStore.get(stateKey(id));
    if (id !== account()) throw new Error("The account changed. Try again.");
    local = localNotificationState(stored); localAccount = id;
}
function synchronize(revision: number) {
    const id = account();
    const job = mutation.catch(() => undefined).then(async () => {
        if (!source.authenticated || revision !== generation || id !== account() || !source.items.length) return;
        const current = source, state = local;
        const ids = (predicate: (item: CloudFeed["items"][number]) => boolean) => current.items.filter(predicate).map(item => item.id);
        for (const [action, selected] of [
            ["read", ids(item => !item.read && (state.read.includes(item.id) || item.id <= state.readThrough) && !state.unread.includes(item.id))],
            ["unread", ids(item => item.read && state.unread.includes(item.id))],
            ["delete", ids(item => item.id <= state.clearThrough || state.removed.includes(item.id))]
        ] as const) for (let offset = 0; offset < selected.length; offset += 100) {
            if (revision !== generation || id !== account()) return;
            await KittycordCloudNotifications.command(action, { ids: selected.slice(offset, offset + 100) });
        }
        if (revision !== generation || id !== account()) return;
        const loaded = new Set(current.items.map(item => item.id)), oldest = Math.min(...loaded) - 1;
        const next = { read: state.read.filter(id => !loaded.has(id)), unread: state.unread.filter(id => !loaded.has(id)), removed: state.removed.filter(id => !loaded.has(id)), readThrough: Math.min(state.readThrough, oldest), clearThrough: Math.min(state.clearThrough, oldest) };
        await DataStore.set(stateKey(id), next);
        if (revision !== generation || id !== account()) return;
        source = localNotificationFeed(current, state); local = next;
    });
    mutation = job;
    return job;
}
function localAction(change: (state: LocalNotificationState) => LocalNotificationState, remote?: () => Promise<unknown>) {
    const id = account();
    const job = mutation.catch(() => undefined).then(async () => {
        await loadLocal();
        if (id !== account()) throw new Error("The account changed. Try again.");
        generation++; pending = undefined;
        const next = localNotificationState(change(local));
        await DataStore.set(stateKey(id), next);
        if (id !== account()) return;
        local = next; feed = localNotificationFeed(source, local); changed();
        if (source.authenticated && remote) await remote();
    });
    mutation = job;
    return job.then(() => KittycordCloudNotifications.refresh());
}

export const KittycordCloudNotifications = {
    enabled: !!cloudOrigin(config),
    supported: !IS_WEB,
    async command(action: CloudClientCommand, input?: unknown) {
        if (IS_WEB) throw new Error("Connect your account from the desktop client. Browser extensions use their supported update flow.");
        const result = await VencordNative.cloud.command(action, { accountId:UserStore.getCurrentUser()?.id??null,payload:input });
        if (result.error) throw new Error(result.error);
        return result;
    },
    refresh(before?: number): Promise<void> {
        if (pending) return pending;
        setStartupCloudState("connecting");
        const requestGeneration=generation;
        pending = Promise.resolve().then(async () => {
            await loadLocal();
            const result = await this.command("feed", before ? { before } : undefined);
            if (!result.feed) throw new Error("The service returned no notification feed.");
            if(requestGeneration!==generation)return;
            source = before ? { ...result.feed, items: [...source.items, ...result.feed.items.filter(item => !source.items.some(previous => previous.id === item.id))] } : result.feed;
            await synchronize(requestGeneration);
            if(requestGeneration!==generation)return;
            feed = localNotificationFeed(source, local);
            error = "";
            setStartupCloudState("online");
        }).catch(reason => { if(requestGeneration!==generation)return;setStartupCloudState("offline");error = reason instanceof Error ? reason.message : "Notifications could not be loaded."; }).finally(() => { if(requestGeneration===generation){ pending = undefined; changed(); } });
        return pending;
    },
    mark(ids?: number[]) { const selected = ids ?? feed.items.map(item => item.id); return localAction(state => ({ ...state, read: [...state.read, ...selected], unread: state.unread.filter(id => !selected.includes(id)), readThrough: ids ? state.readThrough : Math.max(state.readThrough, ...selected, 0) }), () => this.command("read", ids ? { ids } : { all: true })); },
    unread(ids:number[]) { return localAction(state => ({ ...state, unread: [...state.unread, ...ids], read: state.read.filter(id => !ids.includes(id)) }), () => this.command("unread", { ids })); },
    remove(ids:number[]) { return localAction(state => ({ ...state, removed: [...state.removed, ...ids] }), () => this.command("delete", { ids })); },
    clearRead() { const ids = feed.items.filter(item => item.read).map(item => item.id); return localAction(state => ({ ...state, removed: [...state.removed, ...ids] }), () => this.command("clear", { mode: "read" })); },
    clearAll() { const ids = feed.items.map(item => item.id); return localAction(state => ({ ...state, clearThrough: Math.max(state.clearThrough, ...ids, 0) }), () => this.command("clear", { mode: "all", confirm: true })); },
    async preferences(categories: string[]) { await this.command("preferences", { categories }); await this.refresh(); },
    clear() { generation++;pending=undefined;setStartupCloudState("idle");feed = { items: [], next: null, authenticated: false, categories: [...CLOUD_NOTIFICATION_CATEGORIES] }; source = feed; local = localNotificationState(); localAccount = ""; error = ""; changed(); }
};

export function useCloudNotifications() {
    const [, update] = useState(0);
    useEffect(() => { const listener = () => update(value => value + 1); listeners.add(listener); return () => { listeners.delete(listener); }; }, []);
    return { feed, error };
}
