/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginHealth } from "@api/PluginHealth";
import { getPluginLifecycleError, isPluginStarting, notifyPluginRegistry, pluginRequiresRestart, pluginStartTimings, registerPluginDefinition, startDependenciesRecursive, startPlugin, stopPlugin, unregisterPluginDefinition, waitForPluginStart, waitForPluginStop } from "@api/PluginManager";
import { Settings } from "@api/Settings";
import { removeStyle, styleMap } from "@api/Styles";
import { checkedObject, checkedPluginIdentifier } from "@shared/kittycord/manifest";
import type { NativeCompilation, NativePluginStatus, NativeStage } from "@shared/kittycord/nativeStudio";
import { Logger } from "@utils/Logger";
import type { Plugin } from "@utils/types";
import { patches } from "@webpack/patcher";

import { PluginMeta } from "~plugins";

import { nativeStudioModules } from "./NativeStudioModules";

interface Entry { compilation: NativeCompilation; plugin: Plugin; status: NativePluginStatus; loadedAtStartup: boolean; }
const entries = new Map<string, Entry>();
const failures: NativePluginStatus[] = [];
const listeners = new Set<() => void>();
const logger = new Logger("NativeStudio");
let busy = false;
function changed() { for (const listener of listeners) listener(); }
function removeStyles(id: string) { for (const name of styleMap.keys()) if (name.startsWith(`native-studio:${id}:`)) removeStyle(name); }
function evaluate(compilation: NativeCompilation): Plugin {
    const module: { exports: { default?: unknown; }; } = { exports: {} };
    const bound = new Map<string, object>();
    const require = (name: string) => {
        if (!Object.hasOwn(nativeStudioModules, name)) throw new Error(`Unsupported native host module: ${name}.`);
        let facade = bound.get(name);
        if (!facade) {
            const source = nativeStudioModules[name];
            const created: object = Object.create(null, { __esModule: { value: true }, ...Object.fromEntries(Object.keys(source).filter(key => key !== "__esModule").map(key => [key, { enumerable: true, get: () => Reflect.get(source, key) }])) });
            facade = created; bound.set(name, created);
        }
        return facade;
    };
    new Function("require", "module", "exports", compilation.code + `\n//# sourceURL=kittencord-studio://${compilation.project.metadata.id}/${compilation.project.entry}`)(require, module, module.exports);
    const value = module.exports.default;
    if (!value || typeof value !== "object" || !("name" in value) || typeof value.name !== "string" || !("description" in value) || typeof value.description !== "string" || !("authors" in value) || !Array.isArray(value.authors) || !value.authors.length) throw new Error("Export default definePlugin with name, description and authors.");
    if (["__proto__", "prototype", "constructor"].includes(value.name.toLowerCase())) throw new Error("Use a plugin name that is not a reserved registry key.");
    if (value.authors.some(author => !author || typeof author !== "object" || typeof Reflect.get(author, "name") !== "string" || !["bigint", "number"].includes(typeof Reflect.get(author, "id")))) throw new Error("Use authors from the existing Devs or EquicordDevs constants.");
    const settings = Reflect.get(value, "settings");
    if (settings !== undefined && (!settings || typeof settings !== "object" || !Reflect.get(settings, "def") || typeof Reflect.get(settings, "def") !== "object")) throw new Error("Use definePluginSettings from @api/Settings.");
    const flux = Reflect.get(value, "flux");
    if (flux !== undefined && (!flux || typeof flux !== "object" || Object.values(flux).some(handler => typeof handler !== "function"))) throw new Error("Flux handlers must use the inherited event-to-function format.");
    if (value.name !== compilation.project.metadata.name) throw new Error("The source plugin name must match the project name. Update the metadata or definePlugin.name.");
    for (const key of ["start", "stop"]) if (Reflect.get(value, key) !== undefined && typeof Reflect.get(value, key) !== "function") throw new Error(`${key} must be a function.`);
    if ("dependencies" in value && (!Array.isArray(value.dependencies) || value.dependencies.some(name => typeof name !== "string"))) throw new Error("Plugin dependencies must be plugin names.");
    if ("patches" in value && (!Array.isArray(value.patches) || value.patches.some(patch => !patch || typeof patch !== "object" || !("find" in patch) || !("replacement" in patch)))) throw new Error("Use the inherited Vencord source-patch format.");
    const plugin = value as Plugin;
    plugin.id = compilation.project.metadata.id; plugin.started = false; plugin.required = false; plugin.enabledByDefault = false;
    return plugin;
}
function record(compilation: NativeCompilation, loadedAtStartup = false) {
    const { id } = compilation.project.metadata;
    const plugin = evaluate(compilation);
    const contentType = compilation.project.metadata.contentType ?? "plugin";
    if (contentType !== "plugin") plugin.hidden = true;
    const status: NativePluginStatus = { id, name: plugin.name, version: compilation.project.metadata.version, contentType, registered: false, running: false, reloadRequired: pluginRequiresRestart(plugin), stages: { registration: "Checking native plugin contract." } };
    registerPluginDefinition(plugin, loadedAtStartup);
    PluginMeta[plugin.name] = { id, userPlugin: true, folderName: `src/userplugins/.studio/${id}` };
    status.stages.webpack = compilation.imports.filter(name => name.startsWith("@webpack")).length ? "Shared webpack bindings linked. Plugin-specific module access is checked by its native start callback." : "No direct webpack import.";
    status.registered = true; status.stages.registration = "Registered in the existing PluginManager registry.";
    status.stages.patches = status.reloadRequired ? loadedAtStartup ? "Registered before initPluginManager; inspect pending patches and health below." : "Reload required. No late source patching was attempted." : "No source patches or early startup hooks.";
    const entry = { compilation, plugin, status, loadedAtStartup }; entries.set(id, entry);
    notifyPluginRegistry(); changed(); return entry;
}
function entry(id: string) { const found = entries.get(id); if (!found) throw new Error("Register this compiled plugin first."); return found; }
function snapshot() {
    return [...failures, ...[...entries.values()].map(item => {
        const running = item.plugin.started && !isPluginStarting(item.plugin) && pluginStartTimings.get(item.plugin.name)?.success === true;
        const health = PluginHealth.get(item.plugin.name);
        return { ...item.status, stages: { ...item.status.stages, activation: isPluginStarting(item.plugin) ? "Awaiting the actual asynchronous start callback." : running ? "Native start completed." : item.status.stages.activation ?? "Disabled.", ...(item.loadedAtStartup && item.plugin.patches?.length ? { patches: `${patches.filter(patch => patch.plugin === item.plugin.name).length} pending source patches; ${health?.patchFailures.length ?? 0} recorded patch findings.` } : {}) }, running };
    })];
}
async function disable(item: Entry) {
    if (item.plugin.started) {
        if (!stopPlugin(item.plugin) || !await waitForPluginStop(item.plugin)) { item.plugin.started = true; throw getPluginLifecycleError(item.plugin) ?? new Error("The native stop callback failed. Cleanup remains incomplete; inspect the error and retry."); }
    }
    const { id } = item.compilation.project.metadata;
    Settings.plugins[id].enabled = false; Settings.plugins[item.plugin.name].enabled = false;
    item.status.running = false; item.status.stages.activation = "Disabled."; item.status.stages.cleanup = "Native stop completed; declarative API resources removed.";
    if (item.loadedAtStartup && item.plugin.patches?.length) item.status.stages.patches = "Reload required to remove source changes from already executed modules.";
}
export const NativeStudio = {
    project(id: string) { return structuredClone(entry(id).compilation.project); },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }, snapshot,
    bootstrap() {
        if (IS_WEB || !VencordNative.nativeStudio) return;
        const stored = VencordNative.nativeStudio.startup();
        for (const error of stored.errors) failures.push({ id: error.file, name: error.file, registered: false, running: false, reloadRequired: false, stages: { registration: error.message }, error: error.message });
        for (const compilation of stored.plugins) {
            try { record(compilation, true); }
            catch (error) { logger.error("Native project registration failed.", error); failures.push({ id: compilation.project.metadata.id, name: compilation.project.metadata.name, version: compilation.project.metadata.version, contentType: compilation.project.metadata.contentType ?? "plugin", registered: false, running: false, reloadRequired: false, stages: { registration: "Failed." }, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }); }
        }
    },
    async command(input: unknown) {
        if (IS_WEB) throw new Error("Native external source installation is desktop only. Browser plugins use the inherited packaged build.");
        const data = checkedObject(input, ["id", "digest", "operation"], "Native engine command");
        const id = checkedPluginIdentifier(data.id);
        if (data.operation === "status") return snapshot();
        if (busy) throw new Error("Wait for the current native plugin operation.");
        busy = true; let stage: NativeStage = "registration";
        try {
            if (["register", "reload", "enable"].includes(String(data.operation)) && PluginHealth.isSafeModeEnabled()) throw new Error("Disable the diagnostic Safe Mode in Health before running native projects. Your source and selections are kept.");
            if (data.operation === "register" || data.operation === "reload") {
                const compilation = await VencordNative.nativeStudio.request<NativeCompilation>("candidate", { id, digest: data.digest });
                const prior = entries.get(id);
                if (prior?.loadedAtStartup && prior.plugin.patches?.length) {
                    await VencordNative.nativeStudio.request("approve", { id, digest: data.digest });
                    prior.status.reloadRequired = true; prior.status.stages.registration = "New source saved. Reload required before replacing an active source-patch plugin."; changed(); return snapshot();
                }
                if (prior) { stage = "cleanup"; await disable(prior); unregisterPluginDefinition(prior.plugin); delete PluginMeta[prior.plugin.name]; entries.delete(id); removeStyles(id); }
                stage = "registration";
                const item = record(compilation);
                try { await VencordNative.nativeStudio.request("approve", { id, digest: data.digest }); }
                catch (error) { unregisterPluginDefinition(item.plugin); entries.delete(id); delete PluginMeta[item.plugin.name]; removeStyles(id); throw error; }
                if (data.operation !== "reload") return snapshot();
            }
            if (data.operation === "unregister" && !entries.has(id)) { await VencordNative.nativeStudio.request("unapprove", { id }); const index = failures.findIndex(item => item.id === id); if (index >= 0) failures.splice(index, 1); return snapshot(); }
            const item = entry(id); delete item.status.error; delete item.status.stack;
            if (data.operation === "enable" || data.operation === "reload") {
                if (PluginHealth.isQuarantined(id) || PluginHealth.isQuarantined(item.plugin.name)) throw new Error("Restore this plugin from Health recovery controls before running it. Its selection was kept.");
                stage = "activation";
                if (item.plugin.started && !isPluginStarting(item.plugin) && pluginStartTimings.get(item.plugin.name)?.success !== false) return snapshot();
                Settings.plugins[id].enabled = true; Settings.plugins[item.plugin.name].enabled = true;
                if (item.status.reloadRequired && !item.loadedAtStartup) { item.status.stages.activation = "Enabled for next client reload."; changed(); return snapshot(); }
                const dependencies = startDependenciesRecursive(item.plugin);
                if (dependencies.failures.length) throw new Error(`Native dependency startup failed: ${dependencies.failures.join(", ")}.`);
                if (dependencies.restartNeeded) { item.status.reloadRequired = true; item.status.stages.activation = "A dependency needs a client reload."; return snapshot(); }
                changed();
                if (!startPlugin(item.plugin) || !await waitForPluginStart(item.plugin)) {
                    if (item.plugin.started) await disable(item);
                    Settings.plugins[id].enabled = false; Settings.plugins[item.plugin.name].enabled = false;
                    const error = PluginHealth.get(item.plugin.name)?.runtimeErrors.at(-1)?.error;
                    throw getPluginLifecycleError(item.plugin) ?? new Error(error ?? "The actual native start callback failed.");
                }
                item.status.stages.activation = "Native start completed."; item.status.stages.webpack = "Uses the inherited webpack/Common module bindings.";
            } else if (data.operation === "disable" || data.operation === "unregister") {
                stage = "cleanup"; await disable(item);
                if (data.operation === "unregister" && item.loadedAtStartup && item.plugin.patches?.length) { await VencordNative.nativeStudio.request("unapprove", { id }); item.status.reloadRequired = true; item.status.stages.registration = "Removal staged. Reload the client to remove patched module references."; return snapshot(); }
                if (data.operation === "unregister") { unregisterPluginDefinition(item.plugin); delete PluginMeta[item.plugin.name]; removeStyles(id); entries.delete(id); await VencordNative.nativeStudio.request("unapprove", { id }); }
            } else throw new Error("Choose register, enable, disable, reload or unregister.");
            return snapshot();
        } catch (error) {
            const item = entries.get(id);
            if (stage === "activation" && item) {
                if (item.plugin.started) try { await disable(item); } catch (cleanup) { item.status.stages.cleanup = cleanup instanceof Error ? cleanup.message : String(cleanup); }
                Settings.plugins[id].enabled = false; Settings.plugins[item.plugin.name].enabled = false;
            }
            if (item) { item.status.error = error instanceof Error ? error.message : String(error); item.status.stack = error instanceof Error ? error.stack : undefined; item.status.stages[stage] = item.status.error; }
            logger.error(`Native ${stage} failed.`, error); throw error;
        } finally { busy = false; notifyPluginRegistry(); changed(); }
    }
};
