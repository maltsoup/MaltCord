/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { get, set } from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { type CapsuleReminder, createTimeCapsule } from "@shared/kittycord/timeCapsule";
import { Devs } from "@utils/constants";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { Menu, MessageActions, React, TextInput, UserStore, useState } from "@webpack/common";
import type { ComponentProps } from "react";

import style from "./style.css?managed";

const capsule = createTimeCapsule({
    read: account => get(`KittenCord:TimeCapsule:${account}`),
    write: (account, reminders) => set(`KittenCord:TimeCapsule:${account}`, reminders),
    notify: reminder => showNotification({ title: "Kitty Time Capsule", body: reminder.title || "Your message reminder is ready.", onClick: () => openDashboard(), noPersist: true })
});
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let failure = "";
async function connect() {
    const current = ++generation;
    try { await capsule.connect(UserStore.getCurrentUser()?.id ?? ""); if (current === generation) { failure = ""; await capsule.tick(); } }
    catch (error) { failure = error instanceof Error ? error.message : "Reminders could not load. Your saved data was kept."; }
}
function localDate(value: number) { const date = new Date(value - new Date(value).getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16); }
const ReminderEditor = ErrorBoundary.wrap(function ReminderEditor({ reminder, onClose, ...props }: ComponentProps<typeof ModalRoot> & { reminder: CapsuleReminder; onClose(): void; }) {
    const [title, setTitle] = useState(reminder.title), [date, setDate] = useState(localDate(Math.max(reminder.at, Date.now() + 60000)));
    const [error, setError] = useState(""), [busy, setBusy] = useState(false);
    return <ModalRoot {...props} className="kc-time-capsule"><ModalHeader>Remind me about this message</ModalHeader><ModalContent><label>Reminder<TextInput maxLength={200} value={title} onChange={setTitle} /></label><label>Date and time<TextInput type="datetime-local" value={date} onChange={setDate} /></label><Paragraph>Saved locally for this Discord account. No message will be sent.</Paragraph>{error && <Paragraph role="alert">{error}</Paragraph>}</ModalContent><ModalFooter><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => { setBusy(true); void capsule.put({ ...reminder, title, at: new Date(date).getTime() }).then(onClose, error => { setBusy(false); setError(error instanceof Error ? error.message : "Reminder was not saved."); }); }}>Save reminder</Button></ModalFooter></ModalRoot>;
}, { noop: true });
function edit(reminder: CapsuleReminder) { openModal(props => <ReminderEditor {...props} reminder={reminder} />); }
const Dashboard = ErrorBoundary.wrap(function Dashboard({ onClose, ...props }: ComponentProps<typeof ModalRoot> & { onClose(): void; }) {
    const reminders = React.useSyncExternalStore(capsule.subscribe, capsule.snapshot, capsule.snapshot);
    const [error, setError] = useState("");
    function work(action: Promise<void>) { void action.catch(error => setError(error instanceof Error ? error.message : "Reminder was not changed.")); }
    return <ModalRoot {...props} className="kc-time-capsule"><ModalHeader>Kitty Time Capsule</ModalHeader><ModalContent>{(error || failure) && <Paragraph role="alert">{error || failure}</Paragraph>}{!reminders.length && <Paragraph>No reminders. Right-click a message and choose Time Capsule.</Paragraph>}{[...reminders].sort((a, b) => a.at - b.at).map(reminder => <article key={reminder.id}><div><strong>{reminder.title || "Message reminder"}</strong><time dateTime={new Date(reminder.at).toISOString()}>{new Date(reminder.at).toLocaleString()}{reminder.at <= Date.now() ? " · Due" : ""}</time></div><div className="kc-capsule-actions"><Button size="small" variant="secondary" onClick={() => { MessageActions.jumpToMessage({ channelId: reminder.channelId, messageId: reminder.messageId, flash: true }); onClose(); }}>Open message</Button><Button size="small" variant="secondary" onClick={() => edit(reminder)}>Edit</Button><Button size="small" variant="secondary" onClick={() => work(capsule.snooze(reminder.id))}>Snooze 10m</Button><Button size="small" variant="secondary" onClick={() => work(capsule.remove(reminder.id))}>{reminder.at <= Date.now() ? "Dismiss" : "Delete"}</Button></div></article>)}</ModalContent><ModalFooter><Button variant="secondary" onClick={onClose}>Close</Button></ModalFooter></ModalRoot>;
}, { noop: true });
function openDashboard() { openModal(props => <Dashboard {...props} />); }
export default definePlugin({
    name: "KittyTimeCapsule", description: "Keep local message reminders with scheduling, snooze and a link back to the original conversation.",
    authors: [Devs.Kittencord], kittencordOrigin: "original", tags: ["Utility", "Chat"], dependencies: ["ContextMenuAPI"], managedStyle: style,
    settingsAboutComponent: () => <Button onClick={openDashboard}>Open Time Capsule</Button>,
    toolboxActions: { "Open Time Capsule": openDashboard },
    contextMenus: { message(children, { message }: { message: Message; }) { if (!message?.id) return; children.push(<Menu.MenuItem key="kitty-time-capsule" id="kitty-time-capsule" label="Time Capsule" action={() => edit({ id: crypto.randomUUID(), messageId: message.id, channelId: message.channel_id, title: (message.content || "Message reminder").slice(0, 200), at: Date.now() + 3600000, notified: false })} />); } },
    flux: { CONNECTION_OPEN() { void connect(); }, LOGOUT() { generation++; capsule.disconnect(); } },
    start() { void connect(); timer = setInterval(() => { void capsule.tick().catch(error => { failure = error instanceof Error ? error.message : "Reminder check failed."; }); }, 5000); },
    stop() { generation++; if (timer) clearInterval(timer); timer = undefined; capsule.disconnect(); }
});
