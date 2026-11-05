/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { validFeatureId } from "@shared/kittycord/knowledge";

export function initializeKittycordHelp() {
    async function receive(event: MessageEvent) {
        if (event.source !== window || event.origin !== location.origin || typeof event.data !== "string" || event.data.length > 256) return;
        let value: unknown; try { value = JSON.parse(event.data); } catch { return; }
        if (!value || typeof value !== "object" || !("type" in value) || value.type !== "kittycord:help:navigate" || !("feature" in value) || !validFeatureId(value.feature)) return;
        const { feature } = value;
        const components = await import("@components/settings");
        if (feature === "voice") {
            const { default: plugins } = await import("~plugins");
            if (!plugins.KittyVoiceLab) throw new Error("Voice Lab is not available in this build.");
            components.openPluginModal(plugins.KittyVoiceLab); return;
        }
        const tabs = { plugins: components.PluginsTab, packages: components.KittycordPackagesTab, doctor: components.KittycordDoctorTab, marketplace: components.KittycordMarketplaceTab,
            performance: components.KittycordPerformanceTab, profiles: components.KittycordProfilesTab, studio: components.KittycordWorkshopTab,
            discovery: components.KittycordDiscoveryTab, security: components.KittycordSafetyTab, updates: components.KittycordUpdatesTab };
        components.openSettingsTabModal(tabs[feature]);
    }
    const listener = (event: MessageEvent) => { void receive(event).catch(() => console.error("Kittycord could not open the requested feature. Open it from settings.")); };
    window.addEventListener("message", listener);
    window.addEventListener("pagehide", () => window.removeEventListener("message", listener), { once: true });
}
