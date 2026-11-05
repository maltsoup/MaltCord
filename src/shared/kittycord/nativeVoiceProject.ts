/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NativeStudioProject } from "./nativeStudio";

export function safeDeafenProject(): NativeStudioProject {
    return { schemaVersion: 1, kind: "kittencord-native-studio", metadata: { id: "local.native.safe-deafen", name: "FakeDeafenModified", version: "1.0.0", author: "xtufa7" }, entry: "index.tsx", files: { "index.tsx": `import definePlugin, { OptionType } from "@utils/types";
import { Devs, TestcordDevs } from "@utils/constants";
import { definePluginSettings } from "@api/Settings";
import { createSafeDeafenController, subscribeVoiceControl } from "@api/KittycordVoice";
import { ChannelToolbarButton } from "@api/HeaderBar";
import { Button } from "@components/Button";
import { KittycordIcon } from "@components/Icons";
import ErrorBoundary from "@components/ErrorBoundary";
import { ApplicationStreamingStore, MediaEngineStore, React, showToast, Toasts, useEffect, useState, useStateFromStores } from "@webpack/common";

let control: ReturnType<typeof createSafeDeafenController> | undefined;
const settings = definePluginSettings({
    muteOnActivation: { type: OptionType.BOOLEAN, description: "Mute the real microphone before activating. When off, mute it yourself first.", default: true },
    manualUnmute: { type: OptionType.BOOLEAN, description: "Allow the separate, deliberate Unmute microphone action.", default: false },
    stopScreenShare: { type: OptionType.BOOLEAN, description: "Ask to stop your current screen share before activation.", default: false },
    hideDuringCapture: { type: OptionType.BOOLEAN, description: "Hide the toolbar button during screen sharing. This host does not expose recording detection.", default: true },
    reset: { type: OptionType.COMPONENT, component: Reset }
});

async function run(action: () => Promise<void> | void) {
    try { await action(); } catch (error) { showToast(error instanceof Error ? error.message : "Voice action did not complete.", Toasts.Type.FAILURE); }
}
function useVoice() {
    const [, update] = useState(0);
    useEffect(() => subscribeVoiceControl(() => update(value => value + 1)), []);
    const muted = useStateFromStores([MediaEngineStore], () => MediaEngineStore.isSelfMute());
    const sharing = useStateFromStores([ApplicationStreamingStore], () => !!ApplicationStreamingStore.getCurrentUserActiveStream());
    return { active: control?.current().active ?? false, valid: control?.current().valid ?? false, muted, sharing };
}
async function toggle() { if (!control) return; if (control.current().active) control.deactivate(); else await control.activate(settings.store); }
function Reset() {
    return <Button onClick={() => { control?.deactivate(); settings.store.muteOnActivation = true; settings.store.manualUnmute = false; settings.store.stopScreenShare = false; settings.store.hideDuringCapture = true; }}>Reset controls</Button>;
}
const Controls = ErrorBoundary.wrap(function Controls() {
    const voice = useVoice(); const values = settings.use(["manualUnmute"]);
    return <div><p>Cosmetic deafen: {voice.active ? "on" : "off"}. Real microphone: {voice.muted ? "muted" : "live"}.</p>
        <Button disabled={!voice.valid} onClick={() => void run(toggle)}>{voice.active ? "Disable cosmetic deafen" : "Activate cosmetic deafen"}</Button>
        <Button disabled={!voice.valid || !voice.active || !voice.muted || !values.manualUnmute} onClick={() => void run(() => control?.manualUnmute(values.manualUnmute))}>Unmute microphone</Button>
        <p>Uses the existing TestCord FakeMuteDeafen integration. Microphone transmission is never enabled automatically. Recording detection is unavailable.</p></div>;
}, { noop: true });
const Toolbar = ErrorBoundary.wrap(function Toolbar() {
    const voice = useVoice(); const values = settings.use(["hideDuringCapture"]);
    if (!voice.valid || values.hideDuringCapture && voice.sharing) return null;
    return <ChannelToolbarButton icon={KittycordIcon} tooltip={\`Cosmetic deafen \${voice.active ? "on" : "off"} · Microphone \${voice.muted ? "muted" : "live"}\`} onClick={() => void run(toggle)} />;
}, { noop: true });

export default definePlugin({
    name: "FakeDeafenModified", description: "Cosmetic deafen with a real mute first and an explicit manual unmute action.",
    authors: [Devs.Kittencord, TestcordDevs.x2b, TestcordDevs.dot, TestcordDevs.sirphantom89, TestcordDevs.hyyven],
    dependencies: ["FakeMuteDeafen", "UserAreaAPI"], settings, settingsAboutComponent: Controls,
    headerBarButton: { location: "channeltoolbar", render: Toolbar },
    start() { control = createSafeDeafenController(); },
    async stop() { await control?.dispose(); control = undefined; }
});
` } };
}
