/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../kittycordTools.css";

import { KittycordPackages } from "@api/KittycordPackages";
import { PluginHealth } from "@api/PluginHealth";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CodeIcon, FolderIcon, InfoIcon, PluginsIcon, SafetyIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { openSettingsTabModal, SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Switch } from "@components/Switch";
import { settings } from "@plugins/_core/settings";
import { isDesktopPlugin } from "@shared/kittycord/desktopPlugin";
import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import { isNativeProject, type NativeStudioProject, newNativeProject } from "@shared/kittycord/nativeStudio";
import { packageContentType } from "@shared/kittycord/presentation";
import { buildStudioPackage, importStudioFile, parseStudioProject } from "@shared/kittycord/studio";
import { THEME_PACKAGE_LIMIT } from "@shared/kittycord/themePackage";
import { chooseFile, saveFile } from "@utils/web";
import { Alerts, Modal, openModal, React, TextInput, useEffect, useState } from "@webpack/common";

import { ActionIcon, CompactNotice, EmptyState, PluginGlyph, PublisherIdentity } from "../KittenUI";
import { KittyCompatibilityCard } from "../KittyCompatibilityCard";
import { reviewNativeImport } from "../kittycordWorkshop/NativeImportReview";
import { openNativeProject } from "../kittycordWorkshop/NativeStudio";
import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";
import { PluginDetails } from "../PluginDetails";
import { InstalledEditor } from "./InstalledEditor";
import { LocalSettings } from "./LocalSettings";
import { PermissionDetails, SecurityDetails, SourceChanges } from "./SecurityDetails";

type Review = Awaited<ReturnType<typeof KittycordPackages.review>> & { restore?: { id: string; revision: number; }; };
function InstallReview({ review, close }: { review: Review; close(): void; }) {
    const [busy, setBusy] = useState(false); const [error, setError] = useState("");
    async function install() {
        setBusy(true); setError("");
        try {
            if (review.restore) await KittycordPackages.restore(review.restore.id, review.bundle.manifest.integrity.digest, review.restore.revision);
            else await KittycordPackages.install(review.bundle, review.bundle.manifest.integrity.digest, review.previous?.manifest.integrity.digest);
            close();
        } catch (problem) { setError(problem instanceof Error ? problem.message : "Installation failed. Your existing package was retained."); }
        finally { setBusy(false); }
    }
    return <SettingsTab><div className="kc-tool-page kc-install-review"><PluginDetails bundle={review.bundle} />
        <div className="kc-tools-card"><Heading>Installation review</Heading>{review.policyBlocked && review.security?.status !== "Blocked" && <CompactNotice tone="warning">This version is unavailable under the current catalog policy. Its source can still be inspected below.</CompactNotice>}<PermissionDetails manifest={review.bundle.manifest} previous={review.previous?.manifest} />{review.security?.status === "Blocked" && <SecurityDetails report={review.security} />}<KittyToolDetails title="Compatibility & security checks"><KittyCompatibilityCard report={review.compatibility} />{review.security?.status !== "Blocked" && <SecurityDetails report={review.security} />}{review.findings.map((finding, index) => <Paragraph key={index}>{finding.classification}: {finding.message} {finding.remediation}</Paragraph>)}</KittyToolDetails><SourceChanges previous={review.previous} next={review.bundle} /><Paragraph>{review.restore ? "The stored backup replaces this version after verification." : review.previous ? "An active package is replaced dynamically where supported. Its prior source is retained for recovery." : "Installs to Local in an inactive state. Open Local settings, then enable it when ready."}</Paragraph></div>
        {error && <CompactNotice tone="critical">{error}</CompactNotice>}{IS_WEB && <CompactNotice tone="warning">Install this package in the desktop app. Browser builds require packaged extensions.</CompactNotice>}<footer className="kc-wizard-footer"><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button disabled={busy || IS_WEB || review.policyBlocked || review.security?.status === "Blocked"} onClick={() => void install()}>{busy ? "Verifying…" : review.restore ? "Restore reviewed backup" : review.previous ? "Install reviewed update" : "Install to Local"}</Button></footer>
    </div></SettingsTab>;
}
function showReview(review: Review) { openModal(props => <Modal {...props} title="Review installation" size="lg"><InstallReview review={review} close={props.onClose} /></Modal>); }
/** Reviews a package or project file before anything is installed (Plugins › Import package). */
export async function importPackage(expectedId?: string) {
    const file = await chooseFile("application/json,.json,.js,.jsx,.ts,.tsx"); if (!file) return; if (file.size > 1_048_576) throw new Error("The project exceeds 1 MiB.");
    if (/\.[jt]sx?$/i.test(file.name)) {
        const source = await file.text();
        const legacy = /\bglobalThis\.kittycordPlugin\s*=/.test(source);
        const project = await VencordNative.nativeStudio.request<NativeStudioProject>(legacy ? "migrate" : "import-source", legacy ? await importStudioFile(file) : { name: file.name, source });
        if (expectedId && project.metadata.id !== expectedId) throw new Error("Choose an exported native project with this plugin identifier to update it.");
        reviewNativeImport(project, openNativeProject); return;
    }
    let value: unknown; try { value = JSON.parse(await file.text()); } catch { throw new Error("The package is not valid JSON."); }
    if (isNativeProject(value)) { if (expectedId && value.metadata.id !== expectedId) throw new Error("Choose an update for this plugin identifier."); reviewNativeImport(value, openNativeProject); return; }
    if (value && typeof value === "object" && "kind" in value && value.kind === "kittycord-studio") {
        const project = parseStudioProject(value);
        if (project.language === "typescript") { const imported = await VencordNative.nativeStudio.request<NativeStudioProject>("migrate", project); if (expectedId && imported.metadata.id !== expectedId) throw new Error("Choose an update for this plugin identifier."); reviewNativeImport(imported, openNativeProject); return; }
        value = await buildStudioPackage(project);
    }
    if (file.size > THEME_PACKAGE_LIMIT) throw new Error("This package format is limited to 128 KiB.");
    const result = await KittycordPackages.review(value); if (expectedId && result.bundle.manifest.id !== expectedId) throw new Error("Select an update for this plugin identifier. Use Import package to add another plugin."); showReview(result);
}

function download(value: unknown, name: string) { saveFile(new File([JSON.stringify(value, null, 4)], name, { type: "application/json" })); }

/** Library tools for local packages (Plugins ⋯). */
export const packageLibraryTools = {
    exportInventory: () => download({ schemaVersion: 1, ...KittycordPackages.snapshot() }, "kittycord-external-inventory.json"),
    exportSnapshots: async () => download({ schemaVersion: 1, snapshots: await KittycordPackages.exportSnapshots() ?? [] }, "kittencord-source-snapshots.json"),
    clearSnapshots: () => KittycordPackages.clearSnapshots(),
};

export function PackagesTab({ initialPackage, embedded = false, searchQuery, authorQuery = "", enabledOnly, content = "plugins" }: { initialPackage?: ExternalPackage; embedded?: boolean; searchQuery?: string; authorQuery?: string; enabledOnly?: boolean; content?: "plugins" | "visual" | "all"; }) {
    const { developerMode }=settings.use(["developerMode"]);
    const [snapshot, setSnapshot] = useState(() => KittycordPackages.snapshot());
    const [search, setSearch] = useState(""); const [status, setStatus] = useState("all"); const [sort, setSort] = useState("name");
    const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [editing, setEditing] = useState<ExternalPackage | null>(null);
    useEffect(() => {
        const unsubscribe = KittycordPackages.subscribe(() => setSnapshot(KittycordPackages.snapshot())); let active = true;
        void (async () => { try { await KittycordPackages.initialize(); if (initialPackage && active) showReview(await KittycordPackages.review(initialPackage)); } catch (problem) { if (active) setError(problem instanceof Error ? problem.message : "Local package storage could not open."); } })();
        return () => { active = false; unsubscribe(); };
    }, [initialPackage]);
    async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "The operation failed. No successful activation was confirmed."); } finally { setBusy(false); } }
    const unavailable = busy || !snapshot.ready || IS_WEB;
    const categoryEntries = snapshot.entries.filter(item => content === "all" || (packageContentType(item.manifest) === "plugin") === (content === "plugins"));
    const entries = categoryEntries.filter(item => `${item.manifest.name} ${item.manifest.id} ${item.manifest.author}`.toLowerCase().includes((searchQuery ?? search).toLowerCase()) && (!authorQuery || item.manifest.author === authorQuery) && (enabledOnly === undefined || item.enabled === enabledOnly) && (status === "all" || status === "enabled" && item.enabled || status === "disabled" && !item.enabled || status === "attention" && !!(item.failure || item.security?.status === "Blocked"))).sort((a, b) => sort === "updated" ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0) : a.manifest.name.localeCompare(b.manifest.name));
    return <SettingsTab><div className="kc-tool-page">
        {!embedded && <KittyToolHeader Icon={content === "visual" ? FolderIcon : PluginsIcon} title={content === "visual" ? "Installed customizations" : "Local plugins"} description={content === "visual" ? "Your visual packages. Reviewed, managed and reversible." : "Your functional extensions, settings and actions."} />}
        {developerMode && !(embedded && content === "plugins") && <div className="kc-studio-toolbar"><Button disabled={unavailable} onClick={() => void run(() => importPackage())}><FolderIcon />Import package</Button><details className="kc-overflow"><summary aria-label="Library tools">Library tools</summary><div><Button variant="secondary" onClick={packageLibraryTools.exportInventory}>Export inventory</Button><Button variant="secondary" onClick={() => void run(packageLibraryTools.exportSnapshots)}>Export snapshots</Button><Button variant="dangerSecondary" onClick={() => Alerts.show({ title: "Clear source snapshots?", body: "Export first. Only the separate source archive is cleared; installed packages and immediate backups remain.", confirmText: "Clear archive", cancelText: "Cancel", onConfirm: () => void run(packageLibraryTools.clearSnapshots) })}>Clear snapshot archive…</Button></div></details></div>}
        {IS_WEB && <CompactNotice>External installation is desktop only. Packaged browser plugins remain available.</CompactNotice>}{(snapshot.error || error) && <CompactNotice tone="critical">{snapshot.error || error}</CompactNotice>}
        {busy && <div className="kc-operation-progress" role="status"><progress aria-label="Package operation" /><Paragraph>Checking package and runtime state…</Paragraph></div>}
        {editing && <InstalledEditor bundle={editing} onCancel={() => setEditing(null)} onReview={async bundle => { showReview(await KittycordPackages.review(bundle)); setEditing(null); }} />}
        <div className="kc-plugin-filters">{searchQuery === undefined && <TextInput aria-label="Search Local packages" placeholder="Search name, author or identifier" value={search} onChange={setSearch} />}<Select options={[{ value: "all", label: "All statuses" }, { value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }, { value: "attention", label: "Needs attention" }]} isSelected={value => value === status} serialize={String} select={setStatus} /><Select options={[{ value: "name", label: "Name A–Z" }, { value: "updated", label: "Recently imported" }]} isSelected={value => value === sort} serialize={String} select={setSort} /></div>
        {!embedded && snapshot.ready && !entries.length && <EmptyState title={categoryEntries.length ? "No matching packages" : content === "visual" ? "No visual packages installed" : "No Local plugins installed"}>{categoryEntries.length ? "Try another search or status." : <>{developerMode?"Create or import a project in Plugin Studio.":"Installed plugins appear here."}<span className="kc-tools-actions">{developerMode&&<Button variant="secondary" onClick={() => openNativeProject(newNativeProject())}>Open Plugin Studio</Button>}</span></>}</EmptyState>}
        <div className="kc-package-grid">{entries.map(item => {
            const active = item.runtime?.state === "running"; const state = item.security?.status === "Blocked" ? "Changes required" : item.failure || item.runtime?.failure ? "Needs attention" : active ? "Enabled" : "Disabled";
            return <article className="kc-tools-card kc-package-card" key={item.manifest.id}>
                <div className="kc-package-title"><PluginGlyph icon={item.manifest.presentation?.icon} /><div><Heading>{item.manifest.name}</Heading><span className="kc-package-version">v{item.manifest.version} · {item.manifest.author}</span></div><Switch checked={item.enabled} disabled={unavailable || !item.runtime || item.runtime.state === "quarantined"} aria-label={`${item.enabled ? "Disable" : "Enable"} ${item.manifest.name}`} onChange={enabled => void run(() => enabled ? KittycordPackages.enable(item.manifest.id) : KittycordPackages.disable(item.manifest.id))} /></div>
                <Paragraph>{item.manifest.description}</Paragraph><PublisherIdentity author={item.manifest.author} github={item.manifest.presentation?.github?.username} /><div className="kc-card-meta"><span className="kc-source-badge">Local</span><span className="kc-status" data-status={state === "Enabled" ? "active" : state === "Changes required" || state === "Needs attention" ? "blocked" : "review"}>{state}</span>{item.pending && <span className="kc-package-version">Storage pending</span>}</div>
                {(item.failure || item.runtime?.failure || item.runtime && item.runtime.manifest.version !== item.manifest.version) && <CompactNotice tone="warning">{item.failure || item.runtime?.failure || "Candidate cleanup pending"}. Inspect diagnostics before retrying.</CompactNotice>}
                <div className="kc-package-footer"><div className="kc-tools-actions"><ActionIcon label={`Details for ${item.manifest.name}`} onClick={() => void run(async () => { const bundle = await KittycordPackages.exportPackage(item.manifest.id); function Details() { return <SettingsTab><PluginDetails bundle={bundle} /></SettingsTab>; } Details.displayName = item.manifest.name; openSettingsTabModal(Details); })}><InfoIcon /></ActionIcon><ActionIcon label={`Edit ${item.manifest.name}`} disabled={unavailable || !developerMode} onClick={() => void run(async () => setEditing(await KittycordPackages.exportPackage(item.manifest.id)))}><CodeIcon /></ActionIcon>{(isDesktopPlugin(item.manifest) || item.manifest.capabilities.includes("kittycord.utility-js.v1")) && <Button variant="secondary" size="small" onClick={() => { function Controls() { return <SettingsTab><LocalSettings id={item.manifest.id} /></SettingsTab>; } Controls.displayName = `${item.manifest.name} settings`; openSettingsTabModal(Controls); }}>Settings</Button>}</div>
                <details className="kc-overflow"><summary aria-label={`More actions for ${item.manifest.name}`}>•••</summary><div><Button variant="secondary" disabled={unavailable || !item.runtime || !active || item.runtime.state === "quarantined"} onClick={() => void run(() => KittycordPackages.restart(item.manifest.id))}>Reload runtime</Button><Button variant="secondary" disabled={unavailable || !item.runtime} onClick={() => void run(() => KittycordPackages.disable(item.manifest.id))}>Disable / retry cleanup</Button><Button variant="secondary" disabled={unavailable || !developerMode} onClick={() => void run(() => importPackage(item.manifest.id))}>Review update…</Button><Button variant="secondary" onClick={() => void run(async () => download(await KittycordPackages.exportPackage(item.manifest.id), `${item.manifest.id}.kittycord.json`))}><CloudDownloadIcon />Export package</Button><Button variant="secondary" disabled={unavailable} onClick={() => void run(() => KittycordPackages.scan(item.manifest.id))}><SafetyIcon />Security scan</Button><Button variant="secondary" onClick={() => { const health = PluginHealth.get(item.manifest.id); download({ pluginId: item.manifest.id, runtimeFailures: health?.runtimeErrors.map(value => ({ source: value.source, at: value.at })) ?? [], patchFailureCount: health?.patchFailures.length ?? 0, security: item.security ?? null }, `${item.manifest.id}-local-log.json`); }}>Export logs</Button><Button variant="secondary" disabled={unavailable || !item.previousVersion} onClick={() => void run(async () => { const previous = await KittycordPackages.reviewPrevious(item.manifest.id); showReview({ ...previous, restore: { id: item.manifest.id, revision: previous.registryRevision } }); })}>Review backup</Button><Button variant="dangerSecondary" disabled={unavailable} onClick={() => Alerts.show({ title: "Uninstall package?", body: "Removes this package and its immediate backup. Unrelated settings and plugins remain.", confirmText: "Uninstall", cancelText: "Cancel", onConfirm: () => void run(() => KittycordPackages.remove(item.manifest.id)) })}>Uninstall…</Button></div></details></div>
                <KittyToolDetails title="Runtime diagnostics"><Paragraph>{item.manifest.id} · {item.runtime?.state ?? "Not admitted"}. Owned resources: {item.runtime?.activeResources ?? 0}. Backup: {item.previousVersion ?? "None"}.</Paragraph><Paragraph>{item.updatedAt ? `Imported ${new Date(item.updatedAt).toLocaleString()}.` : "Import date unavailable for this older record."} Local updates are reviewed manually.</Paragraph><Paragraph>Observed calls: {item.performance.observedCalls}. Synchronous: {item.performance.synchronousMs.toFixed(1)} ms. Slowest: {item.performance.maxSynchronousMs.toFixed(1)} ms. Async elapsed: {item.performance.asyncElapsedMs.toFixed(1)} ms. Sampling: {item.performance.measurement.enabled ? item.performance.measurement.sampleEvery : "Off"}.</Paragraph><SecurityDetails report={item.security} /></KittyToolDetails>
            </article>;
        })}</div>
    </div></SettingsTab>;
}
export default wrapTab(PackagesTab, "Local plugins");
export function openExternalPackageReview(bundle: ExternalPackage) {
    void KittycordPackages.review(bundle).then(showReview, problem => Alerts.show({ title: "Package review failed", body: problem instanceof Error ? problem.message : "Package admission failed. Nothing was installed.", confirmText: "Close", cancelText: "Close" }));
}
