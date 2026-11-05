/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isNativeProject, type NativeCompilation, type NativeDiagnostic, type NativePluginStatus, nativeProject, newNativeProject } from "@shared/kittycord/nativeStudio";
import { importStudioFile } from "@shared/kittycord/studio";
import { inspectPluginSource } from "@shared/kittycord/safeInstall";
import * as monaco from "monaco-editor/esm/vs/editor/editor.main.js";

import { initializeStudioTheme } from "./studio-theme";

function element<T extends HTMLElement>(id: string, type: new () => T): T { const item = document.getElementById(id); if (!(item instanceof type)) throw new Error(`Missing native Studio control: ${id}.`); return item; }
const bridge = Reflect.get(globalThis, "KittyStudio") as { native(action: string, input?: unknown): Promise<unknown>; project(): Promise<unknown>; };
const status = element("status", HTMLElement); const diagnostics = element("diagnostics", HTMLElement); const files = element("files", HTMLSelectElement);
self.MonacoEnvironment = { getWorkerUrl(_id, label) { return new URL(`vendor/monaco/vs/${label === "typescript" || label === "javascript" ? "language/typescript/ts.worker.js" : label === "json" ? "language/json/json.worker.js" : "editor/editor.worker.js"}`, location.href).href; } };
for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
    defaults.setCompilerOptions({ module: monaco.typescript.ModuleKind.ESNext, target: monaco.typescript.ScriptTarget.ESNext, jsx: monaco.typescript.JsxEmit.React, allowJs: true, allowNonTsExtensions: true });
    defaults.setDiagnosticsOptions({ noSemanticValidation: true });
}
let project = newNativeProject(); let compiled: NativeCompilation | undefined; let dirty = false; let jsonDirty = false; let revision = 0; let busy = false; let updatingProject = false;
function workspace(view: string) {
    for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
        const selected = tab.dataset.view === view;
        tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
        element(`${tab.dataset.view}-panel`, HTMLElement).hidden = !selected;
    }
    if (view === "files") editor.layout();
}
for (const tab of document.querySelectorAll<HTMLButtonElement>("[data-view]")) {
    tab.addEventListener("click", () => workspace(tab.dataset.view ?? "files"));
    tab.addEventListener("keydown", event => {
        const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-view]")], index = tabs.indexOf(tab);
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault(); const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + step + tabs.length) % tabs.length];
        workspace(next.dataset.view ?? "files"); next.focus();
    });
}
function log(message: string) { const output = element("operation-log", HTMLElement); output.textContent = `${output.textContent ?? ""}${new Date().toLocaleTimeString()}  ${message}\n`.slice(-20000); }
const models = new Map<string, monaco.editor.ITextModel>();
const projectModel = monaco.editor.createModel("", "json", monaco.Uri.parse("file:///native-studio/project.json"));
const editor = monaco.editor.create(element("container", HTMLElement), { theme: "vs-dark", automaticLayout: true, minimap: { enabled: false }, fontSize: 14 });
initializeStudioTheme();
function invalidated() { dirty = true; revision++; compiled = undefined; element("register", HTMLButtonElement).disabled = true; element("reload", HTMLButtonElement).disabled = true; }
projectModel.onDidChangeContent(() => { if (!updatingProject) { jsonDirty = true; invalidated(); } });
function current() { if (jsonDirty) throw new Error("Apply the edited Project JSON before compiling."); return nativeProject({ ...project, files: Object.fromEntries([...models].map(([name, model]) => [name, model.getValue()])) }); }
function load(value: unknown) {
    project = nativeProject(value); for (const model of models.values()) model.dispose(); models.clear(); files.replaceChildren(); element("file-explorer", HTMLElement).replaceChildren();
    for (const [name, source] of Object.entries(project.files)) {
        const language = /\.tsx?$/.test(name) ? "typescript" : /\.jsx?$/.test(name) ? "javascript" : name.endsWith(".css") ? "css" : "json";
        const model = monaco.editor.createModel(source, language, monaco.Uri.parse(`file:///native-studio/${name}`)); model.onDidChangeContent(invalidated); models.set(name, model);
        const option = document.createElement("option"); option.value = name; option.textContent = name; files.append(option);
        const fileButton = document.createElement("button"); fileButton.type = "button"; fileButton.textContent = name; fileButton.onclick = () => { files.value = name; editor.setModel(model); }; element("file-explorer", HTMLElement).append(fileButton);
    }
    files.value = project.entry; editor.setModel(models.get(project.entry) ?? null); projectModel.setValue(JSON.stringify(project, null, 4)); jsonDirty = false; dirty = false; compiled = undefined;
    element("project-summary", HTMLElement).textContent = `${project.metadata.name} · ${project.metadata.version} · ${project.metadata.author} · ${project.metadata.id}`;
    element("register", HTMLButtonElement).disabled = true; element("reload", HTMLButtonElement).disabled = true; status.textContent = "Native source loaded. Build to check it, or Run to build and start it.";
    workspace("files");
}
function report(values: NativePluginStatus[]) { diagnostics.textContent = values.map(item => `${item.name}: ${item.running ? "Running" : "Not running"}\n${Object.entries(item.stages).map(([stage, value]) => `${stage}: ${value}`).join("\n")}\n${item.error ?? ""}\n${item.stack ?? ""}`).join("\n\n"); }
async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true; status.setAttribute("aria-busy", "true");
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("header button, nav button")];
    const disabled = buttons.map(button => button.disabled);
    buttons.forEach(button => { button.disabled = true; }); element("import", HTMLInputElement).disabled = true;
    try { await action(); }
    catch (error) { status.textContent = "Native operation failed. Source retained."; diagnostics.textContent = error instanceof Error ? error.stack ?? error.message : String(error); log(diagnostics.textContent); workspace("diagnostics"); }
    finally {
        busy = false; status.removeAttribute("aria-busy");
        buttons.forEach((button, index) => { button.disabled = disabled[index]; });
        element("register", HTMLButtonElement).disabled = !compiled; element("reload", HTMLButtonElement).disabled = !compiled;
        element("import", HTMLInputElement).disabled = false;
    }
}
function button(id: string, action: () => Promise<void> | void) { element(id, HTMLButtonElement).addEventListener("click", () => { void run(async () => { await action(); }); }); }
async function compile() {
    const input = current(); const generation = revision; status.textContent = "Compiling source and resolving actual host module aliases…";
    const result = await bridge.native("compile", input) as { compilation?: NativeCompilation; diagnostics: NativeDiagnostic[]; };
    if (generation !== revision) throw new Error("Source changed during compilation. Compile again.");
    compiled = result.compilation; diagnostics.textContent = result.diagnostics.map(item => `${item.stage}: ${item.file ?? input.entry}:${item.line ?? 1}:${item.column ?? 1} ${item.message}`).join("\n");
    element("register", HTMLButtonElement).disabled = !compiled; element("reload", HTMLButtonElement).disabled = !compiled;
    status.textContent = compiled ? `Compiled by esbuild ${compiled.compilerVersion}. Validation and compilation passed; registration and execution have not run.` : "Compilation failed. Nothing registered or executed.";
    if (compiled) diagnostics.textContent = `Source validation: passed\nCompilation: passed\nSHA-256: ${compiled.digest}\nShared host modules: ${compiled.imports.join(", ")}`;
    log(compiled ? `Build succeeded: ${input.metadata.name} ${input.metadata.version}.` : diagnostics.textContent);
    return compiled;
}
button("compile", async () => { await compile(); workspace("diagnostics"); });
button("run", async () => {
    const result = await compile(); if (!result) { workspace("diagnostics"); return; }
    const values = await bridge.native("engine", { operation: "reload", id: result.project.metadata.id, digest: result.digest }) as NativePluginStatus[];
    report(values); const active = values.find(item => item.id === result.project.metadata.id);
    status.textContent = active?.running ? `${active.name} is running in Discord.` : active?.reloadRequired ? "Saved. Reload Discord to apply source patches." : "Plugin did not start. Open Diagnostics.";
    log(status.textContent); if (!active?.running) workspace("diagnostics");
});
for (const [id, operation] of [["register", "register"], ["enable", "enable"], ["disable", "disable"], ["reload", "reload"], ["unregister", "unregister"], ["refresh", "status"]]) button(id, async () => {
    const input = current();
    const result = await bridge.native("engine", { operation, id: input.metadata.id, digest: compiled?.digest }) as NativePluginStatus[];
    report(result); status.textContent = `${input.metadata.name}: ${result.find(item => item.id === input.metadata.id)?.running ? "Running" : "Stopped"}.`;
    log(`${operation}: ${status.textContent}`);
});
button("reload-client", async () => { if (confirm("Reload Discord to apply saved native source patches and remove disabled source changes?")) await bridge.native("reload-client"); });
button("save", async () => { await bridge.native("draft", current()); dirty = false; status.textContent = "Editable native project saved locally."; log(status.textContent); });
button("delete-draft", async () => { const input = current(); if (!confirm(`Delete the saved draft for ${input.metadata.name}? Open source and installed plugins stay unchanged. A backup is retained.`)) return; await bridge.native("delete-draft", { id: input.metadata.id }); status.textContent = "Saved draft deleted. Source remains open and a backup was retained."; log(status.textContent); });
button("export", () => { const input = current(); const url = URL.createObjectURL(new Blob([JSON.stringify(input, null, 4)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `${input.metadata.id}.native-project.json`; link.click(); URL.revokeObjectURL(url); dirty = false; });
button("new", () => { const { value } = element("template", HTMLSelectElement); const example = (["ui", "basic", "settings", "safe-deafen", "quick-actions"] as const).find(example => example === value) ?? "ui"; if (!dirty || confirm("Replace this unsaved native source project?")) load(newNativeProject(example)); });
button("source-view", () => editor.setModel(models.get(files.value) ?? null));
button("project-view", () => { if (!jsonDirty) { updatingProject = true; try { projectModel.setValue(JSON.stringify(current(), null, 4)); } finally { updatingProject = false; } } workspace("files"); editor.setModel(projectModel); });
button("apply-project", () => load(JSON.parse(projectModel.getValue())));
button("add-file", () => { const name = prompt("Project-relative file name, such as components/Button.tsx"); if (!name) return; const input = current(); if (Object.hasOwn(input.files, name)) throw new Error("This source file already exists."); load({ ...input, files: { ...input.files, [name]: "" } }); files.value = name; editor.setModel(models.get(name) ?? null); dirty = true; });
files.addEventListener("change", () => editor.setModel(models.get(files.value) ?? null));
element("import", HTMLInputElement).addEventListener("change", event => {
    const selected = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined; if (!selected) return;
    const input = event.target;
    void run(async () => {
        if (selected.size > 1_048_576) throw new Error("Native projects are limited to 1 MiB.");
        const source = await selected.text(); let imported: unknown;
        if (/\.[jt]sx?$/i.test(selected.name)) imported = /\bglobalThis\.kittycordPlugin\s*=/.test(source) ? await bridge.native("migrate", await importStudioFile(selected)) : await bridge.native("import-source", { name: selected.name, source });
        else { const value: unknown = JSON.parse(source); imported = isNativeProject(value) ? value : await bridge.native("migrate", value); }
        const next = nativeProject(imported), dialog = element("import-review", HTMLDialogElement), choices = element("import-files", HTMLSelectElement);
        element("import-metadata", HTMLElement).textContent = `${next.metadata.name} · v${next.metadata.version} · ${next.metadata.author} · ${next.metadata.contentType ?? "plugin"}`;
        const findings = Object.values(next.files).flatMap(source => inspectPluginSource(source, ["network", "filesystem", "process"]));
        element("import-findings", HTMLElement).textContent = findings.length ? findings.map(item => item.message).join(" ") : "No recognized network or process references found. Nothing has executed.";
        choices.replaceChildren(...Object.keys(next.files).map(name => { const option = document.createElement("option"); option.value = option.textContent = name; return option; })); choices.value = next.entry;
        const preview = () => { element("import-source", HTMLElement).textContent = next.files[choices.value]; }; choices.onchange = preview; preview();
        element("import-cancel", HTMLButtonElement).onclick = () => dialog.close();
        element("import-accept", HTMLButtonElement).onclick = () => { if (dirty && !confirm("Replace the current unsaved draft?")) return; load(next); dialog.close(); };
        dialog.showModal();
        if (input instanceof HTMLInputElement) input.value = "";
    });
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => { editor.dispose(); projectModel.dispose(); for (const model of models.values()) model.dispose(); }, { once: true });
void bridge.project().then(value => load(value ?? newNativeProject())).catch(error => { diagnostics.textContent = String(error); });
