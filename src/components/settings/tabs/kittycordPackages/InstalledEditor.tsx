/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { CodeIcon, CopyIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { isDesktopPlugin } from "@shared/kittycord/desktopPlugin";
import type { ExternalPackage } from "@shared/kittycord/javascriptPackage";
import { prepareLocalEdit } from "@shared/kittycord/localEditing";
import { parseStudioProject } from "@shared/kittycord/studio";
import { saveFile } from "@utils/web";
import { React, TextArea, TextInput, useState } from "@webpack/common";

export function InstalledEditor({ bundle, onReview, onCancel }: { bundle: ExternalPackage; onReview(bundle: ExternalPackage): Promise<void>; onCancel(): void; }) {
    const [source, setSource] = useState(bundle.artifact);
    const [fork, setFork] = useState(true);
    const [id, setId] = useState(`local.${bundle.manifest.id}.fork`);
    const [version, setVersion] = useState("1.0.0");
    const [name, setName] = useState(`${bundle.manifest.name} fork`);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const label = React.useId();
    async function review() {
        setBusy(true); setError("");
        try { await onReview(await prepareLocalEdit(bundle, source, fork ? id : bundle.manifest.id, version, name)); }
        catch (problem) { setError(problem instanceof Error ? problem.message : "Source validation failed."); }
        finally { setBusy(false); }
    }
    function studioProject() {
        return parseStudioProject({ schemaVersion: 1, kind: "kittycord-studio", language: "javascript", metadata: { id: fork ? id : bundle.manifest.id, name, version, author: bundle.manifest.author }, source,
            tokens: bundle.manifest.exclusiveCapabilities.map(capability => `--${capability.slice(6)}`), tests: [], ...(bundle.manifest.presentation ? { presentation: bundle.manifest.presentation } : {}), description: bundle.manifest.description, ...(isDesktopPlugin(bundle.manifest) ? { api: "desktop-v1", permissions: bundle.manifest.permissions, networkOrigins: bundle.manifest.networkOrigins ?? [] } : {}), ...(bundle.manifest.capabilities.includes("kittycord.utility-js.v1") ? { api: "utility-v1" } : {}) });
    }
    function exportProject() {
        try {
            const project = studioProject();
            saveFile(new File([JSON.stringify(project, null, 4)], `${project.metadata.id}.project.json`, { type: "application/json" }));
        } catch (problem) { setError(problem instanceof Error ? problem.message : "Project export failed."); }
    }
    return <div className="kc-tools-card kc-installed-editor">
        <Heading><CodeIcon width={20} height={20} /> Edit installed source</Heading>
        <Paragraph>Changes stay in a local fork by default. The original author and source attribution are retained. Review the diff and security findings before confirming installation.</Paragraph>
        <div className="kc-permission-row"><label id={label}>Create a separate Local fork</label><Switch checked={fork} onChange={setFork} aria-labelledby={label} /></div>
        <div className="kc-tool-fields"><div className="kc-tool-field"><label>Name</label><TextInput aria-label="Edited plugin name" value={name} onChange={setName} /></div><div className="kc-tool-field"><label>Version</label><TextInput aria-label="Edited plugin version" value={version} onChange={setVersion} /></div>{fork && <div className="kc-tool-field"><label>New identifier</label><TextInput aria-label="Fork identifier" value={id} onChange={setId} /></div>}</div>
        <TextArea className="kc-source-editor" aria-label="Installed plugin source draft" value={source} onChange={setSource} rows={14} spellCheck={false} />
        {!fork && <Notice.Warning>Updating the same identifier requires a higher version. A recoverable source snapshot is saved before replacement. No automatic updater overwrites Local edits.</Notice.Warning>}
        {error && <Notice.Warning>{error}</Notice.Warning>}
        <div className="kc-tools-actions"><Button disabled={busy} onClick={() => void review()}><CodeIcon />Review changes</Button><Button variant="secondary" disabled={bundle.manifest.entrypoints.desktop !== "plugin.js"} onClick={exportProject}><CopyIcon />Export Studio project</Button>{!IS_WEB && <Button variant="secondary" disabled={bundle.manifest.entrypoints.desktop !== "plugin.js"} onClick={() => { try { void VencordNative.studio.open(studioProject()).catch(() => setError("Monaco Studio could not open. Export the project to retain your source.")); } catch (problem) { setError(problem instanceof Error ? problem.message : "The project could not be prepared."); } }}>Open in Monaco</Button>}<Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
    </div>;
}
