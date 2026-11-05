/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { KittycordCatalog } from "@api/KittycordCatalog";
import { Kittycord } from "@shared/kittycord";
import { packageCompatibility } from "@shared/kittycord/compatibility";
import { openQuickCssEditor } from "@utils/quickCssEditor";
import { openPackagedAssistant, openPackagedStudio } from "@utils/studioEditor";
import { EXTENSION_BASE_URL, EXTENSION_VERSION, metaReady } from "@utils/web-metadata";

const store = DataStore.createStore("KittycordExtensionFixture", "preferences");
const listeners = new Set<(css: string) => void>();
const fixture = {
    ready: false, version: "", errors: [] as string[], editor: undefined as ReturnType<typeof openQuickCssEditor> | undefined,
    openStudio: openPackagedStudio,
    openAssistant: openPackagedAssistant,
    lastNavigation: "",
    async catalog() {
        const result = await KittycordCatalog.load();
        const entry = result.catalog.entries[0];
        const report = packageCompatibility(entry.bundle, [], "chrome", Kittycord.apiVersion);
        return { signatureVerified: result.signatureVerified && result.catalog.entries.length === 2,
            browserAdmissionRestricted: report.classification === "Unsupported" && report.canActivate === false };
    },
    read: () => DataStore.get<string>("css", store).then(css => css ?? "body { color: red; }"),
    open() {
        this.editor = openQuickCssEditor({ baseUrl: EXTENSION_BASE_URL, getCss: this.read, getTheme: () => "vs-dark",
            async setCss(css) { await DataStore.set("css", css, store); for (const listener of listeners) listener(css); },
            subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; }, onError: message => this.errors.push(message) });
    },
    listeners: () => listeners.size
};
declare global { interface Window { KittycordBrowserSmoke: typeof fixture; } }
window.KittycordBrowserSmoke = fixture;
void metaReady.then(() => { fixture.ready = true; fixture.version = EXTENSION_VERSION; });
document.addEventListener("DOMContentLoaded", () => document.getElementById("open-editor")?.addEventListener("click", () => fixture.open()), { once: true });
document.addEventListener("DOMContentLoaded", () => document.getElementById("open-studio")?.addEventListener("click", () => { void fixture.openStudio().catch(() => fixture.errors.push("Studio open failed.")); }), { once: true });
document.addEventListener("DOMContentLoaded", () => document.getElementById("open-assistant")?.addEventListener("click", () => { void fixture.openAssistant().catch(() => fixture.errors.push("Assistant open failed.")); }), { once: true });
window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || typeof event.data !== "string" || event.data.length > 256) return;
    try { const message = JSON.parse(event.data); if (message.type === "kittycord:help:navigate" && typeof message.feature === "string") fixture.lastNavigation = message.feature; } catch {}
});
