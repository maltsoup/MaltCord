/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { loadPublicProfile } from "@api/KittycordGithub";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { OwnerCrownIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { type PublicGithubProfile } from "@shared/kittycord/githubPublic";
import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import { contentLabels, originLabels, packageContentType } from "@shared/kittycord/presentation";
import { React, useEffect, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { KittenMarkdown } from "./KittenMarkdown";
import { CompactNotice, KittenTabs, PluginGlyph, PublisherIdentity } from "./KittenUI";
import { PermissionDetails } from "./kittycordPackages/SecurityDetails";

const tabs = ["Overview", "README", "Permissions", "Versions", "Changelog", "Source"].map(label => ({ id: label.toLowerCase(), label }));
export function PluginDetails({ bundle, history = [], actions, authenticatedOwner = false }: { bundle: ExternalPackage; history?: readonly { version: string; notes: string; }[]; actions?: ReactNode; authenticatedOwner?: boolean; }) {
    const panelId = React.useId();
    const [tab, setTab] = useState("overview");
    const [profile, setProfile] = useState<PublicGithubProfile>(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
    const { manifest } = bundle; const { presentation } = manifest;
    const repository = presentation?.github?.repository ?? (new URL(manifest.provenance.source).hostname.endsWith(".invalid") ? undefined : manifest.provenance.source);
    const abort = React.useRef<AbortController | undefined>(undefined);
    useEffect(() => () => abort.current?.abort(), []);
    async function loadProfile() {
        if (!presentation?.github) return;
        abort.current?.abort(); const controller = new AbortController(); abort.current = controller; setLoading(true); setError("");
        try { const value = await loadPublicProfile(presentation.github.username, presentation.github.repository, controller.signal); if (!controller.signal.aborted) setProfile(value); }
        catch (problem) { if (!controller.signal.aborted) setError(problem instanceof Error ? problem.message : "Public GitHub profile unavailable."); }
        finally { if (!controller.signal.aborted) setLoading(false); }
    }
    return <div className="kc-tool-page kc-plugin-details">
        <header className="kc-plugin-detail-header"><PluginGlyph large icon={presentation?.icon} /><div className="kc-detail-copy"><span className="kc-eyebrow">{contentLabels[packageContentType(manifest)]}</span><Heading>{manifest.name} <span className="kc-package-version">v{manifest.version}</span></Heading><div className="kc-publisher"><span className="kc-avatar">{profile ? <img src={profile.avatar} alt="" referrerPolicy="no-referrer" onError={() => setProfile(undefined)} /> : manifest.author.slice(0, 1)}</span><span>{manifest.author}</span><span className={authenticatedOwner ? "kc-owner-badge" : "kc-neutral-identity"}>{authenticatedOwner && <OwnerCrownIcon width={14} height={14} />} {authenticatedOwner ? "KITTENCORD OWNER" : "KITTENCORD USER"}</span></div></div>{actions && <div className="kc-tools-actions">{actions}</div>}</header>
        <PublisherIdentity author={manifest.author} github={presentation?.github?.username} source="Kittencord Local" /><KittenTabs panelId={panelId} tabs={tabs} selected={tab} onSelect={setTab} label="Plugin details" />
        <div id={panelId} className="kc-detail-panel" key={tab} role="tabpanel" aria-label={tabs.find(item => item.id === tab)?.label}>
            {tab === "overview" && <><Paragraph>{manifest.description}</Paragraph><div className="kc-detail-facts"><div><span>Category</span><strong>{presentation?.category ?? contentLabels[packageContentType(manifest)]}</strong></div><div><span>Edition</span><strong>{presentation?.origin ? `${originLabels[presentation.origin.kind]} · declared` : "Imported package"}</strong></div><div><span>Compatibility</span><strong>API ≥ {manifest.minApiVersion}</strong></div><div><span>Platforms</span><strong>{manifest.platforms.join(", ")}</strong></div></div></>}
            {tab === "readme" && (presentation?.readme ? <KittenMarkdown source={presentation.readme} repository={presentation.github?.repository} /> : <Paragraph>No README was included in this package.</Paragraph>)}
            {tab === "permissions" && <PermissionDetails manifest={manifest} />}
            {tab === "versions" && <><Paragraph>Installed or selected version: {manifest.version}.</Paragraph>{history.length ? history.map(item => <div key={item.version} className="kc-permission-row"><strong>{item.version}</strong><span>Catalog release</span></div>) : <Paragraph>No remote version history is configured for this Local package. Review a newer package to update it.</Paragraph>}</>}
            {tab === "changelog" && (history.length ? history.map(item => <section key={item.version}><Heading>{item.version}</Heading><KittenMarkdown source={item.notes} /></section>) : <Paragraph>This package did not include release notes.</Paragraph>)}
            {tab === "source" && <><div className="kc-detail-facts"><div><span>Original author</span><strong>{presentation?.origin?.author ?? manifest.author}</strong></div><div><span>Original project</span><strong>{presentation?.origin?.project ?? "Not declared"}</strong></div></div>{repository ? <Link href={repository} target="_blank" rel="noreferrer noopener">Source repository ↗</Link> : <Paragraph>Local source. No public repository was declared.</Paragraph>}{presentation?.github && <div className="kc-tools-actions"><Link href={`https://github.com/${presentation.github.username}`} target="_blank" rel="noreferrer noopener">@{presentation.github.username} ↗</Link><Button size="small" variant="secondary" disabled={loading} onClick={() => void loadProfile()}>{loading ? "Loading…" : "Load public GitHub profile"}</Button></div>}{profile && <Paragraph>{profile.name} · {profile.description || "Public GitHub profile loaded. Association unverified."}</Paragraph>}{error && <CompactNotice tone="warning">{error}</CompactNotice>}<details className="kc-tool-details"><summary>Source & integrity</summary><div><pre className="kc-catalog-source">{bundle.artifact}</pre><Paragraph>SHA-256: {manifest.integrity.digest}</Paragraph></div></details></>}
        </div>
    </div>;
}
