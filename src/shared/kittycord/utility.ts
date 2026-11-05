/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject, checkedPluginIdentifier, checkedText } from "./manifest";

export type UtilityValue = string | number | boolean;
export interface UtilityField { id: string; label: string; type: "text" | "number" | "boolean"; default: UtilityValue; min?: number; max?: number; }
export interface UtilityPanel { title: string; text: string; actions: { id: string; label: string; }[]; settings: UtilityField[]; }
export interface UtilityBridge {
    attach(id: string, send: (message: object) => void): Promise<{ publish(value: unknown): void; dispose(): void; settings: Record<string, UtilityValue>; }>;
}
export function parseUtilityPanel(value: unknown): UtilityPanel {
    if (JSON.stringify(value).length > 6000) throw new Error("Utility panel exceeds 6 KiB.");
    const data = checkedObject(value, ["title", "text", "actions", "settings"], "Utility panel");
    if (!Array.isArray(data.actions) || data.actions.length > 6 || !Array.isArray(data.settings) || data.settings.length > 8) throw new Error("A utility supports at most six actions and eight settings.");
    const actions = data.actions.map(value => { const action = checkedObject(value, ["id", "label"], "Utility action"); return { id: checkedPluginIdentifier(action.id), label: checkedText(action.label, "Action label", 50) }; });
    const settings = data.settings.map(value => {
        const field = checkedObject(value, ["id", "label", "type", "default", "min", "max"], "Utility setting");
        if (!["text", "number", "boolean"].includes(String(field.type)) || typeof field.default !== (field.type === "text" ? "string" : field.type)) throw new Error("Utility setting type/default mismatch.");
        if (typeof field.default === "string" && field.default.length > 2000 || typeof field.default === "number" && !Number.isFinite(field.default)) throw new Error("Invalid utility setting default.");
        if (field.type === "number" && (typeof field.min !== "number" || typeof field.max !== "number" || !Number.isFinite(field.min) || !Number.isFinite(field.max) || field.min > field.max || Number(field.default) < field.min || Number(field.default) > field.max)) throw new Error("Numeric settings need valid bounds and an in-range default.");
        if (field.type !== "number" && (field.min !== undefined || field.max !== undefined)) throw new Error("Only numeric settings accept bounds.");
        return { id: checkedPluginIdentifier(field.id), label: checkedText(field.label, "Setting label", 80), type: field.type as UtilityField["type"], default: field.default as UtilityValue,
            ...(field.type === "number" ? { min: field.min as number, max: field.max as number } : {}) };
    });
    if (new Set(actions.map(action => action.id)).size !== actions.length || new Set(settings.map(field => field.id)).size !== settings.length) throw new Error("Utility action and setting identifiers must be unique.");
    if (typeof data.text !== "string" || data.text.length > 2000) throw new Error("Utility text must be at most 2000 characters.");
    return { title: checkedText(data.title, "Panel title", 80), text: data.text, actions, settings };
}
export function utilitySettings(panel: UtilityPanel, input: unknown): Record<string, UtilityValue> {
    const values = checkedObject(input, panel.settings.map(field => field.id), "Utility preferences");
    const result = Object.fromEntries(panel.settings.map(field => {
        const value = values[field.id] ?? field.default;
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") throw new Error("Utility settings must be primitive values.");
        if (typeof value !== typeof field.default || typeof value === "string" && value.length > 2000 || typeof value === "number" && (!Number.isFinite(value) || value < Number(field.min) || value > Number(field.max))) throw new Error(`Invalid setting: ${field.label}.`);
        return [field.id, value];
    }));
    if (JSON.stringify(result).length > 4096) throw new Error("Utility preferences exceed 4 KiB.");
    return result;
}
export const utilityStarterSource = `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({
    start(api) {
        let remaining = Number(api.settings.minutes ?? 25) * 60;
        let timer = /** @type {number | undefined} */ (undefined);
        const show = () => api.publishPanel({title: "Focus sessions", text: Math.floor(remaining / 60) + ":" + String(remaining % 60).padStart(2, "0"), actions: [{id:"start",label:"Start"},{id:"pause",label:"Pause"},{id:"reset",label:"Reset"}], settings:[{id:"minutes",label:"Session minutes",type:"number",default:25,min:1,max:120}]});
        const pause = () => { clearInterval(timer); timer = undefined; };
        api.onAction(id => { if(id === "start" && timer === undefined) timer = setInterval(() => { if(remaining > 0) remaining--; if(remaining === 0) pause(); show(); }, 1000); if(id === "pause") pause(); if(id === "reset") { pause(); remaining = Number(api.settings.minutes ?? 25) * 60; show(); } });
        api.onSettings(values => { pause(); remaining = Number(values.minutes) * 60; show(); });
        show();
    }
});`;
