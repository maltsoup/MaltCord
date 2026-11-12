/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { release } from "node:os";
import { basename, join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import { IpcEvents } from "@shared/IpcEvents";
import { type DiagnosticCommand, type DiagnosticReport, type DiagnosticResult, parseDiagnosticReport } from "@shared/kittycord/diagnosticReport";
import { redactDiagnosticString } from "@utils/diagnosticRedaction";
import { app, BrowserWindow, crashReporter, dialog, ipcMain } from "electron";

import { cloudRequest } from "./cloud";

const root = join(DATA_DIR, "diagnostics"), filename = join(root, "pending.json");
const nativeCaptureSupported = process.env.KITTENCORD_OWNS_ELECTRON_CRASH_REPORTER === "1";
let enabled = false, nativeCapture = false, loaded = false, storageError = "", lastReport = "", lastFailure = "";
let reports: DiagnosticReport[] = [], flushing: Promise<void> | undefined;
const uploadTokens = new Map<string,string>();
let contextPlugins: DiagnosticReport["plugins"] = [];
function load() {
    if (loaded) return; loaded = true;
    try {
        if (!existsSync(filename)) return;
        const info = lstatSync(filename); if (info.isSymbolicLink() || !info.isFile() || info.size > 4000000) throw new Error("Invalid diagnostic storage.");
        const value: unknown = JSON.parse(readFileSync(filename, "utf8"));
        if (!value || typeof value !== "object" || !("enabled" in value) || typeof value.enabled !== "boolean" || !("nativeCapture" in value) || typeof value.nativeCapture !== "boolean" || !("reports" in value) || !Array.isArray(value.reports) || value.reports.length > 30) throw new Error("Invalid diagnostic storage.");
        reports = value.reports.map(parseDiagnosticReport); enabled = value.enabled; nativeCapture = value.nativeCapture;
    } catch { storageError = "Diagnostic storage needs inspection. Existing files were preserved."; }
}
function save() {
    if (storageError) throw new Error(storageError);
    mkdirSync(root, { recursive: true }); if (lstatSync(root).isSymbolicLink()) throw new Error("Diagnostic storage cannot be a symbolic link.");
    const temporary = join(root, `${randomUUID()}.tmp`); writeFileSync(temporary, JSON.stringify({ enabled, nativeCapture, reports }), { mode: 0o600, flag: "wx" }); renameSync(temporary, filename);
}
function capture(input: unknown) { load(); if (!enabled) return; const report = parseDiagnosticReport(input); if (reports.some(previous => previous.title === report.title && previous.stack === report.stack && report.at - previous.at < 60000)) return; reports = [...reports.slice(-29), report]; save(); }
function nativeReporter() {
    if (!nativeCapture || !nativeCaptureSupported) return;
    crashReporter.start({ uploadToServer: false, productName: "MaltCord", rateLimit: true, globalExtra: { kittencordVersion: VERSION } });
}
async function submit(report: DiagnosticReport) { const value = await cloudRequest("/api/v1/reports", { report, consent: true }); if (typeof value.id !== "string" || !/^KC-[A-F0-9]{16}$/.test(value.id)) throw new Error("The service returned an invalid report receipt."); if (typeof value.uploadToken === "string" && /^[a-f0-9]{64}$/.test(value.uploadToken)) { if (uploadTokens.size >= 30) { const oldest = uploadTokens.keys().next().value; if (oldest) uploadTokens.delete(oldest); } uploadTokens.set(value.id, value.uploadToken); } lastReport = value.id; return value.id; }
function flush() {
    if (flushing) return flushing;
    flushing = Promise.resolve().then(async () => { load(); if (!enabled) return; for (const report of [...reports]) { if (!enabled) break; await submit(report); reports = reports.filter(item => item !== report); save(); } }).finally(() => { flushing = undefined; }); return flushing;
}
function status(): DiagnosticResult { load(); return { enabled, nativeCapture, nativeCaptureSupported, pending: reports.length, lastReport, platform: `${process.platform} ${release()}`, electron: process.versions.electron ?? "", ...(storageError || lastFailure ? { error: storageError || lastFailure } : {}) }; }
function technical(category: DiagnosticReport["category"], title: string, stack = ""): DiagnosticReport { return parseDiagnosticReport({ kind: "crash", category, severity: "error", version: VERSION, os: `${process.platform} ${release()}`, electron: process.versions.electron ?? "", title, description: "", steps: "", stack, plugins: contextPlugins, logs: [], at: Date.now() }); }
export async function diagnosticCommand(action: DiagnosticCommand, input?: unknown): Promise<DiagnosticResult> {
    load();
    if (action === "status") return status();
    if (action === "export") return { exported: { reports } };
    if (storageError) throw new Error(storageError);
    if (action === "context") { if (enabled) contextPlugins = parseDiagnosticReport({ ...technical("other", "Enabled plugin context"), plugins: input }).plugins; return status(); }
    if (action === "settings") {
        if (!input || typeof input !== "object" || !("enabled" in input) || typeof input.enabled !== "boolean" || !("nativeCapture" in input) || typeof input.nativeCapture !== "boolean" || input.nativeCapture && !nativeCaptureSupported) throw new Error("Choose supported diagnostic preferences.");
        enabled = input.enabled; nativeCapture = input.nativeCapture; save(); nativeReporter(); return status();
    }
    if (action === "capture") { capture(input); return status(); }
    if (action === "flush") { await flush(); return status(); }
    if (action === "submit") { if (!input || typeof input !== "object" || !("consent" in input) || input.consent !== true || !("report" in input)) throw new Error("Review and approve the report before submission."); return { reportId: await submit(parseDiagnosticReport(input.report)) }; }
    if (action === "attach") {
        if (!input || typeof input !== "object" || !("reportId" in input) || typeof input.reportId !== "string" || !/^KC-[A-F0-9]{16}$/.test(input.reportId) || !("kind" in input) || !["screenshot", "log"].includes(String(input.kind)) || !("base64" in input) || typeof input.base64 !== "string" || input.base64.length > 5600000 || !("consent" in input) || input.consent !== true) throw new Error("Review a supported screenshot or log attachment.");
        let bytes = Buffer.from(input.base64, "base64");
        if (input.kind === "log") {
            if (bytes.length > 131072) throw new Error("Choose a text log up to 128 KiB.");
            bytes = Buffer.from(redactDiagnosticString(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), "utf8");
        }
        const value = await cloudRequest(`/api/v1/reports/${input.reportId}/attachments?kind=${input.kind}`, undefined, bytes, uploadTokens.get(input.reportId)); return { attachmentId: String(value.id) };
    }
    throw new Error("Unsupported diagnostic action.");
}
ipcMain.handle(IpcEvents.KITTYCORD_DIAGNOSTICS, async (event, action: DiagnosticCommand, input: unknown) => {
    try {
        const address = new URL(event.sender.getURL()); if (event.senderFrame !== event.sender.mainFrame || !["https://discord.com", "https://ptb.discord.com", "https://canary.discord.com"].includes(address.origin)) return { error: "Open diagnostics from MaltCord settings." };
        if (action !== "nativeFile") return await diagnosticCommand(action, input);
        if (!input || typeof input !== "object" || !("reportId" in input) || typeof input.reportId !== "string" || !/^KC-[A-F0-9]{16}$/.test(input.reportId)) throw new Error("Submit a report before attaching a minidump.");
        const window = BrowserWindow.fromWebContents(event.sender); if (!window) throw new Error("The settings window closed.");
        const chosen = await dialog.showOpenDialog(window, { title: "Choose a native crash minidump", defaultPath: app.getPath("crashDumps"), properties: ["openFile"], filters: [{ name: "Minidumps", extensions: ["dmp"] }] }); if (chosen.canceled || !chosen.filePaths[0]) return { cancelled: true };
        const info = lstatSync(chosen.filePaths[0]); if (!info.isFile() || info.isSymbolicLink() || info.size > 16777216) throw new Error("Choose a minidump up to 16 MiB.");
        const confirmation = await dialog.showMessageBox(window, { type: "warning", title: "Send native crash artifact?", message: `${basename(chosen.filePaths[0])} (${(info.size / 1048576).toFixed(2)} MiB) can contain process memory, including private data. Binary minidumps cannot be reliably redacted. Only send it if you consent to the MaltCord team receiving it.`, buttons: ["Cancel", "Send this artifact"], defaultId: 0, cancelId: 0 }); if (confirmation.response !== 1) return { cancelled: true };
        const value = await cloudRequest(`/api/v1/reports/${input.reportId}/attachments?kind=dump`, undefined, readFileSync(chosen.filePaths[0]), uploadTokens.get(input.reportId)); return { attachmentId: String(value.id) };
    } catch { return { error: "The diagnostic action failed. Check the service connection, report receipt and file limits. Existing diagnostics were retained." }; }
});
function recordMain(error: Error, origin: string) { try { capture(technical(origin === "unhandledRejection" ? "promise" : "main", "Main process exception", error.stack ?? error.name)); } catch { storageError = "A diagnostic could not be saved. Existing files were retained."; } }
process.on("uncaughtExceptionMonitor", recordMain);
app.on("render-process-gone", (_event, _contents, details) => { if (["crashed", "oom", "abnormal-exit", "launch-failed", "integrity-failure"].includes(details.reason)) try { capture(technical("native", `Renderer process stopped: ${details.reason}`, `Exit code ${details.exitCode}`)); } catch { storageError = "A renderer diagnostic could not be saved."; } });
app.on("child-process-gone", (_event, details) => { if (details.reason === "crashed" || details.reason === "oom") try { capture(technical("native", `Electron child process stopped: ${details.reason}`, `Type ${details.type}, exit code ${details.exitCode}`)); } catch { storageError = "A child process diagnostic could not be saved."; } });
export function recordUpdateFailure(error?: unknown) { try { capture(technical("update", "Update verification or installation failed", error instanceof Error ? error.stack ?? error.name : "")); } catch { lastFailure = "The update diagnostic could not be queued."; } }
app.whenReady().then(() => { load(); nativeReporter(); const send = () => { void flush().then(() => { lastFailure = ""; }, () => { lastFailure = "Pending reports could not be uploaded. They remain available for local export."; }); }; const initial = setTimeout(send, 15000), timer = setInterval(send, 300000); app.once("before-quit", () => { clearInterval(timer); clearTimeout(initial); process.removeListener("uncaughtExceptionMonitor", recordMain); }); });
