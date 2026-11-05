/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readStudioTransport } from "@shared/kittycord/browser";

function openPackagedTool(assistant: boolean): Promise<void> {
    if (!IS_WEB && !assistant && typeof VencordNative !== "undefined" && VencordNative.studio) return VencordNative.studio.open();
    if (!IS_EXTENSION) return Promise.reject(new Error("The packaged editor currently requires the browser extension. Use compileStudio.ts on desktop hosts."));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
        function finish(error?: Error) { clearTimeout(timer); window.removeEventListener("message", receive); if (error) reject(error); else resolve(); }
        function receive(event: MessageEvent) {
            if (event.source !== window || event.origin !== location.origin) return;
            let data: ReturnType<typeof readStudioTransport>;
            try { data = readStudioTransport(event.data); } catch { return; }
            if (data?.type !== "kittycord:studio:result" || data.requestId !== requestId) return;
            if (data.ok === true) finish();
            else if (data.ok === false) finish(new Error("The browser could not open Studio. Use the Kittycord button with a fresh user gesture."));
        }
        const timer = setTimeout(() => finish(new Error("The packaged Studio did not respond. Existing projects were preserved.")), 8000);
        window.addEventListener("message", receive);
        window.postMessage(JSON.stringify({ type: assistant ? "kittycord:studio:assistant" : "kittycord:studio:open", requestId }), location.origin);
    });
}

export function openPackagedStudio() { return openPackagedTool(false); }
export function openPackagedAssistant() { return openPackagedTool(true); }
