/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition, type ProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { BADGES_FEED, fetchMaltcordJson } from "@shared/maltcordCloud";
import { Devs } from "@utils/constants";
import { copyWithToast, fetchUserProfile } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import { Button, React, RestAPI, TextInput, useEffect, UserProfileStore, UserStore, useState } from "@webpack/common";
import MaltLogo from "file://../../components/kittencord.png?base64";

import style from "./style.css?managed";

interface MaltBadge {
    id: string;
    userId: string;
    tooltip: string;
    icon: string;
}

interface BadgeRow { id: string; user_id: string; tooltip: string; icon: string; }
interface AnnouncementRow { id: string; title: string; body: string; url: string | null; published: boolean; created_at: string; }

// Desktop only: signs the owner in and changes rows in MaltCord's Supabase project.
const native = (VencordNative as any)?.pluginHelpers?.MaltCordBadges as PluginNative<typeof import("./native")> | undefined;

// Badges in the MaltCord Supabase table are shown to every MaltCord user. If it is unreachable, the file in the
// repository is used instead.
const REMOTE_FALLBACK_URL = "https://raw.githubusercontent.com/maltsoup/MaltCord/main/maltcord-badges.json";
const MAX_BADGES = 1000;
const ICON_SIZE = 64;

const logger = new Logger("MaltCordBadges");

// Other MaltCord users recognise a MaltCord user by this invisible marker in their profile pronouns.
const MARKER = "‌​‌";
const MAX_PRONOUNS = 40;
const MALT_ICON = `data:image/png;base64,${MaltLogo}`;

const settings = definePluginSettings({
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

let remoteBadges: MaltBadge[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

async function loadRemote() {
    try {
        const rows = await fetchMaltcordJson(BADGES_FEED);
        remoteBadges = sanitize(Array.isArray(rows) ? rows.map((r: any) => ({ id: r?.id, userId: r?.user_id, tooltip: r?.tooltip, icon: r?.icon })) : []);
    } catch {
        try {
            remoteBadges = sanitize(await fetchMaltcordJson(REMOTE_FALLBACK_URL));
        } catch {
            remoteBadges = [];
        }
    }
}

function badgesFor(userId: string): ProfileBadge[] {
    return [...userBadge(userId), ...remoteBadges
        .filter(b => b.userId === userId)
        .map(b => ({
            id: `maltcord_badge_${b.id}`,
            description: b.tooltip,
            iconSrc: b.icon,
            position: BadgePosition.START,
            props: { style: { borderRadius: "50%", transform: "scale(0.9)" } }
        }))];
}

/** Scales a picked image down to a small square PNG so it can be stored without hosting. */
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

/** Talks to the database through the signed-in session and turns failures into readable text. */
async function api<T>(method: "GET" | "POST" | "PATCH" | "DELETE", table: "badges" | "announcements", query = "", body?: unknown): Promise<T> {
    if (!native) throw new Error("The cloud admin is only available in MaltCord desktop.");
    const res = await native.request(method, table, query, body);
    if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("This account is not allowed to change MaltCord data. Sign in as the owner.");
        const detail = typeof res.data === "object" && res.data ? (res.data as any).message : res.data;
        throw new Error(String(detail ?? `Request failed (${res.status}).`));
    }
    return res.data as T;
}

function BadgesAdmin() {
    const [rows, setRows] = useState<BadgeRow[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [userId, setUserId] = useState("");
    const [tooltip, setTooltip] = useState("");
    const [icon, setIcon] = useState("");
    const [error, setError] = useState("");
    const fileInput = React.useRef<HTMLInputElement>(null);

    const load = () => api<BadgeRow[]>("GET", "badges", "select=*&order=created_at.desc").then(setRows).catch(e => setError(e.message));
    useEffect(() => { void load(); }, []);

    const reset = () => { setEditingId(null); setUserId(""); setTooltip(""); setIcon(""); setError(""); };

    const save = async () => {
        if (!/^\d{15,22}$/.test(userId.trim())) return setError("Enter a Discord user ID (numbers only).");
        if (!tooltip.trim()) return setError("Enter a badge name.");
        if (!safeIcon(icon.trim())) return setError("Pick an image, or paste an https:// image link.");
        const body = { user_id: userId.trim(), tooltip: tooltip.trim().slice(0, 80), icon: icon.trim() };
        try {
            if (editingId) await api("PATCH", "badges", `id=eq.${editingId}`, body);
            else await api("POST", "badges", "", body);
            reset();
            await load();
            void loadRemote();
        } catch (e) { setError((e as Error).message); }
    };

    const remove = async (id: string) => {
        try {
            await api("DELETE", "badges", `id=eq.${id}`);
            if (id === editingId) reset();
            await load();
            void loadRemote();
        } catch (e) { setError((e as Error).message); }
    };

    const pickFile = async (file?: File) => {
        if (!file) return;
        try { setIcon(await fileToIcon(file)); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Could not read that image."); }
    };

    const previewOk = safeIcon(icon.trim());
    const who = userName(userId.trim());

    return (
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
                            <TextInput placeholder="Icon link (https://…) or pick an image" value={icon.startsWith("data:") ? "Picked image" : icon} onChange={setIcon} disabled={icon.startsWith("data:")} />
                            <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => fileInput.current?.click()}>Pick image</Button>
                            {icon && <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => setIcon("")}>Clear</Button>}
                        </div>
                        <input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                    </div>
                </div>
                {error && <div className="kmb-error">{error}</div>}
                <div className="kmb-inline">
                    <Button size={Button.Sizes.SMALL} onClick={() => void save()}>{editingId ? "Save changes" : "Add badge"}</Button>
                    {(editingId || userId || tooltip || icon) && <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={reset}>{editingId ? "Cancel" : "Clear"}</Button>}
                </div>
            </section>

            <div className="kmb-card-title">Badges ({rows.length})</div>
            {rows.length === 0 && <div className="kmb-note">No badges yet.</div>}
            {rows.map(b => (
                <div className="kmb-row" data-editing={b.id === editingId || undefined} key={b.id}>
                    <img className="kmb-icon" src={b.icon} alt="" />
                    <span className="kmb-name">{b.tooltip}</span>
                    <span className="kmb-user">{userName(b.user_id) || b.user_id}</span>
                    <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => { setEditingId(b.id); setUserId(b.user_id); setTooltip(b.tooltip); setIcon(b.icon); setError(""); }}>Edit</Button>
                    <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => void remove(b.id)}>Remove</Button>
                </div>
            ))}
        </>
    );
}

function AnnouncementsAdmin() {
    const [rows, setRows] = useState<AnnouncementRow[]>([]);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [url, setUrl] = useState("");
    const [published, setPublished] = useState(true);
    const [error, setError] = useState("");

    const load = () => api<AnnouncementRow[]>("GET", "announcements", "select=*&order=created_at.desc&limit=50").then(setRows).catch(e => setError(e.message));
    useEffect(() => { void load(); }, []);

    const add = async () => {
        if (!title.trim()) return setError("Enter a title.");
        if (url.trim() && !/^https:\/\/[^\s]+$/i.test(url.trim())) return setError("The link must start with https://.");
        try {
            await api("POST", "announcements", "", { title: title.trim().slice(0, 120), body: body.trim().slice(0, 2000), url: url.trim() || null, published });
            setTitle(""); setBody(""); setUrl(""); setPublished(true); setError("");
            await load();
        } catch (e) { setError((e as Error).message); }
    };

    const change = async (run: () => Promise<unknown>) => {
        try { await run(); setError(""); await load(); } catch (e) { setError((e as Error).message); }
    };

    return (
        <>
            <section className="kmb-card">
                <div className="kmb-card-title">New announcement</div>
                <TextInput placeholder="Title" value={title} onChange={setTitle} />
                <textarea className="kmb-textarea" rows={4} placeholder="Message" value={body} onChange={e => setBody(e.target.value)} />
                <TextInput placeholder="Link (optional, https://…)" value={url} onChange={setUrl} />
                <label className="kmb-check"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} /> Publish right away</label>
                {error && <div className="kmb-error">{error}</div>}
                <div className="kmb-inline">
                    <Button size={Button.Sizes.SMALL} onClick={() => void add()}>{published ? "Publish announcement" : "Save as draft"}</Button>
                </div>
            </section>

            <div className="kmb-card-title">Announcements ({rows.length})</div>
            {rows.length === 0 && <div className="kmb-note">No announcements yet.</div>}
            {rows.map(a => (
                <div className="kmb-ann" key={a.id}>
                    <div className="kmb-ann-head">
                        <strong>{a.title}</strong>
                        <span className="kmb-user">{a.published ? "Published" : "Draft"} · {new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                    {a.body && <div className="kmb-note">{a.body.length > 160 ? `${a.body.slice(0, 160)}…` : a.body}</div>}
                    <div className="kmb-inline">
                        <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => void change(() => api("PATCH", "announcements", `id=eq.${a.id}`, { published: !a.published }))}>{a.published ? "Unpublish" : "Publish"}</Button>
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => void change(() => api("DELETE", "announcements", `id=eq.${a.id}`))}>Delete</Button>
                    </div>
                </div>
            ))}
        </>
    );
}

type AuthStatus = { signedIn: false; } | { signedIn: true; userId: string; name: string; isOwner: boolean; };

function CloudAdmin({ modalProps }: { modalProps: any; }) {
    const [auth, setAuth] = useState<AuthStatus | null>(null);
    const [tab, setTab] = useState<"badges" | "announcements">("badges");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const refreshAuth = async () => setAuth(await native?.status().catch(() => ({ signedIn: false as const })) ?? { signedIn: false });
    useEffect(() => { void refreshAuth(); }, []);

    const signIn = async () => {
        if (!native) return;
        setBusy(true);
        setError("");
        const result = await native.signIn().catch(e => ({ ok: false as const, error: String(e?.message ?? e) }));
        if (!result.ok) setError(result.error);
        await refreshAuth();
        setBusy(false);
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <span className="kmb-title">MaltCord cloud admin</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="kmb-content">
                {!native ? (
                    <div className="kmb-note">The cloud admin is only available in MaltCord desktop.</div>
                ) : auth === null ? (
                    <div className="kmb-note">Loading…</div>
                ) : !auth.signedIn ? (
                    <section className="kmb-card">
                        <div className="kmb-card-title">Sign in</div>
                        <div className="kmb-note">Sign in with Discord in your browser to manage badges and announcements. Only accounts listed as owners in your Supabase project can make changes.</div>
                        {error && <div className="kmb-error">{error}</div>}
                        <div className="kmb-inline">
                            <Button size={Button.Sizes.SMALL} disabled={busy} onClick={() => void signIn()}>{busy ? "Waiting for the browser…" : "Sign in with Discord"}</Button>
                        </div>
                    </section>
                ) : !auth.isOwner ? (
                    <section className="kmb-card">
                        <div className="kmb-card-title">Signed in as {auth.name}</div>
                        <div className="kmb-note">This account is not an owner yet. In Supabase, open the SQL Editor and run this once, then reopen this window:</div>
                        <code className="kmb-code">{`insert into public.owners (user_id) values ('${auth.userId}');`}</code>
                        <div className="kmb-inline">
                            <Button size={Button.Sizes.SMALL} onClick={() => copyWithToast(`insert into public.owners (user_id) values ('${auth.userId}');`, "SQL copied.")}>Copy SQL</Button>
                            <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => void refreshAuth()}>Check again</Button>
                            <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => void native.signOut().then(refreshAuth)}>Sign out</Button>
                        </div>
                    </section>
                ) : (
                    <>
                        <div className="kmb-inline kmb-bar">
                            <span className="kmb-note">Signed in as {auth.name}</span>
                            <Button size={Button.Sizes.SMALL} look={Button.Looks.LINK} onClick={() => void native.signOut().then(refreshAuth)}>Sign out</Button>
                        </div>
                        <div className="kmb-tabs" role="tablist">
                            <button role="tab" aria-selected={tab === "badges"} data-active={tab === "badges" || undefined} onClick={() => setTab("badges")}>Badges</button>
                            <button role="tab" aria-selected={tab === "announcements"} data-active={tab === "announcements" || undefined} onClick={() => setTab("announcements")}>Announcements</button>
                        </div>
                        {tab === "badges" ? <BadgesAdmin /> : <AnnouncementsAdmin />}
                    </>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function openAdmin() {
    openModal(props => (
        <ErrorBoundary>
            <CloudAdmin modalProps={props} />
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "MaltCordBadges",
    description: "Shows the MaltCord badge and custom badges on profiles, with a cloud admin for the MaltCord owner.",
    authors: [Devs.Maltsoup],
    maltcordOrigin: true,
    managedStyle: style,
    tags: ["MaltCord", "Customisation"],
    enabledByDefault: true,
    settings,

    settingsAboutComponent: () => <Button onClick={openAdmin}>Open cloud admin</Button>,

    toolboxActions: {
        "Open MaltCord cloud admin": openAdmin
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
