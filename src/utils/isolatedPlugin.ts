/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type DesktopPluginBridge, isDesktopPlugin } from "@shared/kittycord/desktopPlugin";
import { isolatedFrameHtml } from "@shared/kittycord/isolatedFrame";
import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import { checkedObject } from "@shared/kittycord/manifest";
import type { RuntimeDefinition } from "@shared/kittycord/runtime";
import { parseThemeArtifact } from "@shared/kittycord/themePackage";
import type { UtilityBridge } from "@shared/kittycord/utility";

export function defineIsolatedJavascript(bundle: ExternalPackage, document: Document, onFailure: () => void, bridge?: { open(token: string): Promise<void>; close(token: string): Promise<void>; }, utility?: UtilityBridge, desktop?: DesktopPluginBridge): RuntimeDefinition {
    let state: unknown;
    return { manifest: bundle.manifest, captureState: () => structuredClone(state), async start({ resources, previousState }) {
        if (IS_WEB) throw new Error("External JavaScript is unavailable in browser extension builds.");
        state = structuredClone(previousState);
        const frame = document.createElement("iframe");
        frame.hidden = true;
        frame.setAttribute("sandbox", "allow-scripts");
        frame.setAttribute("referrerpolicy", "no-referrer");
        const nonce = crypto.randomUUID().replaceAll("-", "");
        frame.srcdoc = isolatedFrameHtml(nonce);
        const style = document.createElement("style");
        style.dataset.kittycordPlugin = bundle.manifest.id;
        const channel = new MessageChannel();
        let port = channel.port1;
        const token = crypto.randomUUID();
        let settled = false;
        let failed = false;
        let windowStart = Date.now();
        let count = 0;
        let rejectStart: (error: Error) => void = () => {};
        let surface: Awaited<ReturnType<UtilityBridge["attach"]>> | undefined;
        function fault(reason = "protocol") {
            if (failed) return;
            failed = true;
            if (host) void Promise.resolve(host.dispose()).catch(() => {});
            surface?.dispose();
            frame.remove(); style.remove(); port.close(); channel.port1.close(); channel.port2.close();
            if (!settled) rejectStart(new Error(`Isolated JavaScript startup failed (${reason}). The package was not activated; host security was preserved.`));
            else onFailure();
        }
        const desktopPlugin = isDesktopPlugin(bundle.manifest);
        let host: ReturnType<DesktopPluginBridge["attach"]> | undefined;
        const timer = setTimeout(() => fault("timeout or host policy"), desktopPlugin ? 20000 : bridge ? 8000 : 3000);
        resources.own(async () => {
            failed = true;
            try { await host?.dispose(); }
            finally {
                surface?.dispose();
                if (!settled) rejectStart(new Error("Isolated JavaScript startup was cancelled."));
                clearTimeout(timer); window.removeEventListener("message", onNativePort); port.close(); channel.port1.close(); channel.port2.close(); frame.remove(); style.remove();
                if (bridge) await bridge.close(token);
            }
        });
        let connect: (connected: MessagePort) => void = () => {};
        function onNativePort(event: MessageEvent) {
            if (event.source !== window || event.origin !== location.origin || event.data?.type !== "kittycord:sandbox" || event.data.token !== token || failed) return;
            if (event.data.closed) { fault("native context closed"); return; }
            if (event.ports.length === 1) connect(event.ports[0]);
        }
        if (desktopPlugin) {
            if (!desktop) throw new Error("Update this desktop host to use Discord plugin capabilities.");
            host = desktop.attach(bundle.manifest, message => { if (!failed) port.postMessage(message); });
        }
        if (desktopPlugin || bundle.manifest.capabilities.includes("kittycord.utility-js.v1")) {
            if (!utility) throw new Error("This host does not support local utility plugins. Update Kittycord.");
            surface = await utility.attach(bundle.manifest.id, message => { if (!failed) port.postMessage(message); });
            if (failed) { surface.dispose(); throw new Error("Utility startup was cancelled while loading local preferences."); }
        }
        await new Promise<void>((resolve, reject) => {
            rejectStart = reject;
            connect = connected => {
                port = connected;
                port.onmessage = event => {
                if (failed) return;
                if (Date.now() - windowStart >= 1000) { windowStart = Date.now(); count = 0; }
                if (++count > 100) { fault(); return; }
                try {
                    const message = checkedObject(event.data, ["type", "colors", "state", "panel", "id", "method", "input", "error"], "Worker response");
                    if (message.type === "host-request" && host && Number.isSafeInteger(message.id) && Number(message.id) > 0 && typeof message.method === "string") {
                        const { id } = message;
                        void host.request(message.method, message.input).then(result => { if (!failed) port.postMessage({ type: "host-result", id, result }); }, error => { if (!failed) port.postMessage({ type: "host-result", id, error: error instanceof Error ? error.message : "The plugin request failed." }); });
                        return;
                    }
                    if (message.type === "failed") { fault(typeof message.error === "string" ? message.error.slice(0, 240) : "worker startup or callback"); return; }
                    if (message.type === "ready" && !settled) { settled = true; clearTimeout(timer); resolve(); }
                    else if (message.type === "colors") {
                        if (surface) throw new Error("Utility plugins have no style permission.");
                        const colors = parseThemeArtifact(JSON.stringify({ schemaVersion: 1, kind: "theme-tokens", colors: message.colors }));
                        if (Object.keys(colors).some(token => !bundle.manifest.exclusiveCapabilities.includes(`theme.${token.slice(2)}`))) throw new Error("Undeclared theme token.");
                        style.textContent = `.theme-dark,.theme-light{${Object.entries(colors).map(([token, color]) => `${token}:${color}!important;`).join("")}}`;
                    } else if (message.type === "panel" && surface) surface.publish(message.panel);
                    else if (message.type === "state") {
                        const serialized = JSON.stringify(message.state);
                        if (typeof serialized !== "string" || new TextEncoder().encode(serialized).byteLength > 4096) throw new Error("State exceeds limits.");
                        state = JSON.parse(serialized);
                    } else throw new Error("Unsupported worker response.");
                } catch { fault(); }
                };
                port.onmessageerror = () => fault("message decoding");
                port.start();
                port.postMessage({ type: "start", source: bundle.artifact, state: previousState, settings: surface?.settings ?? {} });
            };
            frame.addEventListener("load", () => {
                if (!failed) frame.contentWindow?.postMessage({ type: "connect" }, "*", [channel.port2]);
            }, { once: true });
            document.head.appendChild(style);
            if (bridge) {
                window.addEventListener("message", onNativePort);
                void bridge.open(token).catch(problem => fault(problem instanceof Error ? `native context unavailable: ${problem.message.slice(0, 240)}` : "native context unavailable"));
            } else {
                connect(channel.port1);
                document.body.appendChild(frame);
            }
        });
    } };
}
