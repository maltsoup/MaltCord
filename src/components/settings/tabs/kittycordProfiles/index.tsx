/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getProfileSettings, KittycordProfiles } from "@api/KittycordProfiles";
import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, ProfilesIcon, ResetIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { emptyProfile, parseProfile, type ProfileRule, type ProfileValue } from "@shared/kittycord/profiles";
import { chooseFile, saveFile } from "@utils/web";
import { Alerts, React, TextInput, useEffect, UserStore, useState, useStateFromStores } from "@webpack/common";

import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";
import { AccountSetupPanel } from "./AccountSetup";
import { KnownAccounts } from "./KnownAccounts";

function ProfilesTab() {

    const user = useStateFromStores([UserStore], () => UserStore.getCurrentUser());
    const [account, setAccount] = useState(user?.id);
    useEffect(() => setAccount(user?.id), [user?.id]);

    const [snapshot, setSnapshot] = useState(() => KittycordProfiles.snapshot());

    const [scope, setScope] = useState<ProfileRule["scope"]>("account");

    const [selected, setSelected] = useState("");

    const [value, setValue] = useState("false");

    const [error, setError] = useState("");

    const [busy, setBusy] = useState(false);

    useEffect(() => {

        setSnapshot(KittycordProfiles.snapshot());

        return KittycordProfiles.subscribe(() => setSnapshot(KittycordProfiles.snapshot()));

    }, []);

    const definitions = getProfileSettings();

    const definition = definitions.find(item => `${item.pluginId}:${item.key}` === selected) ?? definitions[0];

    const target = scope === "account" ? "" : scope === "server" ? snapshot.context.serverId : snapshot.context.channelId;

    const unavailable = !snapshot.record || snapshot.loading || !!snapshot.error || !snapshot.context.accountId;

    useEffect(() => {

        if (!definition) return;

        const override = snapshot.record?.current.rules.find(rule => rule.scope === scope && rule.target === target)?.values[definition.pluginId]?.[definition.key];

        const current = override ?? snapshot.resolved.values[definition.pluginId]?.[definition.key] ?? Settings.plugins[definition.pluginId]?.[definition.key];

        setValue(String(current ?? (definition.type === "boolean" ? false : 0)));

    }, [definition?.pluginId, definition?.key, scope, target, snapshot.context.accountId, snapshot.record?.current]);

    async function run(action: () => Promise<void>) {

        setBusy(true); setError("");

        try { await action(); }

        catch (problem) { setError(problem instanceof Error ? problem.message : "The profile action failed. No save was confirmed."); }

        finally { setBusy(false); }

    }

    async function setOverride(remove = false) {

        if (!snapshot.record || !definition || target === undefined) return;

        const document = structuredClone(snapshot.record.current);

        let rule = document.rules.find(rule => rule.scope === scope && rule.target === target);

        if (!rule) { rule = { scope, target, values: {} }; document.rules.push(rule); }

        const settings = rule.values[definition.pluginId] ??= {};

        if (remove) delete settings[definition.key];

        else settings[definition.key] = definition.type === "boolean" ? value === "true" : Number(value);

        if (!Object.keys(settings).length) delete rule.values[definition.pluginId];

        document.rules = document.rules.filter(rule => Object.keys(rule.values).length > 0);

        await KittycordProfiles.save(document, snapshot.context.accountId);

    }

    function display(value: ProfileValue | undefined) { return value === undefined ? "Global default" : String(value); }

    return <SettingsTab>

        <div className="kc-tool-page">

        <KittyToolHeader Icon={ProfilesIcon} title="Profiles & Rules" description="Local preferences for each account, server or channel." />

        <KnownAccounts selected={account} onSelect={setAccount} />

        <AccountSetupPanel accountId={account} />

        {snapshot.loading && <Paragraph>Loading this account's profile. Global defaults are active.</Paragraph>}

        {!snapshot.context.accountId && <Paragraph>Log in through Discord normally to use local account profiles.</Paragraph>}

        {(snapshot.error || error) && <Notice.Warning>{snapshot.error || error}</Notice.Warning>}

        {(snapshot.error || error) && <Button disabled={busy || snapshot.loading} onClick={() => void run(() => KittycordProfiles.switchContext(snapshot.context, true))}>Reload account profile</Button>}

        <KittyToolDetails title="Advanced · server and channel rules"><Card className="kc-tools-card"><Heading>Context</Heading>

        <Select options={[{ label: "Current account", value: "account" }, { label: "Current server", value: "server" }, { label: "Current channel", value: "channel" }]}

            isSelected={option => option === scope} serialize={option => option} select={option => setScope(option as ProfileRule["scope"])} />

        {target === undefined && <Paragraph>This context is unavailable. Select a server or channel in Discord first.</Paragraph>}

        <Heading>Reviewed live settings</Heading>

        <Select options={definitions.map(item => ({ label: `${item.pluginId}: ${item.label}`, value: `${item.pluginId}:${item.key}` }))}

            isSelected={option => option === (definition ? `${definition.pluginId}:${definition.key}` : "")} serialize={option => option}

            select={option => { setSelected(option); setValue("false"); }} />

        {definition && <>

            <Paragraph>Effective value: {display(snapshot.resolved.values[definition.pluginId]?.[definition.key] ?? Settings.plugins[definition.pluginId]?.[definition.key])}. Inherited from: {snapshot.resolved.sources[definition.pluginId]?.[definition.key] ?? "global defaults"}.</Paragraph>

            <Paragraph>Selected scope override: {display(snapshot.record?.current.rules.find(rule => rule.scope === scope && rule.target === target)?.values[definition.pluginId]?.[definition.key])}.</Paragraph>

            {definition.type === "boolean"

                ? <Select options={[{ label: "Enabled", value: "true" }, { label: "Disabled", value: "false" }]} isSelected={option => option === value} serialize={option => option} select={setValue} />

                : <TextInput aria-label="Numeric profile override" type="number" value={value === "false" ? "" : value} onChange={setValue} />}

            <div className="kc-tools-actions"><Button disabled={busy || unavailable || target === undefined || (definition.type === "number" && (value.trim() === "" || !Number.isFinite(Number(value))))} onClick={() => void run(() => setOverride())}>Save scope override</Button>

            <Button variant="secondary" disabled={busy || unavailable || target === undefined} onClick={() => void run(() => setOverride(true))}>Use inherited value</Button>

            </div>

        </>}

        </Card><Card className="kc-tools-card">

        <Heading>Profile data</Heading>

        <Paragraph>{snapshot.record?.current.rules.length ?? 0} saved rules. Exports include scoped server/channel identifiers, without account identity.</Paragraph>

        <div className="kc-tools-actions"><Button variant="secondary" disabled={busy || unavailable} onClick={() => { if (snapshot.record) saveFile(new File([JSON.stringify(snapshot.record.current, null, 4)], "kittycord-profile.json", { type: "application/json" })); }}><CloudDownloadIcon aria-hidden="true" />Export current profile</Button>

        <Button disabled={busy || unavailable} onClick={() => void run(async () => {

            const account = snapshot.context.accountId;

            const file = await chooseFile("application/json,.json");

            if (!file) return;

            if (file.size > 131_072) throw new Error("Profile import exceeds 128 KiB.");

            let imported;

            try { imported = parseProfile(JSON.parse(await file.text()), definitions); }

            catch { throw new Error("Profile import rejected. Check the schema, duplicate scopes and reviewed setting types."); }

            if (account !== KittycordProfiles.snapshot().context.accountId) throw new Error("The account changed. Import again for the intended account.");

            Alerts.show({ title: "Replace current profile?", body: `Import ${imported.rules.length} validated rules? The previous profile will be retained as a local backup.`, confirmText: "Replace profile", cancelText: "Cancel",

                onConfirm: () => void run(async () => { if (account !== KittycordProfiles.snapshot().context.accountId) throw new Error("The account changed. Nothing was imported."); await KittycordProfiles.save(imported, account); }) });

        })}>Import reviewed profile</Button>

        <Button variant="secondary" disabled={busy || unavailable || !snapshot.record?.previous} onClick={() => {

            const previous = snapshot.record?.previous;

            const account = snapshot.context.accountId;

            if (previous) Alerts.show({ title: "Restore previous profile?", body: "Current rules will be replaced. The current profile becomes the backup.", confirmText: "Restore", cancelText: "Cancel",

                onConfirm: () => void run(async () => { if (account !== KittycordProfiles.snapshot().context.accountId) throw new Error("The account changed. Nothing was restored."); await KittycordProfiles.save(previous, account); }) });

        }}>Restore previous profile</Button>

        <Button variant="dangerSecondary" disabled={busy || unavailable} onClick={() => {

            const account = snapshot.context.accountId;

            Alerts.show({ title: "Reset this MaltCord profile?", body: "Scoped overrides will be removed. Global preferences stay in place, and the current profile becomes the backup.", confirmText: "Reset profile", cancelText: "Cancel",

                onConfirm: () => void run(async () => { if (account !== KittycordProfiles.snapshot().context.accountId) throw new Error("The account changed. Nothing was reset."); await KittycordProfiles.save(emptyProfile(), account); }) });

        }}><ResetIcon aria-hidden="true" />Reset current profile</Button></div></Card></KittyToolDetails></div>

    </SettingsTab>;

}

export default wrapTab(ProfilesTab, "MaltCord Profiles");
