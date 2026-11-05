/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { createProfileSession, parseProfileRecord, type ProfileRecord, type ProfileSetting } from "@shared/kittycord/profiles";

const definitions = new Map<string, ProfileSetting[]>();
export const KittycordProfiles = createProfileSession({
    read: key => DataStore.get<unknown>(key),
    async write(key, document, expectedRevision) {
        let saved: ProfileRecord = { current: document };
        await DataStore.update<unknown>(key, value => {
            const stored = parseProfileRecord(value, getProfileSettings());
            if (stored.current.revision !== expectedRevision) throw new Error("The profile changed in another window. Reload before saving.");
            saved = { current: document, previous: stored.current };
            return saved;
        });
        return saved;
    }
}, getProfileSettings);

export function getProfileSettings(): ProfileSetting[] {
    return [...definitions.values()].flat();
}

export function registerProfileSettings(pluginId: string, settings: Omit<ProfileSetting, "pluginId">[]) {
    definitions.set(pluginId, settings.map(setting => ({ ...setting, pluginId })));
}

const views = new WeakMap<object, object>();
export function profileSettingsView<T extends object>(pluginId: string, base: object): T {
    if (!definitions.get(pluginId)?.length) return base as T;
    const cached = views.get(base);
    if (cached) return cached as T;
    const proxy = new Proxy(base, { get(target, key, receiver) {
        if (typeof key === "string") {
            const value = KittycordProfiles.get(pluginId, key);
            if (value !== undefined) return value;
        }
        return Reflect.get(target, key, receiver);
    } });
    views.set(base, proxy);
    return proxy as T;
}
