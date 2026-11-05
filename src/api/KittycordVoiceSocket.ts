/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { createInterpositionSlot, type InterpositionSlot } from "./RuntimeInterpositionCore";

interface VoicePacket { self_mute?: boolean; self_deaf?: boolean; self_video?: boolean; [key: string]: unknown; }
interface Socket { send(op: number, data: unknown, ...args: unknown[]): unknown; }
const gateway: { getSocket(): Socket | undefined; } = findByPropsLazy("getSocket");
const slots = new WeakMap<Socket, InterpositionSlot<Socket["send"], "voiceSocketSend">>();
let sequence = 0;
export function registerVoiceStatePatch(owner: string, patch: (packet: VoicePacket) => VoicePacket) {
    let dispose: (() => void) | undefined;
    function bind() {
        dispose?.(); dispose = undefined;
        const socket = gateway.getSocket(); if (!socket) return;
        let slot = slots.get(socket);
        if (!slot) { slot = createInterpositionSlot("voiceSocketSend", () => socket.send, value => { socket.send = value; }, () => sequence++, () => {}); slots.set(socket, slot); }
        dispose = slot.register(owner, 0, next => function (this: Socket, op, data, ...args) {
            return next.call(this, op, op === 4 && data && typeof data === "object" && !Array.isArray(data) ? patch({ ...data }) : data, ...args);
        });
    }
    bind(); FluxDispatcher.subscribe("CONNECTION_OPEN", bind);
    return () => { FluxDispatcher.unsubscribe("CONNECTION_OPEN", bind); dispose?.(); dispose = undefined; };
}
