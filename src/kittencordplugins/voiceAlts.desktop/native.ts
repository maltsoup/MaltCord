/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type IpcMainInvokeEvent, webContents } from "electron";

// Every Discord window that runs MaltCord (your main window and each Multi-instance window) checks in here every
// second or so. That gives each window the list of the other open windows, and a place to leave a message for them.
// It only connects windows of this same app on this computer.

export interface VoiceAltPeer {
    id: number;
    userId: string;
    username: string;
}

export type VoiceAltCommand =
    | { type: "join"; guildId: string | null; channelId: string; inputDeviceId?: string; quiet: boolean; unmute: boolean; }
    | { type: "leave"; };

const STALE_MS = 15_000;
const MAX_TARGETS = 10;
const MAX_QUEUE = 20;
const ID = /^\d{15,22}$/;

const peers = new Map<number, VoiceAltPeer & { seen: number; }>();
const queues = new Map<number, VoiceAltCommand[]>();

function prune() {
    const now = Date.now();
    for (const [id, peer] of peers) {
        const contents = webContents.fromId(id);
        if (!contents || contents.isDestroyed() || now - peer.seen > STALE_MS) {
            peers.delete(id);
            queues.delete(id);
        }
    }
}

/** Checks a window in, and returns what was left for it plus the other open windows. */
export function poll(event: IpcMainInvokeEvent, userId: unknown, username: unknown) {
    const me = event.sender.id;
    if (typeof userId === "string" && ID.test(userId)) {
        peers.set(me, { id: me, userId, username: typeof username === "string" && username ? username.slice(0, 64) : userId, seen: Date.now() });
    }
    prune();

    const commands = queues.get(me) ?? [];
    queues.set(me, []);

    const mine = peers.get(me)?.userId;
    return {
        commands,
        // A second window of the same account cannot join the same call twice, so it is not offered.
        peers: [...peers.values()]
            .filter(p => p.id !== me && p.userId !== mine)
            .map(({ id, userId, username }): VoiceAltPeer => ({ id, userId, username }))
    };
}

function parseCommand(value: unknown): VoiceAltCommand | null {
    if (typeof value !== "object" || value === null) return null;
    const command = value as Record<string, unknown>;
    if (command.type === "leave") return { type: "leave" };
    if (command.type !== "join" || typeof command.channelId !== "string" || !ID.test(command.channelId)) return null;
    const guildId = typeof command.guildId === "string" && ID.test(command.guildId) ? command.guildId : null;
    const inputDeviceId = typeof command.inputDeviceId === "string" && command.inputDeviceId.length <= 300 ? command.inputDeviceId : undefined;
    return { type: "join", guildId, channelId: command.channelId, inputDeviceId, quiet: command.quiet === true, unmute: command.unmute === true };
}

/** Leaves a command for the chosen windows. They pick it up the next time they check in. */
export function send(event: IpcMainInvokeEvent, targetIds: unknown, rawCommand: unknown) {
    const command = parseCommand(rawCommand);
    if (!command) return { ok: false as const, error: "Invalid command." };

    const me = event.sender.id;
    const targets = (Array.isArray(targetIds) ? targetIds : [])
        .filter((id): id is number => Number.isInteger(id) && id !== me && peers.has(id))
        .slice(0, MAX_TARGETS);

    for (const id of targets) {
        const queue = queues.get(id) ?? [];
        queue.push(command);
        queues.set(id, queue.slice(-MAX_QUEUE));
    }
    return { ok: true as const, sent: targets.length };
}
