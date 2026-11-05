/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { captureAccountSetup, commitAccountSetup } from "@api/KittycordAccountSetup";
import { getProfileSettings } from "@api/KittycordProfiles";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { type AccountSetup,accountSetup, accountSetupKey } from "@shared/kittycord/accountSetup";
import { Alerts, useEffect, UserStore,useState, useStateFromStores } from "@webpack/common";

import { SetupEditor } from "./SetupEditor";

export function AccountSetupPanel({ accountId }: { accountId?: string; }) {
    const signedIn = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);
    const [saved, setSaved] = useState<AccountSetup>();
    const [previous, setPrevious] = useState<AccountSetup>();
    const [draft, setDraft] = useState<AccountSetup>();
    const [busy, setBusy] = useState(false), [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        setSaved(undefined); setDraft(undefined); setPrevious(undefined); setError("");
        if (accountId) void Promise.all([DataStore.get<unknown>(accountSetupKey(accountId)), DataStore.get<unknown>(accountSetupKey(accountId) + ":previous")]).then(([saved, previous]) => {
            if (!active) return;
            if (saved !== undefined) { const setup = accountSetup(saved, accountId,getProfileSettings()); setSaved(setup); setDraft(setup); }
            if (previous !== undefined) setPrevious(accountSetup(previous, accountId,getProfileSettings()));
        }).catch(() => { if (active) setError("The saved account setup could not be read. Its data was preserved."); });
        return () => { active = false; };
    }, [accountId]);
    function current() {
        if (!accountId || UserStore.getCurrentUser()?.id !== accountId) throw Error("The account changed. Open Profiles again before saving or applying.");
        return accountId;
    }
    const capture=captureAccountSetup;
    async function save() {
        setBusy(true); setError("");
        try {
            const id = current(), value = capture(id);
            await DataStore.set(accountSetupKey(id), value);
            if (current() === id) { setSaved(value); setDraft(value); }
        } catch (error) { setError(String(error)); }
        finally { setBusy(false); }
    }
    async function apply(setup: AccountSetup) {
        setBusy(true); setError("");
        try {
            const id = current(), value = accountSetup(setup, id,getProfileSettings());
            await commitAccountSetup(value);
            current();
            location.reload();
        } catch (error) { setError(String(error)); setBusy(false); }
    }
    async function saveDraft() {
        if (!accountId || !draft || draft.accountId !== accountId) return;
        setBusy(true); setError("");
        try {
            const value = accountSetup(draft, accountId, getProfileSettings());
            const prior = await DataStore.get<unknown>(accountSetupKey(accountId));
            if (prior !== undefined) await DataStore.set(accountSetupKey(accountId) + ":previous", accountSetup(prior, accountId, getProfileSettings()));
            await DataStore.set(accountSetupKey(accountId), value);
            setSaved(value);
        } catch (error) { setError(String(error)); }
        finally { setBusy(false); }
    }
    function confirm(setup: AccountSetup) {
        Alerts.show({ title: "Apply this account setup and reload?", body: "The current selection is backed up first. Discord reloads and calls may disconnect.", confirmText: "Apply & reload", cancelText: "Cancel", onConfirm: () => void apply(setup) });
    }
    return <section className="kc-tools-card">
        <Heading>Account setup</Heading>
        <Paragraph>{saved && saved.accountId === accountId ? `${Object.values(saved.plugins).filter(Boolean).length} selected plugins and ${saved.themes.length} local themes saved for this account.` : "Save plugins, reviewed preferences and appearance for this account."}</Paragraph>
        <Paragraph>Edits affect this saved setup. Apply it after signing in to the matching Discord account.</Paragraph>
        {draft && draft.accountId === accountId && <SetupEditor key={accountId} value={draft} onChange={setDraft} />}
        <div className="kc-tools-actions">
            <Button disabled={!accountId || busy || signedIn !== accountId} onClick={() => void save()}>Save current setup</Button>
            {draft && <Button variant="secondary" disabled={busy} onClick={() => void saveDraft()}>Save setup edits</Button>}
            <Button variant="secondary" disabled={busy || !accountId || !saved || saved.accountId !== accountId || signedIn !== accountId} onClick={() => { if (saved) confirm(saved); }}>Apply saved setup…</Button>
            {previous && previous.accountId === accountId && <Button variant="secondary" disabled={busy || signedIn !== accountId} onClick={() => confirm(previous)}>Restore previous setup…</Button>}
        </div>
        {error && <Paragraph role="alert">{error}</Paragraph>}
    </section>;
}
