/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Switch } from "@components/Switch";
import { copyWithToast } from "@utils/discord";
import type { Plugin } from "@utils/types";
import { React, Tooltip } from "@webpack/common";

import gitRemote from "~git-remote";

import { KcIcon } from "../kittenIcons";
import { ActionIcon, IconTile, type OverflowItem, OverflowMenu } from "../KittenUI";
import { openPluginModal } from "./PluginModal";
import { pluginDisplayName, usePluginState } from "./usePluginState";

const sourceChip: Record<string, string> = { maltcord: "MaltCord", kittencord: "KittenCord", studio: "Studio", local: "Local", cloud: "Cloud", testcord: "TestCord", equicord: "Equicord", vencord: "Vencord", betterdiscord: "BetterDiscord", imported: "Imported" };

function Chip({ tone, title, children }: React.PropsWithChildren<{ tone?: "brand" | "warning" | "danger"; title?: string; }>) {
    return <span className="kc-chip-label" data-tone={tone} title={title}>{children}</span>;
}

/** The project the plugin comes from, as its logo. Falls back to the plugin glyph if the image cannot load. */
function SourceTile({ state }: { state: ReturnType<typeof usePluginState>; }) {
    const [failed, setFailed] = React.useState(false);
    const brand = state.source === "kittencord" || state.source === "maltcord";
    if (!state.sourceIcon || failed) return <IconTile icon={brand || state.studio ? "zap" : "plugin"} brand={brand} />;
    return <span className="kc-tile kc-plugin-source-tile" data-brand={brand || undefined} aria-hidden="true" title={state.sourceLabel}>
        <img src={state.sourceIcon.src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </span>;
}

/** One plugin in the Plugins list (spec §5): identity on the left, chips, then cog, more actions and the switch on the right. */
export function PluginRow({ plugin, onRestartNeeded, restartPending, isNew, locked }: { plugin: Plugin; onRestartNeeded(name: string, key: string): void; restartPending?: boolean; isNew?: boolean; locked?: string; }) {
    const state = usePluginState(plugin, onRestartNeeded);
    const favorite = Settings.plugins[plugin.name]?.isFavorite ?? false;
    const issue = state.runtime?.failed ? "Needs attention" : state.runtime?.quarantined ? "Quarantined" : state.runtime?.paused ? "Paused" : undefined;
    const name = pluginDisplayName(plugin.name);
    const menu: OverflowItem[] = [
        { id: "details", label: "Details and settings", action: () => openPluginModal(plugin, onRestartNeeded) },
        { id: "favorite", label: favorite ? "Remove from favorites" : "Add to favorites", action: () => { Settings.plugins[plugin.name] ??= { enabled: false }; Settings.plugins[plugin.name].isFavorite = !favorite; } },
        ...(state.jumpToReplacement ? [{ id: "replacement", label: "Go to replacement", action: state.jumpToReplacement }] : []),
        ...(gitRemote && !state.userPlugin ? [{ id: "source", label: "View source", action: () => VencordNative.native.openExternal(`https://github.com/${gitRemote}`) }] : []),
        { id: "copy", label: "Copy plugin ID", action: () => copyWithToast(plugin.id ?? plugin.name, "Plugin ID copied.") },
    ];
    return <div className="kc-pref-row kc-plugin-row" data-enabled={state.enabled || undefined} data-plugin={plugin.name}>
        <div className="kc-pref-main">
            <SourceTile state={state} />
            <span className="kc-pref-text">
                <span className="kc-pref-label kc-plugin-name">
                    <span className="kc-plugin-title">{name}</span>
                    {favorite && <KcIcon name="badge" size={13} className="kc-plugin-favorite" />}
                    <Chip tone={state.source === "kittencord" || state.source === "maltcord" ? "brand" : undefined} title={state.modifiedTitle ?? state.sourceLabel}>{sourceChip[state.source]}</Chip>
                    {isNew && <Chip tone="brand">New</Chip>}
                    {restartPending && <Chip tone="warning">Restart</Chip>}
                    {issue && <Chip tone="danger">{issue}</Chip>}
                    {state.warning && <Tooltip text={state.warningText}>{props => <span {...props}><Chip tone="warning">{state.warning?.label}</Chip></span>}</Tooltip>}
                    {state.stability && <Chip tone="warning" title={state.stability.text}>{state.stability.badge === "unstable" ? "Unstable" : "Flaky"}</Chip>}
                    {state.version && <Chip>v{state.version}</Chip>}
                </span>
                <span className="kc-pref-description" title={plugin.description}>{state.dependencyProblem?.message ?? locked ?? plugin.description}</span>
                {!!state.tags.length && <span className="kc-plugin-tags">{state.tags.slice(0, 3).map(tag => <span key={tag} className="kc-plugin-tag">{tag}</span>)}</span>}
            </span>
            <span className="kc-pref-control">
                {state.hasSettings && <ActionIcon label={`Settings for ${name}`} onClick={() => openPluginModal(plugin, onRestartNeeded)}><KcIcon name="gear" /></ActionIcon>}
                <OverflowMenu label={`More actions for ${name}`} items={menu} />
                <Switch checked={state.enabled} disabled={!!locked || !!state.dependencyProblem} onChange={state.toggle} aria-label={`${state.enabled ? "Disable" : "Enable"} ${name}`} />
            </span>
        </div>
    </div>;
}
