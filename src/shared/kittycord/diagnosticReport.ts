/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { redactDiagnosticString } from "../../utils/diagnosticRedaction";
import { checkedObject, checkedVersion } from "./manifest";

export const REPORT_CATEGORIES = ["plugin", "renderer", "main", "promise", "startup", "update", "native", "interface", "other"] as const;
export type DiagnosticCommand = "status" | "settings" | "context" | "capture" | "export" | "submit" | "flush" | "attach" | "nativeFile";
export interface DiagnosticResult { enabled?: boolean; nativeCapture?: boolean; nativeCaptureSupported?: boolean; pending?: number; lastReport?: string; error?: string; reportId?: string; attachmentId?: string; exported?: { reports: DiagnosticReport[]; }; platform?: string; electron?: string; }
export interface DiagnosticReport {
    kind: "bug" | "crash";
    category: typeof REPORT_CATEGORIES[number];
    severity: "info" | "error" | "critical";
    version: string; os: string; electron: string;
    title: string; description: string; steps: string; stack: string;
    component?: string; relatedPlugin?: { name: string; version: string; };
    plugins: { id: string; version: string; }[];
    logs: string[]; at: number;
}
export function parseDiagnosticReport(input: unknown): DiagnosticReport {
    const value = checkedObject(input, ["kind", "category", "severity", "version", "os", "electron", "title", "description", "steps", "stack", "plugins", "logs", "at", "component", "relatedPlugin"], "Diagnostic report");
    function text(key: string, max: number) { const result = value[key]; if (typeof result !== "string" || result.length > max) throw new Error(`Invalid report ${key}.`); return redactDiagnosticString(result); }
    if (!["bug", "crash"].includes(String(value.kind)) || !REPORT_CATEGORIES.includes(value.category as DiagnosticReport["category"]) || !["info", "error", "critical"].includes(String(value.severity)) || typeof value.at !== "number" || !Number.isSafeInteger(value.at) || value.at < 0 || value.at > Date.now() + 300000 || !Array.isArray(value.plugins) || value.plugins.length > 1500 || !Array.isArray(value.logs) || value.logs.length > 20 || value.logs.some(item => typeof item !== "string" || item.length > 2000)) throw new Error("Invalid diagnostic context.");
    const plugins = value.plugins.map((input: unknown) => { const item = checkedObject(input, ["id", "version"], "Diagnostic plugin"); if (typeof item.id !== "string" || !/^[a-zA-Z0-9._-]{1,100}$/.test(item.id) || typeof item.version !== "string" || item.version.length > 128) throw new Error("Invalid diagnostic plugin."); return { id: item.id, version: item.version }; });
    const title = text("title", 160); if (!title.trim()) throw new Error("Enter a report title.");
    let relatedPlugin: DiagnosticReport["relatedPlugin"];
    if (value.relatedPlugin !== undefined) {
        const plugin = checkedObject(value.relatedPlugin, ["name", "version"], "Related plugin");
        if (typeof plugin.name !== "string" || plugin.name.length > 100 || typeof plugin.version !== "string" || plugin.version.length > 128) throw new Error("Invalid related plugin.");
        relatedPlugin = { name: redactDiagnosticString(plugin.name), version: redactDiagnosticString(plugin.version) };
    }
    return { kind: value.kind as DiagnosticReport["kind"], category: value.category as DiagnosticReport["category"], severity: value.severity as DiagnosticReport["severity"], version: checkedVersion(value.version, "Diagnostic version"), os: text("os", 100), electron: text("electron", 100), title, description: text("description", 8000), steps: text("steps", 8000), stack: text("stack", 12000), plugins, logs: (value.logs as string[]).map(redactDiagnosticString), at: value.at, ...(value.component !== undefined ? { component: text("component", 160) } : {}), ...(relatedPlugin ? { relatedPlugin } : {}) };
}
