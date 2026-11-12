/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { endSession, formatDuration, keepNewest, parseSessions, participants, recapText, recordChange, startSession, type VoiceSession } from "@shared/kittycord/voiceLog";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { Alerts, ChannelStore, GuildStore, Menu, React, SelectedChannelStore, UserStore, useState, VoiceStateStore } from "@webpack/common";
import type { ComponentProps } from "react";

import style from "./style.css?managed";

const settings = definePluginSettings({
    keepSessions: { type: OptionType.SLIDER, description: "How many past calls to keep.", markers: [10, 25, 50, 100, 200], default: 50, stickToMarkers: true },
});

interface VoiceStateUpdate { userId: string; channelId?: string | null; oldChannelId?: string | null; }

let sessions: VoiceSession[] = [];
let account = "";
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => sessions;

function displayName(userId: string) {
    const user = UserStore.getUser(userId);
    return user?.globalName || user?.username || userId;
}

function commit(next: VoiceSession[]) {
    sessions = keepNewest(next, settings.store.keepSessions);
    listeners.forEach(listener => listener());
    if (!loaded || !account) return;
    clearTimeout(saveTimer);
    const key = `MaltCord:VoiceLog:${account}`, value = sessions;
    saveTimer = setTimeout(() => void set(key, value).catch(() => { }), 800);
}

const open = () => sessions.find(session => session.endedAt === undefined);

function closeOpen(at = Date.now()) {
    const current = open();
    if (current) commit(sessions.map(session => session === current ? endSession(session, at) : session));
}

function begin(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return;
    const states = (VoiceStateStore.getVoiceStatesForChannel(channelId) ?? {}) as Record<string, unknown>;
    const present: Record<string, string> = {};
    for (const userId of Object.keys(states)) present[userId] = displayName(userId);
    const self = UserStore.getCurrentUser()?.id;
    if (self && !present[self]) present[self] = displayName(self);
    const guildName = channel.guild_id ? GuildStore.getGuild(channel.guild_id)?.name : undefined;
    const name = channel.name || (channel.recipients?.length ? channel.recipients.map(displayName).join(", ") : "Call");
    commit([startSession({ id: `${channelId}-${Date.now()}`, channelId, channelName: name, guildName, at: Date.now(), present }), ...sessions]);
}

/** Follows your own voice channel: a change of channel closes the old call and starts a new one. */
function follow(channelId: string | null | undefined) {
    const current = open();
    if (current?.channelId === channelId) return;
    closeOpen();
    if (channelId) begin(channelId);
}

async function load() {
    const id = UserStore.getCurrentUser()?.id ?? "";
    if (!id || id === account && loaded) return;
    account = id; loaded = false;
    const stored = parseSessions(await get(`MaltCord:VoiceLog:${id}`).catch(() => undefined));
    if (account !== id) return;
    // A call still open in storage ended when Discord closed; end it at its last recorded moment.
    sessions = stored.map(session => session.endedAt === undefined ? endSession(session, session.events.at(-1)?.at ?? session.startedAt) : session);
    loaded = true;
    commit(sessions);
    follow(SelectedChannelStore.getVoiceChannelId());
}

function time(at: number) { return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function dateTime(at: number) { return new Date(at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); }

function SessionDetails({ session }: { session: VoiceSession; }) {
    const people = participants(session);
    return <div className="kc-voicelog-details">
        <div className="kc-voicelog-people">{people.map(person => <div key={person.userId} className="kc-voicelog-person">
            <span className="kc-voicelog-name">{person.name}{person.stillHere && <small> · here now</small>}</span>
            <span className="kc-voicelog-time">{formatDuration(person.totalMs)}{person.joins > 1 ? ` · joined ${person.joins}×` : ""}</span>
        </div>)}</div>
        <ol className="kc-voicelog-timeline">{session.events.map((event, index) => <li key={index} data-kind={event.kind}>
            <time>{time(event.at)}</time> {session.names[event.userId] ?? event.userId} {event.kind === "join" ? "joined" : "left"}
        </li>)}</ol>
        <div className="kc-voicelog-actions">
            <Button size="small" variant="secondary" onClick={() => copyWithToast(recapText(session, dateTime), "Recap copied.")}>Copy recap</Button>
            <Button size="small" variant="dangerSecondary" onClick={() => commit(sessions.filter(item => item.id !== session.id))}>Delete</Button>
        </div>
    </div>;
}

const SessionsModal = ErrorBoundary.wrap(function SessionsModal({ channelId, onClose, ...props }: ComponentProps<typeof ModalRoot> & { channelId?: string; onClose(): void; }) {
    const all = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    const list = channelId ? all.filter(session => session.channelId === channelId) : all;
    const [expanded, setExpanded] = useState<string | undefined>(list[0]?.id);
    return <ModalRoot {...props} className="kc-voicelog" size="medium">
        <ModalHeader><span className="kc-voicelog-title">Voice sessions{channelId && list[0] ? ` · ${list[0].channelName}` : ""}</span></ModalHeader>
        <ModalContent>
            {!list.length && <Paragraph className="kc-voicelog-empty">No calls recorded yet. Join a voice channel and your call shows up here.</Paragraph>}
            {list.map(session => {
                const people = participants(session), duration = (session.endedAt ?? Date.now()) - session.startedAt;
                return <section key={session.id} className="kc-voicelog-session" data-open={expanded === session.id || undefined}>
                    <button type="button" className="kc-voicelog-summary" aria-expanded={expanded === session.id} onClick={() => setExpanded(expanded === session.id ? undefined : session.id)}>
                        <span className="kc-voicelog-where">{session.channelName}{session.guildName && <small>{session.guildName}</small>}</span>
                        <span className="kc-voicelog-meta">{session.endedAt === undefined && <b>Live</b>}{dateTime(session.startedAt)} · {formatDuration(duration)} · {people.length} {people.length === 1 ? "person" : "people"}</span>
                    </button>
                    {expanded === session.id && <SessionDetails session={session} />}
                </section>;
            })}
        </ModalContent>
        <ModalFooter>
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {!!all.length && <Button variant="dangerSecondary" onClick={() => Alerts.show({ title: "Clear all voice sessions?", body: "Every recorded call on this device is deleted. This cannot be undone.", confirmText: "Clear all", confirmColor: "danger", cancelText: "Cancel", onConfirm: () => commit(all.filter(session => session.endedAt === undefined)) })}>Clear all</Button>}
        </ModalFooter>
    </ModalRoot>;
}, { noop: true });

function openSessions(channelId?: string) { openModal(props => <SessionsModal {...props} channelId={channelId} />); }

export default definePlugin({
    name: "KittenVoiceLog",
    description: "A recap of every call you join: when it started and ended, who was there, how long each person stayed and when they came and went.",
    authors: [Devs.Kittencord],
    kittencordOrigin: "original",
    tags: ["Voice", "Utility"],
    dependencies: ["ContextMenuAPI"],
    settings,
    managedStyle: style,
    settingsAboutComponent: () => <Button onClick={() => openSessions()}>Open voice sessions</Button>,
    toolboxActions: { "Voice sessions": () => openSessions() },
    contextMenus: {
        "channel-context"(children, { channel }: { channel: Channel; }) {
            if (!channel || ![2, 13, 1, 3].includes(channel.type)) return;
            children.push(<Menu.MenuItem key="kitten-voice-log" id="kitten-voice-log" label="Voice sessions" action={() => openSessions(channel.id)} />);
        },
    },
    flux: {
        CONNECTION_OPEN() { void load(); },
        LOGOUT() { closeOpen(); loaded = false; account = ""; sessions = []; },
        VOICE_CHANNEL_SELECT({ channelId }: { channelId: string | null; }) { if (loaded) follow(channelId); },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceStateUpdate[]; }) {
            if (!loaded || !voiceStates?.length) return;
            const self = UserStore.getCurrentUser()?.id;
            for (const state of voiceStates) {
                if (state.userId === self) { follow(state.channelId); continue; }
                const current = open();
                if (!current) return;
                const next = recordChange(current, state.userId, state.channelId === current.channelId, Date.now(), displayName(state.userId));
                if (next !== current) commit(sessions.map(session => session === current ? next : session));
            }
        },
    },
    start() { void load(); },
    stop() {
        closeOpen();
        clearTimeout(saveTimer);
        if (loaded && account) void set(`MaltCord:VoiceLog:${account}`, sessions).catch(() => { });
        loaded = false; account = ""; sessions = [];
    },
});
