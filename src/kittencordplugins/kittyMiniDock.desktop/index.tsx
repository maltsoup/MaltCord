/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { ChannelActions, ChannelRTCStore, ChannelStore, MediaEngineStore, PopoutActions, PopoutWindowStore, React, SelectedChannelStore, UserStore, useState, useStateFromStores, VoiceActions, VoiceStateStore } from "@webpack/common";

import style from "./style.css?managed";

const key = "KITTENCORD_MINIDOCK";
const NativePopout = findComponentByCodeLazy("Missing guestWindow reference");
const native = VencordNative.pluginHelpers.KittyMiniDock as PluginNative<typeof import("./native")>;
const settings = definePluginSettings({
    compact: { type: OptionType.BOOLEAN, default: true, description: "Use the compact participant layout." },
    alwaysOnTop: { type: OptionType.BOOLEAN, default: true, description: "Keep MiniDock above other desktop windows.", onChange(value) { if (PopoutWindowStore.getWindowOpen(key)) PopoutActions.setAlwaysOnTop(key, value); } },
    shortcut: { type: OptionType.STRING, default: "M", description: "Letter used with Ctrl+Shift while Discord is focused to open or close MiniDock.", isValid: value => typeof value === "string" && /^[a-z]$/i.test(value) || "Choose one letter." }
});
const Dock = ErrorBoundary.wrap(function Dock() {
    const channelId = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getVoiceChannelId());
    const channel = useStateFromStores([ChannelStore], () => channelId ? ChannelStore.getChannel(channelId) : undefined);
    const participants = useStateFromStores([VoiceStateStore, UserStore], () => channelId ? Object.values(VoiceStateStore.getVoiceStatesForChannel(channelId)).map(state => UserStore.getUser(state.userId)).filter(user => user != null) : []);
    const speaking = useStateFromStores([ChannelRTCStore], () => channelId ? ChannelRTCStore.getSpeakingParticipants(channelId).filter(item => item.speaking).map(item => item.user.id) : []);
    const muted = useStateFromStores([MediaEngineStore], () => MediaEngineStore.isSelfMute()), deafened = useStateFromStores([MediaEngineStore], () => MediaEngineStore.isSelfDeaf());
    const { compact } = settings.use(["compact"]), [opacity, setOpacity] = useState(100), [error, setError] = useState("");
    return <NativePopout withTitleBar windowKey={key} title="Kitty MiniDock" channelId={channelId}><section className="kc-mini-dock" data-compact={compact}>
        <header><div><strong>Kitty MiniDock</strong><small>{channel?.name || (channelId ? "Voice call" : "Not connected to voice")}</small></div><Button size="small" variant="secondary" onClick={() => { settings.store.compact = !compact; }}>{compact ? "Expand" : "Compact"}</Button></header>
        <div className="kc-dock-participants">{participants.map(user => <div key={user.id} className="kc-dock-person" data-speaking={speaking.includes(user.id)}><img src={user.getAvatarURL()} width={36} height={36} alt={compact ? user.globalName || user.username : ""} title={user.globalName || user.username} />{!compact && <span>{user.globalName || user.username}</span>}{speaking.includes(user.id) && <span className="kc-dock-speaking" aria-label="Speaking" />}</div>)}</div>
        <div className="kc-dock-controls"><Button size="small" variant="secondary" disabled={!channelId} aria-pressed={muted} onClick={() => VoiceActions.toggleSelfMute()}>{muted ? "Unmute" : "Mute"}</Button><Button size="small" variant="secondary" disabled={!channelId} aria-pressed={deafened} onClick={() => VoiceActions.toggleSelfDeaf()}>{deafened ? "Undeafen" : "Deafen"}</Button><Button size="small" variant="secondary" disabled={!channelId} onClick={() => ChannelActions.selectVoiceChannel(null)}>Disconnect</Button></div>
        <label>Window opacity <span>{opacity}%</span><input type="range" min={40} max={100} value={opacity} onChange={event => { const value = Number(event.target.value); void native.setDockOpacity(value / 100).then(result => { if (result.available) { setOpacity(value); setError(""); } else setError(result.error ?? "Native opacity is unavailable."); }, () => setError("Native opacity is unavailable.")); }} /></label>
        {error && <Paragraph role="status">{error}</Paragraph>}
    </section></NativePopout>;
}, { noop: true });
function open() { if (PopoutWindowStore.getWindowOpen(key)) { PopoutActions.close(key); return; } PopoutActions.open(key, () => <Dock />, { defaultWidth: 360, defaultHeight: 340 }); PopoutActions.setAlwaysOnTop(key, settings.store.alwaysOnTop); }
function shortcut(event: KeyboardEvent) { if (event.ctrlKey && event.shiftKey && !event.altKey && !event.repeat && event.key.toLowerCase() === settings.store.shortcut.toLowerCase()) { event.preventDefault(); open(); } }
export default definePlugin({
    name: "KittyMiniDock", description: "Open a compact native voice window with live participants, speaking indicators and voice controls.",
    authors: [Devs.Kittencord], kittencordOrigin: "original", tags: ["Voice", "Utility"], settings, managedStyle: style,
    settingsAboutComponent: () => <><Paragraph>Desktop popout window. Drag its title bar to move it. Shortcuts work while Discord is focused.</Paragraph><Button onClick={open}>Open MiniDock</Button></>,
    toolboxActions: { "Toggle MiniDock": open },
    start() { window.addEventListener("keydown", shortcut); },
    stop() { window.removeEventListener("keydown", shortcut); if (PopoutWindowStore.getWindowOpen(key)) PopoutActions.close(key); }
});
