/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import FakeMuteDeafen, { acquireSafeDeafen, subscribeSafeDeafen } from "@testcordplugins/fakeMuteDeafen";
import { findByCodeLazy } from "@webpack";
import { Alerts, ApplicationStreamingStore, MediaEngineStore, SelectedChannelStore, VoiceActions } from "@webpack/common";

const stopStream: (key: string, options: { streamKey: string; appContext: string; }) => void = findByCodeLazy('type:"STREAM_STOP"');

function until(read: () => boolean, message: string, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
            clearTimeout(timeout);
            MediaEngineStore.removeChangeListener(check);
            ApplicationStreamingStore.removeChangeListener(check);
            signal?.removeEventListener("abort", cancel);
            if (error) reject(error); else resolve();
        };
        const check = () => { if (read()) finish(); };
        const cancel = () => finish(new Error("The voice operation was cancelled."));
        const timeout = setTimeout(() => finish(new Error(message)), 2000);
        MediaEngineStore.addChangeListener(check);
        ApplicationStreamingStore.addChangeListener(check);
        signal?.addEventListener("abort", cancel, { once: true });
        if (signal?.aborted) cancel(); else check();
    });
}

export function voiceCaptureState() {
    return { sharing: !!ApplicationStreamingStore.getCurrentUserActiveStream(), recording: "unavailable" as const };
}

export const subscribeVoiceControl = subscribeSafeDeafen;

export function createSafeDeafenController() {
    if (!FakeMuteDeafen.started) throw new Error("Start the FakeMuteDeafen dependency before creating this control.");
    if (isPluginEnabled("FakeVoicePremium")) throw new Error("Turn off FakeVoicePremium before using this control so microphone indicators remain accurate.");
    const lease = acquireSafeDeafen();
    let disposed = false, busy = false, revision = 0, unmuteUnconfirmed = false;
    let pending: Promise<void> | undefined;
    let activation: AbortController | undefined;
    const current = () => ({ active: lease.current(), muted: MediaEngineStore.isSelfMute(), valid: !disposed && lease.valid(), ...voiceCaptureState() });
    async function mute(force = false, signal?: AbortSignal) {
        if (force || !MediaEngineStore.isSelfMute()) VoiceActions.setSelfMute("default", true, false);
        await until(() => MediaEngineStore.isSelfMute(), "Discord did not confirm a real microphone mute. Cosmetic deafen was not activated.", signal);
    }
    return {
        current,
        subscribe: subscribeSafeDeafen,
        async activate(options: { muteOnActivation: boolean; stopScreenShare: boolean; }) {
            if (busy || disposed || !lease.valid()) throw new Error("The voice control is unavailable. Try again after the current operation.");
            const channel = SelectedChannelStore.getVoiceChannelId();
            if (!channel) throw new Error("Join a voice channel before activating cosmetic deafen.");
            busy = true; const generation = ++revision; activation = new AbortController();
            try {
                const stream = ApplicationStreamingStore.getCurrentUserActiveStream();
                if (stream && options.stopScreenShare) {
                    if (!await Alerts.confirm({ title: "Stop your screen share?", body: "This activation stops your current Discord stream.", confirmText: "Stop share & activate", cancelText: "Cancel" })) return;
                    if (disposed || generation !== revision || SelectedChannelStore.getVoiceChannelId() !== channel) throw new Error("The voice session changed. Activation was cancelled.");
                    const key = stream.streamType === "guild" ? `guild:${stream.guildId}:${stream.channelId}:${stream.ownerId}` : `call:${stream.channelId}:${stream.ownerId}`;
                    stopStream(key, { streamKey: key, appContext: "app" });
                    await until(() => !ApplicationStreamingStore.getCurrentUserActiveStream(), "Discord did not confirm that screen sharing stopped. Activation was cancelled.", activation?.signal);
                }
                if (disposed || generation !== revision) throw new Error("Activation was cancelled.");
                if (options.muteOnActivation) await mute(false, activation.signal);
                if (!MediaEngineStore.isSelfMute()) throw new Error("Mute your microphone first, or enable Mute on activation.");
                if (disposed || generation !== revision || SelectedChannelStore.getVoiceChannelId() !== channel) throw new Error("The voice session changed. Activation was cancelled.");
                lease.set(true);
            } finally { activation = undefined; busy = false; }
        },
        deactivate() { revision++; activation?.abort(); if (!disposed && lease.valid()) lease.set(false); },
        async manualUnmute(allowed: boolean) {
            if (!allowed || disposed || !lease.valid() || !lease.current()) throw new Error("Enable Manual unmute and activate cosmetic deafen first.");
            if (busy) throw new Error("Wait for activation to finish before unmuting.");
            if (isPluginEnabled("FakeVoicePremium")) throw new Error("Turn off FakeVoicePremium before manually unmuting.");
            busy = true;
            unmuteUnconfirmed = true;
            pending = (async () => {
                VoiceActions.setSelfMute("default", false, false);
                await until(() => !MediaEngineStore.isSelfMute(), "Discord did not confirm microphone unmute.");
                unmuteUnconfirmed = false;
            })();
            try { await pending; } finally { pending = undefined; busy = false; }
        },
        async dispose() {
            revision++; disposed = true; activation?.abort();
            if (pending) await pending.catch(() => undefined);
            if (lease.valid()) {
                let restore = true;
                try { if (lease.requiresMuteOnRelease) { restore = false; await mute(true); restore = !unmuteUnconfirmed; } }
                finally { lease.release(restore); }
            }
        }
    };
}
