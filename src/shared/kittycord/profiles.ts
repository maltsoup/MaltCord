/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ProfileValue = boolean | number | string;
export type ProfileValues = Record<string, Record<string, ProfileValue>>;
export interface ProfileRule { scope: "account" | "server" | "channel"; target: string; values: ProfileValues; }
export interface ProfileDocument { schemaVersion: 1; revision: number; rules: ProfileRule[]; }
export interface ProfileRecord { current: ProfileDocument; previous?: ProfileDocument; }
export interface ProfileContext { accountId?: string; serverId?: string; channelId?: string; }
export interface ProfileSetting { pluginId: string; key: string; label: string; type: "boolean" | "number"; }
export interface ResolvedProfile { values: ProfileValues; sources: Record<string, Record<string, ProfileRule["scope"]>>; }

const identifier = /^[A-Za-z0-9_-][A-Za-z0-9 _-]{0,99}$/;
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const snowflake = /^\d{1,22}$/;

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a profile object.");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(key => forbidden.has(key))) throw new Error("Unsupported profile field.");
    return record;
}

export function emptyProfile(): ProfileDocument {
    return { schemaVersion: 1, revision: 0, rules: [] };
}

export function profileStorageKey(accountId: string): string {
    if (!snowflake.test(accountId)) throw new Error("A valid local account identity is required.");
    return `kittycord.profile.v1:${accountId}`;
}

export function parseProfile(value: unknown, supported: readonly ProfileSetting[]): ProfileDocument {
    const candidate = object(value);
    if (candidate.schemaVersion !== 1 || !Number.isSafeInteger(candidate.revision) || Number(candidate.revision) < 0 || !Array.isArray(candidate.rules) || candidate.rules.length > 200)
        throw new Error("Unsupported profile schema, revision or rule count.");
    const contexts = new Set<string>();
    const rules = candidate.rules.map(item => {
        const rule = object(item);
        if (!["account", "server", "channel"].includes(String(rule.scope)) || typeof rule.target !== "string" || (rule.scope === "account" ? rule.target !== "" : !snowflake.test(rule.target)))
            throw new Error("Invalid rule scope or target.");
        const id = `${rule.scope}:${rule.target}`;
        if (contexts.has(id)) throw new Error("Conflicting duplicate rules for the same scope and target. Merge their settings before importing.");
        contexts.add(id);
        const values: ProfileValues = {};
        const plugins = object(rule.values);
        if (Object.keys(plugins).length > 100) throw new Error("Too many profile plugins.");
        for (const [pluginId, rawSettings] of Object.entries(plugins)) {
            if (!identifier.test(pluginId)) throw new Error("Invalid plugin identity.");
            const settings = object(rawSettings);
            if (Object.keys(settings).length > 100) throw new Error("Too many profile settings.");
            values[pluginId] = {};
            for (const [key, value] of Object.entries(settings)) {
                const definition = supported.find(setting => setting.pluginId === pluginId && setting.key === key);
                if (!identifier.test(key) || !definition || typeof value !== definition.type || (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1_000_000)))
                    throw new Error("A setting is unsupported for live profiles or has an invalid value.");
                if (typeof value !== "boolean" && typeof value !== "number") throw new Error("Profiles accept reviewed booleans and finite numbers only.");
                values[pluginId][key] = value;
            }
        }
        return { scope: rule.scope as ProfileRule["scope"], target: rule.target, values };
    });
    return { schemaVersion: 1, revision: Number(candidate.revision), rules };
}

export function parseProfileRecord(value: unknown, supported: readonly ProfileSetting[]): ProfileRecord {
    if (value === undefined) return { current: emptyProfile() };
    const record = object(value);
    return { current: parseProfile(record.current, supported), ...(record.previous === undefined ? {} : { previous: parseProfile(record.previous, supported) }) };
}

export function resolveProfile(document: ProfileDocument, context: ProfileContext): ResolvedProfile {
    const result: ResolvedProfile = { values: {}, sources: {} };
    if (!context.accountId) return result;
    for (const scope of ["account", "server", "channel"] as const) {
        const target = scope === "account" ? "" : scope === "server" ? context.serverId : context.channelId;
        const rule = document.rules.find(rule => rule.scope === scope && rule.target === target);
        if (!rule) continue;
        for (const [pluginId, settings] of Object.entries(rule.values)) {
            result.values[pluginId] ??= {};
            result.sources[pluginId] ??= {};
            for (const [key, value] of Object.entries(settings)) {
                result.values[pluginId][key] = value;
                result.sources[pluginId][key] = scope;
            }
        }
    }
    return result;
}

export interface ProfileStorage {
    read(key: string): Promise<unknown>;
    write(key: string, document: ProfileDocument, expectedRevision: number): Promise<ProfileRecord>;
}

export function createProfileSession(storage: ProfileStorage, supported: () => readonly ProfileSetting[]) {
    let context: ProfileContext = {};
    let record: ProfileRecord | undefined;
    let resolved: ResolvedProfile = { values: {}, sources: {} };
    let error = "";
    let loading = false;
    let generation = 0;
    const listeners = new Set<() => void>();
    function publish() {
        resolved = record ? resolveProfile(record.current, context) : { values: {}, sources: {} };
        for (const listener of listeners) listener();
    }
    return {
        subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        snapshot() { return structuredClone({ context, record, error, loading, resolved }); },
        get(pluginId: string, key: string) { return resolved.values[pluginId]?.[key]; },
        async switchContext(next: ProfileContext, reload = false) {
            if (next.accountId !== undefined) profileStorageKey(next.accountId);
            if (!reload && next.accountId === context.accountId && next.serverId === context.serverId && next.channelId === context.channelId) return;
            const changedAccount = reload || next.accountId !== context.accountId;
            context = { ...next };
            if (!changedAccount) { publish(); return; }
            const current = ++generation;
            record = undefined;
            error = "";
            loading = !!next.accountId;
            publish();
            if (!next.accountId) return;
            try {
                const loaded = parseProfileRecord(await storage.read(profileStorageKey(next.accountId)), supported());
                if (current !== generation) return;
                record = loaded;
            } catch {
                if (current !== generation) return;
                error = "This account profile could not be loaded or validated. Global defaults are active. The saved record was preserved.";
            } finally {
                if (current === generation) { loading = false; publish(); }
            }
        },
        async save(value: unknown, expectedAccountId: string | undefined) {
            if (!context.accountId || !record || loading || error) throw new Error("Load a valid account profile before saving.");
            if (expectedAccountId !== context.accountId) throw new Error("The account changed. Reload the profile before saving.");
            const next = parseProfile(value, supported());
            const current = generation;
            const key = profileStorageKey(context.accountId);
            const saved = await storage.write(key, { ...next, revision: record.current.revision + 1 }, record.current.revision);
            if (current !== generation) return;
            record = saved;
            publish();
        }
    };
}
