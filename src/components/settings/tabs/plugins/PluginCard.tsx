/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CogWheel, GithubIcon, InfoIcon, KittycordIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { AddonCard } from "@components/settings/AddonCard";
import { PublisherIdentity } from "@components/settings/tabs/KittenUI";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { getTestcordModifiedDetails, isTestcordModified, TestcordPluginIconUrl } from "@utils/testcordIcons";
import { Plugin } from "@utils/types";
import { React, Tooltip, UserStore } from "@webpack/common";
import KittenLogo from "file://../../../kittencord.png?base64";

import gitRemote from "~git-remote";
import { PluginMeta } from "~plugins";

import { jumpToPlugin } from "./jumpToPlugin";
import { openPluginModal } from "./PluginModal";
import { pluginDisplayName, usePluginState } from "./usePluginState";

const logger = new Logger("PluginCard");
const cl = classNameFactory("vc-plugins-");

// Hoisted so each card passes the same array instance across renders.
const PLUGIN_ENABLED_PATHS: Record<string, readonly `plugins.${string}.enabled`[]> = {};

interface PluginCardProps extends React.HTMLProps<HTMLDivElement> {
    plugin: Plugin;
    disabled?: boolean;
    onRestartNeeded(name: string, key: string): void;
    isNew?: boolean;
    onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
}

export function PluginCard({ plugin, disabled, onRestartNeeded, onMouseEnter, onMouseLeave, isNew }: PluginCardProps) {
    const state = usePluginState(plugin, onRestartNeeded);
    const { dependencyProblem, studio, warning, runtime } = state;
    const pluginMeta = PluginMeta[plugin.name] || { folderName: "", userPlugin: false };
    const isEquicordPlugin = pluginMeta.folderName?.startsWith("src/equicordplugins/") ?? false;
    const isVencordPlugin = !plugin.kittencordOrigin && (pluginMeta.folderName?.startsWith("src/plugins/") ?? false);
    const isTestcordPlugin = pluginMeta.folderName?.startsWith("src/testcordplugins/") ?? false;
    const isUserPlugin = pluginMeta?.userPlugin ?? false;
    const isModifiedPlugin = plugin.isModified ?? false;
    const isBDPlugin = pluginMeta.folderName?.startsWith("src/Betterdiscordplugins/") || plugin.tags?.includes("betterdiscord");
    const isTestcordMod = isTestcordModified(plugin, pluginMeta.folderName);
    const testcordModDetails = isTestcordMod ? getTestcordModifiedDetails(plugin, pluginMeta.folderName) : null;

    const pluginInfo = [
        { condition: !!plugin.kittencordOrigin && !studio, src: `data:image/png;base64,${KittenLogo}`, alt: "KittenCord", title: plugin.kittencordOrigin === "original" ? "KittenCord Original" : "KittenCord Edition" },
        {
            condition: Boolean(testcordModDetails),
            src: testcordModDetails?.src ?? "",
            alt: testcordModDetails?.alt ?? "Modified",
            title: testcordModDetails?.title ?? "Modified Plugin"
        },
        {
            condition: isModifiedPlugin,
            src: "https://equicord.org/assets/icons/equicord/modified.png",
            alt: "Modified",
            title: "Modified Vencord Plugin"
        },
        {
            condition: isUserPlugin && !isBDPlugin,
            src: "https://equicord.org/assets/icons/misc/userplugin.png",
            alt: "User",
            title: state.sourceLabel
        },
        {
            condition: isEquicordPlugin,
            src: "https://equicord.org/assets/favicon.png",
            alt: "Equicord",
            title: "Equicord Plugin"
        },
        {
            condition: isVencordPlugin,
            src: "https://equicord.org/assets/icons/vencord/icon-light.png",
            alt: "Vencord",
            title: "Vencord Plugin"
        },
        {
            condition: isTestcordPlugin,
            src: TestcordPluginIconUrl,
            alt: "Testcord",
            title: "Testcord Plugin"
        },
        {
            condition: isBDPlugin,
            src: "https://camo.githubusercontent.com/fba98dccf4323b86a2e7599a71e6826f62db4e0bb7d5b637fac9d959111ebfcd/68747470733a2f2f626574746572646973636f72642e6170702f7265736f75726365732f6272616e64696e672f6c6f676f5f736f6c69642e706e67",
            alt: "BetterDiscord",
            title: "BetterDiscord Plugin"
        }
    ];

    const pluginDetails = pluginInfo.find(p => p.condition);

    const tooltip = pluginDetails?.title || "Unknown Plugin";

    const maxVisibleTags = warning ? 1 : 2;
    const { tags } = state;

    const handleWarningClick = (e: React.MouseEvent) => {
        if (!warning?.replacementPlugin) return;
        e.stopPropagation();
        e.preventDefault();
        jumpToPlugin(warning.replacementPlugin);
    };

    const warningTooltipText = warning
        ? warning.replacementPlugin
            ? `${warning.title}: Replaced by ${warning.replacementPlugin} (Click to jump to it)`
            : `${warning.title}: ${warning.description}`
        : "";

    const footer = (
        <div className={cl("card-meta")}>
            {state.version && <span>v{state.version}</span>}
            {runtime?.paused && <span>Temporarily paused</span>}
            {runtime?.quarantined && <span>Quarantined</span>}
            {runtime?.failed && <span>Needs attention</span>}
            <span className={cl("card-source")}>
                {plugin.name === "KittyVoiceLab" ? <span>Kittencord exclusive</span> : pluginDetails && (
                    <img
                        src={pluginDetails.src}
                        alt={pluginDetails.alt}
                        className={cl("source")}
                    />
                )}
                {plugin.name !== "KittyVoiceLab" && tooltip}
            </span>
            {gitRemote && !pluginMeta.userPlugin && <Link href={`https://github.com/${gitRemote}`} aria-label={`Source for ${plugin.name}`}><GithubIcon width={16} height={16} /></Link>}
            <div className={cl("card-badges")}>
                {warning && (
                    <Tooltip text={warningTooltipText}>
                        {({ onMouseEnter: onWarningEnter, onMouseLeave: onWarningLeave }) => (
                            <span
                                className={classes(
                                    cl("card-warning"),
                                    warning.badgeClass || "",
                                    warning.replacementPlugin && cl("warning-clickable")
                                )}
                                onMouseEnter={onWarningEnter}
                                onMouseLeave={onWarningLeave}
                                onClick={handleWarningClick}
                                role={warning.replacementPlugin ? "button" : undefined}
                                tabIndex={warning.replacementPlugin ? 0 : undefined}
                            >
                                <img
                                    src={warning.icon}
                                    alt={warning.label}
                                    className={cl("warning-icon-small")}
                                />
                                {warning.label}
                            </span>
                        )}
                    </Tooltip>
                )}
                {state.stability && (
                    <span
                        className={cl("card-stability")}
                        data-badge={state.stability.badge}
                        title={state.stability.text}
                    >
                        {state.stability.badge === "unstable" ? "Unstable" : "Flaky"}
                    </span>
                )}
                {!!tags?.length && (
                    <div className={cl("card-tags")}>
                        {tags.slice(0, maxVisibleTags).map(tag => (
                            <span key={tag} className={cl("card-tag")}>{tag}</span>
                        ))}
                        {tags.length > maxVisibleTags && (
                            <Tooltip text={tags.slice(maxVisibleTags).join(", ")}>
                                {({ onMouseEnter: onTagEnter, onMouseLeave: onTagLeave }) => (
                                    <span
                                        className={cl("card-tag")}
                                        onMouseEnter={onTagEnter}
                                        onMouseLeave={onTagLeave}
                                    >
                                        +{tags.length - maxVisibleTags}
                                    </span>
                                )}
                            </Tooltip>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    const warningBadge = warning ? (
        <Tooltip text={warningTooltipText}>
            {({ onMouseEnter: onWarningEnter, onMouseLeave: onWarningLeave }) => (
                <div
                    className={classes(
                        cl("warning-badge"),
                        warning.badgeClass || "",
                        warning.replacementPlugin && cl("warning-clickable")
                    )}
                    onMouseEnter={onWarningEnter}
                    onMouseLeave={onWarningLeave}
                    onClick={handleWarningClick}
                    role={warning.replacementPlugin ? "button" : "img"}
                    aria-label={warning.title}
                    tabIndex={warning.replacementPlugin ? 0 : undefined}
                >
                    <img
                        src={warning.icon}
                        alt={warning.label}
                        className={cl("warning-icon")}
                    />
                </div>
            )}
        </Tooltip>
    ) : null;

    return (
        <AddonCard
            icon={studio ? <span className="kc-tool-icon"><KittycordIcon width={28} height={28} aria-hidden="true" /></span> : null}
            author={<div className="kc-plugin-authors">{(plugin.authors?.length ? plugin.authors : [undefined]).map((author, index) => <PublisherIdentity key={`${plugin.name}-author-${author?.id ?? "unknown"}-${index}`} author={author?.name || "Unlisted contributor"} github={author?.github} avatar={author?.id != null && author.id !== 0n ? UserStore.getUser(String(author.id))?.getAvatarURL() : undefined} source={index ? "" : state.sourceLabel} />)}</div>}
            name={pluginDisplayName(plugin.name)}
            tooltip={tooltip}
            description={<>{plugin.description}{dependencyProblem && <Paragraph role="status">{dependencyProblem.message}</Paragraph>}</>}
            isNew={isNew}
            warningBadge={warningBadge}
            enabled={state.enabled}
            setEnabled={state.toggle}
            disabled={disabled || Boolean(dependencyProblem)}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            infoButton={
                <button
                    aria-label={`Settings and details for ${plugin.name}`}
                    onClick={() => openPluginModal(plugin, onRestartNeeded)}
                    className={cl("info-button")}
                >
                    {state.hasSettings
                        ? <CogWheel className={cl("info-icon")} />
                        : <InfoIcon className={cl("info-icon")} />
                    }
                </button>
            }
            footer={footer}
        />
    );
}
