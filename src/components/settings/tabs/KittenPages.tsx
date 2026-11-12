/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cloudBadges, useCloudBadges } from "@api/KittycordCloud";
import { pluginCounts } from "@api/PluginCounts";
import { useSettings } from "@api/Settings";
import { ThemeTab } from "@equicordplugins/themeLibrary/components/ThemeTab";
import { openOwnerBadgeLayout } from "@plugins/_api/badges/OwnerBadgeLayout";
import { settings } from "@plugins/_core/settings";
import { kittenCloudBadgeImage } from "@shared/kittycord/badges";
import { type KittenPageId, kittenPages, type KittenSegment } from "@shared/kittycord/settingsNavigation";
import { showToast, Toasts, UserStore, useStateFromStores } from "@webpack/common";
import type { ComponentType, ReactNode } from "react";

import PrivacySecurityPanel from "../PrivacySecurityPanel";
import { openSettingsTabModal, SettingsTab, wrapTab } from "./BaseTab";
import Changelog from "./changelog";
import About from "./KittenAbout";
import { KittenAboutLinks } from "./KittenAboutLinks";
import { KcIcon } from "./kittenIcons";
import { openKittenPage, useKittenSegment } from "./kittenNavigation";
import { EmptyState, IconTile, KcButton, KcPage, type OverflowItem, PageHeader, PrefGroup, PrefLinkRow, PrefRow, PrefSwitchRow, Segments } from "./KittenUI";
import DeveloperTools from "./kittycordDeveloperTools";
import Doctor from "./kittycordDoctor";
import { CloudConnection } from "./kittycordNotifications";
import { importPackage, packageLibraryTools, PackagesTab } from "./kittycordPackages";
import Performance from "./kittycordPerformance";
import Profiles from "./kittycordProfiles";
import PluginSecurity from "./kittycordSafety";
import Plugins, { disableAllPlugins } from "./plugins";
import { openUIElementsModal } from "./plugins/UIElements";
import Presets from "./presets";
import Backups from "./sync/BackupAndRestoreTab";
import Themes from "./themes";
import { SnippetMarketplaceSection } from "./themes/SnippetMarketplace";

interface Segment<P extends KittenPageId> { id: KittenSegment<P>; label: string; Component: ComponentType; }
interface HeaderProps { description: string; primary?: ReactNode; overflow?: OverflowItem[]; }

/** A page with sections: page header, a segmented control and the selected section. */
function SegmentedPage<P extends KittenPageId>({ page, segments, ...header }: HeaderProps & { page: P; segments: Segment<P>[]; }) {
    const [segment, setSegment] = useKittenSegment(page, segments[0].id);
    const current = segments.find(item => item.id === segment) ?? segments[0];
    return <SettingsTab><KcPage key={page}>
        <PageHeader title={kittenPages[page].title} {...header} />
        <Segments<KittenSegment<P>> label={`${kittenPages[page].title} sections`} value={current.id} onChange={setSegment} items={segments} />
        <div className="kc-shell-body" key={current.id} role="tabpanel" aria-label={current.label}><current.Component /></div>
    </KcPage></SettingsTab>;
}

/** A single-section page: page header and its content. */
function SimplePage({ page, Component, ...header }: HeaderProps & { page: KittenPageId; Component: ComponentType; }) {
    return <SettingsTab><KcPage key={page}>
        <PageHeader title={kittenPages[page].title} {...header} />
        <div className="kc-shell-body"><Component /></div>
    </KcPage></SettingsTab>;
}

function runSafely(action: () => unknown) {
    void Promise.resolve().then(action).catch(error => showToast(error instanceof Error ? error.message : "The action failed.", Toasts.Type.FAILURE));
}

function LocalPlugins() { return <PackagesTab embedded content="plugins" />; }

function PluginsPage() {
    const { developerMode } = settings.use(["developerMode"]);
    const { enabled } = pluginCounts();
    return <SegmentedPage page="plugins" description="Every plugin in your client, with search, filters, settings and health at a glance."
        primary={developerMode && !IS_WEB ? <KcButton level="primary" onClick={() => runSafely(() => importPackage())}><KcIcon name="plus" size={16} />Import package</KcButton> : undefined}
        overflow={[
            { id: "buttons", label: "Manage plugin buttons", action: openUIElementsModal },
            { id: "security", label: "Plugin security", action: () => openKittenPage("privacy", "security") },
            ...(developerMode ? [
                { id: "inventory", label: "Export inventory", action: packageLibraryTools.exportInventory },
                { id: "snapshots", label: "Export snapshots", action: () => runSafely(packageLibraryTools.exportSnapshots) },
                { id: "clear-snapshots", label: "Clear snapshot archive", action: () => runSafely(packageLibraryTools.clearSnapshots), danger: { title: "Clear source snapshots?", body: "Export first. Only the separate source archive is cleared; installed packages and immediate backups remain.", confirmText: "Clear archive" } },
            ] : []),
            { id: "disable-all", label: "Disable all plugins", disabled: !enabled, action: disableAllPlugins, danger: { title: `Disable ${enabled} plugins?`, body: "Every enabled optional plugin turns off. Core plugins stay on. You can enable them again one by one.", confirmText: "Disable all" } },
        ]} segments={[
            { id: "installed", label: "Installed", Component: Plugins },
            { id: "local", label: "Local", Component: LocalPlugins },
            { id: "studio", label: "Studio", Component: DeveloperTools },
        ]} />;
}

function ThemeLibraryTab() { return <ThemeTab />; }
function SnippetLibraryTab() { return <SnippetMarketplaceSection embedded />; }

function ThemesPage() {
    return <SegmentedPage page="themes" description="Your themes, the community Theme Library and CSS snippets you can stack on top." segments={[
        { id: "installed", label: "Installed", Component: Themes },
        { id: "library", label: "Theme Library", Component: ThemeLibraryTab },
        { id: "snippets", label: "Snippet Library", Component: SnippetLibraryTab },
    ]}
        overflow={[
            { id: "quickcss", label: "Edit QuickCSS", action: () => VencordNative.quickCss.openEditor() },
            ...(!IS_WEB ? [{ id: "folder", label: "Open themes folder", action: () => VencordNative.themes.openFolder() }] : []),
        ]} />;
}

function QuickCss() {
    const settings = useSettings(["useQuickCss"]);
    return <>
        <PrefGroup title="QuickCSS" footer="QuickCSS applies on top of your themes and updates as you type.">
            <PrefSwitchRow icon="palette" label="Custom CSS" description="Apply your QuickCSS." value={settings.useQuickCss} onChange={value => { settings.useQuickCss = value; }} />
            <PrefLinkRow icon="studio" label="Edit QuickCSS" description="Opens the editor in its own window." onClick={() => VencordNative.quickCss.openEditor()} />
        </PrefGroup>
        <PrefGroup title="Related">
            <PrefLinkRow icon="customize" label="Themes" description="Full themes and snippets." onClick={() => openKittenPage("themes")} />
            <PrefLinkRow icon="layers" label="Presets" description="Save and restore a whole look." onClick={() => openKittenPage("presets")} />
        </PrefGroup>
    </>;
}

function QuickCssPage() {
    return <SimplePage page="quickcss" description="Your own CSS, applied on top of every theme." Component={QuickCss}
        primary={<KcButton level="primary" onClick={() => VencordNative.quickCss.openEditor()}>Edit QuickCSS</KcButton>} />;
}

function PresetsPage() {
    return <SimplePage page="presets" description="Save your themes, QuickCSS and plugin choices as a preset, then switch between them." Component={Presets} />;
}

/** While the badge service has not answered yet, the page says so instead of claiming there are no badges. */
function BadgesEmpty({ userId }: { userId: string; }) {
    const state = cloudBadges.enabled ? cloudBadges.state(userId) : "disabled";
    if (state === "disabled") return <PrefRow icon="badge" label="Badges are not available" description="This build is not connected to MaltCord Cloud." />;
    if (state === "offline") return <PrefRow icon="warning" label="Badge service unavailable" description="Your badges could not be loaded. Your saved order is kept." control={<KcButton level="secondary" onClick={() => void cloudBadges.load(userId, true)}>Retry</KcButton>} />;
    if (state !== "verified") return <PrefRow icon="clock" label="Loading your badges…" description="Asking MaltCord Cloud for the badges on your account." />;
    return <PrefRow icon="badge" label="No badges yet" description="Badges assigned to your account appear here." />;
}

function Badges() {
    const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
    const own = useCloudBadges(user?.id ?? "");
    if (!user) return <EmptyState title="Not signed in">Sign in to Discord to see your MaltCord badges.</EmptyState>;
    const assigned = cloudBadges.assigned(user.id);
    return <>
        <PrefGroup title="Your badges" footer="MaltCord badges show on your Discord profile for other MaltCord users. They are separate from Discord's official badges and Nitro.">
            {assigned.length || own.length
                ? assigned.map(badge => <PrefRow key={badge.id} icon={<img className="kc-badge-image" src={kittenCloudBadgeImage(badge)} alt="" />} label={badge.label} description={badge.description ?? "MaltCord badge"} />)
                : <BadgesEmpty userId={user.id} />}
        </PrefGroup>
    </>;
}

function BadgesPage() {
    const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
    useCloudBadges(user?.id ?? "");
    const assigned = user ? cloudBadges.assigned(user.id) : [];
    return <SimplePage page="badges" description="The MaltCord badges on your profile, their order and how they look." Component={Badges}
        primary={user && assigned.length ? <KcButton level="primary" onClick={() => openOwnerBadgeLayout(user.id, assigned.map(badge => ({ id: `kittencord_cloud_${badge.id}`, description: badge.label, iconSrc: kittenCloudBadgeImage(badge) })))}>Arrange badges</KcButton> : undefined} />;
}

function ProfilesPage() {
    return <SimplePage page="profiles" description="Different plugins, themes and preferences per Discord account, server or channel." Component={Profiles} />;
}

function BackupPage() {
    return <SegmentedPage page="backup" description="Back up and restore your settings, and connect MaltCord Cloud." segments={[
        { id: "backup", label: "Backup", Component: Backups },
        { id: "cloud", label: "Cloud", Component: CloudConnection },
    ]} />;
}

function PrivacyPage() {
    return <SegmentedPage page="privacy" description="What MaltCord connects to, and what each plugin is allowed to do." segments={[
        { id: "privacy", label: "Privacy", Component: PrivacySecurityPanel },
        { id: "security", label: "Plugin security", Component: PluginSecurity },
    ]} />;
}

function HealthPage() {
    return <SimplePage page="health" description="Plugin health, conflicts, startup recovery and diagnostics." Component={Doctor}
        overflow={[{ id: "performance", label: "Open Performance", action: () => openKittenPage("performance") }]} />;
}

function PerformancePage() {
    return <SimplePage page="performance" description="Plugin profiler, startup timings and the performance mode." Component={Performance}
        overflow={[{ id: "health", label: "Open Health", action: () => openKittenPage("health") }]} />;
}

function UpdatesPage() {
    return <SimplePage page="updates" description="Your version, update checks and the release notes for published versions." Component={Changelog} />;
}

function AboutSegment() {
    return <><About /><KittenAboutLinks /></>;
}

function AboutPage() {
    return <SimplePage page="about" description="Who makes MaltCord, credits, licenses and links." Component={AboutSegment} />;
}

export const kittenPageComponents: Record<Exclude<KittenPageId, "home">, ComponentType> = {
    plugins: wrapTab(PluginsPage, "Plugins"),
    themes: wrapTab(ThemesPage, "Themes"),
    quickcss: wrapTab(QuickCssPage, "QuickCSS"),
    presets: wrapTab(PresetsPage, "Presets"),
    badges: wrapTab(BadgesPage, "Badges"),
    profiles: wrapTab(ProfilesPage, "Profiles & Rules"),
    backup: wrapTab(BackupPage, "Backup & Sync"),
    privacy: wrapTab(PrivacyPage, "Privacy & Security"),
    health: wrapTab(HealthPage, "Health"),
    performance: wrapTab(PerformancePage, "Performance"),
    updates: wrapTab(UpdatesPage, "Updates"),
    about: wrapTab(AboutPage, "About"),
};

export { IconTile, openSettingsTabModal };
