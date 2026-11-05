/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordPackages } from "@api/KittycordPackages";
import { kittycordStartupStatus } from "@api/KittycordRecovery";
import { NativeStudio } from "@api/NativeStudio";
import { PluginHealth } from "@api/PluginHealth";
import { isPluginEnabled, plugins } from "@api/PluginManager";
import { type DiagnosticCommand, type DiagnosticReport, type DiagnosticResult, parseDiagnosticReport } from "@shared/kittycord/diagnosticReport";
import { redactDiagnosticString } from "@utils/diagnosticRedaction";
import { Logger } from "@utils/Logger";

let metadata: DiagnosticResult = {};
const logger = new Logger("KittenCord diagnostics");
function pluginVersion(name: string) { return NativeStudio.snapshot().find(item => item.name === name)?.version ?? KittycordPackages.snapshot().entries.find(item => item.manifest.name === name)?.manifest.version ?? VERSION; }
export const KittycordDiagnostics = {
    async command(action: DiagnosticCommand, input?: unknown) {
        if (IS_WEB) throw new Error("Desktop diagnostics are unavailable in this host. Export the report locally instead.");
        const result = await VencordNative.diagnostics.command(action, input);
        if (result.error && action !== "status" && action !== "settings") throw new Error(result.error);
        if (action === "status" || action === "settings") metadata = result;
        if (action === "settings" && metadata.enabled) await VencordNative.diagnostics.command("context", this.report().plugins);
        return result;
    },
    report(input: Partial<DiagnosticReport> = {}) {
        const native = NativeStudio.snapshot(), local = KittycordPackages.snapshot().entries;
        const enabled = Object.values(plugins).filter(plugin => isPluginEnabled(plugin.name)).map(plugin => ({ id: plugin.id ?? plugin.name, version: native.find(item => item.name === plugin.name)?.version ?? VERSION }));
        return parseDiagnosticReport({ kind: "bug", category: "other", severity: "info", version: VERSION, os: metadata.platform ?? "Browser host", electron: metadata.electron ?? "", title: "KittenCord issue", description: "", steps: "", stack: "", plugins: [...enabled, ...local.filter(item => item.enabled).map(item => ({ id: item.manifest.id, version: item.manifest.version }))].slice(0, 1500), logs: [], at: Date.now(), ...input });
    },
    logs() { return [...PluginHealth.getAll()].flatMap(([name, health]) => health.runtimeErrors.slice(-3).map(error => `${name} · ${error.source}\n${error.error}`)).slice(-20).map(line => redactDiagnosticString(line.slice(0, 2000))); },
    start() {
        if (IS_WEB) return () => {};
        let active = true;
        const seen = new Map<string, number>();
        const capture = (category: DiagnosticReport["category"], title: string, stack: string, relatedPlugin?: DiagnosticReport["relatedPlugin"]) => {
            if (!metadata.enabled || !active) return;
            void this.command("capture", this.report({ kind: "crash", category, severity: "error", title: title.slice(0,160), stack: stack.slice(0,12000), component: relatedPlugin?.name ?? category, ...(relatedPlugin ? { relatedPlugin } : {}) })).catch(error => logger.warn("A diagnostic could not be queued.", error));
        };
        const health = () => { for (const [name, entry] of PluginHealth.getAll()) { const latest = entry.runtimeErrors.at(-1); if (!latest || latest.at <= (seen.get(name) ?? 0)) continue; seen.set(name, latest.at); capture(latest.source.includes("start") ? "startup" : "plugin", `Plugin error: ${name}`, `${latest.source}\n${latest.error}`, { name, version: pluginVersion(name) }); } };
        void this.command("status").then(async () => { if (!active) return; if (metadata.enabled) await this.command("context", this.report().plugins); health(); for (const name of kittycordStartupStatus.failedPlugins) capture("startup", `Plugin startup failure: ${name}`, "Recorded by startup recovery.", { name, version: pluginVersion(name) }); }).catch(error => logger.warn("Diagnostic preferences could not be loaded.", error));
        const unsubscribe = PluginHealth.subscribe(health);
        const error = (event: ErrorEvent) => capture("renderer", "Renderer JavaScript error", event.error instanceof Error ? event.error.stack ?? event.error.name : `Source line ${event.lineno}:${event.colno}`);
        const rejection = (event: PromiseRejectionEvent) => capture("promise", "Unhandled renderer promise", event.reason instanceof Error ? event.reason.stack ?? event.reason.name : "Unhandled promise rejection.");
        window.addEventListener("error", error); window.addEventListener("unhandledrejection", rejection);
        return () => { active = false; unsubscribe(); window.removeEventListener("error", error); window.removeEventListener("unhandledrejection", rejection); };
    }
};
