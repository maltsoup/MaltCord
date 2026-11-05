/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { ClockIcon,CloudDownloadIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import type { UpdateResult } from "@shared/kittycord/updates";
import { React, useEffect, useState } from "@webpack/common";

import { KittyToolHeader } from "../KittyToolLayout";

function Updates() {
    const [result, setResult] = useState<UpdateResult>({});
    const [busy, setBusy] = useState(false);
    const supported = !IS_WEB && typeof VencordNative !== "undefined" && !!VencordNative.updates;
    useEffect(() => { let active = true; if (supported) void VencordNative.updates.command("status").then(value => { if (active) setResult(value); }, () => { if (active) setResult({ error: "The update bridge could not be reached." }); }); return () => { active = false; }; }, [supported]);
    useEffect(() => {
        if (!busy || !supported) return;
        let active = true, pending = false;
        const timer = setInterval(() => {
            if (pending) return;
            pending = true;
            void VencordNative.updates.command("status").then(value => { if (active) setResult(previous => ({ ...previous, progress: value.progress })); }, () => { if (active) setResult(previous => ({ ...previous, error: "Update progress is temporarily unavailable." })); }).finally(() => { pending = false; });
        }, 500);
        return () => { active = false; clearInterval(timer); };
    }, [busy, supported]);
    async function command(action: "check" | "stage" | "apply") {
        setBusy(true);
        try { const next = await VencordNative.updates.command(action); setResult(previous => ({ ...previous, error: undefined, ...next })); }
        catch { setResult(previous => ({ ...previous, error: "The update request failed. Your current installation was retained." })); }
        finally { setBusy(false); }
    }
    return <SettingsTab><div className="kc-tool-page"><KittyToolHeader Icon={CloudDownloadIcon} title="Kittencord Updates" description="Signed releases, readable changes and a controlled restart." />
        <div className="kc-tools-card"><Heading>Current version · {VERSION}</Heading><Paragraph>Updates are verified before installation. Restarting always asks for confirmation.</Paragraph>
        {!supported && <Notice.Info>This host cannot run the Windows installer update flow. Browser extensions follow browser update and signing rules.</Notice.Info>}
        {result.error && <Notice.Warning>{result.error}</Notice.Warning>}
        {result.checked && !result.offer && !result.error && <Paragraph>No newer signed version was returned by the configured channel.</Paragraph>}
        {supported && result.configured && <div className="kc-tools-actions"><Button disabled={busy} onClick={() => void command("check")}><ClockIcon />Check for updates</Button></div>}</div>
        {result.offer && <div className="kc-tools-card"><Heading>Kittencord {result.offer.version}</Heading><Paragraph>{new Date(result.offer.issuedAt).toLocaleString()} · {(result.offer.size / 1048576).toFixed(1)} MiB · Ed25519 signature verified</Paragraph><Heading>Changelog</Heading><pre className="kc-catalog-source">{result.offer.notes}</pre><Paragraph>SHA-256: {result.offer.sha256}</Paragraph><div className="kc-tools-actions"><Button disabled={busy || result.offer.staged} onClick={() => void command("stage")}><CloudDownloadIcon />{result.offer.staged ? "Downloaded and verified" : "Download verified update"}</Button><Button variant="secondary" disabled={busy || !result.offer.staged} onClick={() => void command("apply")}>Restart &amp; Update…</Button></div></div>}
        {busy && <Paragraph role="status">Verifying signed release data. Please wait…</Paragraph>}
        {result.progress && <div className="kc-cloud-download" role="status"><progress aria-label="Verified update download" value={result.progress.received} max={result.progress.total} /><Paragraph>{Math.round(result.progress.received / result.progress.total * 100)}% downloaded · SHA-256 is checked before installation.</Paragraph></div>}
    </div></SettingsTab>;
}
export default wrapTab(Updates, "Kittencord Updates");
