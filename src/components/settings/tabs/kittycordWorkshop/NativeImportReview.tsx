/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NativeStudio } from "@api/NativeStudio";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings/tabs/BaseTab";
import { nativeProject, type NativeStudioProject } from "@shared/kittycord/nativeStudio";
import { contentLabels } from "@shared/kittycord/presentation";
import { inspectPluginSource } from "@shared/kittycord/safeInstall";
import { Modal, openModal, React, useState } from "@webpack/common";

export function reviewNativeImport(input: NativeStudioProject, accept: (project: NativeStudioProject) => void | Promise<void>, details?: { description: string; origin: string; repository: string; }) {
    const project = nativeProject(input);
    const findings = Object.entries(project.files).flatMap(([file, source]) => inspectPluginSource(source, ["network", "filesystem", "process"]).map(finding => ({ ...finding, file })));
    const conflict = NativeStudio.snapshot().find(item => item.id === project.metadata.id || item.name === project.metadata.name);
    function Review({ close }: { close(): void; }) {
        const [file, setFile] = useState(project.entry);
        const [busy, setBusy] = useState(false), [error, setError] = useState("");
        return <SettingsTab><div className="kc-tool-page kc-native-import-review">
            <Heading>{project.metadata.name}</Heading><Paragraph>{contentLabels[project.metadata.contentType ?? "plugin"]} · v{project.metadata.version} · {project.metadata.author}</Paragraph>
            <Paragraph>Imported source. Author and origin claims are unverified. Native plugins run with the client’s access.</Paragraph>
            {details && <><Paragraph>{details.description}</Paragraph><Paragraph>{details.origin}{details.repository ? ` · ${details.repository}` : ""}</Paragraph></>}
            {conflict && <Paragraph role="alert">{details ? "Installation replaces an existing plugin with this name or identifier. The current version stops until you enable the new one. Source patches may require a reload." : "An installed plugin already uses this name or identifier. Opening this source does not replace it; installation requires a separate action."}</Paragraph>}
            <Heading tag="h3">Source review</Heading><Paragraph>{findings.length ? "Inferred references found by static inspection:" : "No recognized network or process references found. This does not establish safety or describe all runtime behavior."}</Paragraph>
            {findings.map((finding, index) => <Paragraph key={index}>{finding.file}: {finding.message}</Paragraph>)}
            <div className="kc-studio-files" role="group" aria-label="Imported files">{Object.keys(project.files).map(name => <Button key={name} size="small" variant="secondary" aria-pressed={name === file} onClick={() => setFile(name)}>{name}</Button>)}</div>
            <pre className="kc-source-diff" tabIndex={0} aria-label={`Source of ${file}`}>{project.files[file]}</pre>
            <Paragraph>{details ? "Nothing has executed. Installing compiles and registers this source through the existing PluginManager. Enable it separately after installation." : "Nothing has executed. Open the source in Studio, then build and review it before choosing Install & run."}</Paragraph>
            {error && <Paragraph role="alert">{error}</Paragraph>}
            <div className="kc-tools-actions"><Button disabled={busy} variant="secondary" onClick={close}>Cancel</Button><Button disabled={busy} onClick={() => { setBusy(true); setError(""); void Promise.resolve().then(() => accept(project)).then(close, reason => { setError(reason instanceof Error ? reason.message : "Import failed."); setBusy(false); }); }}>{busy ? "Installing…" : details ? "Install source" : "Open in Studio"}</Button></div>
        </div></SettingsTab>;
    }
    openModal(props => <Modal {...props} title="Import Review" size="lg"><Review close={props.onClose} /></Modal>);
}
