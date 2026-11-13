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
import { Button, React, TextInput, useEffect, useMemo, useState } from "@webpack/common";

import style from "./style.css?managed";

interface Game {
    id: string;
    name: string;
    icon?: string;
    /** Windows executable name Discord's game scanner looks for. */
    exe: string;
}

interface DetectableApp {
    id?: string;
    name?: string;
    icon?: string;
    executables?: { name?: string; os?: string; is_launcher?: boolean; }[];
}

const native = VencordNative.pluginHelpers.PresencePal as PluginNative<typeof import("./native")>;

const DETECTABLE_URL = "https://discord.com/api/v9/applications/detectable";
const MAX_RECENTS = 8;

const settings = definePluginSettings({
    favorites: { type: OptionType.STRING, description: "Favorite game IDs (JSON)", default: "[]", hidden: true },
    recents: { type: OptionType.STRING, description: "Recent game IDs (JSON)", default: "[]", hidden: true },
    customGames: { type: OptionType.STRING, description: "Custom games (JSON)", default: "[]", hidden: true },
    startMinimized: {
        type: OptionType.BOOLEAN,
        description: "Start the game window minimized",
        default: false
    }
});

function readJson<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// Prefer the real game over launchers, crash handlers and installers, then the shortest name.
const NOT_THE_GAME = /launcher|crash|helper|redist|uninstall/i;
function pickBestExe(exes: NonNullable<DetectableApp["executables"]>): string | undefined {
    const windows = exes.filter(e => e.os === "win32" && e.name);
    const base = (name: string) => name.split("/").pop() ?? name;
    const real = windows.filter(e => !e.is_launcher && !NOT_THE_GAME.test(base(e.name!)));
    const pool = real.length ? real : windows.filter(e => !e.is_launcher).length ? windows.filter(e => !e.is_launcher) : windows;
    return pool.sort((a, b) => base(a.name!).length - base(b.name!).length)[0]?.name?.replace(/^>/, "");
}

let gameCache: Game[] | null = null;

async function loadGames(): Promise<Game[]> {
    if (gameCache) return gameCache;
    const res = await fetch(DETECTABLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as DetectableApp[];
    gameCache = data
        .filter(g => g?.id && g?.name)
        .flatMap(g => {
            const exe = pickBestExe(g.executables ?? []);
            return exe ? [{ id: String(g.id), name: String(g.name), icon: g.icon, exe }] : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    return gameCache;
}

function pushRecent(id: string) {
    const recents = readJson<string[]>(settings.store.recents, []).filter(r => r !== id);
    recents.unshift(id);
    settings.store.recents = JSON.stringify(recents.slice(0, MAX_RECENTS));
}

function toggleFavorite(id: string) {
    const favs = readJson<string[]>(settings.store.favorites, []);
    settings.store.favorites = JSON.stringify(favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]);
}

const iconUrl = (g: Game) => g.icon ? `https://cdn.discordapp.com/app-icons/${g.id}/${g.icon}.png?size=64` : undefined;

function GameRow({ game, isFav, isPlaying, onPlay, onStop, onFav }: {
    game: Game;
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
    const [games, setGames] = useState<Game[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [playing, setPlaying] = useState<string[]>([]);
    const [customName, setCustomName] = useState("");
    const [customExe, setCustomExe] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const [, force] = useState(0);
    const rerender = () => force(n => n + 1);

    const refreshRunning = () => native.running().then(setPlaying).catch(() => { });

    useEffect(() => {
        loadGames().then(setGames).catch(e => setError(String(e?.message ?? e))).finally(() => setLoading(false));
        void refreshRunning();
        // A game window can be closed from the taskbar, so keep the list honest.
        const timer = setInterval(() => void refreshRunning(), 2000);
        return () => clearInterval(timer);
    }, []);

    const custom = readJson<Game[]>(settings.store.customGames, []);
    const favs = readJson<string[]>(settings.store.favorites, []);
    const recents = readJson<string[]>(settings.store.recents, []);

    const all = useMemo(() => [...custom, ...games], [games, custom.length]);
    const byId = useMemo(() => new Map(all.map(g => [g.id, g])), [all]);

    const q = query.trim().toLowerCase();
    const results = q ? all.filter(g => g.name.toLowerCase().includes(q)).slice(0, 100) : [];
    const favGames = favs.map(id => byId.get(id)).filter(Boolean) as Game[];
    const recentGames = recents.map(id => byId.get(id)).filter(Boolean) as Game[];
    const playingGames = playing.map(id => byId.get(id)).filter(Boolean) as Game[];

    const play = async (game: Game) => {
        setNotice(null);
        const result = await native.startGame(game.id, game.exe, game.name, settings.store.startMinimized).catch(e => ({ ok: false as const, error: String(e?.message ?? e) }));
        if (result.ok) pushRecent(game.id);
        else setNotice(result.error);
        await refreshRunning();
    };

    const stop = async (game: Game) => {
        await native.stopGame(game.id);
        await refreshRunning();
    };

    const render = (g: Game) => (
        <GameRow
            key={g.id}
            game={g}
            isFav={favs.includes(g.id)}
            isPlaying={playing.includes(g.id)}
            onPlay={() => void play(g)}
            onStop={() => void stop(g)}
            onFav={() => { toggleFavorite(g.id); rerender(); }}
        />
    );

    const addCustom = () => {
        const name = customName.trim();
        const exe = customExe.trim();
        if (!name || !/^[^\s].*\.exe$/i.test(exe)) return;
        const entry: Game = { id: `custom:${exe.toLowerCase()}`, name, exe };
        settings.store.customGames = JSON.stringify([...custom.filter(c => c.id !== entry.id), entry]);
        setCustomName("");
        setCustomExe("");
        rerender();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <span className="kpp-title">PresencePal</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="kpp-content">
                {playingGames.length > 0 && (
                    <>
                        <div className="kpp-section">Playing now</div>
                        {playingGames.map(render)}
                    </>
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
                    <TextInput placeholder="Executable (game.exe)" value={customExe} onChange={setCustomExe} />
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
    name: "PresencePal",
    description: "Show your Discord status as playing any game, detected like a real one. Windows desktop port of PresencePal.",
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
        "Stop all PresencePal games": () => void native.stopAll()
    },

    stop() {
        void native.stopAll();
    }
});
