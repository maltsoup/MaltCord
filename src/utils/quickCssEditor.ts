/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { extensionBaseUrl, QUICK_CSS_CHANNEL, quickCssMessage, readQuickCssTransport } from "@shared/kittycord/browser";

let closePrevious: (() => void) | undefined;

export function openQuickCssEditor(options: { baseUrl: string; getCss(): Promise<string>; setCss(css: string): Promise<void>; getTheme(): "vs-dark" | "vs-light"; subscribe(listener: (css: string) => void): () => void; onError(message: string): void; }) {
    extensionBaseUrl(options.baseUrl);
    const token = crypto.randomUUID();
    closePrevious?.();
    let disposed = false;
    let revision = -1;
    let tail = Promise.resolve();
    let writing = false;
    let connected = false;
    function send(message: object) {
        if (disposed) return;
        let payload: Record<string, unknown> = { channel: QUICK_CSS_CHANNEL, token, direction: "to-editor", ...message };
        try { quickCssMessage(payload, token); }
        catch { payload = { channel: QUICK_CSS_CHANNEL, token, direction: "to-editor", action: "error", message: "QuickCSS exceeds supported editor limits. Existing settings were preserved; export or reduce the CSS before editing." }; }
        window.postMessage(JSON.stringify(payload), location.origin);
    }
    const unsubscribe = options.subscribe(css => { if (!writing) send({ action: "update", css, theme: options.getTheme() }); });
    function dispose() {
        if (disposed) return;
        send({ action: "closed" });
        disposed = true;
        clearTimeout(connectionTimer);
        window.removeEventListener("message", onMessage);
        window.removeEventListener("pagehide", dispose);
        unsubscribe();
        if (closePrevious === dispose) closePrevious = undefined;
    }
    function onMessage(event: MessageEvent) {
        if (event.source !== window || event.origin !== location.origin || disposed) return;
        let data: ReturnType<typeof readQuickCssTransport>;
        try { data = readQuickCssTransport(event.data); } catch { return; }
        if (data.direction !== "to-host") return;
        let message: ReturnType<typeof quickCssMessage>;
        try { message = quickCssMessage(data, token); } catch { return; }
        if (message.action === "closed") { dispose(); return; }
        if (message.action === "error") { dispose(); options.onError(message.message); return; }
        if (message.action === "ready" && connected) return;
        if (message.action === "ready" || (message.action === "reload" && connected)) {
            connected = true;
            clearTimeout(connectionTimer);
            void options.getCss().then(css => send({ action: "init", css, theme: options.getTheme() }), () => send({ action: "error", message: "QuickCSS could not be loaded. Existing settings were preserved." }));
        } else if (message.action === "save" && connected && message.revision > revision) {
            revision = message.revision;
            const { css, revision: savedRevision } = message;
            tail = tail.then(async () => {
                try { writing = true; await options.setCss(css); send({ action: "saved", revision: savedRevision }); }
                catch { send({ action: "error", message: "QuickCSS could not be saved. Keep this editor open and retry." }); }
                finally { writing = false; }
            });
        }
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", dispose, { once: true });
    closePrevious = dispose;
    const connectionTimer = setTimeout(() => { dispose(); options.onError("The packaged QuickCSS editor could not connect. Existing QuickCSS was preserved. Close the editor and retry."); }, 10_000);
    send({ action: "open" });
    return { dispose };
}
