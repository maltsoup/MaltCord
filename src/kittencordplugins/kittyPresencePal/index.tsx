/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType, type PluginNative } from "@utils/types";
import { Button, FluxDispatcher, React, TextInput, useEffect, useMemo, useState } from "@webpack/common";

import style from "./style.css?managed";

interface DetectableGame {
    id: string;
    name: string;
    icon?: string;
    /** Windows executable name Discord's game scanner looks for. */
    exe?: string;
}

interface CustomGame {
    id: string;
    name: string;
    exe?: string;
}

interface DetectableApp {
    id?: string;
    name?: string;
    icon?: string;
    executables?: { name?: string; os?: string; is_launcher?: boolean; }[];
}

// Only present in the desktop build, where it runs a hidden process named after the game.
const native = (VencordNative as any)?.pluginHelpers?.KittyPresencePal as PluginNative<typeof import("./native")> | undefined;

const DETECTABLE_URL = "https://discord.com/api/v9/applications/detectable";
const SOCKET_ID = "KittyPresencePal";
const MAX_RECENTS = 8;

const settings = definePluginSettings({
    favorites: { type: OptionType.STRING, description: "Favorite game IDs (JSON)", default: "[]", hidden: true },
    recents: { type: OptionType.STRING, description: "Recent game IDs (JSON)", default: "[]", hidden: true },
    customGames: { type: OptionType.STRING, description: "Custom games (JSON)", default: "[]", hidden: true },
    lastGame: { type: OptionType.STRING, description: "Last played game ID", default: "", hidden: true },
    restoreOnStart: {
        type: OptionType.BOOLEAN,
        description: "Re-apply the last game automatically when Discord starts",
        default: false
    },
    showElapsed: {
        type: OptionType.BOOLEAN,
        description: "Show elapsed time on the activity",
        default: true
    }
});

function readJson<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}

let gameCache: DetectableGame[] | null = null;
let current: { id: string; name: string; start: number; } | null = null;

async function loadGames(): Promise<DetectableGame[]> {
    if (gameCache) return gameCache;
    const res = await fetch(DETECTABLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    gameCache = (data as DetectableApp[])
        .filter(g => g?.id && g?.name)
        .map(g => {
            const exes = (g.executables ?? []).filter(e => e.os === "win32" && e.name);
            const exe = (exes.find(e => !e.is_launcher) ?? exes[0])?.name;
            return { id: String(g.id), name: String(g.name), icon: g.icon, exe: exe?.replace(/^>/, "") };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    return gameCache;
}

function dispatchActivity(activity: any | null) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity, socketId: SOCKET_ID });
}

function pushRecent(id: string) {
    const recents = readJson<string[]>(settings.store.recents, []).filter(r => r !== id);
    recents.unshift(id);
    settings.store.recents = JSON.stringify(recents.slice(0, MAX_RECENTS));
}

/** Returns a message when the real-game route was unavailable and the fallback activity was used. */
async function playGame(game: { id: string; name: string; exe?: string; }): Promise<string | undefined> {
    let notice: string | undefined;
    dispatchActivity(null);
    current = { id: game.id, name: game.name, start: Date.now() };

    // Preferred: run a process named after the game so Discord detects it as a real game.
    const started = game.exe && native ? await native.startGame(game.exe).catch(() => null) : null;
    if (!started?.ok) {
        // Fallback: a client-side activity. It uses the application ID, so it only works for registered games.
        if (game.exe && native) notice = started?.error ?? "Real game detection failed, using a basic activity instead.";
        else if (game.exe) notice = "Real game detection needs the desktop app, using a basic activity instead.";
        dispatchActivity({
            application_id: game.id,
            name: game.name,
            type: 0,
            flags: 0,
            ...(settings.store.showElapsed ? { timestamps: { start: current.start } } : {})
        });
    }
    settings.store.lastGame = JSON.stringify(game);
    pushRecent(game.id);
    return notice;
}

function stopGame() {
    current = null;
    dispatchActivity(null);
    void native?.stopGame().catch(() => { });
}

function toggleFavorite(id: string) {
    const favs = readJson<string[]>(settings.store.favorites, []);
    settings.store.favorites = JSON.stringify(favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]);
}

function iconUrl(g: DetectableGame) {
    return g.icon ? `https://cdn.discordapp.com/app-icons/${g.id}/${g.icon}.png?size=64` : undefined;
}

function GameRow({ game, isFav, isPlaying, onPlay, onStop, onFav }: {
    game: DetectableGame;
    isFav: boolean;
    isPlaying: boolean;
    onPlay(): void;
    onStop(): void;
    onFav(): void;
}) {
    const icon = iconUrl(game);
    return (
        <div className="kpp-row">
            {icon ? <img className="kpp-icon" src={icon} alt="" /> : <div className="kpp-icon kpp-icon-empty" />}
            <span className="kpp-name">{game.name}</span>
            <button className="kpp-fav" onClick={onFav} title={isFav ? "Remove favorite" : "Add favorite"}>
                {isFav ? "★" : "☆"}
            </button>
            {isPlaying
                ? <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={onStop}>Stop</Button>
                : <Button size={Button.Sizes.SMALL} onClick={onPlay}>Play</Button>}
        </div>
    );
}

function PresencePalModal({ modalProps }: { modalProps: any; }) {
    const [games, setGames] = useState<DetectableGame[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [playingId, setPlayingId] = useState<string | null>(current?.id ?? null);
    const [customName, setCustomName] = useState("");
    const [customId, setCustomId] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [, force] = useState(0);
    const rerender = () => force(n => n + 1);

    useEffect(() => {
        loadGames().then(setGames).catch(e => setError(String(e?.message ?? e))).finally(() => setLoading(false));
    }, []);

    const custom = readJson<CustomGame[]>(settings.store.customGames, []);
    const favs = readJson<string[]>(settings.store.favorites, []);
    const recents = readJson<string[]>(settings.store.recents, []);

    const all = useMemo(() => [...custom, ...games], [games, custom.length]);
    const byId = useMemo(() => new Map(all.map(g => [g.id, g as DetectableGame])), [all]);

    const q = query.trim().toLowerCase();
    const results = q ? all.filter(g => g.name.toLowerCase().includes(q)).slice(0, 100) : [];
    const favGames = favs.map(id => byId.get(id)).filter(Boolean) as DetectableGame[];
    const recentGames = recents.map(id => byId.get(id)).filter(Boolean) as DetectableGame[];

    const render = (g: DetectableGame) => (
        <GameRow
            key={g.id}
            game={g}
            isFav={favs.includes(g.id)}
            isPlaying={playingId === g.id}
            onPlay={() => { setPlayingId(g.id); setNotice(null); void playGame(g).then(n => setNotice(n ?? null)); }}
            onStop={() => { stopGame(); setPlayingId(null); setNotice(null); }}
            onFav={() => { toggleFavorite(g.id); rerender(); }}
        />
    );

    const addCustom = () => {
        const name = customName.trim();
        // Either a Windows executable name (detected as a real game) or a Discord application ID
        const value = customId.trim();
        const isAppId = /^\d{15,22}$/.test(value);
        if (!name || !(isAppId || /^[^\s].*\.exe$/i.test(value))) return;
        const entry: CustomGame = isAppId ? { id: value, name } : { id: `custom:${value.toLowerCase()}`, name, exe: value };
        settings.store.customGames = JSON.stringify([...custom.filter(c => c.id !== entry.id), entry]);
        setCustomName("");
        setCustomId("");
        rerender();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <span className="kpp-title">PresencePal</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="kpp-content">
                {current && (
                    <div className="kpp-now">
                        Playing <b>{current.name}</b>
                        <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={() => { stopGame(); setPlayingId(null); }}>Stop</Button>
                    </div>
                )}

                <TextInput placeholder={loading ? "Loading games…" : `Search ${games.length} games`} value={query} onChange={setQuery} autoFocus />
                {notice && <div className="kpp-error">{notice}</div>}
                {error && <div className="kpp-error">Couldn't load the game list: {error}</div>}

                {q ? (
                    <>
                        <div className="kpp-section">Results</div>
                        {results.length ? results.map(render) : <div className="kpp-empty">No matches</div>}
                    </>
                ) : (
                    <>
                        {favGames.length > 0 && <><div className="kpp-section">Favorites</div>{favGames.map(render)}</>}
                        {recentGames.length > 0 && <><div className="kpp-section">Recently played</div>{recentGames.map(render)}</>}
                        {!favGames.length && !recentGames.length && !loading && <div className="kpp-empty">Search for a game to get started.</div>}
                    </>
                )}

                <div className="kpp-section">Add custom game</div>
                <div className="kpp-custom">
                    <TextInput placeholder="Name" value={customName} onChange={setCustomName} />
                    <TextInput placeholder="Executable (game.exe) or app ID" value={customId} onChange={setCustomId} />
                    <Button size={Button.Sizes.SMALL} onClick={addCustom}>Add</Button>
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

function openPresencePal() {
    openModal(props => (
        <ErrorBoundary>
            <PresencePalModal modalProps={props} />
        </ErrorBoundary>
    ));
}

export default definePlugin({
    name: "KittyPresencePal",
    description: "Set your Discord game activity for any game, including mobile titles Discord can't detect. Port of PresencePal.",
    authors: [Devs.Maltsoup],
    maltcordOrigin: true,
    managedStyle: style,
    tags: ["MaltCord", "Activity", "Utility"],
    settings,

    settingsAboutComponent: () => (
        <Button onClick={openPresencePal}>Open PresencePal</Button>
    ),

    toolboxActions: {
        "Open PresencePal": openPresencePal,
        "Stop PresencePal activity": stopGame
    },

    start() {
        if (!settings.store.restoreOnStart) return;
        const last = readJson<{ id: string; name: string; exe?: string; } | null>(settings.store.lastGame || "null", null);
        if (last?.id) setTimeout(() => void playGame(last), 3000);
    },

    stop() {
        stopGame();
    }
});
