/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { Switch } from "@components/Switch";
import { buildStudioPackage } from "@shared/kittycord/studio";
import { utilitySettings,type UtilityValue } from "@shared/kittycord/utility";
import { applyWorkflow, newWorkflow, parseWorkflow, type WorkflowDocument, workflowProject, workflowText } from "@shared/kittycord/workflow";
import { chooseFile, saveFile } from "@utils/web";
import { Alerts, React, TextInput, useState } from "@webpack/common";

import { openWorkshopProject } from "../kittycordWorkshop";

export function WorkflowBuilder() {
    const [document, setDocument] = useState(newWorkflow);
    const [state, setState] = useState<Record<string, UtilityValue>>(document.state);
    const [preferences, setPreferences] = useState<Record<string, UtilityValue>>({});
    const [dragged, setDragged] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    function edit(value: WorkflowDocument) { setDocument(value); setState(value.state); setError(""); }
    function move(id: string, destination: number) {
        const actions = [...document.actions]; const index = actions.findIndex(action => action.id === id);
        if (index < 0 || destination < 0 || destination >= actions.length) return;
        actions.splice(destination, 0, ...actions.splice(index, 1)); edit({ ...document, actions });
    }
    async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (problem) { setError(problem instanceof Error ? problem.message : "Workflow validation failed."); } finally { setBusy(false); } }
    function download(value: unknown, name: string) { saveFile(new File([JSON.stringify(value, null, 4)], name, { type: "application/json" })); }
    return <>
        {error && <Notice.Warning>{error}</Notice.Warning>}
        <Card className="kc-tools-card"><Heading>Settings & actions</Heading>
            <Paragraph>Create a local utility. Reorder actions, edit labels and amounts, then try the buttons in the preview.</Paragraph>
            <label>Panel title<TextInput value={document.title} onChange={title => edit({ ...document, title })} /></label>
            <label>Display text<TextInput value={document.text} onChange={text => edit({ ...document, text })} /></label>
            <Paragraph>Use {"{{count}}"} to display the current counter. Actions run only when clicked.</Paragraph>
            <div role="list" aria-label="Workflow actions">{document.actions.map((action, index) => <Card key={action.id} role="listitem" className="kc-tools-card" draggable onDragStart={() => setDragged(action.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); move(dragged, index); setDragged(""); }}>
                <label>Button label<TextInput value={action.label} onChange={label => edit({ ...document, actions: document.actions.map(item => item.id === action.id ? { ...item, label } : item) })} /></label>
                <Select options={[{ label: "Add saved step", value: "setting" }, { label: "Add fixed amount", value: "add" }, { label: "Reset counter", value: "reset" }]} isSelected={value => action.steps[0]?.operation === value} serialize={value => value} select={operation => edit({ ...document, actions: document.actions.map(item => item.id === action.id ? { ...item, steps: [{ operation, target: "count", ...(operation === "reset" ? {} : { value: operation === "setting" ? "step" : 1 }) }] } : item) })} />
                {action.steps[0]?.operation === "add" && <TextInput type="number" aria-label={`Amount for ${action.label}`} value={String(action.steps[0].value)} onChange={value => edit({ ...document, actions: document.actions.map(item => item.id === action.id ? { ...item, steps: [{ operation: "add", target: "count", value: Number(value) }] } : item) })} />}
                <div className="kc-tools-actions"><Button variant="secondary" disabled={!index} onClick={() => move(action.id, index - 1)}>Move up</Button><Button variant="dangerSecondary" disabled={document.actions.length === 1} onClick={() => edit({ ...document, actions: document.actions.filter(item => item.id !== action.id) })}>Remove</Button></div>
            </Card>)}</div>
            <Button disabled={document.actions.length === 6} onClick={() => edit({ ...document, actions: [...document.actions, { id: `action-${crypto.randomUUID()}`, label: "Add one", steps: [{ operation: "add", target: "count", value: 1 }] }] })}>Add action</Button>
        </Card>
        <Card className="kc-tools-card" aria-label="Functional workflow preview"><Heading>{document.title}</Heading><Paragraph>{workflowText(document, state)}</Paragraph>
            {document.settings.map(field => <label key={field.id}>{field.label}{field.type === "boolean" ? <Switch checked={(preferences[field.id] ?? field.default) === true} onChange={value => setPreferences({ ...preferences, [field.id]: value })} /> : <TextInput type={field.type === "number" ? "number" : "text"} value={String(preferences[field.id] ?? field.default)} onChange={value => setPreferences({ ...preferences, [field.id]: field.type === "number" ? Number(value) : value })} />}</label>)}
            <div className="kc-tools-actions">{document.actions.map(action => <Button key={action.id} onClick={() => { try { setState(applyWorkflow(document, state, action.id, preferences)); setError(""); } catch (problem) { setError(problem instanceof Error ? problem.message : "Preview failed."); } }}>{action.label}</Button>)}</div>
        </Card>
        <div className="kc-tools-actions">
            <Button disabled={busy} onClick={() => void run(async () => { const project = workflowProject(document); const bundle = await buildStudioPackage(project); download(bundle, `${bundle.manifest.id}.kittycord.json`); })}>Validate & export utility</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void run(async () => download(workflowProject(document), "kittycord-workflow.project.json"))}>Export Studio project</Button>
            <Button variant="secondary" onClick={() => void run(async () => openWorkshopProject(workflowProject(document)))}>Edit generated source</Button>
            <Button variant="secondary" onClick={() => void run(async () => { parseWorkflow(document); utilitySettings({ ...document, actions: document.actions }, preferences); download(document, "kittycord-workflow.blocks.json"); })}>Export workflow</Button>
            <Button variant="secondary" onClick={() => void run(async () => { const file = await chooseFile("application/json,.json"); if (!file) return; if (file.size > 16_384) throw new Error("Workflow exceeds 16 KiB."); const imported = parseWorkflow(JSON.parse(await file.text())); Alerts.show({ title: "Replace workflow?", body: "Export your current workflow first if you need it.", confirmText: "Replace", cancelText: "Cancel", onConfirm: () => { edit(imported); setPreferences({}); } }); })}>Import workflow</Button>
        </div>
        <Paragraph>Restricted local actions and primitive settings only. No Discord events, messages, network, HTML or arbitrary expressions. Export uses the same SafeInstall review as authored utilities; browser installation remains unavailable.</Paragraph>
    </>;
}
