/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { checkedObject } from "@shared/kittycord/manifest";
import { parseUtilityPanel, type UtilityBridge, type UtilityPanel, utilitySettings,type UtilityValue } from "@shared/kittycord/utility";

interface Surface { panel?: UtilityPanel; values: Record<string, UtilityValue>; send(message: object): void; }
const surfaces = new Map<string, Surface>();
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
export const KittycordUtility = {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    snapshot(id: string) { const surface = surfaces.get(id); return surface?.panel ? structuredClone({ panel: surface.panel, values: surface.values }) : undefined; },
    action(id: string, action: string) {
        const surface = surfaces.get(id);
        if (!surface?.panel?.actions.some(item => item.id === action)) throw new Error("This local plugin action is unavailable.");
        surface.send({ type: "action", id: action });
    },
    async save(id: string, input: unknown) {
        const surface = surfaces.get(id);
        if (!surface?.panel) throw new Error("Enable the local plugin before changing its settings.");
        const values = utilitySettings(surface.panel, input);
        await DataStore.update(`kittycord.utility.preferences:${id}`, () => {
            if (surfaces.get(id) !== surface) throw new Error("The plugin changed before settings could be committed.");
            return values;
        });
        if (surfaces.get(id) !== surface) throw new Error("The plugin changed while saving. Reopen its settings.");
        surface.values = values; surface.send({ type: "settings", settings: values }); notify();
    },
    bridge: { async attach(id, send) {
        if (surfaces.has(id)) throw new Error("A local plugin surface is already active with this identifier.");
        const stored = await DataStore.get<unknown>(`kittycord.utility.preferences:${id}`);
        const raw = stored === undefined ? {} : checkedObject(stored, Object.keys(typeof stored === "object" && stored ? stored : {}), "Stored utility preferences");
        if (JSON.stringify(raw).length > 4096 || Object.values(raw).some(value => !["string", "number", "boolean"].includes(typeof value))) throw new Error("Stored utility preferences are invalid. Export or reset this plugin's local preferences.");
        const surface: Surface = { send, values: raw as Record<string, UtilityValue> };
        if (surfaces.has(id)) throw new Error("A newer runtime already owns this local plugin surface.");
        surfaces.set(id, surface);
        return { settings: structuredClone(surface.values), publish(value) {
            if (surfaces.get(id) !== surface) throw new Error("This plugin surface was replaced.");
            const panel = parseUtilityPanel(value);
            const values = utilitySettings(panel, surface.values);
            const changed = JSON.stringify(values) !== JSON.stringify(surface.values);
            surface.panel = panel; surface.values = values;
            if (changed) surface.send({ type: "settings", settings: values });
            notify();
        }, dispose() { if (surfaces.get(id) === surface) { surfaces.delete(id); notify(); } } };
    } } satisfies UtilityBridge
};
