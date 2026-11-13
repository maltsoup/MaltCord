/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { ANNOUNCEMENTS_FEED, fetchMaltcordJson } from "@shared/maltcordCloud";
import { Devs } from "@utils/constants";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React } from "@webpack/common";

import style from "./style.css?managed";

interface Announcement {
    id: string;
    title: string;
    body: string;
    url?: string;
    date?: string;
}

// The feed is a JSON list of announcements: an id, title, body and optionally a url and a date.
// MaltCord reads them from its Supabase table, and falls back to the file in the repository if that is unreachable.
const DEFAULT_FEED = ANNOUNCEMENTS_FEED;
const FALLBACK_FEED = "https://raw.githubusercontent.com/maltsoup/MaltCord/main/maltcord-announcements.json";
const MAX_ITEMS = 50;
const REFRESH_MS = 15 * 60 * 1000;

const settings = definePluginSettings({
    feedUrl: {
        type: OptionType.STRING,
        description: "Announcements feed link (JSON, https)",
        default: DEFAULT_FEED
    },
    showPopups: {
        type: OptionType.BOOLEAN,
        description: "Show a notification when a new announcement arrives",
        default: true
    },
    readIds: { type: OptionType.STRING, description: "Read announcements (JSON)", default: "[]", hidden: true },
    notifiedIds: { type: OptionType.STRING, description: "Announcements already announced (JSON)", default: "[]", hidden: true }
});

let items: Announcement[] = [];
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

const readSet = (key: "readIds" | "notifiedIds") => {
    try { return new Set<string>(JSON.parse(settings.store[key])); } catch { return new Set<string>(); }
};
const saveSet = (key: "readIds" | "notifiedIds", set: Set<string>) => {
    settings.store[key] = JSON.stringify([...set].slice(-200));
};

function clean(raw: unknown): Announcement[] {
    if (!Array.isArray(raw)) return [];
    const out: Announcement[] = [];
    for (const row of raw) {
        const id = String(row?.id ?? "").slice(0, 64);
        const title = typeof row?.title === "string" ? row.title.trim().slice(0, 120) : "";
        const body = typeof row?.body === "string" ? row.body.trim().slice(0, 2000) : "";
        if (!id || !title) continue;
        const url = typeof row?.url === "string" && /^https:\/\/[^\s]+$/i.test(row.url) ? row.url : undefined;
        const date = typeof row?.date === "string" ? row.date : typeof row?.created_at === "string" ? row.created_at : undefined;
        out.push({ id, title, body, url, date });
    }
    return out
        .sort((a, b) => (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0))
        .slice(0, MAX_ITEMS);
}

async function refresh() {
    const url = String(settings.store.feedUrl || DEFAULT_FEED).trim();
    if (!/^https:\/\//i.test(url)) return;
    try {
        let data: unknown;
        try {
            data = await fetchMaltcordJson(url);
        } catch (e) {
            if (url !== DEFAULT_FEED) throw e;
            data = await fetchMaltcordJson(FALLBACK_FEED);
        }
        items = clean(data);
        emit();

        if (!settings.store.showPopups) return;
        const read = readSet("readIds");
        const notified = readSet("notifiedIds");
        const first = notified.size === 0 && read.size === 0;
        for (const item of items) {
            if (read.has(item.id) || notified.has(item.id)) continue;
            notified.add(item.id);
            // On the very first run only mark old items as seen, so a new user is not flooded.
            if (!first) showNotification({ title: item.title, body: item.body.slice(0, 200), onClick: openAnnouncements });
        }
        saveSet("notifiedIds", notified);
    } catch {
        // Offline or the feed is missing: keep what we have.
    }
}

function useAnnouncements() {
    const [, force] = React.useState(0);
    React.useEffect(() => {
        const l = () => force(n => n + 1);
        listeners.add(l);
        return () => { listeners.delete(l); };
    }, []);
    const read = readSet("readIds");
    return { items, unread: items.filter(i => !read.has(i.id)).length, isRead: (id: string) => read.has(id) };
}

function markRead(ids: string[]) {
    const read = readSet("readIds");
    ids.forEach(id => read.add(id));
    saveSet("readIds", read);
    emit();
}

function BellIcon({ width = 20, height = 20, dot = false, className }: { width?: number; height?: number; dot?: boolean; className?: string; }) {
    return (
        <svg className={className} aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24" fill="none">
            <path fill="currentColor" d="M12 2a6 6 0 0 0-6 6v3.6c0 .5-.2 1-.5 1.4L3.9 15c-.6.8 0 2 1 2h14.2c1 0 1.6-1.2 1-2l-1.6-2c-.3-.4-.5-.9-.5-1.4V8a6 6 0 0 0-6-6Zm-2.8 17a2.8 2.8 0 0 0 5.6 0H9.2Z" />
            {dot && <circle cx="19" cy="5" r="3.2" fill="#f23f43" />}
        </svg>
    );
}

function AnnouncementsModal({ modalProps }: { modalProps: any; }) {
    const { items: list, isRead } = useAnnouncements();
    // Reading the list marks everything as read once it is closed, so the unread marks stay visible while it is open.
    React.useEffect(() => () => markRead(items.map(i => i.id)), []);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <span className="kma-title">MaltCord announcements</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="kma-content">
                {list.length === 0 && <div className="kma-empty">No announcements yet.</div>}
                {list.map(item => (
                    <article className="kma-item" data-unread={!isRead(item.id) || undefined} key={item.id}>
                        <div className="kma-item-head">
                            <strong>{item.title}</strong>
                            {item.date && <time>{new Date(item.date).toLocaleDateString()}</time>}
                        </div>
                        {item.body && <p>{item.body}</p>}
                        {item.url && <Button size={Button.Sizes.SMALL} onClick={() => VencordNative.native.openExternal(item.url!)}>Read more</Button>}
                    </article>
                ))}
            </ModalContent>
        </ModalRoot>
    );
}

function openAnnouncements() {
    openModal(props => (
        <ErrorBoundary>
            <AnnouncementsModal modalProps={props} />
        </ErrorBoundary>
    ));
}

function AnnouncementsButton() {
    const { unread } = useAnnouncements();
    return (
        <HeaderBarButton
            icon={() => <BellIcon dot={unread > 0} />}
            tooltip={unread > 0 ? `MaltCord announcements (${unread} new)` : "MaltCord announcements"}
            onClick={openAnnouncements}
        />
    );
}

const AnnouncementsButtonWithBoundary = ErrorBoundary.wrap(AnnouncementsButton, { noop: true });

export default definePlugin({
    name: "MaltCordAnnouncements",
    description: "Shows MaltCord announcements from a bell in the top bar, with a notification when a new one arrives.",
    authors: [Devs.Maltsoup],
    maltcordOrigin: true,
    managedStyle: style,
    tags: ["MaltCord", "Notifications"],
    dependencies: ["HeaderBarAPI"],
    enabledByDefault: true,
    settings,

    headerBarButton: {
        icon: BellIcon,
        render: () => <AnnouncementsButtonWithBoundary />,
        priority: 8
    },

    toolboxActions: {
        "Open MaltCord announcements": openAnnouncements,
        "Check for announcements": () => void refresh()
    },

    start() {
        void refresh();
        timer = setInterval(() => void refresh(), REFRESH_MS);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = undefined;
        items = [];
    }
});
