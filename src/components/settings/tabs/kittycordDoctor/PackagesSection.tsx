/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../kittycordTools.css";

import { KittycordPackages } from "@api/KittycordPackages";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, DoctorIcon, MagnifyingGlassIcon, PluginsIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { KittycordRecoveryPanel } from "@components/settings/KittycordRecoveryPanel";
import { openSettingsTabModal, SettingsTab } from "@components/settings/tabs/BaseTab";
import { saveFile } from "@utils/web";
import { React, useEffect, useState } from "@webpack/common";

import KittycordPackagesTab from "../kittycordPackages";
import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";

function PackagesSection({ showRecovery = true }: { showRecovery?: boolean; }) {
    const [snapshot, setSnapshot] = useState(KittycordPackages.snapshot);
    const [report, setReport] = useState<Awaited<ReturnType<typeof KittycordPackages.audit>> | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        const unsubscribe = KittycordPackages.subscribe(() => setSnapshot(KittycordPackages.snapshot()));
        void KittycordPackages.initialize();
        return unsubscribe;
    }, []);
    async function scan() {
        setBusy(true); setError(""); setReport(null);
        try { await KittycordPackages.scanAll(); setReport(await KittycordPackages.audit()); }
        catch { setError("The local registry could not be inspected. Existing data was preserved. Check local storage, then reload or use startup recovery."); }
        finally { setBusy(false); }
    }
    return <SettingsTab>
        <div className="kc-doctor-packages">
            <KittyToolHeader Icon={DoctorIcon} title="Local packages & recovery" description="Integrity, dependencies and safe recovery." />
            <Card className="kc-tools-card">
                <Heading>{IS_WEB ? "Browser diagnostics" : "External runtime health"}</Heading>
                {!IS_WEB && <div className="kc-tool-stats">
                    <div><strong>{snapshot.entries.length}</strong>Installed</div>
                    <div><strong>{snapshot.entries.filter(item => item.runtime?.state === "running").length}</strong>Running</div>
                    <div><strong>{snapshot.entries.filter(item => item.failure || item.pending || item.runtime?.state === "quarantined").length}</strong>Need attention</div>
                </div>}
                {IS_WEB && <Paragraph>Inspect packaged plugins with the preserved TestCord diagnostics.</Paragraph>}
                {snapshot.entries.filter(item => item.failure || item.pending || item.runtime?.failure).map(item => <Paragraph key={item.manifest.id}>{item.manifest.id}: {item.failure || item.runtime?.failure || "Interrupted operation"}. Runtime: {item.runtime?.state ?? "Not admitted"}. Review the package in Kitty Plugin Manager before retrying. A cleanup failure requires reload if resources cannot be released.</Paragraph>)}
                <div className="kc-tools-actions">
                    <Button disabled={busy || !snapshot.ready || IS_WEB} title={IS_WEB ? "Desktop only" : undefined} onClick={() => void scan()}><MagnifyingGlassIcon aria-hidden="true" />Scan installed packages</Button>
                    {!IS_WEB && <Button variant="secondary" onClick={() => openSettingsTabModal(KittycordPackagesTab)}><PluginsIcon aria-hidden="true" />Open Kitty Plugin Manager</Button>}
                </div>
                {IS_WEB && <Paragraph>Package scanning and startup recovery require desktop.</Paragraph>}
                {snapshot.error && <Notice.Warning>{snapshot.error}</Notice.Warning>}
            </Card>
            {error && <Notice.Warning>{error}</Notice.Warning>}
            {report && <Card className="kc-tools-card" aria-label="Health scan results">
                <Heading>Local scan results</Heading>
                <Paragraph>Stored revision {report.revision}. {report.stale ? "Another window changed the registry. Reload before acting on this report." : "Registry matches the active window at scan time."} Results describe this scan; rescan after changes.</Paragraph>
                {!report.packages.length && <Paragraph>No external packages to inspect.</Paragraph>}
                {report.packages.map(item => <Paragraph key={item.id}>{item.id} {item.version}: {item.integrity ? "Artifact integrity passed" : "Artifact integrity or source admission failed. Keep this package disabled and replace it with a reviewed copy"}. Catalog policy: {item.policy}. {item.pending ? "Interrupted operation requires recovery." : ""}</Paragraph>)}
                {!report.findings.length && <Paragraph>No declared dependency or capability conflicts found. Static analysis cannot detect every runtime conflict.</Paragraph>}
                {report.findings.map((finding, index) => <Paragraph key={index}>{finding.classification}: {finding.plugins.join(", ")}. {finding.message} {finding.remediation}</Paragraph>)}
                <Paragraph>Publisher identity is unverified. A matching hash does not prove safety. Reports contain package identifiers, versions and fixed findings; no source, Discord messages or account credentials.</Paragraph>
                <div className="kc-tools-actions"><Button variant="secondary" onClick={() => saveFile(new File([JSON.stringify({ schemaVersion: 1, ...report }, null, 4)], "kittycord-doctor-scan.json", { type: "application/json" }))}><CloudDownloadIcon aria-hidden="true" />Export local scan</Button></div>
                {report.packages.some(item => item.policy === "blocked") && <Button variant="dangerSecondary" disabled={busy} onClick={() => {
                    setBusy(true); setError("");
                    void KittycordPackages.enforceCatalogPolicy().then(() => KittycordPackages.audit()).then(setReport, () => setError("Catalog quarantine did not complete. Inspect the affected package cleanup before retrying.")).finally(() => setBusy(false));
                }}>Disable blocked packages</Button>}
            </Card>}
            {!IS_WEB && showRecovery && <Card className="kc-tools-card"><KittycordRecoveryPanel /></Card>}
            <KittyToolDetails title="Checks, privacy & credits">
            <Paragraph>Scans check local integrity, declared dependencies and capability conflicts without executing code or uploading reports. Static checks do not prove safety. Browser extensions cannot load external JavaScript or use native startup recovery.</Paragraph>
            <Paragraph>Health uses TestCord diagnostics alongside MaltCord package auditing and recovery. Source credits are preserved.</Paragraph>
            </KittyToolDetails>
        </div>
    </SettingsTab>;
}

export default PackagesSection;
