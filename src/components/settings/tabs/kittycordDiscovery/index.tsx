/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordCatalog } from "@api/KittycordCatalog";
import { KittycordPackages } from "@api/KittycordPackages";
import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { SearchIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { openSettingsTabModal, SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Kittycord } from "@shared/kittycord";
import { packageCompatibility } from "@shared/kittycord/compatibility";
import { discoverPlugins, type DiscoveryItem } from "@shared/kittycord/discovery";
import { IS_MAC, IS_WINDOWS } from "@utils/constants";
import { React, TextInput, useState } from "@webpack/common";

import plugins from "~plugins";

import { FunctionalCatalog as KittycordMarketplaceTab } from "../kittycordMarketplace";
import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";

const reviewedMetadata = new Set(["MessageLatency", "CallTimer", "BetterFolders", "ShowMeYourName", "VoiceChatDoubleClick"]);

function Discovery() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ReturnType<typeof discoverPlugins>>([]);
    const [error, setError] = useState("");
    const [searched, setSearched] = useState(false);
    const [busy, setBusy] = useState(false);
    async function search() {
        setBusy(true); setError("");
        try {
            const items: DiscoveryItem[] = Object.values(plugins).filter(plugin => reviewedMetadata.has(plugin.name)).map(plugin => ({
                id: `builtin:${plugin.name}`, name: plugin.name, description: plugin.description, keywords: plugin.tags ?? [],
                installed: Settings.plugins[plugin.name]?.enabled === true, status: "Packaged build. Runtime compatibility is not certified."
            }));
            try {
                const { catalog } = await KittycordCatalog.load();
                const platform = IS_WEB ? "chrome" : IS_WINDOWS ? "windows" : IS_MAC ? "macos" : "linux";
                const installed = KittycordPackages.snapshot().entries.map(item => item.manifest);
                for (const entry of catalog.entries) {
                    const { manifest } = entry.bundle;
                    const report = packageCompatibility(entry.bundle, installed, platform, Kittycord.apiVersion, new Set(catalog.blockedDigests));
                    items.push({ id: `catalog:${manifest.id}`, name: manifest.name, description: manifest.description, keywords: [entry.category], installed: installed.some(item => item.id === manifest.id), status: report.classification, permissions: manifest.permissions, exclusiveCapabilities: manifest.exclusiveCapabilities });
                }
            } catch { setError("Signed catalog unavailable. Results below use only curated metadata from this packaged build."); }
            setResults(discoverPlugins(query, items)); setSearched(true);
        } catch (problem) { setError(problem instanceof Error ? problem.message : "Discovery failed."); }
        finally { setBusy(false); }
    }
    return <SettingsTab><div className="kc-tool-page">
        <KittyToolHeader Icon={SearchIcon} title="Kitty Smart Discovery" description="Describe a goal. Search local, trusted catalog metadata without sending it anywhere." />
        <TextInput aria-label="Plugin discovery request" placeholder="Voice controls, latency, folders or theme colors" value={query} onChange={setQuery} />
        <div className="kc-tools-actions"><Button disabled={busy || !query.trim()} onClick={() => void search()}>Find plugins</Button></div>
        {error && <Notice.Warning>{error}</Notice.Warning>}
        {searched && !results.length && <Paragraph>No matching reviewed catalog items. No plugin was invented or installed.</Paragraph>}
        {results.map(item => <Card className="kc-tools-card" key={item.id}>
            <Heading>{item.name}</Heading><Paragraph>{item.description}</Paragraph>
            <Paragraph>{item.installed ? "Existing enabled/installed functionality" : "Not enabled/installed"}. {item.status}</Paragraph>
            <Paragraph>Matched metadata: {item.matched.join(", ")}. Permissions: {item.permissions?.join(", ") ?? "Not declared by the inherited plugin format"}.</Paragraph>
            <div className="kc-tools-actions"><Button variant="secondary" onClick={() => {
                if (item.id.startsWith("builtin:")) { const plugin = plugins[item.id.slice(8)]; if (plugin) openPluginModal(plugin); }
                else openSettingsTabModal(KittycordMarketplaceTab);
            }}>View details before enabling</Button></div>
        </Card>)}
        <KittyToolDetails title="Recommendation limits"><Paragraph>This is local keyword/synonym matching over a curated subset of real packaged plugins and the signed catalog. It prefers existing functionality and omits duplicate identifiers and overlapping declared exclusive behaviors. Legacy plugins lack complete permission/conflict metadata, so combinations still need review. Nothing is installed automatically.</Paragraph></KittyToolDetails>
    </div></SettingsTab>;
}

export default wrapTab(Discovery, "Kitty Smart Discovery");
