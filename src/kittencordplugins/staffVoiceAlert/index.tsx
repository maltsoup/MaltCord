/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import { chooseFile } from "@utils/web";
import { Button, ChannelStore, GuildMemberStore, GuildRoleStore, GuildStore, PermissionsBits, React, SelectedChannelStore, Toasts, UserStore } from "@webpack/common";

const DEFAULT_URL = "https://minecraft.wiki/images/Curse.ogg?1614d";
const MAX_LOCAL_BYTES = 2 * 1024 * 1024;
const COOLDOWN_MS = 3000;

// Only present in the desktop build, where it downloads the sound outside Discord's content security policy.
const native = (VencordNative as any)?.pluginHelpers?.StaffVoiceAlert as PluginNative<typeof import("./native")> | undefined;

const permissionToggles = [
    ["alertAdministrator", "ADMINISTRATOR", "Administrators", true],
    ["alertManageServer", "MANAGE_GUILD", "Manage Server", true],
    ["alertManageMessages", "MANAGE_MESSAGES", "Manage Messages", true],
    ["alertKick", "KICK_MEMBERS", "Kick Members", true],
    ["alertBan", "BAN_MEMBERS", "Ban Members", true],
    ["alertTimeout", "MODERATE_MEMBERS", "Timeout Members", true],
    ["alertManageChannels", "MANAGE_CHANNELS", "Manage Channels", false],
    ["alertManageRoles", "MANAGE_ROLES", "Manage Roles", false]
] as const;

function SoundPicker() {
    const { soundSource, localSoundName } = settings.use(["soundSource", "localSoundName"]);
    const [message, setMessage] = React.useState("");

    const choose = async () => {
        const file = await chooseFile("audio/*");
        if (!file) return;
        if (file.size > MAX_LOCAL_BYTES) return setMessage("Pick a sound under 2 MB.");
        const reader = new FileReader();
        reader.onload = () => {
            settings.store.localSound = String(reader.result);
            settings.store.localSoundName = file.name;
            settings.store.soundSource = "file";
            setMessage("");
        };
        reader.onerror = () => setMessage("Could not read that file.");
        reader.readAsDataURL(file);
    };

    const test = async () => {
        const ok = await playAlert();
        setMessage(ok ? "" : "Could not play the sound. Check the link or file.");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
                {soundSource === "file"
                    ? localSoundName ? `Local file: ${localSoundName}` : "No local file chosen yet."
                    : `Sound from the link above (default: ${DEFAULT_URL}).`}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <Button size={Button.Sizes.SMALL} onClick={choose}>Choose local sound</Button>
                {localSoundName && <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => { settings.store.localSound = ""; settings.store.localSoundName = ""; }}>Remove local sound</Button>}
                <Button size={Button.Sizes.SMALL} onClick={test}>Test sound</Button>
            </div>
            {message && <div style={{ color: "var(--text-danger)", fontSize: 13 }}>{message}</div>}
        </div>
    );
}

const settings = definePluginSettings({
    soundSource: {
        type: OptionType.SELECT,
        description: "Where the alert sound comes from",
        options: [
            { label: "Open sound from a URL", value: "url", default: true },
            { label: "Open a local sound file", value: "file" }
        ]
    },
    soundUrl: {
        type: OptionType.STRING,
        description: "Sound URL (https). Used when the source is a URL.",
        default: DEFAULT_URL
    },
    soundPicker: { type: OptionType.COMPONENT, component: SoundPicker },
    volume: {
        type: OptionType.SLIDER,
        description: "Alert volume",
        markers: [0, 25, 50, 75, 100],
        default: 70,
        stickToMarkers: false
    },
    showNotification: {
        type: OptionType.BOOLEAN,
        description: "Also show a notification with the name of the person who joined",
        default: true
    },
    ignoreBots: { type: OptionType.BOOLEAN, description: "Ignore bots", default: true },
    localSound: { type: OptionType.STRING, description: "Local sound (data)", default: "", hidden: true },
    localSoundName: { type: OptionType.STRING, description: "Local sound name", default: "", hidden: true },
    ...Object.fromEntries(permissionToggles.map(([key, , label, on]) => [key, {
        type: OptionType.BOOLEAN,
        description: `Alert for members who can: ${label}`,
        default: on
    }]))
} as any) as any;

let cachedKey = "";
let cachedUrl = "";
const lastAlert = new Map<string, number>();

function setCache(key: string, url: string) {
    if (cachedUrl.startsWith("blob:")) URL.revokeObjectURL(cachedUrl);
    cachedKey = key;
    cachedUrl = url;
}

function dataUrlToBlobUrl(dataUrl: string): string | null {
    const match = /^data:(audio\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) return null;
    const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: match[1] }));
}

async function resolveSound(): Promise<string | null> {
    if (settings.store.soundSource === "file") {
        const local: string = settings.store.localSound;
        if (!local) return null;
        if (cachedKey !== local) setCache(local, dataUrlToBlobUrl(local) ?? "");
        return cachedUrl || null;
    }

    const url = String(settings.store.soundUrl || DEFAULT_URL).trim();
    if (!/^https:\/\//i.test(url)) return null;
    if (cachedKey === url && cachedUrl) return cachedUrl;
    if (!native) return url; // Web build: the browser loads it directly.

    const result = await native.fetchSound(url).catch(() => null);
    if (!result?.ok) return null;
    setCache(url, URL.createObjectURL(new Blob([result.data], { type: result.type })));
    return cachedUrl;
}

async function playAlert(): Promise<boolean> {
    try {
        const src = await resolveSound();
        if (!src) return false;
        const audio = new Audio(src);
        audio.volume = Math.min(1, Math.max(0, Number(settings.store.volume) / 100));
        await audio.play();
        return true;
    } catch {
        return false;
    }
}

function staffMask(): bigint {
    let mask = 0n;
    for (const [key, permission] of permissionToggles)
        if (settings.store[key]) mask |= PermissionsBits[permission];
    return mask;
}

function isStaff(userId: string, guildId: string, mask: bigint): boolean {
    if (mask === 0n) return false;
    const guild = GuildStore.getGuild(guildId);
    if (!guild) return false;
    if (guild.ownerId === userId) return true;

    let permissions = BigInt(GuildRoleStore.getRole(guildId, guildId)?.permissions ?? 0);
    for (const roleId of GuildMemberStore.getMember(guildId, userId)?.roles ?? [])
        permissions |= BigInt(GuildRoleStore.getRole(guildId, roleId)?.permissions ?? 0);

    // Administrators have every permission.
    if ((permissions & PermissionsBits.ADMINISTRATOR) !== 0n) return true;
    return (permissions & mask) !== 0n;
}

interface VoiceStateChange { userId: string; channelId?: string | null; oldChannelId?: string | null; guildId?: string | null; }

export default definePlugin({
    name: "StaffVoiceAlert",
    description: "Plays a sound when a moderator, admin or other staff member joins the voice channel you are in.",
    authors: [Devs.Maltsoup],
    maltcordOrigin: true,
    tags: ["MaltCord", "Voice", "Notifications"],
    settings,

    stop() {
        setCache("", "");
        lastAlert.clear();
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceStateChange[]; }) {
            const myChannel = SelectedChannelStore.getVoiceChannelId();
            const me = UserStore.getCurrentUser()?.id;
            if (!myChannel || !me) return;

            const guildId = ChannelStore.getChannel(myChannel)?.guild_id;
            if (!guildId) return; // Calls and group DMs have no staff.

            const mask = staffMask();
            for (const state of voiceStates) {
                if (state.userId === me || state.channelId !== myChannel || state.oldChannelId === myChannel) continue;

                const user = UserStore.getUser(state.userId);
                if (settings.store.ignoreBots && user?.bot) continue;
                if (!isStaff(state.userId, guildId, mask)) continue;

                const now = Date.now();
                if (now - (lastAlert.get(state.userId) ?? 0) < COOLDOWN_MS) continue;
                lastAlert.set(state.userId, now);

                void playAlert().then(ok => {
                    if (!ok) Toasts.show({ message: "Staff joined voice, but the alert sound could not be played.", id: Toasts.genId(), type: Toasts.Type.FAILURE });
                });
                if (settings.store.showNotification) {
                    showNotification({
                        title: "Staff joined voice",
                        body: `${user?.globalName || user?.username || "A staff member"} joined ${ChannelStore.getChannel(myChannel)?.name ?? "your voice channel"}.`
                    });
                }
            }
        }
    }
});
