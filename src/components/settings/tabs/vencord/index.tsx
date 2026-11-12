/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./VencordTab.css";

import { pluginCounts } from "@api/PluginCounts";
import { useSettings } from "@api/Settings";
import { openPluginModal, SettingsTab, wrapTab } from "@components/settings";
import { SpecialCard } from "@components/settings/SpecialCard";
import BadgeAPI from "@plugins/_api/badges";
import SettingsPlugin from "@plugins/_core/settings";
import { DONOR_ROLE_ID, EQUICORD_GUILD_ID, IS_MAC, IS_WINDOWS, VC_DONOR_ROLE_ID, VC_GUILD_ID } from "@utils/constants";
import { relaunch } from "@utils/native";
import { promptToRestart } from "@utils/promptToRestart";
import { GuildMemberStore, React, UserStore } from "@webpack/common";
import type { ReactNode } from "react";

import { type KcIconName } from "../kittenIcons";
import { openKittenPage } from "../kittenNavigation";
import { KcPage, PrefGroup, PrefLinkRow, PrefSwitchRow } from "../KittenUI";
import { DonateButtonComponent } from "./DonateButton";
import { KittycordCommunityCard } from "./KittycordCommunityCard";
import { MacOSVibrancySettings } from "./MacVibrancySettings";
import { WindowsMaterialSettings } from "./WindowsMaterialSettings";

const VENNIE_DONATOR_IMAGE = "https://cdn.discordapp.com/emojis/1238120638020063377.png";

const DONOR_BACKGROUND_IMAGE = "https://media.discordapp.net/stickers/1311070116305436712.png?size=2048";

type SwitchKey = "useTestcordIcon" | "useQuickCss" | "safeStart" | "mainWindowFrameless" | "frameless" | "nativeTitleBar" | "transparent" | "disableMinSize" | "winCtrlQ";
type SwitchItem = false | { key: SwitchKey; title: string; description: string; restartRequired?: boolean; icon?: KcIconName; };

const windowSwitches: SwitchItem[] = [
    (!IS_WEB && !IS_DISCORD_DESKTOP || !IS_WINDOWS) && {
        key: "mainWindowFrameless",
        title: "Hide the main window frame",
        description: "Remove the native frame. Drag the title bar area to move the window.",
        restartRequired: true,
    },
    !IS_WEB && (!IS_DISCORD_DESKTOP || !IS_WINDOWS
        ? {
            key: "frameless",
            title: "Hide all window frames",
            description: "Remove the native frame from every window. Drag the title bar area to move them.",
            restartRequired: true,
        }
        : {
            key: "nativeTitleBar",
            title: "Use the Windows title bar",
            description: "Replace Discord's title bar with the standard one. Not used while Window transparency is on: Discord keeps its own buttons then.",
            restartRequired: true,
        }
    ),
    !IS_WEB && {
        key: "transparent",
        title: "Window transparency",
        description: IS_WINDOWS
            ? "Needs a theme that supports it. The Windows title bar option is not used with it; move the window by dragging Discord's top bar. Snapping to screen edges may not work."
            : "Needs a theme that supports it. The window can no longer be resized.",
        restartRequired: true,
    },
    IS_DISCORD_DESKTOP && {
        key: "disableMinSize",
        title: "Allow any window size",
        description: "Resize the window below Discord's minimum size.",
        restartRequired: true
    },
    !IS_WEB && IS_WINDOWS && {
        key: "winCtrlQ",
        title: "Close Discord with Ctrl+Q",
        description: "An alternative to Alt+F4.",
        restartRequired: true,
    },
];

function SettingSwitches({ items }: { items: SwitchItem[]; }) {
    const settings = useSettings(["useTestcordIcon", "useQuickCss", "safeStart", "mainWindowFrameless", "frameless", "nativeTitleBar", "transparent", "disableMinSize", "winCtrlQ"]);
    return <>{items.map(item => item && <PrefSwitchRow
        key={item.key}
        icon={item.icon ?? "window"}
        label={item.title}
        description={item.description}
        value={settings[item.key]}
        onChange={value => {
            settings[item.key] = value;
            if (item.restartRequired) promptToRestart("relaunch");
        }}
    />)}</>;
}

function EquicordSettings({ navigationEditor }: { navigationEditor?: ReactNode; }) {
    const user = UserStore?.getCurrentUser();
    const counts = pluginCounts();
    const failing = counts.issues;
    const windowEffects = !IS_WEB && (IS_MAC || IS_WINDOWS && VencordNative.native.supportsWindowsMaterial());

    return (
        <SettingsTab>
            <KcPage>
                <KittycordCommunityCard running={counts.running} failing={failing} overflow={[
                    { id: "quickcss", label: "Edit QuickCSS", action: () => VencordNative.quickCss.openEditor() },
                    ...(!IS_WEB ? [{ id: "folder", label: "Open settings folder", action: () => VencordNative.settings.openFolder() }] : []),
                    { id: "placement", label: "Settings placement", action: () => openPluginModal(SettingsPlugin) },
                    ...(!IS_WEB ? [{ id: "relaunch", label: "Relaunch Discord", action: relaunch }] : []),
                ]} />
                {(isEquicordDonor(user?.id) || isVencordDonor(user?.id)) && (
                    <SpecialCard
                        title="Upstream Donations"
                        subtitle="Thank you for donating!"
                        description={
                            isEquicordDonor(user?.id) && isVencordDonor(user?.id)
                                ? "All Vencord users can see your Vencord donor badge, and Equicord users can see your Equicord donor badge. To change your Vencord donor badge, contact @vending.machine. For your Equicord donor badge, make a ticket in Equicord's server."
                                : isVencordDonor(user?.id)
                                    ? "All Vencord users can see your badge! You can manage your perks by messaging @vending.machine."
                                    : "All Equicord users can see your badge! You can manage your perks by making a ticket in Equicord's server."
                        }
                        cardImage={VENNIE_DONATOR_IMAGE}
                        backgroundImage={DONOR_BACKGROUND_IMAGE}
                        backgroundColor="#ED87A9"
                    >
                        <DonateButtonComponent donated={true} />
                    </SpecialCard>
                )}

                <PrefGroup title="Jump to">
                    <PrefLinkRow icon="plugin" brand label="Plugins" description={`${counts.enabled} enabled · ${counts.available} available`} onClick={() => openKittenPage("plugins")} />
                    <PrefLinkRow icon="customize" brand label="Themes" description="Local and online themes, snippets and QuickCSS" onClick={() => openKittenPage("themes")} />
                    <PrefLinkRow icon="sync" brand label="Backup & Sync" description="Backups, restore and MaltCord Cloud" onClick={() => openKittenPage("backup")} />
                    <PrefLinkRow icon="health" brand label="Health" description={failing ? `${failing} ${failing === 1 ? "plugin needs" : "plugins need"} attention` : "No startup failures this session"} onClick={() => openKittenPage("health")} />
                </PrefGroup>

                <PrefGroup title="General">
                    <SettingSwitches items={[
                        !IS_WEB && { key: "safeStart", icon: "shield", title: "Safe Start", description: "If Discord fails to start twice in a row, the plugin that caused it stays off for one launch and you see which one it was. If the cause is unknown, optional plugins pause for one launch. A clean start turns it off again." },
                        { key: "useTestcordIcon", icon: "image", title: "Use the MaltCord icon", description: "Show the MaltCord icon instead of the Discord logo." },
                    ]} />
                </PrefGroup>

                {windowSwitches.some(Boolean) && <PrefGroup title="Window" footer="Changes here need a relaunch.">
                    <SettingSwitches items={windowSwitches} />
                    {windowEffects && <div className="kc-pref-row kc-pref-block"><MacOSVibrancySettings /><WindowsMaterialSettings /></div>}
                </PrefGroup>}

                {navigationEditor}
            </KcPage>
        </SettingsTab>
    );
}

export default wrapTab(EquicordSettings, "MaltCord Settings");

export function isEquicordDonor(userId: string): boolean {
    const donorBadges = BadgeAPI.getEquicordDonorBadges(userId);
    return GuildMemberStore.getMember(EQUICORD_GUILD_ID, userId)?.roles.includes(DONOR_ROLE_ID) || !!donorBadges;
}

export function isVencordDonor(userId: string): boolean {
    const donorBadges = BadgeAPI.getDonorBadges(userId);
    return GuildMemberStore.getMember(VC_GUILD_ID, userId)?.roles.includes(VC_DONOR_ROLE_ID) || !!donorBadges;
}
