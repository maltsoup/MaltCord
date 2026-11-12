/*
 * MaltCord plugin: PresencePal (port)
 * Based on the idea of https://github.com/foxmanhwa/presencepal (MIT)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import style from "./style.css?managed";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Button, FluxDispatcher, React, TextInput, useEffect, useMemo, useState } from "@webpack/common";

interface DetectableGame {
    id: string;
    name: string;
    icon?: string;
}

interface CustomGame {
    id: string;
    name: string;
}

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
    gameCache = (data as any[])
        .filter(g => g?.id && g?.name)
        .map(g => ({ id: String(g.id), name: String(g.name), icon: g.icon }))
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

function playGame(game: { id: string; name: string; }) {
    current = { id: game.id, name: game.name, start: Date.now() };
    dispatchActivity({
        application_id: game.id,
        name: game.name,
        type: 0,
        flags: 0,
        ...(settings.store.showElapsed ? { timestamps: { start: current.start } } : {})
    });
    settings.store.lastGame = JSON.stringify(game);
    pushRecent(game.id);
}

function stopGame() {
    current = null;
    dispatchActivity(null);
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
            onPlay={() => { playGame(g); setPlayingId(g.id); }}
            onStop={() => { stopGame(); setPlayingId(null); }}
            onFav={() => { toggleFavorite(g.id); rerender(); }}
        />
    );

    const addCustom = () => {
        const name = customName.trim();
        // A custom game needs a real Discord application ID to be recognised
        const id = customId.trim();
        if (!name || !/^\d{15,22}$/.test(id)) return;
        settings.store.customGames = JSON.stringify([...custom.filter(c => c.id !== id), { id, name }]);
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
                    <TextInput placeholder="Discord application ID" value={customId} onChange={setCustomId} />
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
    authors: [Devs.Kittencord],
    kittencordOrigin: "original",
    managedStyle: style,
    tags: ["Activity", "Utility"],
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
        const last = readJson<{ id: string; name: string; } | null>(settings.store.lastGame || "null", null);
        if (last?.id) setTimeout(() => playGame(last), 3000);
    },

    stop() {
        stopGame();
    }
});
