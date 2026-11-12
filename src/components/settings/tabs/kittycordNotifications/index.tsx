/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordCloudNotifications as cloud, useCloudNotifications } from "@api/KittycordCloudNotifications";
import { openNotificationLogModal } from "@api/Notifications/notificationLog";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { openSettingsTabModal, SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import config from "@shared/kittycord/cloudConfig.json";
import { CLOUD_NOTIFICATION_CATEGORIES, type CloudClientResult, type CloudNotification } from "@shared/kittycord/cloudNotifications";
import { catalogImageUrl } from "@shared/kittycord/imageSources";
import { React, useCallback, useEffect, UserStore, useState, useStateFromStores } from "@webpack/common";

import { KcIcon } from "../kittenIcons";
import { openKittenPage } from "../kittenNavigation";
import { ActionIcon, CompactNotice, Counter, EmptyState, OverflowMenu, PageHeader, Popover, PrefGroup, PrefRow, PrefSwitchRow } from "../KittenUI";
import { openNotificationSettingsModal } from "../vencord/NotificationSettings";

function useAction() {
    const [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
    const action = useCallback(async (operation: () => Promise<unknown>) => {
        setBusy(true); setFailure("");
        try { await operation(); } catch (error) { setFailure(error instanceof Error ? error.message : "The request failed."); } finally { setBusy(false); }
    }, []);
    return { busy, failure, setFailure, action };
}

function CloudUnavailable() {
    return !cloud.enabled
        ? <EmptyState title="Cloud service not configured">This build has no service address. Your installed plugins and settings remain available.</EmptyState>
        : <CompactNotice>Account connection is available in the desktop client. Browser extensions follow the browser update flow.</CompactNotice>;
}

/** Account & Sync › Cloud: account connection and which announcement categories you receive. */
export function CloudConnection() {
    const accountId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const { feed, error } = useCloudNotifications();
    const [account, setAccount] = useState<CloudClientResult>({});
    const { busy, failure, setFailure, action } = useAction();
    useEffect(() => {
        let active = true; setAccount({}); setFailure("");
        if (cloud.enabled && cloud.supported) {
            void cloud.refresh();
            void cloud.command("session").then(value => { if (active) setAccount(value); }, error => { if (active) setFailure(String(error)); });
        }
        return () => { active = false; };
    }, [accountId]);
    useEffect(() => {
        if (!account.pending) return;
        let active = true, polling = false;
        const timer = setInterval(() => {
            if (polling) return;
            if (account.expiresAt && account.expiresAt < Date.now()) { setAccount({}); setFailure("The connection code expired. Connect again to retry."); return; }
            polling = true;
            void cloud.command("poll").then(value => { if (active && !value.pending) { setAccount(value); void cloud.refresh(); } }, error => { if (active) { setFailure(String(error)); setAccount({}); } }).finally(() => { polling = false; });
        }, 6000);
        return () => { active = false; clearInterval(timer); };
    }, [account.pending, account.expiresAt, accountId]);
    if (!cloud.enabled || !cloud.supported) return <CloudUnavailable />;
    return <>
        {(failure || error) && <CompactNotice>{failure || error}</CompactNotice>}
        <PrefGroup title="MaltCord Cloud" footer="Public announcements and read controls work on this device. Connecting syncs your choices and adds account or team announcements.">
            <PrefRow icon="cloud" brand={!!account.user} label={account.user ? `Connected as ${account.user.username}` : "Not connected"} description={account.user ? account.user.id : "Connect your Discord account"} control={<>
                <Button size="small" variant="secondary" className="kc-btn kc-btn-row" disabled={busy} onClick={() => void action(() => cloud.refresh())}>Refresh</Button>
                <Button size="small" variant={account.authenticated ? "secondary" : "primary"} className="kc-btn kc-btn-row" disabled={busy || account.pending} onClick={() => void action(async () => { const value = await cloud.command(account.authenticated ? "logout" : "start"); if (UserStore.getCurrentUser()?.id === accountId) setAccount(value); await cloud.refresh(); })}>{account.authenticated ? "Disconnect" : "Connect"}</Button>
            </>}>{account.pending && <span role="status">Connection code: <strong>{account.code}</strong> · <Link href={account.verificationUri}>Open approval page</Link></span>}</PrefRow>
        </PrefGroup>
        {feed.authenticated && <PrefGroup title="Announcements you receive">
            {CLOUD_NOTIFICATION_CATEGORIES.map(category => <PrefSwitchRow key={category} icon="bell" label={category} value={feed.categories.includes(category)} disabled={busy} onChange={value => void action(() => cloud.preferences(value ? [...feed.categories, category] : feed.categories.filter(item => item !== category)))} />)}
        </PrefGroup>}
    </>;
}

function itemMenu(item: CloudNotification, action: (operation: () => Promise<unknown>) => void) {
    return [
        ...(item.url ? [{ id: "open", label: "Read more", action: () => VencordNative.native.openExternal(item.url) }] : []),
        { id: "read", label: item.read ? "Mark as unread" : "Mark as read", action: () => action(() => item.read ? cloud.unread([item.id]) : cloud.mark([item.id])) },
        { id: "delete", label: "Delete", action: () => action(() => cloud.remove([item.id])) },
    ];
}

function NotificationItem({ item, action, full }: { item: CloudNotification; action(operation: () => Promise<unknown>): void; full?: boolean; }) {
    return <div className="kc-pref-row kc-notification" data-unread={!item.read || undefined}>
        <div className="kc-pref-main">
            <span className="kc-pref-text">
                <span className="kc-pref-label">{item.title}</span>
                <span className="kc-pref-description">{item.category} · <time dateTime={new Date(item.publish_at).toISOString()}>{new Date(item.publish_at).toLocaleString()}</time></span>
            </span>
            <OverflowMenu label={`Actions for ${item.title}`} items={itemMenu(item, action)} />
        </div>
        {full && <div className="kc-pref-extra"><pre className="kc-cloud-message">{item.message}</pre>{item.image && <img className="kc-market-cover" src={catalogImageUrl(item.image, config.origin)} alt={item.title} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}</div>}
    </div>;
}

/** The full announcement feed with every read and cleanup control. */
export function NotificationFeed() {
    const { feed, error } = useCloudNotifications();
    const { busy, failure, action } = useAction();
    useEffect(() => { if (cloud.enabled && cloud.supported) void cloud.refresh(); }, []);
    if (!cloud.enabled || !cloud.supported) return <CloudUnavailable />;
    const unread = feed.unreadCount ?? feed.items.filter(item => !item.read).length;
    return <div className="kc-page">
        <PageHeader title="Notifications" description={`${unread} unread${feed.authenticated ? " · Changes sync with your account." : " · Choices are saved on this device."}`} primary={<Button size="small" className="kc-btn" disabled={busy || !feed.items.some(item => !item.read)} onClick={() => void action(() => cloud.mark())}>Mark all read</Button>} overflow={[
            { id: "clear-read", label: "Clear read", disabled: busy || !feed.items.some(item => item.read), action: () => void action(() => cloud.clearRead()) },
            { id: "preferences", label: "Notification preferences", action: () => openKittenPage("backup", "cloud") },
            { id: "clear-all", label: "Clear all", disabled: busy || !feed.items.length, action: () => void action(() => cloud.clearAll()), danger: { title: "Clear your notifications?", body: "This clears announcements in your personal feed. It does not delete the original announcements.", confirmText: "Clear all" } },
        ]} />
        {(failure || error) && <CompactNotice>{failure || error}</CompactNotice>}
        {feed.items.length ? <div className="kc-pref-list">{feed.items.map(item => <NotificationItem key={item.id} item={item} action={action} full />)}</div> : <EmptyState title="You’re up to date">Announcements will appear here when published for your version and channel.</EmptyState>}
        {feed.next && <Button size="small" variant="secondary" className="kc-btn" disabled={busy} onClick={() => void action(() => cloud.refresh(feed.next ?? undefined))}>Older announcements</Button>}
    </div>;
}

function NotificationsPage() {
    return <SettingsTab><NotificationFeed /></SettingsTab>;
}
const NotificationsTab = wrapTab(NotificationsPage, "Notifications");
export default NotificationsTab;

/** Home header bell: unread count, latest announcements and the read controls (spec §2). */
export function NotificationBell() {
    const { feed } = useCloudNotifications();
    const [open, setOpen] = useState(false);
    const { busy, action } = useAction();
    const close = useCallback(() => setOpen(false), []);
    const available = cloud.enabled && cloud.supported;
    const unread = feed.unreadCount ?? feed.items.filter(item => !item.read).length;
    return <span className="kc-bell">
        <ActionIcon label={unread ? `Notifications, ${unread} unread` : "Notifications"} onClick={() => { if (!open && available) void cloud.refresh(); setOpen(value => !value); }}><KcIcon name="bell" /></ActionIcon>
        {unread > 0 && <span className="kc-bell-count"><Counter value={unread} /></span>}
        <Popover open={open} onClose={close} label="Notifications">
            <div className="kc-popover-head"><Heading tag="h3" className="kc-pref-group-title">Notifications</Heading>
                {available && <Button size="small" variant="secondary" className="kc-btn kc-btn-row" disabled={busy || !unread} onClick={() => void action(() => cloud.mark())}>Mark all read</Button>}</div>
            {!available ? <Paragraph className="kc-popover-note">MaltCord announcements need the desktop client with the Cloud service configured.</Paragraph>
                : feed.items.length ? <div className="kc-popover-list">{feed.items.slice(0, 5).map(item => <NotificationItem key={item.id} item={item} action={action} />)}</div>
                    : <Paragraph className="kc-popover-note">You’re up to date.</Paragraph>}
            <div className="kc-popover-foot">
                {available && <Button size="small" variant="secondary" className="kc-btn kc-btn-row" disabled={busy || !feed.items.some(item => item.read)} onClick={() => void action(() => cloud.clearRead())}>Clear read</Button>}
                <Button size="small" variant="secondary" className="kc-btn kc-btn-row" onClick={() => { close(); openNotificationLogModal(); }}>Log</Button>
                <Button size="small" variant="secondary" className="kc-btn kc-btn-row" onClick={() => { close(); openNotificationSettingsModal(); }}>Settings</Button>
                {available && <Button size="small" variant="secondary" className="kc-btn kc-btn-row" onClick={() => { close(); openSettingsTabModal(NotificationsTab); }}>See all</Button>}
            </div>
        </Popover>
    </span>;
}
