/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useVerifiedNativeSource, verifiedSourceLabel } from "@api/KittycordPackageSource";
import { NativeStudio } from "@api/NativeStudio";
import { showNotice } from "@api/Notices";
import { PluginHealth } from "@api/PluginHealth";
import { getPluginDependencyProblem, getPluginRuntimeState, hasAnyVisibleSettings, isPluginSelected, pluginRequiresRestart, startDependenciesRecursive, startPlugin, stopPlugin } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { Paragraph } from "@components/Paragraph";
import { settings as TestcordHelperSettings } from "@testcordplugins/TestcordHelper";
import { Logger } from "@utils/Logger";
import { Margins } from "@utils/margins";
import { getPluginWarning, type PluginWarningInfo } from "@utils/pluginWarnings";
import { getTestcordModifiedDetails, isTestcordModified, TestcordPluginIconUrl } from "@utils/testcordIcons";
import type { Plugin } from "@utils/types";
import { ConfirmModal, openModal, React, showToast, Toasts } from "@webpack/common";
import KittenLogo from "file://../../../kittencord.png?base64";

import { PluginMeta } from "~plugins";

import { jumpToPlugin } from "./jumpToPlugin";

const logger = new Logger("PluginCard");

// Hoisted so each card passes the same array instance across renders.
const PLUGIN_ENABLED_PATHS: Record<string, readonly `plugins.${string}.enabled`[]> = {};

function showEnableWarningModal(plugin: Plugin, warningInfo: PluginWarningInfo, onConfirm: () => void) {
    const isExp = warningInfo.type === "experimental";
    openModal(props => (
        <ConfirmModal
            {...props}
            title={isExp ? "Experimental Plugin Warning" : "Legacy Plugin Warning"}
            confirmText="Enable Anyway"
            cancelText="Cancel"
            variant={isExp ? "critical-primary" : "primary"}
            onConfirm={onConfirm}
            onCancel={props.onClose}
        >
            <div>
                {isExp ? (
                    <>
                        <Paragraph><strong>{plugin.name}</strong> is an experimental plugin that is in active experimentation or development.</Paragraph>
                        <Paragraph className={Margins.top8}>This plugin may not behave correctly and might brick or break some stuff and settings. We are not responsible for any issues, client instability, crashes, or data loss caused by using this plugin.</Paragraph>
                        <Paragraph className={Margins.top8}>Are you sure you want to enable this plugin?</Paragraph>
                    </>
                ) : (
                    <>
                        <Paragraph><strong>{plugin.name}</strong> is a legacy plugin and is no longer actively maintained or updated.</Paragraph>
                        <Paragraph className={Margins.top8}>
                            Because Discord updates frequently, this plugin may not behave correctly and could cause errors or visual glitches.
                            {warningInfo.replacementPlugin && <> It has been replaced by <strong>{warningInfo.replacementPlugin}</strong>, which we recommend using instead.</>}
                        </Paragraph>
                        <Paragraph className={Margins.top8}>Are you sure you want to enable this plugin?</Paragraph>
                    </>
                )}
            </div>
        </ConfirmModal>
    ));
}

export type PluginSource = "kittencord" | "studio" | "local" | "cloud" | "testcord" | "equicord" | "vencord" | "betterdiscord" | "imported";

export function pluginDisplayName(name: string) {
    return (TestcordHelperSettings?.store?.splitPluginNames ?? true) ? name.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2") : name;
}

/** Everything a plugin row or card needs: selection, the exact enable/disable flow, source and health badges. */
export function usePluginState(plugin: Plugin, onRestartNeeded: (name: string, key: string) => void) {
    const cloudSource = useVerifiedNativeSource(plugin.id);
    const dependencyProblem = getPluginDependencyProblem(plugin.name);
    const canonicalId = plugin.id ?? plugin.name;
    const settingsKey = `plugins.${canonicalId}.enabled` as const;
    const legacyKey = canonicalId !== plugin.name ? `plugins.${plugin.name}.enabled` as const : null;
    // Subscribe to canonical and (if it differs) legacy path so old installs still react
    useSettings(PLUGIN_ENABLED_PATHS[canonicalId] ??= legacyKey ? [settingsKey, legacyKey] : [settingsKey]);

    const pluginMeta = PluginMeta[plugin.name] || { folderName: "", userPlugin: false };
    const studio = pluginMeta.folderName.startsWith("src/userplugins/.studio/");
    const [nativeStatus, setNativeStatus] = React.useState(() => studio ? NativeStudio.snapshot().find(item => item.id === plugin.id) : undefined);
    React.useEffect(() => {
        if (!studio) return;
        const refresh = () => setNativeStatus(NativeStudio.snapshot().find(item => item.id === plugin.id));
        refresh(); return NativeStudio.subscribe(refresh);
    }, [studio, plugin.id]);

    // Re-render when the stability score for *this* plugin changes (e.g. when
    // history finishes loading from IndexedDB after the Plugins tab opens).
    const [stabilityTick, setStabilityTick] = React.useState(0);
    React.useEffect(() => {
        let lastBadge = PluginHealth.getStability(plugin.name).badge;
        return PluginHealth.subscribe(() => {
            const next = PluginHealth.getStability(plugin.name).badge;
            if (next !== lastBadge) { lastBadge = next; setStabilityTick(t => t + 1); }
        });
    }, [plugin.name]);
    const stability = React.useMemo(() => PluginHealth.getStability(plugin.name), [plugin.name, stabilityTick]);

    const warning = getPluginWarning(plugin);
    const replacement = warning?.replacementPlugin;
    const isEnabled = () => isPluginSelected(plugin.name);
    const runtime = getPluginRuntimeState(plugin.name);

    function doToggle(wasEnabled: boolean) {
        const nextEnabled = !wasEnabled;
        const setEnabledState = (enabled: boolean) => {
            Settings.plugins[canonicalId] ??= { enabled };
            Settings.plugins[canonicalId].enabled = enabled;
            if (canonicalId !== plugin.name) {
                Settings.plugins[plugin.name] ??= { enabled };
                Settings.plugins[plugin.name].enabled = enabled;
            }
            void PluginHealth.recordPluginChange(canonicalId, enabled);
        };

        // If we're enabling a plugin, make sure all deps are enabled recursively.
        if (!wasEnabled) {
            const { restartNeeded, failures } = startDependenciesRecursive(plugin);
            if (failures.length) {
                logger.error(`Failed to start dependencies for ${plugin.name}: ${failures.join(", ")}`);
                showNotice("Failed to start dependencies: " + failures.join(", "), "Close", () => null);
                return;
            }
            if (restartNeeded) {
                // If any dependencies have patches, don't start the plugin yet.
                setEnabledState(true);
                onRestartNeeded(plugin.name, "enabled");
                return;
            }
        }

        // if the plugin requires a restart, don't use stopPlugin/startPlugin. Wait for restart to apply changes.
        if (pluginRequiresRestart(plugin)) {
            setEnabledState(nextEnabled);
            onRestartNeeded(plugin.name, "enabled");
            return;
        }

        // If the plugin is enabled, but hasn't been started, then we can just toggle it off.
        if (wasEnabled && !plugin.started) {
            setEnabledState(false);
            return;
        }

        // Set state in settings before starting so startup checks see it enabled
        setEnabledState(nextEnabled);
        const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);
        if (!result) {
            setEnabledState(wasEnabled);
            showToast(`Error while ${wasEnabled ? "stopping" : "starting"} plugin ${plugin.name}`, Toasts.Type.FAILURE, { position: Toasts.Position.BOTTOM });
        }
    }

    function toggle() {
        const wasEnabled = isEnabled();
        if (studio) {
            void NativeStudio.command({ id: plugin.id, operation: wasEnabled ? "disable" : "enable" }).then(() => { if (pluginRequiresRestart(plugin)) onRestartNeeded(plugin.name, "enabled"); }, error => { logger.error("Native plugin activation failed.", error); showToast(error instanceof Error ? error.message : String(error), Toasts.Type.FAILURE); });
            return;
        }
        if (!wasEnabled && warning && (warning.type === "experimental" || warning.type === "legacy")) {
            showEnableWarningModal(plugin, warning, () => doToggle(false));
            return;
        }
        doToggle(wasEnabled);
    }

    const isTestcordMod = isTestcordModified(plugin, pluginMeta.folderName);
    const testcordModDetails = isTestcordMod ? getTestcordModifiedDetails(plugin, pluginMeta.folderName) : null;
    const isBDPlugin = pluginMeta.folderName?.startsWith("src/Betterdiscordplugins/") || plugin.tags?.includes("betterdiscord");
    const source: PluginSource = plugin.kittencordOrigin && !studio ? "kittencord"
        : cloudSource ? "cloud"
            : isBDPlugin ? "betterdiscord"
                : pluginMeta.userPlugin ? studio ? "studio" : "local"
                    : pluginMeta.folderName.startsWith("src/testcordplugins/") ? "testcord"
                        : pluginMeta.folderName.startsWith("src/equicordplugins/") ? "equicord"
                            : pluginMeta.folderName.startsWith("src/plugins/") ? "vencord" : "imported";
    const sourceLabel = source === "kittencord" ? plugin.kittencordOrigin === "original" ? "MaltCord Original" : "MaltCord Edition"
        : source === "cloud" && cloudSource ? verifiedSourceLabel(cloudSource)
            : ({ studio: "MaltCord Studio", local: "Local Plugin", testcord: "TestCord", equicord: "Equicord", vencord: "Vencord", betterdiscord: "BetterDiscord", imported: "Imported Plugin" } as Record<string, string>)[source] ?? "Plugin";

    const tags = React.useMemo(() => {
        const list = [...(plugin.tags ?? [])];
        if (isTestcordMod && !list.includes("Testcord Modified")) list.unshift("Testcord Modified");
        return list;
    }, [plugin.tags, isTestcordMod]);

    const sourceIcon: { src: string; alt: string; } | undefined =
        source === "kittencord" ? { src: `data:image/png;base64,${KittenLogo}`, alt: "MaltCord" }
            : testcordModDetails ? { src: testcordModDetails.src, alt: testcordModDetails.alt }
                : plugin.isModified ? { src: "https://equicord.org/assets/icons/equicord/modified.png", alt: "Modified" }
                    : source === "local" || source === "studio" || source === "cloud" ? { src: "https://equicord.org/assets/icons/misc/userplugin.png", alt: "Local" }
                        : source === "equicord" ? { src: "https://equicord.org/assets/favicon.png", alt: "Equicord" }
                            : source === "vencord" ? { src: "https://equicord.org/assets/icons/vencord/icon-light.png", alt: "Vencord" }
                                : source === "testcord" ? { src: TestcordPluginIconUrl, alt: "TestCord" }
                                    : source === "betterdiscord" ? { src: "https://betterdiscord.app/resources/branding/logo_solid.png", alt: "BetterDiscord" }
                                        : undefined;

    return {
        sourceIcon,
        enabled: isEnabled(),
        toggle,
        dependencyProblem,
        runtime,
        warning,
        warningText: warning ? warning.replacementPlugin ? `${warning.title}: Replaced by ${warning.replacementPlugin}` : `${warning.title}: ${warning.description}` : "",
        jumpToReplacement: replacement ? () => jumpToPlugin(replacement) : undefined,
        stability: stability.badge === "flaky" || stability.badge === "unstable" ? { badge: stability.badge, text: `Broken in ${stability.sessionsBroken} of the last ${stability.sessionsSeen} sessions (${Math.round(stability.ratio * 100)}%).` } : undefined,
        source,
        sourceLabel,
        modifiedTitle: testcordModDetails?.title ?? (plugin.isModified ? "Modified Vencord Plugin" : undefined),
        studio,
        version: nativeStatus?.version,
        userPlugin: pluginMeta.userPlugin,
        tags,
        hasSettings: hasAnyVisibleSettings(plugin),
    };
}
