/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, PlainSettings, Settings } from "@api/Settings";
import type { InstanceProfile } from "@testcordplugins/MultiInstance/native";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, MediaEngineStore, Menu, SelectedChannelStore, showToast, Toasts, UserStore, VoiceActions } from "@webpack/common";

import type { VoiceAltCommand, VoiceAltPeer } from "./native";

const native = VencordNative.pluginHelpers.VoiceAlts as PluginNative<typeof import("./native")>;
// Multi-instance owns the saved profiles and opens the windows; VoiceAlts only asks it to start the ones that are closed.
const instances = (VencordNative as any)?.pluginHelpers?.MultiInstance as PluginNative<typeof import("@testcordplugins/MultiInstance/native")> | undefined;
const MediaEngineActions = findByPropsLazy("setInputDevice", "setOutputVolume");

const POLL_MS = 1500;
const OFFLINE_REFRESH_EVERY = 4; // polls
const START_TIMEOUT_MS = 90_000;
const GUILD_VOICE = 2;

const settings = definePluginSettings({
    sameMic: {
        type: OptionType.BOOLEAN,
        description: "Give each alt the same microphone you are using",
        default: true
    },
    unmuteAlts: {
        type: OptionType.BOOLEAN,
        description: "Unmute an alt when it joins, so it sends the microphone sound",
        default: true
    },
    startHidden: {
        type: OptionType.BOOLEAN,
        description: "Start closed alts hidden and light: no window, no taskbar button and no pictures or videos loaded, so they use less of your computer. Close them from Multi-instance.",
        default: false
    },
    quietAlts: {
        type: OptionType.BOOLEAN,
        description: "Turn an alt's speaker volume to zero while it is in the call, so you do not hear the same call several times",
        default: true
    }
});

let peers: VoiceAltPeer[] = [];
let offline: InstanceProfile[] = [];
let pollCount = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let polling = false;
let savedVolume: number | undefined;

const media = () => MediaEngineStore as any;

function waitFor(check: () => boolean, ms: number) {
    return new Promise<boolean>(resolve => {
        const end = Date.now() + ms;
        const tick = () => {
            if (check()) return resolve(true);
            if (Date.now() > end) return resolve(false);
            setTimeout(tick, 300);
        };
        tick();
    });
}

/** Runs on an alt: joins the channel, then sets the microphone and volume. */
async function handleJoin(command: Extract<VoiceAltCommand, { type: "join"; }>) {
    FluxDispatcher.dispatch({ type: "VOICE_CHANNEL_SELECT", guildId: command.guildId, channelId: command.channelId });
    if (!await waitFor(() => SelectedChannelStore.getVoiceChannelId() === command.channelId, 10_000)) return;

    try {
        if (command.inputDeviceId && media().getInputDeviceId?.() !== command.inputDeviceId)
            MediaEngineActions.setInputDevice(command.inputDeviceId);
        if (command.unmute && media().isSelfMute?.()) VoiceActions.toggleSelfMute();
        if (command.quiet) {
            savedVolume ??= media().getOutputVolume?.();
            MediaEngineActions.setOutputVolume(0);
        }
    } catch {
        // The call was joined; a device or volume that cannot be set is not worth failing over.
    }
}

/** Runs on an alt: leaves the call and gives the speaker volume back. */
function handleLeave() {
    FluxDispatcher.dispatch({ type: "VOICE_CHANNEL_SELECT", guildId: null, channelId: null });
    if (savedVolume !== undefined) {
        try { MediaEngineActions.setOutputVolume(savedVolume); } catch { /* ignore */ }
        savedVolume = undefined;
    }
}

/** Saved Multi-instance profiles that have no open window. */
async function refreshOffline() {
    if (!instances) return;
    try {
        const [profiles, open] = await Promise.all([
            // The plain copy of the settings can be sent to the main process; the live settings object cannot.
            instances.listProfiles(JSON.parse(JSON.stringify((PlainSettings.plugins as any).MultiInstance?.instances ?? null))),
            instances.getOpenInstances()
        ]);
        const openIds = new Set(open.map(i => i.id));
        offline = profiles.filter(p => !openIds.has(p.id));
    } catch {
        offline = [];
    }
}

async function startProfile(profile: InstanceProfile): Promise<boolean> {
    if (!instances) return false;
    const options = (Settings.plugins as any).MultiInstance ?? {};
    const block = options.blockExternalTokenAccess === true;
    const saveSession = !block && (profile.saveSession ?? options.saveSessionsByDefault ?? true);
    const result = await instances.openInstance(
        profile.id, profile.name, saveSession, profile.domain ?? "discord.com", block,
        options.performanceMode === true, profile.mode ?? "detached", profile.token, settings.store.startHidden
    ).catch(() => null);
    return !!result?.ok;
}

/** Starts closed alt windows, then makes each one join once it has logged in and checked in. */
async function startAndJoin(profiles: InstanceProfile[], channel: { id: string; guild_id?: string | null; }) {
    const before = new Set(peers.map(p => p.id));
    const started = (await Promise.all(profiles.map(startProfile))).filter(Boolean).length;
    if (!started) return showToast("Could not start the alt windows.", Toasts.Type.FAILURE);
    showToast(`Starting ${started} alt${started === 1 ? "" : "s"}…`, Toasts.Type.MESSAGE);

    // A window only checks in after it has logged in, so a new peer means a window that is ready to join.
    const joined = new Set<number>();
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (joined.size < started && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1000));
        const ready = peers.filter(p => !before.has(p.id) && !joined.has(p.id));
        if (!ready.length) continue;
        ready.forEach(p => joined.add(p.id));
        await send(ready, joinCommand(channel));
    }
    if (joined.size < started) showToast("Some alts did not finish starting in time.", Toasts.Type.FAILURE);
}

async function poll() {
    if (polling) return;
    polling = true;
    try {
        if (pollCount++ % OFFLINE_REFRESH_EVERY === 0) void refreshOffline();
        const me = UserStore.getCurrentUser();
        if (!me) return;
        const result = await native.poll(me.id, me.globalName || me.username);
        peers = result.peers;
        for (const command of result.commands) {
            if (command.type === "join") void handleJoin(command);
            else handleLeave();
        }
    } catch {
        // The helper is not ready yet; try again next time.
    } finally {
        polling = false;
    }
}

async function send(targets: VoiceAltPeer[], command: VoiceAltCommand) {
    const result = await native.send(targets.map(t => t.id), command).catch(() => null);
    if (result?.ok && result.sent) showToast(command.type === "join" ? `Asked ${result.sent} alt${result.sent === 1 ? "" : "s"} to join.` : `Asked ${result.sent} alt${result.sent === 1 ? "" : "s"} to leave.`, Toasts.Type.SUCCESS);
    else showToast("No alt windows are open. Open them from Multi-instance first.", Toasts.Type.FAILURE);
}

function joinCommand(channel: { id: string; guild_id?: string | null; }): VoiceAltCommand {
    return {
        type: "join",
        guildId: channel.guild_id ?? null,
        channelId: channel.id,
        inputDeviceId: settings.store.sameMic ? media().getInputDeviceId?.() : undefined,
        quiet: settings.store.quietAlts,
        unmute: settings.store.unmuteAlts
    };
}

export default definePlugin({
    name: "VoiceAlts",
    description: "Right-click a voice channel to make your other Multi-instance accounts join it, starting closed ones for you, all using the same microphone.",
    authors: [Devs.Maltsoup],
    maltcordOrigin: true,
    tags: ["MaltCord", "Voice"],
    dependencies: ["ContextMenuAPI"],
    settings,

    contextMenus: {
        "channel-context"(children, { channel }: { channel?: { id: string; type: number; guild_id?: string | null; name?: string; }; }) {
            if (!channel || channel.type !== GUILD_VOICE) return;

            const online = peers.map(peer => (
                <Menu.MenuItem key={peer.id} id={`maltcord-voice-alt-${peer.id}`} label={`Join with ${peer.username}`} action={() => void send([peer], joinCommand(channel))} />
            ));
            const closed = offline.map(profile => (
                <Menu.MenuItem key={profile.id} id={`maltcord-voice-alt-start-${profile.id}`} label={`Start and join with ${profile.name}`} action={() => void startAndJoin([profile], channel)} />
            ));
            const total = peers.length + offline.length;

            const items = total
                ? [
                    ...online,
                    ...closed,
                    <Menu.MenuSeparator key="separator" />,
                    <Menu.MenuItem
                        key="all"
                        id="maltcord-voice-alts-all"
                        label={offline.length ? "Join with all alts, starting closed ones" : "Join with all alts"}
                        action={() => {
                            if (peers.length) void send(peers, joinCommand(channel));
                            if (offline.length) void startAndJoin(offline, channel);
                        }}
                    />,
                    ...(peers.length ? [<Menu.MenuItem key="leave" id="maltcord-voice-alts-leave" label="Make all open alts leave" color="danger" action={() => void send(peers, { type: "leave" })} />] : [])
                ]
                : [<Menu.MenuItem key="none" id="maltcord-voice-alts-none" label="No alt profiles yet. Add some in Multi-instance" disabled />];

            children.push(
                <Menu.MenuSeparator key="voice-alts-separator" />,
                <Menu.MenuItem key="voice-alts" id="maltcord-voice-alts" label="Voice alts">{items}</Menu.MenuItem>
            );
        }
    },

    start() {
        pollCount = 0;
        void poll();
        timer = setInterval(() => void poll(), POLL_MS);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = undefined;
        peers = [];
        offline = [];
    }
});
