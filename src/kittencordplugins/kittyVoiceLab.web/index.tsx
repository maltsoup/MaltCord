/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginHealth } from "@api/PluginHealth";
import { isPluginEnabled } from "@api/PluginManager";
import { definePluginSettings } from "@api/Settings";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { createMicEffectEngine, deriveMicEffectParams } from "@testcordplugins/StreamEnhancer/micEffects";
import { EquicordDevs, TestcordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { React } from "@webpack/common";

const settings = definePluginSettings({
    preset: { type: OptionType.SELECT, description: "Voice effect for newly acquired browser microphones.", options: [{ label: "Robot", value: "robot", default: true }, { label: "Deep", value: "deep" }, { label: "Chipmunk", value: "chipmunk" }, { label: "Echo", value: "echo" }] },
    mix: { type: OptionType.NUMBER, description: "Effect strength from 0 to 100 percent.", default: 65 },
}, { mix: { isValid: value => Number.isFinite(value) && value >= 0 && value <= 100 || "Choose 0 to 100 percent." } });
let restore: (() => void) | undefined;
const active = new Set<() => void>();
let enabled = false;

export default definePlugin({
    name: "KittyVoiceLab",
    description: "Kittycord browser microphone effects with live presets. Reuses TestCord StreamEnhancer DSP with attribution.",
    authors: [EquicordDevs.omaw, TestcordDevs.DavidHiFi],
    tags: ["Voice"],
    settings,
    settingsAboutComponent: () => <><Notice.Warning>Effects apply to browser getUserMedia microphone capture. Reconnect voice after enabling. Keep StreamEnhancer off to avoid double processing.</Notice.Warning><Paragraph>No recording, upload, microphone acquisition on startup or automatic channel joining. Disabling switches existing streams to dry audio; their minimal graph closes when Discord releases the microphone. Native Discord voice capture is not supported by this browser plugin.</Paragraph></>,
    start() {
        enabled = true;
        const devices = navigator.mediaDevices;
        if (!devices) { PluginHealth.recordRuntimeError("KittyVoiceLab", "capture", new Error("Browser microphone capture is unavailable in this host.")); return; }
        if (restore) return;
        const original = devices.getUserMedia;
        let installed = true;
        const wrapped: typeof original = async function (constraints) {
            const stream = await original.call(devices, constraints);
            if (!enabled || !installed || !constraints?.audio || !stream.getAudioTracks().length) return stream;
            if (isPluginEnabled("StreamEnhancer")) {
                PluginHealth.recordRuntimeError("KittyVoiceLab", "microphone conflict", new Error("Voice effects were bypassed because StreamEnhancer is enabled. Disable one microphone processor."));
                return stream;
            }
            let context: AudioContext | undefined;
            let resumeTimer: ReturnType<typeof setTimeout> | undefined;
            try {
                context = new AudioContext();
                await Promise.race([context.resume(), new Promise<never>((_resolve, reject) => { resumeTimer = setTimeout(() => reject(new Error("Audio processing was not activated by this browser.")), 2000); })]);
                clearTimeout(resumeTimer);
                const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
                const processor = context.createScriptProcessor(2048, 1, 1);
                const destination = context.createMediaStreamDestination();
                const engine = createMicEffectEngine(context.sampleRate);
                let bypass = false;
                const dry = () => { bypass = true; source.disconnect(); processor.disconnect(); processor.onaudioprocess = null; source.connect(destination); };
                let closed = false;
                const close = () => {
                    if (closed) return; closed = true; active.delete(dry);
                    processor.onaudioprocess = null; source.disconnect(); processor.disconnect(); destination.disconnect();
                    for (const track of stream.getAudioTracks()) track.stop();
                    void context?.close().catch(() => PluginHealth.recordRuntimeError("KittyVoiceLab", "cleanup", new Error("Voice processing context did not close. Disconnect voice to release capture.")));
                };
                processor.onaudioprocess = event => {
                    const input = event.inputBuffer.getChannelData(0); const output = event.outputBuffer.getChannelData(0);
                    if (bypass || !enabled) { output.set(input); return; }
                    const { preset, mix } = settings.store;
                    const amount = Number.isFinite(mix) ? Math.max(0, Math.min(100, mix)) : 65;
                    engine.process(input, output, deriveMicEffectParams({ pitchPercent: preset === "deep" ? -35 : preset === "chipmunk" ? 65 : 0, echoPercent: preset === "echo" ? amount : 0, ringPercent: preset === "robot" ? amount : 0, staticPercent: 0, dropoutPercent: 0, bitcrushPercent: 0, clippingPercent: 0, voiceBoostPercent: 0, hardCutout: false }));
                    const wet = amount / 100; for (let i = 0; i < output.length; i++) output[i] = output[i] * wet + input[i] * (1 - wet);
                };
                source.connect(processor); processor.connect(destination);
                const output = destination.stream.getAudioTracks()[0];
                const stop = output.stop.bind(output);
                output.stop = () => { close(); stop(); };
                output.addEventListener("ended", close, { once: true });
                for (const track of stream.getAudioTracks()) track.addEventListener("ended", () => { close(); stop(); }, { once: true });
                active.add(dry);
                return new MediaStream([...stream.getVideoTracks(), output]);
            } catch {
                clearTimeout(resumeTimer);
                if (context) void context.close().catch(() => PluginHealth.recordRuntimeError("KittyVoiceLab", "capture cleanup", new Error("A failed voice-processing context did not close.")));
                PluginHealth.recordRuntimeError("KittyVoiceLab", "capture", new Error("Voice processing was unavailable. Original microphone audio was preserved; no security policy was changed."));
                return stream;
            }
        };
        devices.getUserMedia = wrapped;
        restore = () => { installed = false; if (devices.getUserMedia === wrapped) devices.getUserMedia = original; };
    },
    stop() { enabled = false; restore?.(); restore = undefined; for (const dry of active) dry(); active.clear(); }
});
