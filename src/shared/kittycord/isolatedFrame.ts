/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

function frameBootstrap(bootstrap: string) {
    window.addEventListener("message", event => {
        if (event.source !== parent || event.data?.type !== "connect" || event.ports.length !== 1) return;
        const port = event.ports[0];
        let worker: Worker | undefined;
        let count = 0;
        let since = Date.now();
        port.onmessage = event => {
            const message: unknown = event.data;
            if (!message || typeof message !== "object" || !("type" in message)) return;
            if (message.type === "shutdown") { worker?.terminate(); port.close(); return; }
            if (worker && message.type === "host-result") { worker.postMessage(message); return; }
            if (worker && message.type === "action" && "id" in message && typeof message.id === "string" && message.id.length <= 100) { worker.postMessage({ type: "action", id: message.id }); return; }
            if (worker && message.type === "settings" && "settings" in message) { worker.postMessage({ type: "settings", settings: message.settings }); return; }
            if (message.type !== "start" || worker || !("source" in message) || typeof message.source !== "string" || !("state" in message)) return;
            const url = URL.createObjectURL(new Blob([bootstrap], { type: "text/javascript" }));
            const source = URL.createObjectURL(new Blob([message.source], { type: "text/javascript" }));
            let authorization: string | undefined;
            try {
                worker = new Worker(url);
                worker.onmessage = event => {
                    if (Date.now() - since >= 1000) { since = Date.now(); count = 0; }
                    try {
                        const data = JSON.stringify(event.data);
                        if (++count > 100 || typeof data !== "string" || data.length > 8192) throw new Error("Worker response exceeds limits.");
                        const response: unknown = event.data;
                        if (!response || typeof response !== "object" || !("nonce" in response) || typeof response.nonce !== "string" || !("type" in response)) throw new Error("Unauthenticated worker response.");
                        if (response.type === "boot" && !authorization) { authorization = response.nonce; return; }
                        if (!authorization || response.nonce !== authorization) throw new Error("Unauthenticated worker response.");
                        const payload = { ...response };
                        delete payload.nonce;
                        port.postMessage(payload);
                        if (response.type === "ready" || response.type === "failed") URL.revokeObjectURL(source);
                    } catch { worker?.terminate(); port.postMessage({ type: "failed" }); }
                };
                worker.onerror = event => { event.preventDefault(); port.postMessage({ type: "failed" }); };
                worker.onmessageerror = () => port.postMessage({ type: "failed" });
                worker.postMessage({ source, state: message.state, settings: "settings" in message ? message.settings : {} });
            } catch { port.postMessage({ type: "failed" }); }
            finally { URL.revokeObjectURL(url); }
        };
        port.start();
    }, { once: true });
}

function workerBootstrap() {
    const scope = self as typeof self & { importScripts(url: string): void; kittycordPlugin?: { start(api: object, previous: unknown): unknown; }; process?: unknown; require?: unknown; close(): void; };
    const send = scope.postMessage.bind(scope);
    const load = scope.importScripts.bind(scope);
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, "0")).join("");
    if (typeof scope.process !== "undefined" || typeof scope.require !== "undefined") { send({ type: "failed" }); scope.close(); return; }
    send({ type: "boot", nonce });
    scope.addEventListener("unhandledrejection", () => send({ type: "failed", nonce }));
    let started = false;
    let settings: object = {};
    let action: ((id: string) => unknown) | undefined;
    let changed: ((values: object) => unknown) | undefined;
    let requestId = 0;
    const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; }>();
    function request(method: string, input: unknown): Promise<unknown> {
        if (pending.size >= 16) return Promise.reject(new Error("Too many plugin requests are pending."));
        const id = ++requestId;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(id); reject(new Error("The plugin request timed out.")); }, 12000);
            pending.set(id, { resolve, reject, timer }); send({ type: "host-request", id, method, input, nonce });
        });
    }
    scope.onmessage = async event => {
        try {
            const { data } = event;
            if (data.type === "host-result") {
                const entry = pending.get(data.id); if (!entry) return;
                pending.delete(data.id); clearTimeout(entry.timer);
                if (typeof data.error === "string") entry.reject(new Error(data.error)); else entry.resolve(data.result);
                return;
            }
            if (!started) {
                started = true; settings = Object.freeze(data.settings ?? {}); load(data.source);
                const plugin = scope.kittycordPlugin;
                if (!plugin || typeof plugin.start !== "function") throw new Error("Missing start");
                await plugin.start(Object.freeze({
                    get settings() { return settings; },
                    setColors: (colors: unknown) => send({ type: "colors", colors, nonce }),
                    checkpoint: (state: unknown) => send({ type: "state", state, nonce }),
                    publishPanel: (panel: unknown) => send({ type: "panel", panel, nonce }),
                    readDiscord: (resource: string, options: object = {}) => request("discord", { resource, ...options }),
                    addButton: (button: unknown) => request("button", button),
                    addStyle: (css: string) => request("styles", { css }),
                    fetch: (url: string) => request("network", { url }),
                    loadScript: async (url: string, digest: string) => {
                        if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Pin the script's SHA-256 digest.");
                        const result = await request("script", { url }) as { text: string; sha256: string; };
                        const bytes = new TextEncoder().encode(result.text);
                        if (bytes.byteLength > 65536) throw new Error("External scripts are limited to 64 KiB.");
                        const actual = result.sha256;
                        if (actual !== digest) throw new Error("External script integrity does not match its pinned digest.");
                        const blob = URL.createObjectURL(new Blob([result.text], { type: "text/javascript" }));
                        try { load(blob); } finally { URL.revokeObjectURL(blob); }
                    },
                    onAction: (listener: typeof action) => { if (typeof listener !== "function") throw new Error("Action listener must be a function"); action = listener; },
                    onSettings: (listener: typeof changed) => { if (typeof listener !== "function") throw new Error("Settings listener must be a function"); changed = listener; }
                }), data.state);
                send({ type: "ready", nonce });
            } else if (data.type === "action") await action?.(data.id);
            else if (data.type === "settings") { settings = Object.freeze(data.settings); await changed?.(settings); }
        } catch (error) { send({ type: "failed", nonce, error: error instanceof Error ? error.message.slice(0, 240) : "Worker callback failed." }); }
    };
}

export function isolatedFrameHtml(nonce: string) {
    if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error("Invalid isolated frame nonce.");
    const policy = "default-src 'none'; script-src 'nonce-" + nonce + "' blob:; worker-src blob:; connect-src 'none'; base-uri 'none'; form-action 'none';";
    const bootstrap = `"use strict";(${workerBootstrap.toString()})();`;
    return '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + policy + '"><script nonce="' + nonce + '">(' + frameBootstrap.toString() + ")(" + JSON.stringify(bootstrap) + ");</script>";
}
