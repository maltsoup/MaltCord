/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { DESKTOP_PERMISSIONS, isDesktopPlugin } from "@shared/kittycord/desktopPlugin";
import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import type { PluginManifest } from "@shared/kittycord/manifest";
import { packageChanges, permissionDescriptions, type SecurityReport } from "@shared/kittycord/security";
import { React } from "@webpack/common";
import { diffLines } from "diff";

import { KittyToolDetails } from "../KittyToolLayout";

export function PermissionDetails({ manifest, previous, active }: { manifest: PluginManifest; previous?: PluginManifest; active?: boolean; }) {
    const changes = packageChanges(previous, manifest);
    return <div className="kc-permissions"><Heading>Permission center</Heading>{manifest.permissions.map(permission => {
        const info = permissionDescriptions[permission];
        const supported = isDesktopPlugin(manifest) ? DESKTOP_PERMISSIONS.includes(permission) : ["settings", "events", "styles"].includes(permission);
        return <div className="kc-permission-row" key={permission}><div><strong>{info.label}</strong><Paragraph>{info.description}</Paragraph><Paragraph>{!supported ? "Unsupported, never granted." : active === undefined ? "Requested. No access is granted by this review." : active ? "Granted to this running package." : "Inactive. Disable/stop revokes its runtime access."}</Paragraph></div><span className="kc-status" data-status={supported ? "review" : "blocked"}>{info.risk}{active === undefined && changes.permissionsAdded.includes(permission) ? " · New" : ""}</span></div>;
    })}{manifest.networkOrigins?.length ? <Paragraph>Allowed resource origins: {manifest.networkOrigins.join(", ")}.</Paragraph> : null}<Paragraph>Access starts when you enable the plugin. Disabling it removes its worker, buttons, styling and pending downloads.</Paragraph></div>;
}

export function SecurityDetails({ report }: { report?: SecurityReport; }) {
    if (!report) return <Paragraph>Source checks run when you review a JavaScript package.</Paragraph>;
    const status = report.status === "Blocked" ? "Changes required" : report.status === "Needs Review" ? "Review notes" : "Checks passed";
    return <div className="kc-security-result"><Heading>{status}</Heading>{report.indicators.map((item, index) => <Paragraph key={`${item.code}-${item.line}-${index}`}><strong>Line {item.line}</strong> · {item.message}</Paragraph>)}{report.status === "Blocked" && <Paragraph>Edit the affected source and review it again. Your project is kept.</Paragraph>}<KittyToolDetails title="Scan details"><Paragraph>{report.engine} · {new Date(report.analyzedAt).toLocaleString()} · Policy {report.policyVersion}</Paragraph><Paragraph>{report.limitations}</Paragraph>{report.indicators.map((item, index) => <Paragraph key={`${item.code}-${index}`}>{item.code} · {item.severity}</Paragraph>)}</KittyToolDetails></div>;
}

export function SourceChanges({ previous, next }: { previous?: ExternalPackage; next: ExternalPackage; }) {
    const changes = packageChanges(previous?.manifest, next.manifest);
    const parts = diffLines(previous?.artifact ?? "", next.artifact);
    return <KittyToolDetails title="Changed files & source comparison">
        <Paragraph>Files: {changes.files.join(", ")}. Added permissions: {changes.permissionsAdded.join(", ") || "None"}. Removed permissions: {changes.permissionsRemoved.join(", ") || "None"}. Dependencies changed: {changes.dependenciesChanged ? "Yes" : "No"}.</Paragraph>
        <pre className="kc-source-diff">{parts.map((part, index) => <span key={index} className={part.added ? "kc-diff-added" : part.removed ? "kc-diff-removed" : ""}>{part.added ? "+ " : part.removed ? "− " : "  "}{part.value}</span>)}</pre>
        <Paragraph>Package integrity and the exact acknowledged digest are checked again when applying. Updating retains the previous package; Local source snapshots preserve earlier revisions separately.</Paragraph>
    </KittyToolDetails>;
}
