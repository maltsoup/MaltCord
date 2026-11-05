/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordCloudNotifications } from "@api/KittycordCloudNotifications";
import { KittycordDiagnostics as diagnostics } from "@api/KittycordDiagnostics";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { DoctorIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Switch } from "@components/Switch";
import { type DiagnosticReport, type DiagnosticResult, REPORT_CATEGORIES } from "@shared/kittycord/diagnosticReport";
import { chooseFile, saveFile } from "@utils/web";
import { React, TextArea, TextInput, useEffect, useState } from "@webpack/common";

import { CompactNotice } from "../KittenUI";
import { KittyToolHeader } from "../KittyToolLayout";

export function Reports() {
    const [status, setStatus] = useState<DiagnosticResult>({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
    const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [steps, setSteps] = useState(""), [category, setCategory] = useState<DiagnosticReport["category"]>("interface");
    const [logs, setLogs] = useState<string[]>([]), [selected, setSelected] = useState<number[]>([]), [consent, setConsent] = useState(false), [preview, setPreview] = useState("");
    async function action(operation: () => Promise<void>) { setBusy(true); setError(""); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : "The diagnostic action failed."); } finally { setBusy(false); } }
    useEffect(() => { let active = true; if (!IS_WEB) void diagnostics.command("status").then(value => { if (active) setStatus(value); }, error => { if (active) setError(String(error)); }); return () => { active = false; }; }, []);
    function report() { return diagnostics.report({ title: title || "KittenCord issue", description, steps, category, logs: selected.map(index => logs[index]) }); }
    async function attachment() {
        const file = await chooseFile("image/png,text/plain"); if (!file) return;
        const screenshot = file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
        if (file.size > (screenshot ? 4194304 : 131072)) throw new Error("Choose a PNG up to 4 MiB or a text log up to 128 KiB.");
        const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
        await diagnostics.command("attach", { reportId: receipt, kind: screenshot ? "screenshot" : "log", base64: btoa(binary), consent: true });
    }
    return <SettingsTab><div className="kc-tool-page"><KittyToolHeader Icon={DoctorIcon} title="Report a bug" description="Review a report, choose logs and send it to the KittenCord team." />
        {(error || status.error) && <CompactNotice tone="warning">{error || status.error}</CompactNotice>}
        {!KittycordCloudNotifications.enabled && <CompactNotice>The Cloud service is not configured in this build. You can collect and export diagnostics locally; submission will become available after setup.</CompactNotice>}
        <article className="kc-tools-card"><Heading>Diagnostic preferences</Heading><Paragraph>Automatic reports are off by default. Enabling them stores redacted technical errors locally and sends them to the KittenCord team and its private Discord reporting channel. A connected account includes its verified public Discord identity; other reports are marked unauthenticated. Message content, Discord tokens and cookies are not collected. Screenshots and native dumps always require a separate approval.</Paragraph>
            {!IS_WEB && <><div className="kc-package-footer"><span id="kc-diagnostic-auto">Collect and submit technical error reports</span><Switch aria-labelledby="kc-diagnostic-auto" disabled={busy} checked={!!status.enabled} onChange={enabled => void action(async () => { setStatus(await diagnostics.command("settings", { enabled, nativeCapture: !!status.nativeCapture })); })} /></div>
                <div className="kc-package-footer"><span id="kc-diagnostic-native">Local native crash capture</span><Switch aria-labelledby="kc-diagnostic-native" disabled={busy || !status.nativeCaptureSupported} checked={!!status.nativeCapture} onChange={nativeCapture => void action(async () => { setStatus(await diagnostics.command("settings", { enabled: !!status.enabled, nativeCapture })); })} /></div>
                {!status.nativeCaptureSupported && <Paragraph>Discord manages its own native crash reporter. KittenCord records renderer termination events without changing Discord’s reporter. You can attach an existing minidump after reviewing its privacy warning.</Paragraph>}
                <Paragraph>{status.pending ?? 0} reports waiting locally{status.lastReport ? ` · Last receipt ${status.lastReport}` : ""}.</Paragraph><div className="kc-tools-actions"><Button disabled={busy || !status.enabled} onClick={() => void action(async () => setStatus(await diagnostics.command("flush")))}>Send pending reports</Button><Button variant="secondary" disabled={busy} onClick={() => void action(async () => { const value = await diagnostics.command("export"); saveFile(new File([JSON.stringify(value.exported, null, 2)], "kittencord-diagnostics.json", { type: "application/json" })); })}>Export pending diagnostics</Button></div></>}
        </article>
        <article className="kc-tools-card kc-report-fields"><Heading>Problem details</Heading><label>Title<TextInput value={title} onChange={setTitle} maxLength={160} placeholder="What went wrong?" /></label><label>Category<Select options={REPORT_CATEGORIES.map(value => ({ label: value, value }))} isSelected={value => value === category} select={setCategory} serialize={value => value} /></label><label>Description<TextArea value={description} onChange={setDescription} rows={4} maxLength={8000} /></label><label>Reproduction steps<TextArea value={steps} onChange={setSteps} rows={4} maxLength={8000} /></label><Button size="small" variant="secondary" disabled={busy} onClick={() => { setLogs(diagnostics.logs()); setSelected([]); }}>Choose available plugin logs</Button>
            {logs.map((log, index) => <div className="kc-report-log" key={index}><div className="kc-package-footer"><span id={`kc-report-log-${index}`}>Plugin log {index + 1}</span><Switch aria-labelledby={`kc-report-log-${index}`} checked={selected.includes(index)} onChange={value => setSelected(previous => value ? [...previous, index] : previous.filter(item => item !== index))} /></div><pre className="kc-cloud-message">{log}</pre></div>)}
            <div className="kc-tools-actions"><Button variant="secondary" disabled={busy} onClick={() => setPreview(JSON.stringify(report(), null, 2))}>Review report</Button><Button variant="secondary" disabled={busy} onClick={() => saveFile(new File([JSON.stringify(report(), null, 2)], "kittencord-bug-report.json", { type: "application/json" }))}>Export report</Button></div>{preview && <pre className="kc-catalog-source">{preview}</pre>}
            <div className="kc-package-footer"><span id="kc-report-consent">I reviewed this report and consent to sending its selected technical details and connected public Discord identity to the KittenCord team and its private Discord channel.</span><Switch aria-labelledby="kc-report-consent" checked={consent} onChange={setConsent} /></div><Button disabled={busy || IS_WEB || !KittycordCloudNotifications.enabled || !consent || !title.trim()} onClick={() => void action(async () => { const value = await diagnostics.command("submit", { report: report(), consent }); setReceipt(value.reportId ?? ""); })}>Submit report</Button>
        </article>
        {receipt && <article className="kc-tools-card"><Heading>Report received · {receipt}</Heading><Paragraph>Only attach screenshots or logs you have reviewed for private content. Each report supports up to five attachments. Minidumps can contain process memory and require an additional native confirmation.</Paragraph><div className="kc-tools-actions"><Button disabled={busy} onClick={() => void action(attachment)}>Attach reviewed screenshot or log</Button><Button variant="secondary" disabled={busy} onClick={() => void action(async () => { await diagnostics.command("nativeFile", { reportId: receipt }); })}>Choose native crash artifact…</Button></div></article>}
    </div></SettingsTab>;
}
export default wrapTab(Reports, "Report a bug");
