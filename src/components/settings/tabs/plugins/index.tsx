/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./styles.css";

import * as DataStore from "@api/DataStore";
import { KittycordPackages } from "@api/KittycordPackages";
import { NativeStudio } from "@api/NativeStudio";
import { isOptionalPlugin, pluginCounts } from "@api/PluginCounts";
import { PluginHealth } from "@api/PluginHealth";
import { getPluginDependencyProblem, getPluginRuntimeState, isPluginSelected, stopPlugin, subscribePluginRegistry } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings";
import { KittenSearchableSelect as SearchableSelect } from "@components/settings/KittenSelect";
import { PackagesTab } from "@components/settings/tabs/kittycordPackages";
import { ViewportCull } from "@components/ViewportCull";
import { settings as kittenSettings } from "@plugins/_core/settings";
import { packageContentType } from "@shared/kittycord/presentation";
import { ChangeList } from "@utils/ChangeList";
import { Devs, EquicordDevs, TestcordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { isTruthy } from "@utils/guards";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { PluginTarget } from "@utils/pluginTargets";
import { isExperimentalPlugin, isLegacyPlugin } from "@utils/pluginWarnings";
import { promptToRestart } from "@utils/promptToRestart";
import { useAwaiter, useCleanupEffect } from "@utils/react";
import { isTestcordModified } from "@utils/testcordIcons";
import { Plugin, PluginTag, PluginTags } from "@utils/types";
import { Alerts, Parser, React, showToast, TextInput, useCallback, useEffect, useMemo, useRef, useState } from "@webpack/common";

import Plugins, { BrowserPluginRestrictions, ExcludedPlugins, PluginMeta } from "~plugins";

import { openSettingsTabModal, wrapTab } from "../BaseTab";
import { KcIcon } from "../kittenIcons";
import { Counter, EmptyState, IconTile, Popover, PrefGroup, PrefRow } from "../KittenUI";
import { registerJumpListener, setPluginsTabOpener } from "./jumpToPlugin";
import { PluginCard } from "./PluginCard";
import { PluginRow } from "./PluginRow";

export const cl = classNameFactory("vc-plugins-");
export const logger = new Logger("PluginSettings", "#a6d189");

const PluginSearchPrefixes: Array<{ prefix: string; folders: string[]; modifiedOnly?: boolean; }> = [
    { prefix: "tcp:", folders: ["src/testcordplugins/"] },
    { prefix: "testcordplugin:", folders: ["src/testcordplugins/"] },
    { prefix: "tcm:", folders: ["src/testcordplugins/", "src/equicordplugins/", "src/plugins/"], modifiedOnly: true },
    { prefix: "vcp:", folders: ["src/plugins/"] },
    { prefix: "vencordplugin:", folders: ["src/plugins/"] },
    { prefix: "eqp:", folders: ["src/equicordplugins/"] },
    { prefix: "equicordplugin:", folders: ["src/equicordplugins/"] },
    { prefix: "plg:", folders: ["src/testcordplugins/", "src/equicordplugins/", "src/plugins/"] },
    { prefix: "plugin:", folders: ["src/testcordplugins/", "src/equicordplugins/", "src/plugins/"] },
    { prefix: "plugins:", folders: ["src/testcordplugins/", "src/equicordplugins/", "src/plugins/"] }
];
const PluginLoadBatchSize = 36;

function showErrorToast(message: string) {
    showToast({
        text: message,
        variant: "critical",
        position: "bottom"
    });
}

const SearchStatus = {
    ALL: 0,
    FAVORITES: 1,
    ENABLED: 2,
    DISABLED: 3,
    EQUICORD: 4,
    TESTCORD: 5,
    VENCORD: 6,
    NEW: 7,
    USER_PLUGINS: 8,
    API_PLUGINS: 9,
    BETTERDISCORD: 10,
    EXPERIMENTAL: 11,
    LEGACY: 12,
    TESTCORD_MODIFIED: 13,
    LOCAL: 14,
    KITTENCORD: 15,
    NEEDS_RESTART: 16,
    ISSUES: 17,
} as const;

const RowChunkSize = 24;

function isKittenCordPlugin(plugin: Plugin) {
    return !!plugin.kittencordOrigin || !!PluginMeta[plugin.name]?.folderName.startsWith("src/userplugins/.studio/");
}

function hasIssue(plugin: Plugin) {
    const state = getPluginRuntimeState(plugin.name);
    return !!state?.failed || !!state?.quarantined || !!getPluginDependencyProblem(plugin.name);
}

/** Plugins ⋯ › Disable all plugins: turns every enabled optional plugin off and asks to restart when patches need it. */
export function disableAllPlugins() {
    const enabled = Object.keys(Plugins).filter(name => isOptionalPlugin(Plugins[name]) && isPluginSelected(name));
    let restartNeeded = false;
    for (const name of enabled) {
        const pluginSettings = Settings.plugins[name];
        if (Plugins[name].patches?.length) {
            pluginSettings.enabled = false;
            void PluginHealth.recordPluginChange(name, false);
            restartNeeded = true;
            continue;
        }
        if (!stopPlugin(Plugins[name])) {
            logger.error(`Error while stopping plugin ${name}`);
            showErrorToast(`Error while stopping plugin ${name}`);
            continue;
        }
        pluginSettings.enabled = false;
        void PluginHealth.recordPluginChange(name, false);
    }
    if (restartNeeded) Alerts.show({ title: "Restart required", body: "Some plugins need a restart to turn off completely.", confirmText: "Restart now", cancelText: "Later", onConfirm: () => location.reload() });
}

type SearchStatus = typeof SearchStatus[keyof typeof SearchStatus];

export const ExcludedReasons: Record<PluginTarget, string> = {
    desktop: "Discord Desktop app or Vesktop/Equibop",
    discordDesktop: "Discord Desktop app",
    vesktop: "Vesktop/Equibop apps",
    equibop: "Vesktop/Equibop apps",
    web: "Vesktop/Equibop apps & Discord web",
    dev: "Developer version of MaltCord",
    browser: "Web Browser version of MaltCord"
};

function ExcludedPluginsList({ search }: { search: string; }) {
    const matchingExcludedPlugins = search
        ? Object.entries(ExcludedPlugins)
            .filter(([name]) => name.toLowerCase().includes(search))
        : [];

    return (
        <Paragraph className={Margins.top16}>
            {matchingExcludedPlugins.length
                ? <>
                    <Paragraph>Are you looking for:</Paragraph>
                    <ul>
                        {matchingExcludedPlugins.map(([name, reason]) => (
                            <li key={name}>
                                <b>{name}</b>: {BrowserPluginRestrictions[name] ?? `Only available on the ${ExcludedReasons[reason]}`}
                            </li>
                        ))}
                    </ul>
                </>
                : "No plugins meet the search criteria."
            }
        </Paragraph>
    );
}

function PluginSettings() {
    const [registryRevision, setRegistryRevision] = useState(0);
    useEffect(() => subscribePluginRegistry(() => setRegistryRevision(value => value + 1)), []);
    useEffect(() => PluginHealth.subscribe(() => setRegistryRevision(value => value + 1)), []);
    const [nativeSnapshot, setNativeSnapshot] = useState(NativeStudio.snapshot);
    useEffect(() => NativeStudio.subscribe(() => setNativeSnapshot(NativeStudio.snapshot())), []);
    const [localSnapshot, setLocalSnapshot] = useState(KittycordPackages.snapshot);
    useEffect(() => KittycordPackages.subscribe(() => setLocalSnapshot(KittycordPackages.snapshot())), []);
    // Every settings read in this tab is under `plugins`, so scoping the subscription
    // stops unrelated settings writes (themes, layout, ...) from re-rendering it.
    const settings = useSettings(["plugins.*"]);
    const changeRef = useRef<ChangeList<string>>(null);
    const changes = changeRef.current ??= new ChangeList<string>();
    const [restartRevision, setRestartRevision] = useState(0);
    const restartPending = useMemo(() => new Set([...changes.getChanges()].map(change => change.split(":")[0])), [restartRevision]);

    useCleanupEffect(() => {
        return () => {
            if (!changes.hasChanges) return;

            const allChanges = [...changes.getChanges()];
            const pluginNames = [...new Set(allChanges.map(s => s.split(":")[0]))];
            const maxDisplay = 15;
            const displayed = pluginNames.slice(0, maxDisplay);
            const remainingCount = pluginNames.length - displayed.length;

            promptToRestart("reload", {
                children: <>
                    <p>The following plugins require a restart:</p>
                    <div>
                        {displayed.map((s, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && ", "}
                                {Parser.parse("`" + s + "`")}
                            </React.Fragment>
                        ))}
                        {remainingCount > 0 && <span> and {remainingCount} more</span>}
                    </div>
                </>
            });
        };
    }, []);

    const depMap = useMemo(() => {
        const o = {} as Record<string, string[]>;
        for (const plugin in Plugins) {
            const deps = Plugins[plugin].dependencies;
            if (deps) {
                for (const dep of deps) {
                    o[dep] ??= [];
                    o[dep].push(plugin);
                }
            }
        }
        return o;
    }, [registryRevision]);

    const sortedPlugins = useMemo(() =>
        Object.values(Plugins)
            .filter(p => p.name)
            .sort((a, b) => a.name.localeCompare(b.name)),
        [registryRevision]
    );

    const hasUserPlugins = useMemo(() => !IS_STANDALONE && Object.values(PluginMeta).some(m => m.userPlugin), [registryRevision]);

    const [searchValue, setSearchValue] = useState<{ value: string; tags: PluginTag[]; status: number; author: string; sort?: "favorites" | "name" | "name-desc" | "enabled"; }>({ value: "", tags: [] as PluginTag[], status: SearchStatus.ALL, author: "" });

    useEffect(() => {
        return registerJumpListener(pluginName => {
            setSearchValue({
                value: pluginName,
                tags: [],
                status: SearchStatus.ALL,
                author: "",
            });

            setTimeout(() => {
                const searchInput = document.querySelector<HTMLInputElement>(`.${cl("filter-control")} input, input.${cl("filter-control")}`);
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
                const section = document.querySelector(`.${cl("section-heading")}`) ?? searchInput;
                section?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 80);
        });
    }, []);

    const search = searchValue.value.toLowerCase();
    const searchPrefixMatch = useMemo(() => {
        const trimmedSearch = search.trimStart();

        for (const entry of PluginSearchPrefixes) {
            if (trimmedSearch.startsWith(entry.prefix)) {
                return {
                    folders: entry.folders,
                    modifiedOnly: entry.modifiedOnly,
                    query: trimmedSearch.slice(entry.prefix.length).trim()
                };
            }
        }

        return null;
    }, [search]);
    const onSearch = (query: string) => setSearchValue(prev => ({ ...prev, value: query }));

    const githubMap = useMemo(() => {
        const map: Record<string, string> = {};
        const allDevs = { ...TestcordDevs, ...EquicordDevs, ...Devs };
        for (const dev of Object.values(allDevs)) {
            if ((dev as any).github) map[(dev as any).name] = (dev as any).github;
        }
        return map;
    }, []);
    const authorOptions = useMemo(() => {
        const authors = new Map<string, { category: string; github: any; }>();
        for (const plugin of sortedPlugins) {
            const meta = PluginMeta[plugin.name];
            const folder = meta ? meta.folderName : "";
            const category = folder.startsWith("src/testcordplugins/") ? "Testcord" : folder.startsWith("src/equicordplugins/") ? "Equicord" : folder.startsWith("src/plugins/") ? "Vencord" : "Other";
            for (const author of (plugin.authors || [])) {
                if (!author || !author.name) continue;
                if (!authors.has(author.name)) authors.set(author.name, { category, github: (author as any).github });
            }
        }
        const grouped: Record<string, string[]> = { Testcord: [], Equicord: [], Vencord: [], Other: [] };
        for (const [name, info] of authors.entries()) grouped[info.category].push(name);
        const result: Array<{ label: string; value: string; github: string; }> = [];
        for (const [cat, names] of Object.entries(grouped)) {
            for (const name of names.sort()) { const info = authors.get(name)!; result.push({ label: name + " (" + cat + ")", value: name, github: info.github || githubMap[name] }); }
        }
        return result;
    }, [sortedPlugins]);

    const pluginFilter = useCallback((plugin: typeof Plugins[keyof typeof Plugins], newPluginsSet: Set<string> | null) => {
        const { status, tags } = searchValue;
        if (plugin.id === "local.native.patch" && status !== SearchStatus.LOCAL) return false;

        switch (status) {
            case SearchStatus.KITTENCORD:
                if (!isKittenCordPlugin(plugin)) return false;
                break;
            case SearchStatus.NEEDS_RESTART:
                if (!restartPending.has(plugin.name)) return false;
                break;
            case SearchStatus.ISSUES:
                if (!hasIssue(plugin)) return false;
                break;
            case SearchStatus.FAVORITES:
                if (!settings.plugins[plugin.name]?.isFavorite) return false;
                break;
            case SearchStatus.DISABLED:
                if (isPluginSelected(plugin.name)) return false;
                break;
            case SearchStatus.ENABLED:
                if (!isPluginSelected(plugin.name)) return false;
                break;
            case SearchStatus.EQUICORD:
                if (!PluginMeta[plugin.name].folderName.startsWith("src/equicordplugins/")) return false;
                break;
            case SearchStatus.TESTCORD:
                if (!PluginMeta[plugin.name].folderName.startsWith("src/testcordplugins/")) return false;
                break;
            case SearchStatus.VENCORD:
                if (!PluginMeta[plugin.name].folderName.startsWith("src/plugins/")) return false;
                break;
            case SearchStatus.NEW:
                if (!newPluginsSet?.has(plugin.name)) return false;
                break;
            case SearchStatus.USER_PLUGINS:
            case SearchStatus.LOCAL:
                if (!PluginMeta[plugin.name]?.userPlugin) return false;
                break;
            case SearchStatus.API_PLUGINS:
                if (!plugin.name.endsWith("API")) return false;
                break;
            case SearchStatus.BETTERDISCORD:
                // Check if plugin is a BD plugin by looking at folderName or tags
                const pluginMetaInfo = PluginMeta[plugin.name];
                if (!pluginMetaInfo) return false;
                if (!pluginMetaInfo.folderName?.startsWith("src/Betterdiscordplugins/") &&
                    !plugin.tags?.includes("betterdiscord")) return false;
                break;
            case SearchStatus.EXPERIMENTAL:
                if (!isExperimentalPlugin(plugin.name) && !plugin.experimental && !plugin.tags?.includes("experimental")) return false;
                break;
            case SearchStatus.LEGACY:
                if (!isLegacyPlugin(plugin.name) && !plugin.legacy && !plugin.tags?.includes("legacy")) return false;
                break;
            case SearchStatus.TESTCORD_MODIFIED:
                if (!isTestcordModified(plugin, PluginMeta[plugin.name]?.folderName)) return false;
                break;
        }

        if (tags.length && tags.some(t => {
            if (t === "Testcord Modified") return !isTestcordModified(plugin, PluginMeta[plugin.name]?.folderName);
            return !plugin.tags?.includes(t);
        })) return false;

        if (searchValue.author && !plugin.authors?.some(a => a?.name === searchValue.author)) return false;

        if (searchPrefixMatch) {
            if (searchPrefixMatch.modifiedOnly && !isTestcordModified(plugin, PluginMeta[plugin.name]?.folderName)) return false;
            const folder = PluginMeta[plugin.name]?.folderName || "";
            if (!searchPrefixMatch.folders.some(f => folder.startsWith(f))) return false;
        }

        const pluginSearchValue = searchPrefixMatch ? searchPrefixMatch.query : search;

        if (!pluginSearchValue.length) return true;

        const normSearch = pluginSearchValue.replace(/\s+/g, "");
        const normName = plugin.name.toLowerCase().replace(/\s+/g, "");

        return (
            plugin.name.toLowerCase().includes(pluginSearchValue) ||
            normName.includes(normSearch) ||
            plugin.name.match(/[A-Z]/g)?.join("").toLowerCase().includes(pluginSearchValue) || // acronyms like BF for BetterFolders
            plugin.description.toLowerCase().includes(pluginSearchValue) ||
            plugin.authors?.some(author => author.name?.toLowerCase().includes(pluginSearchValue) || author.github?.toLowerCase().includes(pluginSearchValue)) ||
            !!plugin.kittencordOrigin && "kittencord".includes(normSearch) ||
            plugin.searchTerms?.some(t => t.toLowerCase().includes(pluginSearchValue))
        );
    }, [searchValue, search, searchPrefixMatch, restartPending]);

    const [newPluginsSet] = useAwaiter(() => DataStore.get("Vencord_existingPlugins").then((cachedPlugins: Record<string, number> | undefined) => {
        const now = Date.now() / 1000;
        const existingTimestamps: Record<string, number> = {};

        // Genuine first run: no baseline exists, so nothing is "new" yet.
        // Establish the baseline and return null instead of marking everything new.
        if (!cachedPlugins) {
            for (const { name: p } of sortedPlugins) existingTimestamps[p] = now;
            DataStore.set("Vencord_existingPlugins", existingTimestamps);
            return null;
        }

        const newPlugins: string[] = [];
        for (const { name: p } of sortedPlugins) {
            const cached = cachedPlugins[p];
            if (cached == null) {
                // Plugin was added since the previous launch
                existingTimestamps[p] = now;
                newPlugins.push(p);
            } else {
                existingTimestamps[p] = cached;
            }
        }
        DataStore.set("Vencord_existingPlugins", existingTimestamps);

        return newPlugins.length ? new Set(newPlugins) : null;
    }));

    const handleRestartNeeded = useCallback((name: string, key: string) => { changes.handleChange(`${name}:${key}`); setRestartRevision(value => value + 1); }, [changes]);

    // Filtering is cheap; building JSX is not. This used to allocate a <PluginCard>
    // element for every matching plugin (~700) on each keystroke, of which the
    // visiblePlugins slice below then discarded all but `visibleCount`. Split the two:
    // filter and classify first, build elements only for what actually renders.
    const { filteredPlugins, requiredPluginDefs } = (() => {
        const filtered: Plugin[] = [];
        const required: Plugin[] = [];

        // Favorites first, each group still in name order. This used to be a second full
        // sort chained onto `sortedPlugins`, whose `[]` deps meant it never re-ran when a
        // plugin was favorited, so the order only refreshed on remount. Doing it here costs
        // two cheap passes on each settings render.
        const ordered = searchValue.sort === "name" ? sortedPlugins : searchValue.sort === "name-desc" ? [...sortedPlugins].reverse() : searchValue.sort === "enabled" ? [...sortedPlugins.filter(p => isPluginSelected(p.name)), ...sortedPlugins.filter(p => !isPluginSelected(p.name))] : [
            ...sortedPlugins.filter(p => settings.plugins[p.name]?.isFavorite),
            ...sortedPlugins.filter(p => !settings.plugins[p.name]?.isFavorite)
        ];

        const showApi = searchValue.status === SearchStatus.API_PLUGINS;
        for (const p of ordered) {
            if (p.hidden || (!p.settings?.def && p.name.endsWith("API") && !showApi))
                continue;

            if (!pluginFilter(p, newPluginsSet)) continue;

            const isRequired = p.required || p.isDependency || depMap[p.name]?.some(d => settings.plugins[d].enabled);
            (isRequired ? required : filtered).push(p);
        }
        return { filteredPlugins: filtered, requiredPluginDefs: required };
    })();

    const unregisteredProjects = nativeSnapshot.filter(item => !item.registered && (!item.contentType || item.contentType === "plugin"));
    const [visibleCount, setVisibleCount] = React.useState(PluginLoadBatchSize);
    useEffect(() => setVisibleCount(PluginLoadBatchSize), [searchValue]);
    // The next batch loads when the browser reports the end marker on screen after layout. Reacting to a cached
    // "visible" flag instead re-ran after every batch before the flag updated and loaded the whole list at once.
    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const node = sentinelRef.current;
        if (!node || visibleCount >= filteredPlugins.length) return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) setVisibleCount(count => Math.min(count + PluginLoadBatchSize, filteredPlugins.length));
        }, { rootMargin: "400px 0px" });
        observer.observe(node);
        return () => observer.disconnect();
    }, [visibleCount, filteredPlugins.length]);
    const [filterOpen, setFilterOpen] = useState(false);
    const closeFilter = useCallback(() => setFilterOpen(false), []);
    const [showRequired, setShowRequired] = useState(false);
    const [, setViewTick] = useState(0);
    const functionalLocal = localSnapshot.entries.filter(item => packageContentType(item.manifest) === "plugin");
    const allAuthorOptions = [...authorOptions, ...[...new Set(functionalLocal.map(item => item.manifest.author))].filter(name => !authorOptions.some(author => author.value === name)).map(name => ({ label: `${name} (Local)`, value: name, github: "" }))];
    const rawAuthorGithub = searchValue.author ? (allAuthorOptions.find(a => a.value === searchValue.author)?.github || "") : "";
    const authorGithub = rawAuthorGithub ? (rawAuthorGithub.startsWith("http") ? rawAuthorGithub : "https://github.com/" + rawAuthorGithub) : "";

    const counts = pluginCounts();
    const listable = sortedPlugins.filter(p => !p.hidden && !(!p.settings?.def && p.name.endsWith("API")) && p.id !== "local.native.patch");
    // Core plugins that are always on are listed separately, so the chips count the same plugins as the summary line.
    const optional = listable.filter(isOptionalPlugin);
    const chipCounts: Record<number, number> = {
        [SearchStatus.ALL]: optional.length,
        [SearchStatus.ENABLED]: optional.filter(p => isPluginSelected(p.name)).length,
        [SearchStatus.KITTENCORD]: optional.filter(isKittenCordPlugin).length,
        [SearchStatus.NEEDS_RESTART]: restartPending.size,
        [SearchStatus.ISSUES]: optional.filter(hasIssue).length,
    };
    const chips = [
        { status: SearchStatus.ALL, label: "All" },
        { status: SearchStatus.ENABLED, label: "Enabled" },
        { status: SearchStatus.KITTENCORD, label: "MaltCord" },
        { status: SearchStatus.NEEDS_RESTART, label: "Needs restart" },
        { status: SearchStatus.ISSUES, label: "Issues" },
    ];
    const chipStatuses = new Set<number>(chips.map(chip => chip.status));
    const moreStatuses = [
        { label: "Favorites", value: SearchStatus.FAVORITES },
        { label: "Disabled", value: SearchStatus.DISABLED },
        { label: "Local projects & imports", value: SearchStatus.LOCAL },
        { label: "New", value: SearchStatus.NEW },
        { label: "From Vencord", value: SearchStatus.VENCORD },
        { label: "From Equicord", value: SearchStatus.EQUICORD },
        { label: "From TestCord", value: SearchStatus.TESTCORD },
        { label: "Modified by TestCord", value: SearchStatus.TESTCORD_MODIFIED },
        hasUserPlugins && { label: "UserPlugins", value: SearchStatus.USER_PLUGINS },
        { label: "API plugins", value: SearchStatus.API_PLUGINS },
        { label: "BetterDiscord", value: SearchStatus.BETTERDISCORD },
        { label: "Experimental", value: SearchStatus.EXPERIMENTAL },
        { label: "Legacy", value: SearchStatus.LEGACY },
    ].filter(isTruthy);
    const extraFilters = (chipStatuses.has(searchValue.status) ? 0 : 1) + searchValue.tags.length + (searchValue.author ? 1 : 0) + (searchValue.sort && searchValue.sort !== "favorites" ? 1 : 0);
    const unfiltered = searchValue.status === SearchStatus.ALL && !searchValue.value && !searchValue.tags.length && !searchValue.author;
    const shown = filteredPlugins.slice(0, visibleCount);
    const sections = unfiltered
        // The MaltCord group is small, so it always shows in full instead of only what the first page reached.
        ? [{ title: "MaltCord", plugins: filteredPlugins.filter(isKittenCordPlugin) }, { title: "All plugins", plugins: shown.filter(p => !isKittenCordPlugin(p)) }]
        : [{ title: `${filteredPlugins.length} ${filteredPlugins.length === 1 ? "plugin" : "plugins"}`, plugins: shown }];
    const cards = kittenSettings.store.pluginsView === "cards";
    const renderRows = (list: Plugin[]) => {
        if (cards) {
            const cardChunks: Plugin[][] = [];
            for (let index = 0; index < list.length; index += RowChunkSize) cardChunks.push(list.slice(index, index + RowChunkSize));
            return cardChunks.map(chunk => <ViewportCull key={chunk[0].name} minHeight={Math.ceil(chunk.length / 2) * 210} rootMargin="600px 0px" className="vc-plugins-grid kc-plugins-cards">
                {chunk.map(p => <PluginCard key={p.name} plugin={p} onRestartNeeded={handleRestartNeeded} isNew={newPluginsSet?.has(p.name)} />)}
            </ViewportCull>);
        }
        const chunks: Plugin[][] = [];
        for (let index = 0; index < list.length; index += RowChunkSize) chunks.push(list.slice(index, index + RowChunkSize));
        return chunks.map(chunk => <ViewportCull key={chunk[0].name} minHeight={chunk.length * 57} rootMargin="600px 0px" className="kc-plugin-chunk">
            {chunk.map(p => <PluginRow key={p.name} plugin={p} onRestartNeeded={handleRestartNeeded} restartPending={restartPending.has(p.name)} isNew={newPluginsSet?.has(p.name)} />)}
        </ViewportCull>);
    };

    return (
        <SettingsTab>
            <div className="kc-plugins">
                <div className="kc-plugins-toolbar">
                    <ErrorBoundary noop>
                        <TextInput inputClassName={cl("filter-control")} placeholder="Search plugins, authors or IDs" aria-label="Search plugins" value={searchValue.value} onChange={onSearch} autoFocus />
                    </ErrorBoundary>
                    <div className="kc-chips" role="toolbar" aria-label="Plugin filters">
                        {chips.map(chip => <button type="button" key={chip.status} className="kc-chip" aria-pressed={searchValue.status === chip.status} onClick={() => setSearchValue(prev => ({ ...prev, status: chip.status }))}>{chip.label}<Counter value={chipCounts[chip.status]} /></button>)}
                        <span className="kc-filter-wrap">
                            <button type="button" className="kc-chip" aria-haspopup="dialog" aria-expanded={filterOpen} aria-pressed={extraFilters > 0} onClick={() => setFilterOpen(open => !open)}><KcIcon name="filter" size={14} />Filter{extraFilters > 0 && <Counter value={extraFilters} />}</button>
                            <Popover open={filterOpen} onClose={closeFilter} align="end" label="More plugin filters">
                                <div className="kc-filter-panel">
                                    <div className="kc-filter-section"><span className="kc-filter-title">Show</span>
                                        <div className="kc-filter-options" role="radiogroup" aria-label="Plugin type">
                                            {moreStatuses.map(option => <button type="button" role="radio" key={option.value} className="kc-chip" aria-checked={searchValue.status === option.value} onClick={() => setSearchValue(prev => ({ ...prev, status: prev.status === option.value ? SearchStatus.ALL : option.value }))}>{option.label}</button>)}
                                        </div>
                                    </div>
                                    <div className="kc-filter-section"><span className="kc-filter-title">Tags</span>
                                        <div className="kc-filter-options">
                                            {PluginTags.map(tag => <button type="button" key={tag} className="kc-chip" aria-pressed={searchValue.tags.includes(tag)} onClick={() => setSearchValue(prev => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags.filter(item => item !== tag) : [...prev.tags, tag] }))}>{tag}</button>)}
                                        </div>
                                    </div>
                                    <div className="kc-filter-section"><span className="kc-filter-title">Author</span>
                                        <SearchableSelect options={[{ label: "All authors", value: "" }, ...allAuthorOptions]} value={searchValue.author} onChange={v => setSearchValue(prev => ({ ...prev, author: v ?? "" }))} closeOnSelect={true} placeholder="All authors" />
                                        {searchValue.author && rawAuthorGithub && <Link href={authorGithub} className="kc-filter-link"><KcIcon name="github" size={14} />{(authorOptions.find(a => a.value === searchValue.author)?.github || searchValue.author).replace(/^https?:\/\/github\.com\//, "")}</Link>}
                                    </div>
                                    <div className="kc-filter-section"><span className="kc-filter-title">Sort</span>
                                        <div className="kc-filter-options" role="radiogroup" aria-label="Sort plugins">
                                            {([["favorites", "Favorites first"], ["name", "Name A–Z"], ["name-desc", "Name Z–A"], ["enabled", "Enabled first"]] as const).map(([value, label]) => <button type="button" role="radio" key={value} className="kc-chip" aria-checked={(searchValue.sort ?? "favorites") === value} onClick={() => setSearchValue(prev => ({ ...prev, sort: value }))}>{label}</button>)}
                                        </div>
                                    </div>
                                    <div className="kc-filter-foot"><Button size="small" variant="secondary" className="kc-btn kc-btn-row" onClick={() => setSearchValue({ value: "", tags: [], status: SearchStatus.ALL, author: "" })}>Clear filters</Button></div>
                                </div>
                            </Popover>
                        </span>
                    </div>
                </div>

                <div className="kc-plugins-view" role="radiogroup" aria-label="Plugin layout">
                    {(["list", "cards"] as const).map(value => <button type="button" role="radio" key={value} className="kc-chip" aria-checked={(kittenSettings.store.pluginsView ?? "list") === value} onClick={() => { kittenSettings.store.pluginsView = value; setViewTick(tick => tick + 1); }}>{value === "list" ? "List" : "Cards"}</button>)}
                </div>
                <p className="kc-plugins-summary" role="status">{counts.running} running · {counts.enabled} enabled · {counts.available} available{counts.paused ? ` · ${counts.paused} paused` : ""}{counts.issues ? ` · ${counts.issues} need attention` : ""}</p>

                {changes.hasChanges && <PrefGroup>
                    <PrefRow icon="restart" label="Restart required" description={`${restartPending.size} ${restartPending.size === 1 ? "change applies" : "changes apply"} after Discord reloads.`} control={<Button size="small" variant="secondary" className="kc-btn kc-btn-row" onClick={() => location.reload()}>Restart now</Button>} />
                </PrefGroup>}

                {unregisteredProjects.length > 0 && <PrefGroup>
                    <PrefRow icon="warning" label="Native projects awaiting registration" description={`${unregisteredProjects.map(item => item.name).join(", ")}. ${localSnapshot.recovery ? "Resume normal startup in Health, then relaunch. Your source and selections are kept." : "Open Studio to inspect registration errors."}`} />
                </PrefGroup>}

                {[SearchStatus.LOCAL, SearchStatus.ALL, SearchStatus.ENABLED, SearchStatus.DISABLED].some(status => status === searchValue.status) && !searchValue.tags.length && <PackagesTab embedded searchQuery={searchValue.value} authorQuery={searchValue.author} enabledOnly={searchValue.status === SearchStatus.ENABLED ? true : searchValue.status === SearchStatus.DISABLED ? false : undefined} />}

                {filteredPlugins.length
                    ? sections.filter(section => section.plugins.length).map(section => <PrefGroup key={section.title} title={section.title} className="kc-plugin-section">
                        <div className="kc-list-fade">{renderRows(section.plugins)}</div>
                    </PrefGroup>)
                    : searchValue.status === SearchStatus.LOCAL
                        ? <EmptyState title="No local plugins">Source plugins placed in src/userplugins appear here after building. Imported packages appear under Local.</EmptyState>
                        : <ExcludedPluginsList search={search} />}
                {visibleCount < filteredPlugins.length && <div ref={sentinelRef} style={{ height: 32 }} />}

                {searchValue.status !== SearchStatus.LOCAL && requiredPluginDefs.length > 0 && <PrefGroup>
                    <button type="button" className="kc-pref-row kc-pref-link" aria-expanded={showRequired} onClick={() => setShowRequired(value => !value)}>
                        <span className="kc-pref-main"><IconTile icon="shield" /><span className="kc-pref-text"><span className="kc-pref-label">{requiredPluginDefs.length} core plugins are always on</span><span className="kc-pref-description">Required by MaltCord or by plugins you enabled. {showRequired ? "Hide them" : "Show them to open their settings"}.</span></span><KcIcon name="chevron" size={16} className="kc-pref-chevron" /></span>
                    </button>
                    {showRequired && renderRequiredRows(requiredPluginDefs)}
                </PrefGroup>}
            </div>
        </SettingsTab>
    );

    function renderRequiredRows(list: Plugin[]) {
        return list.map(p => <PluginRow key={p.name} plugin={p} onRestartNeeded={handleRestartNeeded} locked={p.required || !depMap[p.name] ? "Required for MaltCord to work." : `Required by ${depMap[p.name].filter(d => settings.plugins[d]?.enabled).join(", ")}.`} />);
    }
}

setPluginsTabOpener(() => openSettingsTabModal(PluginSettings));

export default wrapTab(PluginSettings, "Plugins");

export function PluginDependencyList({ deps }: { deps: string[]; }) {
    return (
        <>
            <Paragraph>This plugin is required by:</Paragraph>
            {deps.map((dep: string) => <Paragraph key={dep} className={cl("dep-text")}>{dep}</Paragraph>)}
        </>
    );
}
