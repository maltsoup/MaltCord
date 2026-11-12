/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { KittycordCloudNotifications as cloud, useCloudNotifications } from "@api/KittycordCloudNotifications";
import { KittycordDiagnostics } from "@api/KittycordDiagnostics";
import { UserAreaButton } from "@api/UserArea";
import ErrorBoundary from "@components/ErrorBoundary";
import { NotificationsIcon } from "@components/Icons";
import { openSettingsTabModal } from "@components/settings/tabs/BaseTab";
import { KittenReleaseNotes } from "@components/settings/tabs/KittenReleaseNotes";
import Notifications from "@components/settings/tabs/kittycordNotifications";
import { Devs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import { React } from "@webpack/common";

let timer: ReturnType<typeof setInterval> | undefined, healthy: ReturnType<typeof setTimeout> | undefined;
const logger = new Logger("MaltCord Cloud");
let stopDiagnostics: (() => void) | undefined;
function Bell() {
    const { feed } = useCloudNotifications();
    if (!cloud.enabled || !cloud.supported) return null;
    const count = feed.unreadCount ?? feed.items.filter(item => !item.read).length;
    return <UserAreaButton aria-label={`MaltCord notifications, ${count} unread in the loaded list`} tooltipText="MaltCord notifications" onClick={() => openSettingsTabModal(Notifications)} icon={<span className="kc-cloud-bell"><NotificationsIcon />{count > 0 && <span className="kc-cloud-unread-count">{count > 9 ? "9+" : count}</span>}</span>} />;
}
export default definePlugin({
    name: "KittycordCloud",
    kittencordOrigin: "original",
    description: "MaltCord announcements and release history.",
    authors: [Devs.Kittencord],
    required: true,
    userAreaButton: { icon: NotificationsIcon, render: () => <ErrorBoundary noop><Bell /></ErrorBoundary> },
    start() {
        stopDiagnostics = KittycordDiagnostics.start();
        if (cloud.enabled && cloud.supported) { void cloud.refresh(); timer = setInterval(() => void cloud.refresh(), 300000); }
        healthy = setTimeout(() => {
            void DataStore.get<string>("kittencord.lastHealthyVersion").then(async previous => {
                if (previous === VERSION) return;
                if (previous) openSettingsTabModal(KittenReleaseNotes);
                await DataStore.set("kittencord.lastHealthyVersion", VERSION);
            }).catch(error => logger.warn("Release history could not be saved.", error));
        }, 30000);
    },
    stop() { clearInterval(timer); clearTimeout(healthy); stopDiagnostics?.(); cloud.clear(); }
});
