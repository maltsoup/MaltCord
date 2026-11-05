/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** One call you were in: who was there, when they came and went. Pure data, stored locally. */
export interface VoiceSession {
    id: string;
    channelId: string;
    channelName: string;
    guildName?: string;
    startedAt: number;
    endedAt?: number;
    /** Everyone in the channel right now (only meaningful while the session is open). */
    present: string[];
    events: { at: number; userId: string; kind: "join" | "leave"; }[];
    names: Record<string, string>;
}

export interface Participant { userId: string; name: string; totalMs: number; joins: number; firstSeen: number; lastSeen: number; stillHere: boolean; }

export const MAX_EVENTS = 2000;

export function startSession(input: { id: string; channelId: string; channelName: string; guildName?: string; at: number; present: Record<string, string>; }): VoiceSession {
    const present = Object.keys(input.present);
    return {
        id: input.id, channelId: input.channelId, channelName: input.channelName, ...(input.guildName ? { guildName: input.guildName } : {}),
        startedAt: input.at, present, names: { ...input.present },
        events: present.map(userId => ({ at: input.at, userId, kind: "join" as const })),
    };
}

/** Records a person entering or leaving. Repeated updates for the same state are ignored. */
export function recordChange(session: VoiceSession, userId: string, inChannel: boolean, at: number, name?: string): VoiceSession {
    if (session.endedAt !== undefined || inChannel === session.present.includes(userId) || session.events.length >= MAX_EVENTS) return session;
    return {
        ...session,
        present: inChannel ? [...session.present, userId] : session.present.filter(id => id !== userId),
        names: name && session.names[userId] !== name ? { ...session.names, [userId]: name } : session.names,
        events: [...session.events, { at, userId, kind: inChannel ? "join" : "leave" }],
    };
}

export function endSession(session: VoiceSession, at: number): VoiceSession {
    if (session.endedAt !== undefined) return session;
    return { ...session, endedAt: at, present: [], events: [...session.events, ...session.present.map(userId => ({ at, userId, kind: "leave" as const }))] };
}

export function participants(session: VoiceSession, now = Date.now()): Participant[] {
    const result = new Map<string, Participant & { since?: number; }>();
    for (const event of session.events) {
        const entry = result.get(event.userId) ?? { userId: event.userId, name: session.names[event.userId] ?? event.userId, totalMs: 0, joins: 0, firstSeen: event.at, lastSeen: event.at, stillHere: false };
        if (event.kind === "join" && entry.since === undefined) { entry.since = event.at; entry.joins++; }
        if (event.kind === "leave" && entry.since !== undefined) { entry.totalMs += event.at - entry.since; entry.since = undefined; }
        entry.lastSeen = event.at;
        result.set(event.userId, entry);
    }
    const end = session.endedAt ?? now;
    return [...result.values()].map(({ since, ...entry }) => since === undefined ? entry : { ...entry, totalMs: entry.totalMs + end - since, lastSeen: end, stillHere: true })
        .sort((a, b) => b.totalMs - a.totalMs || a.name.localeCompare(b.name));
}

export function formatDuration(ms: number) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 1) return "under a minute";
    const hours = Math.floor(minutes / 60), rest = minutes % 60;
    return hours ? `${hours} h ${rest} min` : `${rest} min`;
}

export function recapText(session: VoiceSession, formatTime: (at: number) => string, now = Date.now()) {
    const where = session.guildName ? `${session.channelName} (${session.guildName})` : session.channelName;
    const lines = [`Voice session in ${where}`, `${formatTime(session.startedAt)} to ${session.endedAt ? formatTime(session.endedAt) : "now"}, ${formatDuration((session.endedAt ?? now) - session.startedAt)}`, "", "People:"];
    for (const person of participants(session, now)) lines.push(`- ${person.name}: ${formatDuration(person.totalMs)}${person.joins > 1 ? `, joined ${person.joins} times` : ""}`);
    lines.push("", "Timeline:");
    for (const event of session.events) lines.push(`${formatTime(event.at)}  ${session.names[event.userId] ?? event.userId} ${event.kind === "join" ? "joined" : "left"}`);
    return lines.join("\n");
}

/** Keeps the newest sessions, never dropping the one still open. */
export function keepNewest(sessions: readonly VoiceSession[], max: number) {
    const sorted = [...sessions].sort((a, b) => b.startedAt - a.startedAt);
    return sorted.filter((session, index) => index < max || session.endedAt === undefined);
}

export function parseSessions(value: unknown): VoiceSession[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is VoiceSession => !!item && typeof item === "object" && typeof item.id === "string" && typeof item.channelId === "string" && typeof item.startedAt === "number" && Array.isArray(item.events) && Array.isArray(item.present) && !!item.names && typeof item.names === "object");
}
