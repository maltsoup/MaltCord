/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface CapsuleReminder { id: string; messageId: string; channelId: string; title: string; at: number; notified: boolean; }
export function capsuleReminders(value: unknown): CapsuleReminder[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 500) throw Error("Reminder storage is invalid. Existing data was kept.");
    const ids = new Set<string>();
    return value.map(item => {
        if (!item || typeof item !== "object" || typeof item.id !== "string" || !/^[a-z0-9-]{1,100}$/i.test(item.id) || ids.has(item.id) || typeof item.messageId !== "string" || !/^\d{17,20}$/.test(item.messageId) || typeof item.channelId !== "string" || !/^\d{17,20}$/.test(item.channelId) || typeof item.title !== "string" || item.title.length > 200 || !Number.isSafeInteger(item.at) || item.at < 0 || typeof item.notified !== "boolean") throw Error("Reminder storage is invalid. Existing data was kept.");
        ids.add(item.id); return { id: item.id, messageId: item.messageId, channelId: item.channelId, title: item.title, at: item.at, notified: item.notified };
    });
}
export function createTimeCapsule(dependencies: { read(account: string): Promise<unknown>; write(account: string, reminders: CapsuleReminder[]): Promise<void>; notify(reminder: CapsuleReminder): Promise<void>; now?: () => number; }) {
    const now = dependencies.now ?? Date.now, listeners = new Set<() => void>();
    let account = "", revision = 0, items: CapsuleReminder[] = [], queue = Promise.resolve();
    const publish = () => listeners.forEach(listener => listener());
    function enqueue(action: (id: string, generation: number) => Promise<void>) { const id = account, generation = revision; const next = queue.then(async () => { if (!id || id !== account || generation !== revision) throw Error("Connect the current Discord account first."); await action(id, generation); }); queue = next.catch(() => {}); return next; }
    async function save(id: string, generation: number, next: CapsuleReminder[]) { await dependencies.write(id, next); if (generation === revision && id === account) { items = next; publish(); } }
    return {
        snapshot: () => items,
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        async connect(id: string) { const generation = ++revision; account = ""; items = []; publish(); if (!/^\d{17,20}$/.test(id)) return; const next = capsuleReminders(await dependencies.read(id)); if (generation === revision) { account = id; items = next; publish(); } },
        disconnect() { revision++; account = ""; items = []; publish(); },
        put(reminder: CapsuleReminder) { return enqueue(async (id, generation) => { if (!Number.isSafeInteger(reminder.at) || reminder.at <= now()) throw Error("Choose a valid reminder time in the future."); capsuleReminders([reminder]); const next = [...items.filter(item => item.id !== reminder.id), { ...reminder, notified: false }]; if (next.length > 500) throw Error("You can keep up to 500 reminders."); await save(id, generation, next); }); },
        remove(reminderId: string) { return enqueue(async (id, generation) => { await save(id, generation, items.filter(item => item.id !== reminderId)); }); },
        snooze(reminderId: string, minutes = 10) { return enqueue(async (id, generation) => { if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw Error("Choose a snooze time between one minute and one day."); await save(id, generation, items.map(item => item.id === reminderId ? { ...item, at: now() + minutes * 60000, notified: false } : item)); }); },
        tick() { return enqueue(async (id, generation) => { for (const reminder of items.filter(item => item.at <= now() && !item.notified)) { if (generation !== revision || id !== account) return; await dependencies.notify({ ...reminder }); if (generation !== revision || id !== account) return; await save(id, generation, items.map(item => item.id === reminder.id ? { ...item, notified: true } : item)); } }); }
    };
}
