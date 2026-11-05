/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject, checkedPluginIdentifier } from "./manifest";
import { newUtilityProject, parseStudioProject, type StudioProject } from "./studio";
import { parseUtilityPanel, type UtilityField, utilitySettings, type UtilityValue } from "./utility";

export interface WorkflowStep { operation: "set" | "add" | "toggle" | "setting" | "reset"; target: string; value?: UtilityValue; }
export interface WorkflowDocument {
    schemaVersion: 1; kind: "kittycord-workflow"; title: string; text: string;
    state: Record<string, UtilityValue>; settings: UtilityField[];
    actions: { id: string; label: string; steps: WorkflowStep[]; }[];
}
export function newWorkflow(): WorkflowDocument {
    return { schemaVersion: 1, kind: "kittycord-workflow", title: "Local counter", text: "Count: {{count}}", state: { count: 0 },
        settings: [{ id: "step", label: "Increment amount", type: "number", default: 1, min: 1, max: 100 }],
        actions: [{ id: "increment", label: "Add", steps: [{ operation: "setting", target: "count", value: "step" }] }, { id: "reset", label: "Reset", steps: [{ operation: "reset", target: "count" }] }] };
}
export function parseWorkflow(value: unknown): WorkflowDocument {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16_384) throw new Error("Workflow exceeds 16 KiB.");
    const data = checkedObject(value, ["schemaVersion", "kind", "title", "text", "state", "settings", "actions"], "Workflow");
    if (data.schemaVersion !== 1 || data.kind !== "kittycord-workflow") throw new Error("Unsupported workflow schema.");
    const state = checkedObject(data.state, Object.keys(data.state && typeof data.state === "object" ? data.state : {}), "Workflow state");
    if (!Object.keys(state).length || Object.keys(state).length > 8) throw new Error("A workflow needs one to eight state values.");
    for (const [key, value] of Object.entries(state)) {
        checkedPluginIdentifier(key);
        if (!["string", "number", "boolean"].includes(typeof value) || typeof value === "string" && value.length > 1000 || typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1e9)) throw new Error("State values must be bounded text, numbers or booleans.");
    }
    if (!Array.isArray(data.actions)) throw new Error("Declare workflow actions.");
    const panel = parseUtilityPanel({ title: data.title, text: data.text, settings: data.settings, actions: data.actions.map(value => {
        const action = checkedObject(value, ["id", "label", "steps"], "Workflow action"); return { id: action.id, label: action.label };
    }) });
    for (const [, key] of panel.text.matchAll(/\{\{([^{}]+)\}\}/g)) if (!Object.hasOwn(state, key)) throw new Error(`Unknown display value: ${key}.`);
    const actions = data.actions.map((value, index) => {
        const action = checkedObject(value, ["id", "label", "steps"], "Workflow action");
        if (!Array.isArray(action.steps) || !action.steps.length || action.steps.length > 8) throw new Error("An action needs one to eight supported steps.");
        const steps = action.steps.map(value => {
            const step = checkedObject(value, ["operation", "target", "value"], "Workflow step");
            const target = checkedPluginIdentifier(step.target);
            if (!Object.hasOwn(state, target) || !["set", "add", "toggle", "setting", "reset"].includes(String(step.operation))) throw new Error("Unknown workflow target or operation.");
            if (step.operation === "set" && (typeof step.value !== typeof state[target] || typeof step.value === "string" && step.value.length > 1000 || typeof step.value === "number" && (!Number.isFinite(step.value) || Math.abs(step.value) > 1e9))) throw new Error("Set requires a matching bounded value.");
            if (step.operation === "add" && (typeof state[target] !== "number" || typeof step.value !== "number" || !Number.isFinite(step.value) || Math.abs(step.value) > 1e6)) throw new Error("Add requires a numeric target and finite amount.");
            if (step.operation === "toggle" && (typeof state[target] !== "boolean" || step.value !== undefined) || step.operation === "reset" && step.value !== undefined) throw new Error("Toggle/reset do not accept a value; toggle requires a boolean.");
            if (step.operation === "setting" && (typeof state[target] !== "number" || !panel.settings.some(field => field.id === step.value && field.type === "number"))) throw new Error("Setting increment requires a declared numeric setting and target.");
            return { operation: step.operation as WorkflowStep["operation"], target, ...(step.value !== undefined ? { value: step.value as UtilityValue } : {}) };
        });
        return { ...panel.actions[index], steps };
    });
    return { schemaVersion: 1, kind: "kittycord-workflow", title: panel.title, text: panel.text, state: state as Record<string, UtilityValue>, settings: panel.settings, actions };
}
export function applyWorkflow(document: WorkflowDocument, current: Record<string, UtilityValue>, actionId: string, preferences: unknown) {
    const workflow = parseWorkflow(document);
    const settings = utilitySettings({ ...workflow, actions: workflow.actions }, preferences);
    const action = workflow.actions.find(action => action.id === actionId);
    if (!action) throw new Error("Choose a declared workflow action.");
    const state = { ...current };
    for (const step of action.steps) {
        if (step.operation === "reset") state[step.target] = workflow.state[step.target];
        else if (step.operation === "set" && step.value !== undefined) state[step.target] = step.value;
        else if (step.operation === "toggle") state[step.target] = !state[step.target];
        else state[step.target] = Math.max(-1e9, Math.min(1e9, Number(state[step.target]) + Number(step.operation === "setting" ? settings[String(step.value)] : step.value)));
    }
    return state;
}
export function workflowText(document: WorkflowDocument, state: Record<string, UtilityValue>) {
    return document.text.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => String(state[key])).slice(0, 2000);
}
export function workflowProject(input: unknown, metadata = { ...newUtilityProject().metadata, id: "local.visual-counter", name: "Visual counter" }): StudioProject {
    const workflow = parseWorkflow(input);
    const source = `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({start(api) {
const workflow = /** @type {{title:string;text:string;state:Record<string,UtilityValue>;settings:Parameters<KittyPluginApi["publishPanel"]>[0]["settings"];actions:{id:string;label:string;steps:{operation:string;target:string;value?:UtilityValue}[]}[]}} */ (${JSON.stringify(workflow)});
/** @type {Record<string, string | number | boolean>} */
let state = {...workflow.state};
const show = () => api.publishPanel({title:workflow.title,text:workflow.text.replace(/\\{\\{([^{}]+)\\}\\}/g, (_match, key) => String(state[key])).slice(0,2000),actions:workflow.actions.map(action=>({id:action.id,label:action.label})),settings: /** @type {Parameters<KittyPluginApi["publishPanel"]>[0]["settings"]} */ (workflow.settings)});
api.onAction(id=>{const action=workflow.actions.find(action=>action.id===id);if(!action)return;for(const step of action.steps){if(step.operation==="reset")state[step.target]=workflow.state[step.target];else if(step.operation==="set"&&step.value!==undefined)state[step.target]=step.value;else if(step.operation==="toggle")state[step.target]=!state[step.target];else state[step.target]=Math.max(-1e9,Math.min(1e9,Number(state[step.target])+Number(step.operation==="setting"?api.settings[String(step.value)]:step.value)));}show();});
api.onSettings(()=>show());show();
}});`;
    return parseStudioProject({ ...newUtilityProject(), metadata, source });
}
