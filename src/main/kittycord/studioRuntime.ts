/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { IpcEvents } from "@shared/IpcEvents";
import { Kittycord } from "@shared/kittycord";
import { isDesktopPlugin, previewDesktopRequest } from "@shared/kittycord/desktopPlugin";
import { isolatedFrameHtml } from "@shared/kittycord/isolatedFrame";
import { verifyExternalPackage } from "@shared/kittycord/javascriptPackage";
import { checkedObject } from "@shared/kittycord/manifest";
import { reviewPluginManifest } from "@shared/kittycord/safeInstall";
import { readStudioCommand, type StudioPreviewSnapshot } from "@shared/kittycord/studioPreview";
import { parseThemeArtifact } from "@shared/kittycord/themePackage";
import { parseUtilityPanel, utilitySettings } from "@shared/kittycord/utility";
import { BrowserWindow, ipcMain, MessageChannelMain, type MessagePortMain, session } from "electron";

export function createStudioPreview() {
    let window: BrowserWindow | undefined;
    let port: MessagePortMain | undefined;
    let busy = false;
    let snapshot: StudioPreviewSnapshot = { running: false, settings: {}, colors: {}, events: [] };
    function record(event: string) { snapshot.events = [...snapshot.events.slice(-19), event]; }
    function stop() { snapshot.running = false; port?.close(); port = undefined; const previous = window; window = undefined; if (previous && !previous.isDestroyed()) previous.destroy(); }
    return { stop, async command(input: unknown) {
        const data = readStudioCommand(input);
        if (data.action === "snapshot") return structuredClone(snapshot);
        if (busy) throw new Error("Wait for the current preview operation.");
        if (data.action === "stop") { stop(); record("Preview stopped and worker released."); return structuredClone(snapshot); }
        if (data.action === "action") {
            if (!snapshot.running || !snapshot.panel?.actions.some(action => action.id === data.id)) throw new Error("Action is not declared by the running preview.");
            port?.postMessage({ type: "action", id: data.id }); record(`Action: ${data.id}.`); return structuredClone(snapshot);
        }
        if (data.action === "settings") {
            if (!snapshot.running || !snapshot.panel) throw new Error("Start a utility preview first.");
            snapshot.settings = utilitySettings(snapshot.panel, data.settings); port?.postMessage({ type: "settings", settings: snapshot.settings }); record("Preview settings applied in memory."); return structuredClone(snapshot);
        }
        busy = true;
        try {
            const bundle = await verifyExternalPackage(data.bundle);
            const review = reviewPluginManifest(bundle.manifest, [], process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux", Kittycord.apiVersion);
            if (review.reasons.length) throw new Error("Preview package has incompatible platform, dependencies or permissions.");
            stop(); snapshot = { running: false, settings: {}, colors: {}, events: [] };
            if (bundle.manifest.entrypoints.desktop === "theme.json") { snapshot.colors = parseThemeArtifact(bundle.artifact); snapshot.running = true; record("Declarative preview loaded locally."); return structuredClone(snapshot); }
            const isolated = session.fromPartition(`kittycord-studio-runtime-${randomUUID()}`);
            isolated.setPermissionRequestHandler((_owner, _permission, callback) => callback(false)); isolated.setPermissionCheckHandler(() => false);
            isolated.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (request, callback) => callback({ cancel: !request.url.startsWith("data:") && !request.url.startsWith("blob:") }));
            const candidate = new BrowserWindow({ show: false, webPreferences: { session: isolated, preload: join(__dirname, "isolated-preload.js"), sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webSecurity: true, backgroundThrottling: false } });
            window = candidate; candidate.setTitle("Kittycord Studio isolated preview"); candidate.webContents.setWindowOpenHandler(() => ({ action: "deny" })); candidate.webContents.on("will-navigate", event => event.preventDefault());
            candidate.webContents.once("render-process-gone", () => { if (window === candidate) { snapshot.error = "Preview renderer stopped unexpectedly."; stop(); } });
            const channel = new MessageChannelMain(); port = channel.port1;
            let rejectStartup: (error: Error) => void = () => {};
            const timer = setTimeout(() => { snapshot.error = "Preview exceeded its startup deadline."; stop(); rejectStartup(new Error(snapshot.error)); }, 7000);
            const ready = new Promise<void>((resolve, reject) => {
                rejectStartup = reject;
                let messages = 0; let since = Date.now();
                channel.port1.on("message", event => {
                    if (window !== candidate) return;
                    try {
                        if (Date.now() - since > 1000) { messages = 0; since = Date.now(); }
                        if (++messages > 100 || JSON.stringify(event.data).length > 8192) throw new Error("Preview protocol exceeded limits.");
                        const value = checkedObject(event.data, ["type", "panel", "colors", "state", "id", "method", "input", "error"], "Preview response");
                        if (value.type === "host-request" && isDesktopPlugin(bundle.manifest)) {
                            try {
                                const result = previewDesktopRequest(value.method, value.input);
                                record("Desktop preview uses simulated channel data; interface changes remain in the preview.");
                                channel.port1.postMessage({ type: "host-result", id: value.id, result });
                            } catch (error) { channel.port1.postMessage({ type: "host-result", id: value.id, error: error instanceof Error ? error.message : "Preview request failed." }); }
                        } else if (value.type === "ready") { snapshot.running = true; record("Isolated startup passed."); resolve(); }
                        else if (value.type === "panel" && (isDesktopPlugin(bundle.manifest) || bundle.manifest.capabilities.includes("kittycord.utility-js.v1"))) {
                            snapshot.panel = parseUtilityPanel(value.panel); const values = utilitySettings(snapshot.panel, snapshot.settings);
                            if (JSON.stringify(values) !== JSON.stringify(snapshot.settings)) { snapshot.settings = values; channel.port1.postMessage({ type: "settings", settings: values }); }
                        } else if (value.type === "colors" && bundle.manifest.permissions.includes("styles")) {
                            const colors = parseThemeArtifact(JSON.stringify({ schemaVersion: 1, kind: "theme-tokens", colors: value.colors }));
                            if (Object.keys(colors).some(token => !bundle.manifest.exclusiveCapabilities.includes(`theme.${token.slice(2)}`))) throw new Error("Undeclared preview token.");
                            snapshot.colors = colors;
                        } else if (value.type === "state" && JSON.stringify(value.state).length <= 4096) record("State checkpoint validated.");
                        else throw new Error("Preview failed or sent an unsupported response.");
                    } catch { snapshot.error = "Preview startup, callback or protocol failed. Worker terminated."; stop(); reject(new Error(snapshot.error)); }
                }); channel.port1.start();
            });
            let attest: (event: Electron.IpcMainEvent, value: unknown) => void = () => {};
            const prepared = new Promise<void>((resolve, reject) => {
                attest = (event, value) => {
                    if (event.sender !== candidate.webContents || event.senderFrame !== event.sender.mainFrame) return;
                    if (value && typeof value === "object" && Reflect.get(value, "sandboxed") === true && Reflect.get(value, "contextIsolated") === true) resolve();
                    else reject(new Error("Preview security attestation failed."));
                }; ipcMain.on(IpcEvents.KITTYCORD_SANDBOX_READY, attest);
            });
            try {
                const load = Promise.all([prepared, candidate.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(isolatedFrameHtml(randomUUID().replaceAll("-", "")))}`)]).then(() => {
                    if (window !== candidate) throw new Error("Preview was closed.");
                    candidate.webContents.postMessage(IpcEvents.KITTYCORD_SANDBOX_PORT, randomUUID(), [channel.port2]); channel.port1.postMessage({ type: "start", source: bundle.artifact, state: undefined, settings: {} });
                });
                await Promise.all([load, ready]);
            } finally { clearTimeout(timer); ipcMain.removeListener(IpcEvents.KITTYCORD_SANDBOX_READY, attest); }
            return structuredClone(snapshot);
        } catch (problem) { stop(); throw problem; } finally { busy = false; }
    } };
}
