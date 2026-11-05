/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../kittycordTools.css";

import * as DataStore from "@api/DataStore";
import { loadPublicProfile, loadPublicReadme } from "@api/KittycordGithub";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CodeIcon, FolderIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { openSettingsTabModal, SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Switch } from "@components/Switch";
import { DESKTOP_PERMISSIONS } from "@shared/kittycord/desktopPlugin";
import { type PublicGithubProfile } from "@shared/kittycord/githubPublic";
import { checkedPluginIdentifier, checkedText, checkedVersion } from "@shared/kittycord/manifest";
import { CONTENT_TYPES, contentLabels, originLabels, ORIGINS, type PluginPresentation, README_LIMIT } from "@shared/kittycord/presentation";
import { permissionDescriptions } from "@shared/kittycord/security";
import { buildStudioPackage, importStudioFile, newDesktopProject, newStudioProject, newUtilityProject, parseStudioProject, type StudioProject } from "@shared/kittycord/studio";
import { openPackagedStudio } from "@utils/studioEditor";
import { chooseFile, saveFile } from "@utils/web";
import { Alerts, TextArea, TextInput, useEffect, useRef, useState } from "@webpack/common";
import type { ComponentType } from "react";

import { KittenMarkdown } from "../KittenMarkdown";
import { CompactNotice, PluginGlyph } from "../KittenUI";
import { openExternalPackageReview } from "../kittycordPackages";
import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";
import { PluginDetails } from "../PluginDetails";
import { NativeStudioPanel } from "./NativeStudio";

const steps = ["Basics", "Source", "Permissions", "Documentation", "Preview", "Save & publish"];
const draftKey = "kittencord.studio-draft";
function newLocalProject(): StudioProject { return { ...newDesktopProject(), metadata: { ...newStudioProject().metadata, name: "My plugin" } }; }
export function Workshop({ initialProject }: { initialProject?: StudioProject; }) {
    const [draft, setDraft] = useState<StudioProject>(initialProject ?? newLocalProject());
    const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
    const [preview, setPreview] = useState<Awaited<ReturnType<typeof buildStudioPackage>>>();
    const [profile, setProfile] = useState<PublicGithubProfile>(); const [markdownPreview, setMarkdownPreview] = useState(false);
    const request = useRef<AbortController | undefined>(undefined);
    const [publishingOrigin, setPublishingOrigin] = useState("http://127.0.0.1:4180");
    useEffect(() => { let active=true; void DataStore.get<unknown>("kittencord.store-origin").then(value=>{ if(typeof value !== "string")return; try{ const url=new URL(value);if(active && url.origin === value && (url.protocol === "https:" || url.protocol === "http:" && ["127.0.0.1","localhost"].includes(url.hostname)))setPublishingOrigin(value); }catch{ if(active)setError("Saved publishing address is invalid. Import the source again or export the project."); } },()=>{ if(active)setError("The saved publishing address could not be read."); });return()=>{ active=false; }; },[]);
    useEffect(() => () => request.current?.abort(), []);
    const presentation: PluginPresentation = draft.presentation ?? { contentType: draft.api ? "plugin" : "theme", category: draft.api ? "Utilities" : "Themes", icon: draft.api ? "puzzle" : "palette", readme: "" };
    function edit(value: Partial<StudioProject>) { setDraft(previous => ({ ...previous, ...value })); setPreview(undefined); setMessage(""); }
    function metadata(key: keyof StudioProject["metadata"], value: string) { edit({ metadata: { ...draft.metadata, [key]: value } }); }
    function present(value: Partial<PluginPresentation>) { if ("github" in value) setProfile(undefined); edit({ presentation: { ...presentation, ...value } }); }
    function project() {
        return parseStudioProject({ schemaVersion: 1, kind: "kittycord-studio", language: draft.language, metadata: draft.metadata, source: draft.source,
            tokens: draft.tokens, tests: draft.tests, ...(draft.api ? { api: draft.api } : {}), ...(draft.api === "desktop-v1" ? { permissions: draft.permissions, networkOrigins: draft.networkOrigins } : {}), presentation,
            description: draft.description?.trim() || (draft.api ? "A local utility with settings and actions." : "A local visual customization.") });
    }
    async function run(action: () => Promise<void>) { setBusy(true); setError(""); setMessage(""); try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "The Studio operation failed. Your draft remains available."); } finally { setBusy(false); } }
    function download(value: unknown, name: string) { saveFile(new File([JSON.stringify(value, null, 4)], name, { type: "application/json" })); }
    function next() {
        setError("");
        try {
            if (!step) { checkedPluginIdentifier(draft.metadata.id); checkedText(draft.metadata.name, "Name"); checkedVersion(draft.metadata.version, "Version"); checkedText(draft.metadata.author, "Author"); if (draft.description?.trim()) checkedText(draft.description, "Description", 500); }
            else project();
            if (step === 3) { void run(async () => { if (draft.language !== "typescript") setPreview(await buildStudioPackage(project())); setStep(4); }); return; }
            setStep(Math.min(step + 1, steps.length - 1));
        } catch (problem) { setError(problem instanceof Error ? problem.message : "Complete this step first."); }
    }
    async function importProject() {
        const file = await chooseFile("application/json,.json,.js,.ts"); if (!file) return;
        const value = await importStudioFile(file);
        Alerts.show({ title: "Replace this draft?", body: "Save or export your current project first if you need it.", confirmText: "Replace", cancelText: "Cancel", onConfirm: () => { setDraft(value); setPreview(undefined); setStep(0); } });
    }
    const sourceHelp = draft.api === "desktop-v1" ? "Desktop API: Discord data, buttons, removable CSS and declared HTTPS downloads. Choose permissions in the next step." : draft.api ? "Utility API: local settings, panels, user actions and managed callbacks." : "Visual API: declared colors. This project belongs in KittenCord Market.";
    return <SettingsTab><div className="kc-tool-page kc-studio-wizard">
        <KittyToolHeader Icon={CodeIcon} title="Plugin Studio" description="Create, edit and add your plugins to Local." />
        <div className="kc-studio-toolbar"><details className="kc-overflow"><summary>New project</summary><div>{[{ label:"Discord plugin",project:newLocalProject() },{ label:"Local utility",project:newUtilityProject() },{ label:"Theme package",project:newStudioProject() }].map(item=><Button key={item.label} variant="secondary" onClick={()=>Alerts.show({ title:"Replace current draft?",body:"Save or export your current project first.",confirmText:"New project",cancelText:"Cancel",onConfirm:()=>{ setDraft(item.project);setPreview(undefined);setStep(0); } })}>{item.label}</Button>)}</div></details><Button variant="secondary" size="small" disabled={busy} onClick={() => void run(importProject)}><FolderIcon />Import project</Button><Button variant="secondary" size="small" disabled={busy} onClick={() => void run(async () => { const value = await DataStore.get<unknown>(draftKey); if (!value) throw new Error("No saved draft is available."); const saved = parseStudioProject(value); Alerts.show({ title: "Load saved draft?", body: "Export the current draft first if needed.", confirmText: "Load", cancelText: "Cancel", onConfirm: () => { setDraft(saved); setPreview(undefined); setStep(0); } }); })}>Load draft</Button></div>
        <ol className="kc-studio-steps" aria-label="Plugin creation steps">{steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}><span className="kc-step-index">{index + 1}</span><span>{label}</span></li>)}</ol>
        {error && <CompactNotice tone="critical">{error}</CompactNotice>}{message && <CompactNotice>{message}</CompactNotice>}
        <div className="kc-tools-card kc-studio-step" key={step}>
        <Heading>{steps[step]}</Heading>
        {step === 0 && <><div className="kc-tool-fields">{([["name", "Name"], ["id", "Identifier"], ["version", "Version"], ["author", "Author"]] as const).map(([key, label]) => <div className="kc-tool-field" key={key}><label>{label}</label><TextInput aria-label={`Plugin ${label.toLowerCase()}`} value={draft.metadata[key]} onChange={value => metadata(key, value)} /></div>)}<div className="kc-tool-field"><label>Short description</label><TextInput aria-label="Short description" value={draft.description ?? ""} onChange={description => edit({ description })} maxLength={500} /></div><div className="kc-tool-field"><label>Category</label><TextInput aria-label="Plugin category" value={presentation.category} onChange={category => present({ category })} /></div><div className="kc-tool-field"><label>Icon</label><div className="kc-icon-options" role="group" aria-label="Plugin icon">{["puzzle", "code", "clock", "palette", "search", "shield"].map(icon => <Button key={icon} size="small" variant="secondary" aria-label={`${icon} icon`} aria-pressed={presentation.icon === icon} onClick={() => present({ icon })}><PluginGlyph icon={icon} /></Button>)}</div></div><div className="kc-tool-field"><label>Destination</label><Select options={CONTENT_TYPES.filter(type => draft.api ? type === "plugin" : type === "theme").map(value => ({ label: contentLabels[value], value }))} isSelected={value => value === presentation.contentType} serialize={String} select={contentType => present({ contentType })} /></div></div><div className="kc-tools-actions"><PluginGlyph icon={presentation.icon} /><Button variant="secondary" size="small" onClick={() => void run(async () => { const file = await chooseFile("image/png,image/jpeg"); if (!file) return; if (file.size > 8192 || !["image/png", "image/jpeg"].includes(file.type)) throw new Error("Choose a PNG/JPEG icon up to 8 KiB."); const bytes = new Uint8Array(await file.arrayBuffer()); present({ icon: `data:${file.type};base64,${btoa(String.fromCharCode(...bytes))}` }); })}>Upload small icon</Button></div></>}
        {step === 1 && <><Paragraph>{sourceHelp}</Paragraph><Select options={["javascript", "typescript", "declarative"].filter(value => !draft.api || value !== "declarative").map(value => ({ label: value === "declarative" ? "Builder JSON" : value === "typescript" ? "TypeScript" : "JavaScript", value }))} isSelected={value => value === draft.language} serialize={String} select={language => edit({ language: language as StudioProject["language"] })} /><div className="kc-tool-field kc-tool-editor"><label>Source draft</label><TextArea aria-label="Plugin source" value={draft.source} onChange={source => edit({ source })} rows={14} spellCheck={false} /></div><div className="kc-tools-actions"><Button variant="secondary" disabled={IS_WEB && !IS_EXTENSION} onClick={() => void run(async () => { if (!IS_WEB) await VencordNative.studio.open(project()); else { download(project(), "kittencord-studio.project.json"); await openPackagedStudio(); setMessage("Import the exported project in the packaged editor."); } })}><CodeIcon />Open Monaco editor</Button></div><Paragraph>Monaco provides syntax highlighting, diagnostics, format, find/replace and a consented isolated preview. Import the edited project back here to retain compiler changes.</Paragraph></>}
        {step === 2 && <><Paragraph>Capabilities used by this plugin.</Paragraph>{draft.api === "desktop-v1" ? <>
            <div className="kc-settings-rows">{DESKTOP_PERMISSIONS.map(permission => <div className="kc-setting-row" key={permission}><div><strong>{permissionDescriptions[permission].label}</strong><Paragraph>{permissionDescriptions[permission].description}</Paragraph></div><Switch aria-label={`${permission} permission`} checked={draft.permissions?.includes(permission) ?? false} disabled={permission === "settings" || permission === "events"} onChange={enabled => {
                const permissions = new Set(draft.permissions); if (enabled) permissions.add(permission); else permissions.delete(permission);
                if (permission === "scripts" && enabled) permissions.add("network"); if (permission === "network" && !enabled) permissions.delete("scripts");
                edit({ permissions: [...permissions], ...(!permissions.has("network") ? { networkOrigins: [] } : {}) });
            }} /></div>)}</div>
            {draft.permissions?.includes("network") && <div className="kc-tool-field"><label>Allowed HTTPS origins, one per line</label><TextArea aria-label="Plugin network origins" value={draft.networkOrigins?.join("\n") ?? ""} onChange={value => edit({ networkOrigins: value.split("\n").map(line => line.trim()).filter(Boolean) })} rows={3} placeholder="https://raw.githubusercontent.com" /></div>}
            <Paragraph>External libraries use api.loadScript(url, sha256). Every downloaded script is pinned by digest and runs inside this plugin's worker. Disable the plugin to remove its buttons, styling and pending downloads.</Paragraph>
        </> : (draft.api ? ["Local plugin settings", "Explicit panel actions and managed events"] : ["Declared color tokens"]).map(label => <div className="kc-permission-row" key={label}><PluginGlyph icon="shield" /><span>{label}</span><span className="kc-status">Declared</span></div>)}</>}
        {step === 3 && <><div className="kc-tool-fields"><div className="kc-tool-field"><label>GitHub username</label><TextInput aria-label="GitHub username" placeholder="Username or profile URL" value={presentation.github?.username ?? ""} onChange={username => present({ github: username ? { ...presentation.github, username } : undefined })} /></div><div className="kc-tool-field"><label>GitHub repository</label><TextInput aria-label="GitHub repository" placeholder="https://github.com/author/project" value={presentation.github?.repository ?? ""} onChange={repository => present({ github: { username: presentation.github?.username ?? "", repository: repository || undefined } })} /></div></div><div className="kc-tools-actions"><Button variant="secondary" size="small" disabled={busy || !presentation.github?.username} onClick={() => void run(async () => { if (presentation.github) { request.current?.abort(); request.current = new AbortController(); const result = await loadPublicProfile(presentation.github.username, presentation.github.repository, request.current.signal); if (!request.current.signal.aborted) setProfile(result); } })}>Load public profile</Button><Button variant="secondary" size="small" disabled={busy || !presentation.github?.repository} onClick={() => void run(async () => { if (presentation.github?.repository) present({ readme: await loadPublicReadme(presentation.github.repository) }); })}>Import GitHub README</Button><Button variant="secondary" size="small" onClick={() => void run(async () => { const file = await chooseFile("text/markdown,text/plain,.md"); if (!file) return; if (file.size > README_LIMIT) throw new Error("README exceeds 24 KiB."); present({ readme: await file.text() }); })}>Upload README.md</Button></div>{profile && <div className="kc-publisher"><span className="kc-avatar"><img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setProfile(undefined)} /></span><Link href={profile.profile} target="_blank" rel="noreferrer noopener">@{profile.username}</Link><span className="kc-package-version">Public profile, association unverified</span></div>}<div className="kc-tool-field"><label>README Markdown</label><TextArea aria-label="README Markdown" value={presentation.readme} onChange={readme => present({ readme })} rows={9} /></div><Button variant="secondary" size="small" onClick={() => setMarkdownPreview(value => !value)}>{markdownPreview ? "Hide preview" : "Preview README"}</Button>{markdownPreview && <KittenMarkdown source={presentation.readme} repository={presentation.github?.repository} />}<details className="kc-tool-details"><summary>Edition & original attribution</summary><div><Select options={ORIGINS.map(value => ({ value, label: originLabels[value] }))} isSelected={value => value === presentation.origin?.kind} serialize={String} select={kind => present({ origin: { kind, project: "KittenCord", author: draft.metadata.author, repository: presentation.github?.repository ?? "", compatibility: "1.1.0" } })} />{presentation.origin && <div className="kc-tool-fields">{([["project", "Original project"], ["author", "Original author"], ["repository", "Original repository"], ["compatibility", "Compatibility version"]] as const).map(([key, label]) => <div className="kc-tool-field" key={key}><label>{label}</label><TextInput aria-label={label} value={presentation.origin?.[key] ?? ""} onChange={value => { if (presentation.origin) present({ origin: { ...presentation.origin, [key]: value } }); }} /></div>)}</div>}<Paragraph>Origin is a content declaration. Only the authenticated publishing service can mark an official owner release.</Paragraph></div></details></>}
        {step === 4 && (preview ? <PluginDetails bundle={preview} /> : <><Paragraph>TypeScript must be compiled in Monaco before package export. The project retains all documentation and attribution.</Paragraph><PluginGlyph large icon={presentation.icon} /><Heading>{draft.metadata.name}</Heading><KittenMarkdown source={presentation.readme || "No README yet."} repository={presentation.github?.repository} /></>)}
        {step === 5 && <><Paragraph>Save the editable project first. Exported packages are reviewed before installation.</Paragraph><div className="kc-tools-actions"><Button disabled={busy || IS_WEB || draft.language === "typescript"} onClick={() => void run(async () => { const bundle = await buildStudioPackage(project()); openExternalPackageReview(bundle); })}><PluginGlyph icon="puzzle" />Add to Local</Button><Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await DataStore.set(draftKey, project()); setMessage("Draft saved locally."); })}>Save local draft</Button><Button variant="secondary" onClick={() => void run(async () => { download(project(), `${draft.metadata.id}.project.json`); setMessage("Editable project exported."); })}><CloudDownloadIcon />Export project</Button><Button variant="secondary" disabled={busy || draft.language === "typescript"} onClick={() => void run(async () => { const bundle = await buildStudioPackage(project()); download(bundle, `${bundle.manifest.id}-${bundle.manifest.version}.kittycord.json`); setMessage("Package exported. Review it in Local plugins or Market → Installed before enabling."); })}>Export package</Button></div><div className="kc-compact-notice"><CodeIcon width={18} /><div><strong>Publish your plugin</strong><Paragraph>Export the package, open your configured publishing service, sign in with Discord, and upload it. Public publishing requires the existing backend and signing configuration.</Paragraph><Link href={publishingOrigin} target="_blank" rel="noreferrer noopener">Open publishing service ↗</Link></div></div>{draft.language === "typescript" && <CompactNotice>Export TypeScript packages from Monaco after Run checks. Project export here retains the editable TypeScript source.</CompactNotice>}{IS_WEB && <Paragraph>Browser extensions require a reviewed packaged build; external JavaScript cannot install here.</Paragraph>}</>}
        </div>
        <footer className="kc-wizard-footer"><Button variant="secondary" disabled={step === 0 || busy} onClick={() => { setStep(value => value - 1); setError(""); }}>Back</Button><span>{step + 1} / {steps.length}</span>{step < steps.length - 1 && <Button disabled={busy} onClick={next}>{busy ? "Validating…" : "Continue"}</Button>}</footer>
        <KittyToolDetails title="Existing source plugins"><Paragraph>TestCord/Vencord plugins using definePlugin, Discord imports or webpack patches remain in src/userplugins and the reviewed build workflow. Existing source projects remain available.</Paragraph></KittyToolDetails>
    </div></SettingsTab>;
}
export function StudioHome() {
    return <><NativeStudioPanel /><KittyToolDetails title="Legacy projects"><Workshop /></KittyToolDetails></>;
}
function StudioEntry() {
    const [Component, setComponent] = useState<ComponentType>();
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true;
        void import("../kittycordDeveloperTools").then(module => { if (active) setComponent(() => module.default); }, () => { if (active) setError("Developer tools could not load. Reopen this page to try again."); });
        return () => { active = false; };
    }, []);
    return Component ? <Component /> : <Paragraph>{error || "Loading developer tools…"}</Paragraph>;
}
export default wrapTab(StudioEntry, "Developer tools");
export function openWorkshopProject(project: StudioProject) {
    const checked = parseStudioProject(project);
    function ProjectReview() { return <Workshop initialProject={checked} />; }
    ProjectReview.displayName = "Kitty Studio Project";
    openSettingsTabModal(ProjectReview);
}
