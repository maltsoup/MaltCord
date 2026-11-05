/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { NativeStudio } from "@api/NativeStudio";
import { Settings, useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CodeIcon, FolderIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { openSettingsTabModal, SettingsTab } from "@components/settings/tabs/BaseTab";
import { isNativeProject, type NativeCompilation, type NativeDiagnostic, nativeProject, type NativeStudioProject, newNativeProject } from "@shared/kittycord/nativeStudio";
import { CONTENT_TYPES,contentLabels } from "@shared/kittycord/presentation";
import { importStudioFile, parseStudioProject } from "@shared/kittycord/studio";
import { promptToRestart } from "@utils/promptToRestart";
import { chooseFile, saveFile } from "@utils/web";
import { Alerts, React, TextArea, TextInput, useEffect, useRef, useState } from "@webpack/common";

import { CompactNotice, KittenTabs } from "../KittenUI";
import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";
import { reviewNativeImport } from "./NativeImportReview";

export function NativeStudioPanel({ initialProject, workspaceView, onNavigate }: { initialProject?: NativeStudioProject; workspaceView?: string; onNavigate?(view: string): void; } = {}) {
    const revision = useRef(0);
    const [section, setSection] = useState("studio");
    const view = workspaceView ?? section;
    const navigate = onNavigate ?? setSection;
    const [dirty, setDirty] = useState(false), [restored, setRestored] = useState(!!initialProject);
    const dirtyRef = useRef(false);
    const workingKey = `kittencord.native-studio.working:${initialProject?.metadata.id ?? "workspace"}`;
    const [auxiliary,setAuxiliary]=useState("project");
    const [quickEdit, setQuickEdit] = useState(true);
    const [drafts,setDrafts]=useState<NativeStudioProject[]>([]);
    const [project, setProject] = useState(() => initialProject ? nativeProject(initialProject) : newNativeProject());
    const [file, setFile] = useState(project.entry);
    const [compiled, setCompiled] = useState<NativeCompilation>();
    const [diagnostics, setDiagnostics] = useState<NativeDiagnostic[]>([]);
    const [statuses, setStatuses] = useState(NativeStudio.snapshot);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [stack, setStack] = useState("");
    const [note, setNote] = useState("");
    const [recovered, setRecovered] = useState<unknown>();
    const latest = useRef(project);
    useEffect(() => {
        let active = true;
        void Promise.all([DataStore.get<unknown>(workingKey), DataStore.get<unknown>(workingKey + ":unvalidated")]).then(([value, recovery]) => {
            if (!active) return;
            setRecovered(recovery);
            if (!initialProject && value && revision.current === 0) load(nativeProject(value));
        }).catch(() => { if (active) setError("The previous working draft could not be opened. Stored source was preserved."); }).finally(() => { if (active) setRestored(true); });
        function beforeUnload(event: BeforeUnloadEvent) { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; } }
        window.addEventListener("beforeunload", beforeUnload);
        return () => {
            active = false; window.removeEventListener("beforeunload", beforeUnload);
            if (!dirtyRef.current) return;
            try { void DataStore.set(workingKey, nativeProject(latest.current)).catch(() => undefined); }
            catch { void DataStore.set(workingKey + ":unvalidated", latest.current).catch(() => undefined); }
        };
    }, [workingKey]);
    useEffect(() => {
        if (!restored) return;
        const timer = setTimeout(() => {
            try { void DataStore.set(workingKey, nativeProject(project)).catch(() => setError("The working draft could not be saved. Export your source before leaving.")); }
            catch { void DataStore.set(workingKey + ":unvalidated", project).catch(() => setError("The working draft could not be saved. Export your source before leaving.")); }
        }, 300);
        return () => clearTimeout(timer);
    }, [project, restored, workingKey]);
    useEffect(()=>{ if(IS_WEB)return;let active=true;void VencordNative.nativeStudio.request<NativeStudioProject[]>("drafts").then(value=>{ if(active)setDrafts(value); },()=>{ if(active)setError("Saved projects could not be loaded."); });return()=>{ active=false; }; },[]);
    useEffect(() => NativeStudio.subscribe(() => setStatuses(NativeStudio.snapshot())), []);
    async function run(action: () => Promise<void>) {
        setBusy(true); setError(""); setStack("");
        try { await action(); }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); setStack(error instanceof Error ? error.stack ?? "" : ""); }
        finally { setBusy(false); setStatuses(NativeStudio.snapshot()); }
    }
    function edit(next: NativeStudioProject) { revision.current++; latest.current = next; setProject(next); setCompiled(undefined); setDiagnostics([]); setNote(""); dirtyRef.current = true; setDirty(true); }
    function load(value: NativeStudioProject) { const parsed = nativeProject(value); edit(parsed); setFile(parsed.entry); dirtyRef.current = false; setDirty(false); }
    function replace(value: NativeStudioProject) { const apply = async () => { try { await DataStore.set(workingKey + ":previous", latest.current); load(value); navigate("studio"); } catch { setError("The previous draft could not be preserved. Replacement was cancelled."); } }; if (!dirtyRef.current) void apply(); else Alerts.show({ title: "Replace unsaved edits?", body: "Save or export the current project before replacing it. A working copy is retained locally.", confirmText: "Replace project", cancelText: "Keep editing", onConfirm: () => void apply() }); }
    async function importProject() {
        const selected = await chooseFile("application/json,.json,.js,.jsx,.ts,.tsx"); if (!selected) return;
        if (selected.size > 1_048_576) throw new Error("Native projects are limited to 1 MiB.");
        if (/\.[jt]sx?$/i.test(selected.name)) {
            const source = await selected.text();
            const imported = await VencordNative.nativeStudio.request<NativeStudioProject>(/\bglobalThis\.kittycordPlugin\s*=/.test(source) ? "migrate" : "import-source", /\bglobalThis\.kittycordPlugin\s*=/.test(source) ? await importStudioFile(selected) : { name: selected.name, source });
            reviewNativeImport(imported, replace); return;
        }
        const value: unknown = JSON.parse(await selected.text());
        if (isNativeProject(value)) { reviewNativeImport(value, replace); return; }
        reviewNativeImport(await VencordNative.nativeStudio.request<NativeStudioProject>("migrate", parseStudioProject(await importStudioFile(selected))), replace);
        setNote("Imported. The original source is preserved in this project.");
    }
    async function compile() {
        const generation = revision.current;
        const result = await VencordNative.nativeStudio.request<{ compilation?: NativeCompilation; diagnostics: NativeDiagnostic[]; }>("compile", nativeProject(project));
        if (revision.current !== generation) throw new Error("Source changed during compilation. Try again.");
        setCompiled(result.compilation); setDiagnostics(result.diagnostics);
        if (!result.compilation) throw new Error("Fix the source errors below, then try again.");
        return result.compilation;
    }
    function operation(action: string, id = project.metadata.id) { return run(async () => { await NativeStudio.command({ id, digest: compiled?.digest, operation: action }); }); }
    const current = statuses.find(status => status.id === project.metadata.id);
    const unavailable = busy || IS_WEB;
    const reloadClient = () => Alerts.show({ title: "Reload Discord?", body: "This applies saved source patches and removes disabled source changes.", confirmText: "Reload Discord", cancelText: "Cancel", onConfirm: () => location.reload() });
    return <SettingsTab><div className="kc-tool-page kc-native-studio">
        <KittyToolHeader Icon={CodeIcon} title="Plugin Studio" description="Create, edit and run your plugins." />
        {!workspaceView && <KittenTabs tabs={[{ id:"studio",label:"Studio" },{ id:"projects",label:"Projects" },{ id:"advanced",label:"Advanced" }]} selected={view} onSelect={navigate} label="Studio workspace" />}
        {view === "projects" && <section className="kc-tool-page"><Heading>Saved projects</Heading>{!drafts.length && <Paragraph>Save a project in Studio to add it here.</Paragraph>}{drafts.map(item => <article className="kc-tools-card" key={item.metadata.id}><Heading>{item.metadata.name}</Heading><Paragraph>v{item.metadata.version} · {item.metadata.author}</Paragraph><Button size="small" variant="secondary" onClick={() => replace(item)}>Open project</Button></article>)}</section>}
        {view === "studio" && <>
        <div className="kc-studio-toolbar">
            <div><Heading tag="h3">{project.metadata.name}</Heading><span className="kc-studio-state" data-running={current?.running || undefined}>{busy ? "Working…" : current?.running ? "Running" : current?.reloadRequired ? "Reload required" : current?.registered ? "Installed" : "Draft"}</span>{dirty && <small> · Unsaved edits</small>}</div>
            <div className="kc-tools-actions"><Button disabled={unavailable} onClick={() => void run(async () => {
                const result = await compile();
                await NativeStudio.command({ id: project.metadata.id, digest: result.digest, operation: "reload" });
                setNote(NativeStudio.snapshot().find(status => status.id === project.metadata.id)?.running ? "Running. Find your plugin in Plugins." : "Saved. Reload Discord to apply this plugin.");
            })}>{busy ? "Working…" : current?.registered ? "Update & run" : "Install & run"}</Button><Button variant="secondary" disabled={unavailable || !current?.running} onClick={() => void operation("disable")}>Stop</Button><Button variant="secondary" disabled={unavailable} onClick={() => void run(async () => { await VencordNative.studio.open(nativeProject(project)); })}>Open editor</Button></div>
        </div>
        {current?.reloadRequired && <div className="kc-studio-reload"><Paragraph>Source patches take effect when Discord reloads.</Paragraph><Button size="small" disabled={unavailable} onClick={reloadClient}>Reload Discord</Button></div>}
        <div className="kc-studio-workspace"><div className="kc-studio-files" role="group" aria-label="Project files"><span className="kc-studio-explorer-title">Project files</span>{Object.keys(project.files).map(name => <Button size="small" variant="none" key={name} aria-pressed={file === name} onClick={() => { setFile(name); setQuickEdit(true); }}>{name}</Button>)}</div>
        <div className="kc-studio-editor-pane"><div className="kc-studio-editor-tabs"><button type="button" aria-pressed={!quickEdit} onClick={() => setQuickEdit(false)}>Workspace</button><button type="button" aria-pressed={quickEdit} onClick={() => setQuickEdit(true)}>{file}</button></div>{quickEdit ? <TextArea className="kc-source-editor" aria-label="Native plugin source" rows={17} spellCheck={false} value={project.files[file] ?? ""} onChange={source => edit({ ...project, files: { ...project.files, [file]: source } })} /> : <div className="kc-studio-launch"><CodeIcon width={36} height={36}/><Heading tag="h3">Monaco workspace</Heading><Paragraph>Edit files, build, run and inspect diagnostics in the dedicated Studio window.</Paragraph><Button disabled={unavailable} onClick={() => void run(async () => { await VencordNative.studio.open(nativeProject(project)); })}>Open workspace</Button><small>{Object.keys(project.files).length} source files · {project.metadata.version}</small></div>}</div></div>
        <div className="kc-studio-file-actions"><Button size="small" variant="secondary" disabled={busy} onClick={() => replace(newNativeProject("basic"))}>Create plugin</Button><Button size="small" variant="secondary" disabled={unavailable} onClick={() => void run(async()=>{ const { default:PackagesTab }=await import("../kittycordPackages");openSettingsTabModal(PackagesTab); })}>Import package</Button><Button size="small" variant="secondary" disabled={busy} onClick={() => void run(importProject)}><FolderIcon width={16} height={16} />Import project</Button><Button size="small" variant="secondary" disabled={unavailable} onClick={() => void run(async () => { await VencordNative.nativeStudio.request("draft", nativeProject(project)); setDrafts(await VencordNative.nativeStudio.request<NativeStudioProject[]>("drafts")); dirtyRef.current = false; setDirty(false); setNote("Project saved."); })}>Save project</Button><Button size="small" variant="secondary" onClick={() => void run(async () => { await saveFile(new File([JSON.stringify(nativeProject(project), null, 4)], `${project.metadata.id}.native-project.json`, { type: "application/json" })); dirtyRef.current = false; setDirty(false); })}>Export</Button></div>
        <Button size="small" variant="secondary" onClick={() => { setAuxiliary("project"); navigate("advanced"); }}>Project Settings</Button>
        </> }
        {note && <Paragraph aria-live="polite">{note}</Paragraph>}
        {IS_WEB && <CompactNotice>Open the desktop app to install native plugins. Browser plugins are included in extension builds.</CompactNotice>}
        {error && <CompactNotice tone="critical">{error}</CompactNotice>}
        {diagnostics.map((diagnostic, index) => <CompactNotice tone="critical" key={index}>{diagnostic.file}:{diagnostic.line}:{diagnostic.column} {diagnostic.message}</CompactNotice>)}
        {stack && <KittyToolDetails title="Error details"><pre>{stack}</pre></KittyToolDetails>}
        {view === "advanced" && <>
        {recovered !== undefined && <Button variant="secondary" onClick={() => void saveFile(new File([JSON.stringify(recovered, null, 4)], "recovered-studio-draft.json", { type:"application/json" }))}>Export unfinished recovered draft</Button>}
        <KittenTabs label="Studio tools" tabs={[{ id:"project",label:"Project Settings" },{ id:"diagnostics",label:"Compiler & Diagnostics" },{ id:"installed",label:"Installed Studio Plugins" },{ id:"help",label:"Help" },{ id:"debugging",label:"Client Debugging" }]} selected={auxiliary} onSelect={setAuxiliary}/>
        {auxiliary==="project"&&<section className="kc-studio-panel">
            <Select options={CONTENT_TYPES.map(value=>({ value,label:contentLabels[value] }))} isSelected={value=>value===(project.metadata.contentType??"plugin")} select={contentType=>edit({ ...project,metadata:{ ...project.metadata,contentType } })} serialize={String}/>
            <div className="kc-tool-fields">{(["id", "name", "version", "author"] as const).map(key => <div className="kc-tool-field" key={key}><label>{key}</label><TextInput aria-label={`Native plugin ${key}`} value={project.metadata[key]} onChange={value => edit({ ...project, metadata: { ...project.metadata, [key]: value } })} /></div>)}</div>
            <Paragraph>Start with an example. This replaces the source in the editor.</Paragraph>
            <Select options={[{ label: "Kitty QuickActions", value: "quick-actions" }, { label: "Blank plugin", value: "basic" }, { label: "Toolbar button", value: "ui" }, { label: "Plugin with settings", value: "settings" }, { label: "Safe FakeDeafen", value: "safe-deafen" }, { label: "Read a Webpack module", value: "webpack" }, { label: "Source patch", value: "patch" }]} isSelected={() => false} serialize={String} select={example => replace(newNativeProject(example))} />
            <Button variant="secondary" size="small" disabled={unavailable} onClick={() => void run(async () => { const drafts = await VencordNative.nativeStudio.request<NativeStudioProject[]>("drafts"); const saved = drafts.find(item => item.metadata.id === project.metadata.id) ?? drafts.at(-1); if (!saved) throw new Error("No saved project yet."); replace(saved); })}>Open saved project</Button>
        </section>}
        {auxiliary==="diagnostics"&&<section className="kc-studio-panel"><div className="kc-tools-actions"><Button variant="secondary" disabled={unavailable} onClick={() => void run(async () => { await compile(); setNote("Compiled successfully. Nothing has run yet."); })}>Check source</Button><Button variant="secondary" disabled={unavailable || !compiled} onClick={() => void operation("register")}>Register without running</Button></div>{current && <dl>{Object.entries(current.stages).map(([stage, message]) => <React.Fragment key={stage}><dt>{stage}</dt><dd>{message}</dd></React.Fragment>)}</dl>}</section>}
        {auxiliary==="installed" && <section className="kc-studio-panel">{!statuses.length&&<Paragraph>No Studio plugins installed.</Paragraph>}{statuses.map(status => <section className="kc-studio-installed" key={status.id}><div><strong>{status.name}</strong><Paragraph>{status.running ? "Running" : status.reloadRequired ? "Reload required" : "Stopped"}</Paragraph></div>{status.error && <CompactNotice tone="critical">{status.error}</CompactNotice>}{status.stack && <details><summary>Error details</summary><pre>{status.stack}</pre></details>}<div className="kc-tools-actions"><Button variant="secondary" size="small" disabled={unavailable || !status.registered} onClick={() => replace(NativeStudio.project(status.id))}>Edit</Button><Button variant="secondary" size="small" disabled={unavailable} onClick={() => void operation(status.running ? "disable" : "enable", status.id)}>{status.running ? "Stop" : "Run"}</Button><Button variant="dangerSecondary" size="small" disabled={unavailable} onClick={() => Alerts.show({ title: `Remove ${status.name}?`, body: "The source is kept in your backups. Applied source patches need a Discord reload to be removed.", confirmText: "Remove plugin", cancelText: "Cancel", onConfirm: () => void operation("unregister", status.id) })}>Remove</Button></div></section>)}</section>}
        {auxiliary==="help"&&<section className="kc-studio-panel"><Paragraph>Use export default definePlugin with start and stop. Imports use the existing React, Webpack, Settings and plugin APIs. Stop must undo resources you create manually. Source patches need a client reload. Native plugins run as trusted client source.</Paragraph><Paragraph>Import accepts source files or project JSON, including older Studio projects. Full TypeScript type checking and native.ts helpers use the source build tools.</Paragraph></section>}
        {auxiliary==="debugging"&&<StudioDebugging/>}
        </> }
    </div></SettingsTab>;
}

function StudioDebugging(){ const { enableReactDevtools }=useSettings(["enableReactDevtools"]);return <section className="kc-studio-panel"><FormSwitch title="React developer tools" description="Requires restarting Discord." value={enableReactDevtools} onChange={value=>{ Settings.enableReactDevtools=value;promptToRestart("relaunch"); }}/></section>; }

export function openNativeProject(project: NativeStudioProject) {
    function Editor() { return <NativeStudioPanel initialProject={project} />; }
    Editor.displayName = project.metadata.name;
    openSettingsTabModal(Editor);
}
