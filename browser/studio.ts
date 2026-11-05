/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { buildStudioPackage, importStudioFile, newStudioProject, newUtilityProject, parseStudioProject, STUDIO_LIMIT, type StudioProject,studioTypeDeclarations } from "@shared/kittycord/studio";
import * as monaco from "monaco-editor/esm/vs/editor/editor.main.js";

import { initializeStudioPreview } from "./studio-preview";
import { initializeStudioTheme } from "./studio-theme";

function control<T extends HTMLElement>(id: string, type: new () => T): T { const element = document.getElementById(id); if (!(element instanceof type)) throw new Error(`Studio control is missing: ${id}.`); return element; }
const container = control("container", HTMLElement);
const status = control("status", HTMLElement);
const diagnostics = control("diagnostics", HTMLElement);
const exportButton = control("export-package", HTMLButtonElement);
const language = control("language", HTMLSelectElement);
self.MonacoEnvironment = { getWorkerUrl(_id: unknown, label: string) {
    const worker = label === "typescript" || label === "javascript" ? "language/typescript/ts.worker.js" : label === "json" ? "language/json/json.worker.js" : "editor/editor.worker.js";
    return new URL(`vendor/monaco/vs/${worker}`, location.href).href;
} };
for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
    const javascript = defaults === monaco.typescript.javascriptDefaults;
    defaults.setCompilerOptions({ target: monaco.typescript.ScriptTarget.ES2020, module: monaco.typescript.ModuleKind.None, strict: true, allowJs: javascript, checkJs: javascript, noEmit: javascript, noEmitOnError: true, allowNonTsExtensions: true, lib: ["es2021", "webworker"] });
}
let project = newUtilityProject();
let dirty = false;
let revision = 0;
let busy = false;
let jsonDirty = false;
let compiled: Awaited<ReturnType<typeof buildStudioPackage>> | undefined;
const sourceModel = monaco.editor.createModel(project.source, project.language, monaco.Uri.parse("file:///kittycord/plugin"));
const jsonModel = monaco.editor.createModel(JSON.stringify(project, null, 4), "json", monaco.Uri.parse("file:///kittycord/project.json"));
const editor = monaco.editor.create(container, { model: sourceModel, theme: "vs-dark", automaticLayout: true, minimap: { enabled: false }, fontSize: 14 });
initializeStudioTheme();
function invalidate() { dirty = true; revision++; compiled = undefined; exportButton.disabled = true; preview.invalidate(); }
sourceModel.onDidChangeContent(invalidate);
jsonModel.onDidChangeContent(() => { jsonDirty = true; invalidate(); });
function current() { if (jsonDirty) throw new Error("Apply the edited Project JSON first. Source and metadata have not been replaced."); return parseStudioProject({ ...project, language: language.value, source: sourceModel.getValue() }); }
function download(value: unknown, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 4)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
function load(value: StudioProject) {
    project = parseStudioProject(value); language.value = project.language;
    for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) defaults.setExtraLibs([{ content: studioTypeDeclarations(project.tokens, project.api === "utility-v1", project.api === "desktop-v1"), filePath: "file:///kittycord/kittycord-api.d.ts" }]);
    sourceModel.setValue(project.source); monaco.editor.setModelLanguage(sourceModel, project.language === "declarative" ? "json" : project.language);
    jsonModel.setValue(JSON.stringify(project, null, 4)); editor.setModel(sourceModel); compiled = undefined; exportButton.disabled = true; dirty = false; jsonDirty = false;
    status.textContent = "Project loaded locally. Run checks before exporting a package."; diagnostics.textContent = "";
}
async function check() {
    if (busy) return;
    busy = true; compiled = undefined; exportButton.disabled = true;
    status.textContent = "Checking source, types, permissions and integrity…";
    const checkedRevision = revision;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const input = current();
        const work = async () => {
            if (input.language === "declarative") return buildStudioPackage(input);
            const worker = input.language === "typescript" ? await monaco.typescript.getTypeScriptWorker() : await monaco.typescript.getJavaScriptWorker();
            const client = await worker(sourceModel.uri);
            if (await client.getScriptText(sourceModel.uri.toString()) !== input.source) throw new Error("Compiler source has not synchronized. Run checks again.");
            const problems = [...await client.getCompilerOptionsDiagnostics(sourceModel.uri.toString()), ...await client.getSyntacticDiagnostics(sourceModel.uri.toString()), ...await client.getSemanticDiagnostics(sourceModel.uri.toString())].filter(item => item.category === 1);
            if (problems.length) throw new Error(problems.map(item => {
                const position = sourceModel.getPositionAt(item.start ?? 0);
                return `${position.lineNumber}:${position.column} TS${item.code} ${typeof item.messageText === "string" ? item.messageText : JSON.stringify(item.messageText)}`;
            }).join("\n"));
            if (input.language === "javascript") return buildStudioPackage(input, input.source);
            const output = await client.getEmitOutput(sourceModel.uri.toString());
            const emitted = output.outputFiles.find(file => file.name.endsWith(".js"));
            if (output.emitSkipped || !emitted) throw new Error(`The compiler produced no JavaScript (skipped: ${output.emitSkipped}, files: ${output.outputFiles.map(file => file.name).join(", ")}). Check project language and source.`);
            return buildStudioPackage(input, emitted.text);
        };
        const result = await Promise.race([work(), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Compiler checks exceeded ten seconds. The project was preserved; close Studio if its worker remains busy.")), 10_000); })]);
        if (revision !== checkedRevision) throw new Error("Source changed during checks. Run checks again.");
        compiled = result;
        diagnostics.textContent = `Compiler diagnostics: passed\nManifest and declared permissions: passed\nSHA-256 integrity: passed\nRuntime source execution: not performed\n${result.manifest.integrity.digest}`;
        status.textContent = "Static checks passed. Package export is available; installation still requires review."; exportButton.disabled = false;
    } catch (problem) { status.textContent = "Checks failed. Nothing was executed or installed."; diagnostics.textContent = problem instanceof Error ? problem.message : "Studio validation failed."; }
    finally { clearTimeout(timer); busy = false; }
}
function button(id: string, action: () => void) { document.getElementById(id)?.addEventListener("click", action); }
button("new", () => { if (!dirty || confirm("Replace the unsaved Studio draft?")) load(newUtilityProject()); });
button("new-color", () => { if (!dirty || confirm("Replace the unsaved Studio draft?")) load(newStudioProject()); });
button("source-view", () => editor.setModel(sourceModel));
button("project-view", () => { if (!jsonDirty) { jsonModel.setValue(JSON.stringify(current(), null, 4)); jsonDirty = false; } editor.setModel(jsonModel); });
button("apply-project", () => { try { const value = parseStudioProject(JSON.parse(jsonModel.getValue())); if (!dirty || confirm("Apply project JSON and replace the editor draft?")) load(value); } catch (problem) { diagnostics.textContent = problem instanceof Error ? problem.message : "Invalid project JSON."; } });
button("format", () => { void editor.getAction("editor.action.formatDocument")?.run(); });
button("select", () => { const model = editor.getModel(); if (model) editor.setSelection(model.getFullModelRange()); editor.focus(); });
button("validate", () => { void check(); });
button("save-project", () => { try { download(current(), "kittycord-studio.project.json"); dirty = false; } catch (problem) { diagnostics.textContent = problem instanceof Error ? problem.message : "Project export failed."; } });
button("export-package", () => { if (compiled) download(compiled, `${compiled.manifest.id}-${compiled.manifest.version}.kittycord.json`); });
language.addEventListener("change", () => { invalidate(); monaco.editor.setModelLanguage(sourceModel, language.value === "declarative" ? "json" : language.value); });
document.getElementById("import")?.addEventListener("change", event => {
    const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : undefined;
    if (!file) return;
    void (async () => {
        try {
            if (file.size > STUDIO_LIMIT) throw new Error("Studio project exceeds 128 KiB.");
            const value = await importStudioFile(file);
            if (!dirty || confirm("Replace the unsaved Studio draft with this project?")) load(value);
        } catch (problem) { diagnostics.textContent = problem instanceof Error ? problem.message : "Project import failed."; }
    })();
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
window.addEventListener("pagehide", () => { editor.dispose(); sourceModel.dispose(); jsonModel.dispose(); }, { once: true });
const preview = initializeStudioPreview(() => compiled, current);
load(project);
const nativeBridge: unknown = Reflect.get(globalThis, "KittyStudio");
if (location.protocol === "file:" && nativeBridge && typeof nativeBridge === "object" && "project" in nativeBridge && typeof nativeBridge.project === "function") {
    void Promise.resolve(nativeBridge.project()).then(value => { if (value !== undefined && (!dirty || confirm("Replace this draft with the selected Local source project?"))) load(parseStudioProject(value)); }).catch(() => { diagnostics.textContent = "The selected Local project could not be loaded. Existing drafts were retained."; });
}
