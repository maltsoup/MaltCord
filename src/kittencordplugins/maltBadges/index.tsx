/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition, type ProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { copyWithToast, fetchUserProfile } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React, RestAPI, TextInput, UserProfileStore, UserStore, useState } from "@webpack/common";
import MaltLogo from "file://../../components/kittencord.png?base64";

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
const ICON_SIZE = 64;

const logger = new Logger("MaltCordBadges");

// Other MaltCord users recognise a MaltCord user by this invisible marker in their profile pronouns.
const MARKER = "‌​‌";
const MAX_PRONOUNS = 40;
const MALT_ICON = `data:image/png;base64,${MaltLogo}`;

const settings = definePluginSettings({
    badges: { type: OptionType.STRING, description: "Local badges (JSON)", default: "[]", hidden: true },
    showMyBadge: {
        type: OptionType.BOOLEAN,
        description: "Show the MaltCord badge on my profile. Other MaltCord users can see it. This keeps an invisible mark in your Discord profile pronouns, and turning this off removes it.",
        default: true,
        onChange: () => void syncMarker()
    }
});

function hasMarker(userId: string) {
    return !!UserProfileStore.getUserProfile(userId)?.pronouns?.includes(MARKER);
}

/** Adds or removes the invisible marker in the user's own pronouns so the badge matches the setting. */
async function syncMarker(forceRemove = false) {
    try {
        const me = UserStore.getCurrentUser()?.id;
        if (!me) return;
        if (UserProfileStore.getUserProfile(me) == null) await fetchUserProfile(me);
        const profile = UserProfileStore.getUserProfile(me);
        if (!profile) return; // Never overwrite pronouns that could not be read.

        const current = profile.pronouns ?? "";
        const want = !forceRemove && settings.store.showMyBadge;
        const has = current.includes(MARKER);
        if (want === has) return;

        const next = want ? current + MARKER : current.split(MARKER).join("");
        if (next.length > MAX_PRONOUNS) return logger.warn("Pronouns are too long to hold the MaltCord marker.");
        await RestAPI.patch({ url: "/users/@me/profile", body: { pronouns: next } });
    } catch (e) {
        logger.warn("Could not update the MaltCord badge marker.", e);
    }
}

function userBadge(userId: string): ProfileBadge[] {
    const mine = userId === UserStore.getCurrentUser()?.id;
    if (!(mine ? settings.store.showMyBadge : hasMarker(userId))) return [];
    return [{
        id: "maltcord_user",
        description: "MaltCord User",
        iconSrc: MALT_ICON,
        position: BadgePosition.START,
        props: { style: { borderRadius: "50%", transform: "scale(0.9)" } }
    }];
}

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
    return [...userBadge(userId), ...[...local, ...remoteBadges.filter(b => !localIds.has(b.id))]
        .filter(b => b.userId === userId)
        .map(b => ({
            id: `maltcord_badge_${b.id}`,
            description: b.tooltip,
            iconSrc: b.icon,
            position: BadgePosition.START,
            props: { style: { borderRadius: "50%", transform: "scale(0.9)" } }
        }))];
}

/** Scales a picked image down to a small square PNG so it can be stored and published without hosting. */
async function fileToIcon(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read the image.");
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
    bitmap.close();
    return canvas.toDataURL("image/png");
}

const userName = (id: string) => {
    const user = /^\d{15,22}$/.test(id) ? UserStore.getUser(id) : undefined;
    return user ? user.globalName || user.username : "";
};

function BadgeEditor({ modalProps }: { modalProps: any; }) {
    const [badges, setBadges] = useState<MaltBadge[]>(localBadges);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [userId, setUserId] = useState("");
    const [tooltip, setTooltip] = useState("");
    const [icon, setIcon] = useState("");
    const [error, setError] = useState("");
    const [importing, setImporting] = useState(false);
    const [importText, setImportText] = useState("");
    const fileInput = React.useRef<HTMLInputElement>(null);

    const update = (next: MaltBadge[]) => { setBadges(next); saveLocal(next); };

    const reset = () => { setEditingId(null); setUserId(""); setTooltip(""); setIcon(""); setError(""); };

    const startEdit = (b: MaltBadge) => {
        setEditingId(b.id);
        setUserId(b.userId);
        setTooltip(b.tooltip);
        setIcon(b.icon);
        setError("");
    };

    const save = () => {
        if (!/^\d{15,22}$/.test(userId.trim())) return setError("Enter a Discord user ID (numbers only).");
        if (!tooltip.trim()) return setError("Enter a badge name.");
        if (!safeIcon(icon.trim())) return setError("Pick an image, or paste an https:// image link.");
        const entry: MaltBadge = { id: editingId ?? crypto.randomUUID().slice(0, 8), userId: userId.trim(), tooltip: tooltip.trim().slice(0, 80), icon: icon.trim() };
        if (editingId) update(badges.map(b => b.id === editingId ? entry : b));
        else if (badges.length >= MAX_BADGES) return setError(`At most ${MAX_BADGES} badges.`);
        else update([...badges, entry]);
        reset();
    };

    const pickFile = async (file?: File) => {
        if (!file) return;
        try {
            setIcon(await fileToIcon(file));
            setError("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not read that image.");
        }
    };

    const runImport = () => {
        try {
            const incoming = sanitize(JSON.parse(importText));
            if (!incoming.length) return setError("No valid badges found in that JSON.");
            const ids = new Set(incoming.map(b => b.id));
            update([...badges.filter(b => !ids.has(b.id)), ...incoming].slice(0, MAX_BADGES));
            setImporting(false);
            setImportText("");
            setError("");
        } catch {
            setError("That is not valid JSON.");
        }
    };

    const previewOk = safeIcon(icon.trim());
    const who = userName(userId.trim());

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
                        <section className="kmb-card">
                            <div className="kmb-card-title">{editingId ? "Edit badge" : "New badge"}</div>
                            <div className="kmb-preview-row">
                                <div className="kmb-preview" title="Preview">
                                    {previewOk ? <img src={icon.trim()} alt="" /> : <span>?</span>}
                                </div>
                                <div className="kmb-fields">
                                    <TextInput placeholder="Badge name (shown on hover)" value={tooltip} onChange={setTooltip} />
                                    <div className="kmb-inline">
                                        <TextInput placeholder="User ID" value={userId} onChange={setUserId} />
                                        <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => setUserId(UserStore.getCurrentUser().id)}>Use my ID</Button>
                                    </div>
                                    {who && <div className="kmb-note">User: {who}</div>}
                                    <div className="kmb-inline">
                                        <TextInput placeholder="Icon link (https://â€¦) or pick an image" value={icon.startsWith("data:") ? "Picked image" : icon} onChange={setIcon} disabled={icon.startsWith("data:")} />
                                        <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => fileInput.current?.click()}>Pick image</Button>
                                        {icon && <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => setIcon("")}>Clear</Button>}
                                    </div>
                                    <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                                </div>
                            </div>
                            {error && <div className="kmb-error">{error}</div>}
                            <div className="kmb-inline">
                                <Button size={Button.Sizes.SMALL} onClick={save}>{editingId ? "Save changes" : "Add badge"}</Button>
                                {(editingId || userId || tooltip || icon) && <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={reset}>{editingId ? "Cancel" : "Clear"}</Button>}
                            </div>
                        </section>

                        <div className="kmb-card-title">Your badges ({badges.length})</div>
                        {badges.length === 0 && <div className="kmb-note">No badges yet. Add one above.</div>}
                        {badges.map(b => (
                            <div className="kmb-row" data-editing={b.id === editingId || undefined} key={b.id}>
                                <img className="kmb-icon" src={b.icon} alt="" />
                                <span className="kmb-name">{b.tooltip}</span>
                                <span className="kmb-user">{userName(b.userId) || b.userId}</span>
                                <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => startEdit(b)}>Edit</Button>
                                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => { update(badges.filter(x => x.id !== b.id)); if (b.id === editingId) reset(); }}>Remove</Button>
                            </div>
                        ))}

                        <section className="kmb-card">
                            <div className="kmb-card-title">Publish to everyone</div>
                            <div className="kmb-note">
                                Your badges show on your own client right away. To show them to every MaltCord user, copy the JSON and save it
                                as <code>maltcord-badges.json</code> in the MaltCord repository.
                            </div>
                            <div className="kmb-inline">
                                <Button size={Button.Sizes.SMALL} disabled={!badges.length} onClick={() => copyWithToast(JSON.stringify(badges, null, 2), "Badge JSON copied.")}>Copy JSON</Button>
                                <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => setImporting(v => !v)}>{importing ? "Cancel import" : "Import JSON"}</Button>
                            </div>
                            {importing && (
                                <>
                                    <textarea className="kmb-textarea" rows={6} placeholder="Paste badge JSON here" value={importText} onChange={e => setImportText(e.target.value)} />
                                    <Button size={Button.Sizes.SMALL} onClick={runImport}>Import</Button>
                                </>
                            )}
                        </section>
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
    maltcordOrigin: true,
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

    flux: {
        CONNECTION_OPEN() {
            setTimeout(() => void syncMarker(), 8000);
        }
    },

    start() {
        void loadRemote();
        timer = setInterval(() => void loadRemote(), 30 * 60 * 1000);
        setTimeout(() => void syncMarker(), 8000);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = undefined;
        remoteBadges = [];
        // Turning the plugin off also takes the invisible mark out of your pronouns.
        void syncMarker(true);
    }
});
