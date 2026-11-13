/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";
import { ApplicationStreamingStore, FluxDispatcher, SelectedChannelStore } from "@webpack/common";

// Discord shows the purple "Streaming" status for an activity of type 1 that has a Twitch or YouTube link.
const logger = new Logger("StreamingStatus");
const STREAMING = 1;
const SOCKET_ID = "MaltCordStreamingStatus";
const DEFAULT_URL = "https://www.twitch.tv/discord";

const settings = definePluginSettings({
    activityName: {
        type: OptionType.STRING,
        description: "Name shown next to Streaming",
        default: "Streaming"
    },
    details: {
        type: OptionType.STRING,
        description: "Optional second line (leave empty for none)",
        default: ""
    },
    streamUrl: {
        type: OptionType.STRING,
        description: "Twitch or YouTube link Discord needs for the purple status",
        default: DEFAULT_URL
    }
});

let active = false;
let startedAt = 0;

/** True only while you are sharing your screen or a game in a voice call. */
function isStreamingInVoice() {
    return !!ApplicationStreamingStore?.getCurrentUserActiveStream() && !!SelectedChannelStore.getVoiceChannelId();
}

function validUrl(value: string) {
    try {
        const url = new URL(value.trim());
        const host = url.hostname.replace(/^www\./, "");
        return url.protocol === "https:" && ["twitch.tv", "youtube.com", "youtu.be"].includes(host) ? url.toString() : DEFAULT_URL;
    } catch {
        return DEFAULT_URL;
    }
}

function activity() {
    const details = String(settings.store.details ?? "").trim().slice(0, 128);
    return {
        // Same shape Discord's own custom activities use, so the gateway accepts it.
        application_id: "0",
        name: String(settings.store.activityName || "Streaming").trim().slice(0, 128),
        type: STREAMING,
        url: validUrl(String(settings.store.streamUrl ?? "")),
        flags: 1,
        timestamps: { start: startedAt },
        ...(details ? { details } : {})
    };
}

function dispatch(value: ReturnType<typeof activity> | null) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: value, socketId: SOCKET_ID });
}

function update() {
    const streaming = isStreamingInVoice();
    if (streaming === active) return;
    active = streaming;
    logger.info(streaming ? "Streaming in voice: showing the Streaming status." : "Stopped streaming: status restored.");
    if (streaming) startedAt = Date.now();
    dispatch(streaming ? activity() : null);
}

export default definePlugin({
    name: "StreamingStatus",
    description: "Shows your status as purple Streaming instead of the green online dot, only while you stream in a voice call.",
    authors: [Devs.Maltsoup],
    maltcordOrigin: true,
    tags: ["MaltCord", "Activity", "Voice"],
    settings,

    flux: {
        VOICE_CHANNEL_SELECT: update,
        STREAM_CREATE: update,
        STREAM_UPDATE: update,
        STREAM_CLOSE: update,
        STREAM_DELETE: update,
        RTC_CONNECTION_STATE: update
    },

    start() {
        ApplicationStreamingStore?.addChangeListener(update);
        update();
    },

    stop() {
        ApplicationStreamingStore?.removeChangeListener(update);
        if (active) dispatch(null);
        active = false;
    }
});
