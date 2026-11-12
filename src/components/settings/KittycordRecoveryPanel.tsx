/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { kittycordStartupStatus } from "@api/KittycordRecovery";
import { PluginHealth } from "@api/PluginHealth";
import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { type RecoveryResult, type RecoveryStatus, unsupportedRecovery } from "@shared/kittycord/recovery";
import { relaunch } from "@utils/native";
import { Alerts, Modal, openModal, React, useState } from "@webpack/common";

import { KittyToolDetails } from "./tabs/KittyToolLayout";

function times(count: number) {
    return count === 1 ? "once" : `${count} times in a row`;
}

function safeStartSummary(status: RecoveryStatus) {
    if (status.reason === "plugin-crash") {
        const { suspect } = status;
        const blocked = status.blockedPlugins.join(", ");
        return suspect
            ? `${suspect.plugin} stopped Discord from starting ${times(suspect.crashes)}. Reason: ${suspect.reason} Safe Start kept ${blocked} off for this launch. Your other plugins are running.`
            : `Safe Start kept ${blocked} off for this launch. Your other plugins are running.`;
    }
    return `Discord did not finish starting ${times(status.consecutiveFailures)} and no plugin could be identified as the cause. All optional plugins are paused for this launch only.`;
}

async function leaveSafeStart(action?: () => Promise<unknown> | unknown) {
    try {
        await action?.();
        const result = await VencordNative.recovery.setRecovery(false);
        if (!result.ok) throw new Error(result.error);
        relaunch();
    } catch {
        Alerts.show({ title: "Safe Start could not finish this action", body: "Nothing was restarted. Try again from Health, Packages and recovery." });
    }
}

function disableAndRestart(plugin: string) {
    return leaveSafeStart(() => { if (Settings.plugins[plugin]) Settings.plugins[plugin].enabled = false; });
}

function quarantineAndRestart(plugin: string) {
    return leaveSafeStart(() => PluginHealth.quarantinePlugin(plugin));
}

function restoreWorkingSelection() {
    return leaveSafeStart(async () => {
        const result = await VencordNative.recovery.restoreLastGood();
        if (!result.ok) throw new Error(result.error);
    });
}

/** Shown once per Safe Start launch. A Modal with its own actions, because Discord's Alert drops a third button. */
export function showSafeStartNotice() {
    const status = kittycordStartupStatus;
    if (status.mode !== "recovery") return;
    const plugin = status.reason === "plugin-crash" ? status.suspect?.plugin ?? status.blockedPlugins.at(-1) : undefined;
    openModal(props => {
        const run = (action: () => Promise<void>) => () => { props.onClose(); void action(); };
        return <Modal {...props} size="sm" title={plugin ? `Safe Start kept ${plugin} off` : "Safe Start paused your plugins"} actions={plugin ? [
            { text: "Not now", variant: "secondary", onClick: props.onClose },
            { text: "Quarantine and restart", variant: "secondary", onClick: run(() => quarantineAndRestart(plugin)) },
            { text: "Disable and restart", variant: "primary", onClick: run(() => disableAndRestart(plugin)) },
        ] : [
            { text: "Not now", variant: "secondary", onClick: props.onClose },
            ...(status.lastGoodAvailable ? [{ text: "Restore working selection", variant: "secondary", onClick: run(restoreWorkingSelection) }] : []),
            { text: "Restart normally", variant: "primary", onClick: run(() => leaveSafeStart()) },
        ]}>
            <Paragraph>{plugin ? safeStartSummary(status) : `${safeStartSummary(status)} Restart to load them again${status.lastGoodAvailable ? ", or restore the last plugin selection that started cleanly" : ""}.`}</Paragraph>
        </Modal>;
    });
}

export function KittycordRecoveryPanel() {
    const [status] = useState(() => VencordNative.recovery ? VencordNative.recovery.getStatus() : unsupportedRecovery);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    if (!status.supported) return <Paragraph>Startup history is available on desktop.</Paragraph>;
    const plugin = status.reason === "plugin-crash" ? status.suspect?.plugin ?? status.blockedPlugins.at(-1) : undefined;

    async function run(action: () => Promise<RecoveryResult>) {
        setBusy(true);
        setError("");
        try {
            const result = await action();
            if (!result.ok) setError(result.error);
            else setMessage("Plugin selection restored. Relaunch Discord to apply it.");
        } catch {
            setError("The recovery action failed. Your settings were not confirmed as saved.");
        } finally {
            setBusy(false);
        }
    }

    return <Card className="kc-tools-card kc-tool-page kc-recovery-card">
        <Heading>Startup history</Heading>
        {!status.persistent && <Notice.Warning>Startup history could not be saved. Check write access to the settings directory.</Notice.Warning>}
        {status.mode === "recovery" && <Notice.Warning>
            {safeStartSummary(status)}
            <div className="kc-tools-actions">
                {plugin && <Button size="small" disabled={busy} onClick={() => void disableAndRestart(plugin)}>Disable {plugin} and restart</Button>}
                {plugin && <Button size="small" variant="secondary" disabled={busy} onClick={() => void quarantineAndRestart(plugin)}>Quarantine and restart</Button>}
                <Button size="small" variant="secondary" disabled={busy} onClick={() => void leaveSafeStart()}>Restart normally</Button>
            </div>
        </Notice.Warning>}
        {!Settings.safeStart && <Paragraph>Safe Start is off. Turn it on in MaltCord settings to recover automatically from repeated startup crashes.</Paragraph>}
        {status.failedPlugins.length > 0 && <Paragraph>Startup failures: {status.failedPlugins.join(", ")}</Paragraph>}
        <div className="kc-tools-actions">{status.lastGoodAvailable && <Button variant="secondary" disabled={busy || !status.persistent} onClick={() => Alerts.show({
            title: "Restore successful plugin selection?",
            body: "This restores plugin enablement flags and disables newly added selections. Other plugin preferences and account data are preserved. The current selection is backed up locally. Relaunch is required.",
            confirmText: "Restore selection", cancelText: "Cancel",
            onConfirm: () => void run(() => VencordNative.recovery.restoreLastGood())
        })}>Restore working selection</Button>}</div>
        <KittyToolDetails title="History details"><Paragraph>Previous incomplete launches: {status.consecutiveFailures}. {status.lastGoodAvailable ? "A successful plugin selection is available to restore manually." : "No successful plugin selection has been recorded yet."}</Paragraph></KittyToolDetails>
        {error && <Notice.Warning>{error}</Notice.Warning>}
        {message && <><Paragraph>{message}</Paragraph><Button onClick={relaunch}>Relaunch Discord</Button></>}
    </Card>;
}
