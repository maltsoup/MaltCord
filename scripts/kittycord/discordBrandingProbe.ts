/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface BrandingHost {
    Components: { openSettingsTabModal(tab: unknown): void; VencordTab: unknown; ChangelogTab: unknown; KittycordMarketplaceTab: unknown; KittycordWorkshopTab: unknown; KittycordDoctorTab: unknown; KittycordPerformanceTab: unknown; KittycordProfilesTab: unknown; KittycordSafetyTab: unknown; KittycordPackagesTab: unknown; KittycordDiscoveryTab: unknown; };
    Webpack: { Common: { UserStore: { getCurrentUser(): unknown; }; closeAllModals(): void; }; };
}

const toolTabs = { workshop: "KittycordWorkshopTab", doctor: "KittycordDoctorTab", performance: "KittycordPerformanceTab", profiles: "KittycordProfilesTab", safety: "KittycordSafetyTab", packages: "KittycordPackagesTab", marketplace: "KittycordMarketplaceTab", discovery: "KittycordDiscoveryTab" } as const;

export async function marketplace(exportReport = false) {
    const layout = await showTool("marketplace");
    if (!layout.ready) return { marketplaceReady: false };
    Array.from(document.querySelectorAll<HTMLButtonElement>(".kc-tool-page button")).find(button => button.textContent === "Catalog")?.click();
    for (let attempt = 0; attempt < 50 && !document.querySelector(".kc-tool-page")?.textContent?.includes("Catalog signature verified"); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    const page = document.querySelector(".kc-tool-page");
    const buttons = Array.from(page?.querySelectorAll("button") ?? []);
    const entries = buttons.filter(button => button.textContent === "View compatibility & permissions");
    entries[0]?.click();
    await new Promise(resolve => setTimeout(resolve, 300));
    const report = document.querySelector('[aria-label="Kittycord compatibility report"]');
    const install = Array.from(page?.querySelectorAll("button") ?? []).find(button => button.textContent === "Review in Plugin Manager");
    if (exportReport) Array.from(page?.querySelectorAll("button") ?? []).find(button => button.textContent === "Export compatibility")?.click();
    return { marketplaceReady: true, marketplaceEntries: entries.length === 2,
        marketplaceCompatibility: report?.textContent?.includes("Compatibility: Unsupported") === true && report.textContent.includes("Permissions: styles"),
        marketplaceInstallDisabled: install?.disabled === true, marketplaceSignedLabel: page?.textContent?.includes("Catalog signature verified") === true };
}

export async function showTool(name: keyof typeof toolTabs) {
    const client = host();
    if (!client) return { ready: false, reason: "Client unavailable" };
    if (client.Webpack.Common.UserStore.getCurrentUser()) return { ready: false, reason: "Anonymous-session guard stopped the probe" };
    client.Webpack.Common.closeAllModals();
    await new Promise(resolve => setTimeout(resolve, 300));
    client.Components.openSettingsTabModal(client.Components[toolTabs[name]]);
    await new Promise(resolve => setTimeout(resolve, 800));
    for (let attempt = 0; attempt < 22 && !document.querySelector(".kc-tool-page"); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    const page = document.querySelector<HTMLElement>(".kc-tool-page");
    if (!page) return { ready: false, reason: document.body.textContent?.includes("Failed to render") ? "Tool render error boundary" : "Tool page did not appear within three seconds" };
    const content = page.cloneNode(true);
    if (!(content instanceof HTMLElement)) return { ready: false };
    content.querySelectorAll("details,textarea,input,pre").forEach(element => element.remove());
    const words = content.textContent?.trim().split(/\s+/).length ?? 0;
    const numeric = page.querySelector<HTMLInputElement>('input[aria-label="Numeric profile override"]');
    return { ready: true, icon: !!page.querySelector(".kc-tool-header svg"),
        ...(name === "doctor" ? { doctorUnified: ["Local & recovery", "Overview", "Client Diagnostics", "Impact analysis", "Plugin monitor", "Startup Timings", "Module finder", "Guide"].every(label => Array.from(page.querySelectorAll(".vc-health-nav button")).some(button => button.textContent?.trim() === label)), doctorNavigationReadable: Array.from(page.querySelectorAll<HTMLElement>(".vc-health-nav button")).every(button => getComputedStyle(button).whiteSpace === "nowrap" && button.scrollWidth <= button.clientWidth) } : { compact: words < 200 }),
        noOverflow: page.scrollWidth <= page.clientWidth,
        modalTitleClean: !Array.from(document.querySelectorAll('[role="dialog"] h2')).some(element => element.textContent?.includes("Settings Tab")),
        ...(name === "profiles" ? { profileValuePopulated: !!numeric?.value } : {}) };
}

function host(): BrandingHost | undefined {
    return (globalThis as { Vencord?: BrandingHost; }).Vencord;
}

export async function developerTools() {
    const layouts: Record<string, Awaited<ReturnType<typeof showTool>>> = {};
    for (const name of Object.keys(toolTabs) as (keyof typeof toolTabs)[]) layouts[name] = await showTool(name);
    return { developerToolLayouts: Object.values(layouts).every(layout => Object.values(layout).every(value => value === true)), layouts };
}

export async function run() {
    const client = host();
    if (!client) return { kittycordLoaded: false };
    if (client.Webpack.Common.UserStore.getCurrentUser()) return { kittycordLoaded: true, anonymousSession: false };
    client.Components.openSettingsTabModal(client.Components.VencordTab);
    for (let attempt = 0; attempt < 50 && !document.querySelector('[aria-label="Kittencord community"]'); attempt++)
        await new Promise(resolve => setTimeout(resolve, 200));
    const card = document.querySelector<HTMLElement>('[role="region"][aria-label="Kittencord community"]');
    if (!card) return { kittycordLoaded: true, anonymousSession: true, communityCard: false };
    card.scrollIntoView({ block: "center" });
    await new Promise(resolve => setTimeout(resolve, 300));
    const rectangle = card.getBoundingClientRect();
    const link = card.querySelector<HTMLAnchorElement>(".kc-community-join");
    const style = getComputedStyle(card);
    const buttons = Array.from(card.querySelectorAll("button"));
    return {
        kittycordLoaded: true,
        anonymousSession: true,
        communityCard: card.querySelector("h2")?.textContent === "Kittencord",
        communityLink: link?.href === "https://discord.gg/7bZ5qKdDR" && link.rel.includes("noopener") && link.rel.includes("noreferrer"),
        packagedImage: !!card.querySelector(".kc-community-avatar svg") && !card.querySelector("img"),
        styledCard: style.borderRadius === "18px" && style.getPropertyValue("--kc-accent").trim() === "#e7a5d2",
        styledButtons: !!link && getComputedStyle(link).backgroundColor !== "rgba(0, 0, 0, 0)" && buttons.every(button => getComputedStyle(button).boxSizing === "border-box" && button.getBoundingClientRect().height === link.getBoundingClientRect().height),
        controls: buttons.length === 2 && buttons.some(button => button.textContent === "Plugin Manager") && buttons.some(button => button.textContent === "Kitty Doctor"),
        upstreamCredits: card.querySelectorAll(".kc-community-credits a").length === 3,
        noHorizontalOverflow: card.scrollWidth <= card.clientWidth,
        cardRect: { x: Math.ceil(rectangle.x), y: Math.ceil(rectangle.y), width: Math.floor(rectangle.width), height: Math.floor(rectangle.height) }
    };
}

export async function navigate(exportPackage = false) {
    const card = document.querySelector('[aria-label="Kittencord community"]');
    const buttons = Array.from(card?.querySelectorAll("button") ?? []);
    buttons.find(button => button.textContent === "Plugin Manager")?.click();
    await new Promise(resolve => setTimeout(resolve, 1200));
    const pluginManagerNavigation = !!document.querySelector('input[placeholder="Search for a plugin..."]');
    Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Create plugin")?.click();
    await new Promise(resolve => setTimeout(resolve, 800));
    const workshopNavigation = !!document.querySelector('textarea[aria-label="Plugin JavaScript source"]') && !!document.querySelector('input[aria-label="Plugin identifier"]');
    let workshopExportPrepared = false;
    if (exportPackage && workshopNavigation) {
        Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Validate and export package")?.click();
        for (let attempt = 0; attempt < 30; attempt++) {
            workshopExportPrepared = Array.from(document.querySelectorAll("p")).some(element => element.textContent?.includes("Package prepared for download. SHA-256:"));
            if (workshopExportPrepared) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    buttons.find(button => button.textContent === "Kitty Doctor")?.click();
    await new Promise(resolve => setTimeout(resolve, 1200));
    const doctorNavigation = !!document.querySelector(".kc-doctor-overview");
    Array.from(document.querySelectorAll<HTMLButtonElement>(".vc-health-nav button")).find(button => button.textContent === "Local & recovery")?.click();
    await new Promise(resolve => setTimeout(resolve, 300));
    const scan = Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Scan installed packages");
    let doctorAuditScan = false;
    if (scan && !scan.disabled) {
        scan.click();
        for (let attempt = 0; attempt < 30; attempt++) {
            doctorAuditScan = !!document.querySelector('[aria-label="Kitty Doctor scan results"]');
            if (doctorAuditScan) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    host()?.Components.openSettingsTabModal(host()?.Components.ChangelogTab);
    await new Promise(resolve => setTimeout(resolve, 800));
    const localChangelog = Array.from(document.querySelectorAll(".vc-changelog-entry")).some(element => element.textContent?.includes("Kittencord 0.7.0 development"));
    return { pluginManagerNavigation, workshopNavigation, doctorNavigation, localChangelog, ...(scan && !scan.disabled ? { doctorAuditScan } : {}), ...(exportPackage ? { workshopExportPrepared } : {}) };
}
