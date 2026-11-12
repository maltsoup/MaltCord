/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition, type ProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Button, TextInput, UserStore, useState } from "@webpack/common";

import style from "./style.css?managed";

interface MaltBadge {
    id: string;
    userId: string;
    tooltip: string;
    icon: string;
}

// Badges listed in this file are shown to every MaltCord user. The editor below
// produces the JSON for it; commit it to the repository to publish.
const REMOTE_URL = "https://raw.githubusercontent.com/maltsoup/MaltCord/main/maltcord-badges.json";
const OWNER_ID = String(Devs.Maltsoup.id);
const MAX_BADGES = 200;

const settings = definePluginSettings({
    badges: { type: OptionType.STRING, description: "Local badges (JSON)", default: "[]", hidden: true }
});

let remoteBadges: MaltBadge[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

const isOwner = () => UserStore.getCurrentUser()?.id === OWNER_ID;

function safeIcon(url: unknown): url is string {
    return typeof url === "string" && url.length <= 200_000
        && (/^https:\/\/[^\s]+$/i.test(url) || /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(url));
}

function sanitize(raw: unknown): MaltBadge[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((b): b is MaltBadge => /^\d{15,22}$/.test(String(b?.userId)) && typeof b?.tooltip === "string" && safeIcon(b?.icon))
        .slice(0, MAX_BADGES)
        .map((b, i) => ({
            id: typeof b.id === "string" && b.id ? b.id.slice(0, 64) : `badge-${i}`,
            userId: String(b.userId),
            tooltip: b.tooltip.slice(0, 80),
            icon: b.icon
        }));
}

function localBadges(): MaltBadge[] {
    try { return sanitize(JSON.parse(settings.store.badges)); } catch { return []; }
}

function saveLocal(badges: MaltBadge[]) {
    settings.store.badges = JSON.stringify(sanitize(badges));
}

async function loadRemote() {
    try {
        const res = await fetch(REMOTE_URL, { cache: "no-cache" });
        remoteBadges = res.ok ? sanitize(await res.json()) : [];
    } catch {
        remoteBadges = [];
    }
}

function badgesFor(userId: string): ProfileBadge[] {
    const local = localBadges();
    const localIds = new Set(local.map(b => b.id));
    return [...local, ...remoteBadges.filter(b => !localIds.has(b.id))]
        .filter(b => b.userId === userId)
        .map(b => ({
            id: `maltcord_badge_${b.id}`,
            description: b.tooltip,
            iconSrc: b.icon,
            position: BadgePosition.START,
            props: { style: { borderRadius: "50%", transform: "scale(0.9)" } }
        }));
}

function BadgeEditor({ modalProps }: { modalProps: any; }) {
    const [badges, setBadges] = useState<MaltBadge[]>(localBadges);
    const [userId, setUserId] = useState("");
    const [tooltip, setTooltip] = useState("");
    const [icon, setIcon] = useState("");
    const [error, setError] = useState("");

    const update = (next: MaltBadge[]) => { setBadges(next); saveLocal(next); };

    const add = () => {
        if (!/^\d{15,22}$/.test(userId.trim())) return setError("Enter a Discord user ID (numbers only).");
        if (!tooltip.trim()) return setError("Enter a badge name.");
        if (!safeIcon(icon.trim())) return setError("The icon must be an https:// image link or a PNG, JPEG, GIF or WebP data URL.");
        if (badges.length >= MAX_BADGES) return setError(`At most ${MAX_BADGES} badges.`);
        setError("");
        update([...badges, { id: crypto.randomUUID().slice(0, 8), userId: userId.trim(), tooltip: tooltip.trim().slice(0, 80), icon: icon.trim() }]);
        setTooltip("");
        setIcon("");
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <span className="kmb-title">MaltCord badge editor</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="kmb-content">
                {!isOwner() ? (
                    <div className="kmb-note">The badge editor is only available to the MaltCord owner.</div>
                ) : (
                    <>
                        <div className="kmb-note">
                            Badges you add show on your own client right away. To show them to every MaltCord user, copy the JSON
                            and save it as <code>maltcord-badges.json</code> in the MaltCord repository.
                        </div>
                        <div className="kmb-form">
                            <TextInput placeholder="User ID" value={userId} onChange={setUserId} />
                            <TextInput placeholder="Badge name" value={tooltip} onChange={setTooltip} />
                            <TextInput placeholder="Icon link (https://…)" value={icon} onChange={setIcon} />
                            <Button size={Button.Sizes.SMALL} onClick={add}>Add badge</Button>
                        </div>
                        {error && <div className="kmb-error">{error}</div>}
                        {badges.length === 0 && <div className="kmb-note">No badges yet.</div>}
                        {badges.map(b => (
                            <div className="kmb-row" key={b.id}>
                                <img className="kmb-icon" src={b.icon} alt="" />
                                <span className="kmb-name">{b.tooltip}</span>
                                <code className="kmb-user">{b.userId}</code>
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => update(badges.filter(x => x.id !== b.id))}>Remove</Button>
                            </div>
                        ))}
                        {badges.length > 0 && (
                            <Button size={Button.Sizes.SMALL} onClick={() => copyWithToast(JSON.stringify(badges, null, 2), "Badge JSON copied.")}>
                                Copy JSON to publish
                            </Button>
                        )}
                    </>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function openEditor() {
    openModal(props => (
        <ErrorBoundary>
            <BadgeEditor modalProps={props} />
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "MaltCordBadges",
    description: "Custom MaltCord profile badges, with an owner-only badge editor.",
    authors: [Devs.Maltsoup],
    kittencordOrigin: "original",
    managedStyle: style,
    tags: ["MaltCord", "Customisation"],
    enabledByDefault: true,
    settings,

    settingsAboutComponent: () => <Button onClick={openEditor}>Open badge editor</Button>,

    toolboxActions: {
        "Open MaltCord badge editor": openEditor
    },

    userProfileBadges: [{
        id: "maltcord_badges",
        position: BadgePosition.START,
        getBadges: ({ userId }) => badgesFor(userId)
    }],

    start() {
        void loadRemote();
        timer = setInterval(() => void loadRemote(), 30 * 60 * 1000);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = undefined;
        remoteBadges = [];
    }
});
