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
import { Button, React, RunningGameStore, TextInput, useEffect, useMemo, useState } from "@webpack/common";

import style from "./style.css?managed";

interface Game {
    id: string;
    name: string;
    icon?: string;
    /** Windows executable name Discord's game scanner looks for (the best candidate). */
    exe: string;
    /** Every usable executable, best first. Tried in turn if Discord does not detect the first one. */
    exes?: string[];
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
const MAX_CANDIDATES = 4;
const DETECT_TIMEOUT_MS = 9000;

type WindowMode = "normal" | "minimized" | "hidden";
interface Attempt { exe: string; mode: WindowMode; }

const settings = definePluginSettings({
    favorites: { type: OptionType.STRING, description: "Favorite game IDs (JSON)", default: "[]", hidden: true },
    recents: { type: OptionType.STRING, description: "Recent game IDs (JSON)", default: "[]", hidden: true },
    customGames: { type: OptionType.STRING, description: "Custom games (JSON)", default: "[]", hidden: true },
    working: { type: OptionType.STRING, description: "Executable and window mode that worked per game (JSON)", default: "{}", hidden: true },
    windowMode: {
        type: OptionType.SELECT,
        description: "The small window each game opens. Hidden has no window or taskbar button, so stop it from here or by quitting Discord.",
        options: [
            { label: "Normal window", value: "normal", default: true },
            { label: "Minimized to the taskbar", value: "minimized" },
            { label: "Hidden", value: "hidden" }
        ]
    }
});

function readJson<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// Prefer the real game over launchers, crash handlers and installers. Very generic names such as javaw.exe
// come last, because many unrelated programs share them. Within a group the shortest name goes first.
const NOT_THE_GAME = /launcher|crash|helper|redist|uninstall|setup|updater/i;
const GENERIC = /^(javaw?|python\w*|node|dotnet|wine\w*|cmd|powershell)\.exe$/i;
function orderExes(exes: NonNullable<DetectableApp["executables"]>): string[] {
    const base = (name: string) => name.split("/").pop() ?? name;
    const windows = exes.filter(e => e.os === "win32" && e.name).map(e => ({ name: e.name!.replace(/^>/, ""), launcher: !!e.is_launcher }));
    const rank = (e: { name: string; launcher: boolean; }) => (e.launcher ? 4 : 0) + (NOT_THE_GAME.test(base(e.name)) ? 2 : 0) + (GENERIC.test(base(e.name)) ? 1 : 0);
    return [...new Set(windows
        .sort((a, b) => rank(a) - rank(b) || base(a.name).length - base(b.name).length)
        .map(e => e.name))];
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
            const exes = orderExes(g.executables ?? []);
            return exes.length ? [{ id: String(g.id), name: String(g.name), icon: g.icon, exe: exes[0], exes }] : [];
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

function GameRow({ game, isFav, isPlaying, busy, status, onPlay, onStop, onFav }: {
    game: Game;
    isFav: boolean;
    isPlaying: boolean;
    busy: boolean;
    status?: string;
    onPlay(): void;
    onStop(): void;
    onFav(): void;
}) {
    const icon = iconUrl(game);
    return (
        <div className="kpp-row">
            {icon ? <img className="kpp-icon" src={icon} alt="" /> : <div className="kpp-icon kpp-icon-empty" />}
            <span className="kpp-name">{game.name}{status && <small className="kpp-status">{status}</small>}</span>
            <button className="kpp-fav" onClick={onFav} title={isFav ? "Remove favorite" : "Add favorite"}>
                {isFav ? "★" : "☆"}
            </button>
            {isPlaying || busy
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
    const [status, setStatus] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState<string[]>([]);
    const cancelled = React.useRef(new Set<string>());
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

    const setGameStatus = (id: string, text?: string) => setStatus(s => {
        const next = { ...s };
        if (text) next[id] = text; else delete next[id];
        return next;
    });

    /** Waits until Discord itself reports the game as running, so we know it was really detected. */
    const waitDetected = async (game: Game, id: string) => {
        const deadline = Date.now() + DETECT_TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (cancelled.current.has(id)) return false;
            const running = (RunningGameStore as any)?.getRunningGames?.() ?? [];
            if (running.some((g: any) => (g?.id && g.id === game.id) || /[\\/]presencepal[\\/]games[\\/]/i.test(g?.exePath ?? ""))) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        return false;
    };

    const play = async (game: Game) => {
        const { id } = game;
        cancelled.current.delete(id);
        setNotice(null);
        setBusy(b => [...b, id]);

        // Custom games are not in Discord's list, so there is nothing to confirm them against.
        const verifiable = !id.startsWith("custom:");
        const mode = settings.store.windowMode as WindowMode;
        const exes = (game.exes?.length ? game.exes : [game.exe]).slice(0, MAX_CANDIDATES);
        const saved = readJson<Record<string, Attempt>>(settings.store.working, {})[id];

        // What worked before goes first, then each executable in the chosen window mode, then more visible window modes.
        const attempts: Attempt[] = [];
        if (saved) attempts.push(saved);
        exes.forEach(exe => attempts.push({ exe, mode }));
        if (mode === "hidden") attempts.push({ exe: exes[0], mode: "minimized" });
        if (mode !== "normal") attempts.push({ exe: exes[0], mode: "normal" });
        const unique = attempts.filter((a, i) => attempts.findIndex(b => b.exe === a.exe && b.mode === a.mode) === i);

        let lastError = "";
        let ok = false;
        for (let i = 0; i < unique.length && !cancelled.current.has(id); i++) {
            const { exe, mode: windowMode } = unique[i];
            setGameStatus(id, unique.length > 1 ? `Trying ${exe.split("/").pop()} (${i + 1}/${unique.length})` : "Starting");
            const result = await native.startGame(id, exe, game.name, windowMode).catch(e => ({ ok: false as const, error: String(e?.message ?? e) }));
            if (!result.ok) { lastError = result.error; continue; }
            if (!verifiable || await waitDetected(game, id)) {
                ok = true;
                if (verifiable) {
                    const working = readJson<Record<string, Attempt>>(settings.store.working, {});
                    working[id] = { exe, mode: windowMode };
                    settings.store.working = JSON.stringify(working);
                }
                break;
            }
            await native.stopGame(id);
        }

        if (ok) {
            pushRecent(id);
            setGameStatus(id, verifiable ? "Detected by Discord" : "Running");
            setTimeout(() => setGameStatus(id), 6000);
        } else {
            setGameStatus(id);
            if (!cancelled.current.has(id)) {
                setNotice(lastError || `Discord did not detect ${game.name}. Not every game can be detected this way, and Discord's game detection setting must be on.`);
            }
        }
        setBusy(b => b.filter(x => x !== id));
        await refreshRunning();
    };

    const stop = async (game: Game) => {
        cancelled.current.add(game.id);
        await native.stopGame(game.id);
        setGameStatus(game.id);
        await refreshRunning();
    };
    const render = (g: Game) => (
        <GameRow
            key={g.id}
            game={g}
            isFav={favs.includes(g.id)}
            isPlaying={playing.includes(g.id)}
            busy={busy.includes(g.id)}
            status={status[g.id]}
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
