/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { IpcEvents } from "@shared/IpcEvents";
import { checkedObject, checkedPluginIdentifier } from "@shared/kittycord/manifest";
import { type NativeCompilation, nativeProject, newNativeProject } from "@shared/kittycord/nativeStudio";
import { importStudioProject } from "@shared/kittycord/studio";
import { ipcMain, type WebContents } from "electron";

import { DATA_DIR } from "../utils/constants";
import { compileNativeProject, importNativeSource } from "./nativeStudioCompiler";

const root = join(DATA_DIR, "native-studio");
const owners = new Map<number, WebContents>();
let compiling = false;
let compilerReady: Promise<void> | undefined;
export function connectNativeStudio(editor: WebContents, owner: WebContents) { owners.set(editor.id, owner); editor.once("destroyed", () => owners.delete(editor.id)); }
function hash(code: string | Buffer) { return createHash("sha256").update(code).digest("hex"); }
function folder(name: string) { const path = join(root, name); mkdirSync(path, { recursive: true }); return path; }
function validateCompilation(value: unknown): NativeCompilation {
    const record = checkedObject(value, ["project", "code", "digest", "imports", "diagnostics", "compilerVersion"], "Compiled native project");
    const project = nativeProject(record.project);
    if (typeof record.code !== "string" || Buffer.byteLength(record.code) > 4_194_304 || typeof record.digest !== "string" || hash(record.code) !== record.digest || !Array.isArray(record.imports) || record.imports.some(item => typeof item !== "string") || typeof record.compilerVersion !== "string") throw new Error("Compiled native source failed integrity verification.");
    return { project, code: record.code, digest: record.digest, imports: record.imports, diagnostics: [], compilerVersion: record.compilerVersion };
}
function stored(path: string) { const bytes = readFileSync(path); if (bytes.byteLength > 5_242_880) throw new Error("Stored native project exceeds its size limit."); return validateCompilation(JSON.parse(bytes.toString("utf8"))); }
function save(path: string, value: unknown) { const temporary = path + ".pending"; writeFileSync(temporary, JSON.stringify(value), "utf8"); renameSync(temporary, path); }
function startup() {
    const directory = folder("plugins");
    const plugins: NativeCompilation[] = []; const errors: { file: string; message: string; }[] = [];
    for (const name of readdirSync(directory).filter(name => name.endsWith(".json")).slice(0, 32)) {
        try { plugins.push(stored(join(directory, name))); }
        catch (error) { errors.push({ file: name, message: error instanceof Error ? error.message : "Native project could not load." }); }
    }
    return { plugins, errors };
}
async function prepareCompiler() {
    compilerReady ??= (async () => {
        const binary = await readFile(join(__dirname, "native-studio", process.platform === "win32" ? "esbuild.exe" : "esbuild"));
        const directory = join(root, "compiler", hash(binary)); await mkdir(directory, { recursive: true });
        const path = join(directory, process.platform === "win32" ? "esbuild.exe" : "esbuild");
        if (!existsSync(path) || hash(await readFile(path)) !== hash(binary)) await writeFile(path, binary);
        if (process.platform !== "win32") await chmod(path, 0o755);
        process.env.ESBUILD_BINARY_PATH = path;
    })().catch(error => { compilerReady = undefined; throw error; });
    return compilerReady;
}
ipcMain.on(IpcEvents.KITTYCORD_NATIVE_STUDIO_STARTUP, event => {
    try {
        if (event.senderFrame !== event.sender.mainFrame || !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com$/.test(new URL(event.sender.getURL()).origin)) throw new Error("Native plugins load only in the Discord main frame.");
        event.returnValue = startup();
    } catch (error) { event.returnValue = { plugins: [], errors: [{ file: "startup", message: error instanceof Error ? error.message : "Native startup failed." }] }; }
});
ipcMain.handle(IpcEvents.KITTYCORD_NATIVE_STUDIO, async (event, action: unknown, input: unknown) => {
    const owner = owners.get(event.sender.id);
    if (event.senderFrame !== event.sender.mainFrame || !owner && !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com$/.test(new URL(event.sender.getURL()).origin)) throw new Error("Use native Studio from Discord settings.");
    if (action === "reload-client") { const client = owner ?? event.sender; setTimeout(() => { if (!client.isDestroyed()) client.reload(); }, 50); return; }
    if (action === "import-source") {
        const value = checkedObject(input, ["name", "source"], "Native source import");
        if (typeof value.name !== "string" || typeof value.source !== "string" || value.source.length > 262144) throw new Error("Choose a source file up to 256 KiB.");
        await prepareCompiler();
        return importNativeSource(value.name, value.source);
    }
    if (action === "compile") {
        if (compiling) throw new Error("Wait for the current compilation to finish.");
        compiling = true;
        try {
            await prepareCompiler(); const result = await compileNativeProject(input, { VERSION: JSON.stringify(VERSION), BUILD_TIMESTAMP: String(BUILD_TIMESTAMP), IS_DEV: String(IS_DEV), IS_DISCORD_DESKTOP: String(IS_DISCORD_DESKTOP), IS_VESKTOP: String(IS_VESKTOP), IS_EQUIBOP: String(IS_EQUIBOP), IS_STANDALONE: String(IS_STANDALONE), IS_UPDATER_DISABLED: String(IS_UPDATER_DISABLED) });
            if (result.compilation) save(join(folder("candidates"), result.compilation.digest + ".json"), result.compilation);
            return result;
        } finally { compiling = false; }
    }
    if (action === "migrate") {
        await prepareCompiler();
        const original = await importStudioProject(input);
        const { transform } = await import("esbuild");
        const adapted = { ...original, metadata: { ...original.metadata, id: original.metadata.id + ".native" }, ...(original.language === "typescript" ? { language: "javascript" as const, source: (await transform(original.source, { loader: "ts", target: "es2022" })).code } : {}) };
        const base = newNativeProject("basic");
        return nativeProject({ ...base, metadata: adapted.metadata, files: { "index.tsx": `import {legacyStudioPlugin} from "@api/KittycordLegacyStudio";\nimport definePlugin from "@utils/types";\nexport default definePlugin(legacyStudioPlugin(${JSON.stringify(adapted)}));`, "legacy-original.json": JSON.stringify(original, null, 4) } });
    }
    if (action === "draft") { const project = nativeProject(input); save(join(folder("drafts"), project.metadata.id + ".json"), project); return project; }
    if (action === "drafts") return readdirSync(folder("drafts")).filter(name => name.endsWith(".json")).slice(0, 32).map(name => nativeProject(JSON.parse(readFileSync(join(folder("drafts"), name), "utf8"))));
    if (action === "list") return startup();
    const data = checkedObject(input, ["id", "digest", "operation"], "Native Studio operation");
    const id = checkedPluginIdentifier(data.id);
    if (action === "delete-draft") {
        const path = join(folder("drafts"), id + ".json");
        if (existsSync(path)) renameSync(path, join(folder("backups"), `draft-${id}-${Date.now()}.json`));
        return { removed: true };
    }
    if (action === "candidate" || action === "approve") {
        if (typeof data.digest !== "string" || !/^[a-f0-9]{64}$/.test(data.digest)) throw new Error("Compile this project before registering it.");
        const compilation = stored(join(folder("candidates"), data.digest + ".json"));
        if (compilation.project.metadata.id !== id) throw new Error("The compiled project does not match this identifier.");
        if (action === "approve") {
            const directory = folder("plugins");
            if (!existsSync(join(directory, id + ".json")) && readdirSync(directory).filter(name => name.endsWith(".json")).length >= 32) throw new Error("Remove an unused native plugin before registering another one.");
            const path = join(directory, id + ".json"); if (existsSync(path)) save(join(folder("backups"), id + ".json"), stored(path)); save(path, compilation);
        }
        return compilation;
    }
    if (action === "unapprove") { const path = join(folder("plugins"), id + ".json"); if (existsSync(path)) renameSync(path, join(folder("backups"), id + ".json")); return; }
    if (action === "engine" && owner && !owner.isDestroyed()) {
        if (!["register", "enable", "disable", "reload", "unregister", "status"].includes(String(data.operation))) throw new Error("Choose a supported native engine operation.");
        return owner.executeJavaScript(`Vencord.Api.NativeStudio.command(${JSON.stringify(data)})`);
    }
    throw new Error("Unsupported native Studio action.");
});
