/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type PluginDisposer = () => void | Promise<void>;
export type ResourceMeasurement = <T>(surface: string, action: () => T) => T;

export function createPluginResources(measure?: ResourceMeasurement) {
    const resources = new Map<symbol, () => Promise<void>>();
    let closed = false;
    function assertOpen() { if (closed) throw new Error("The plugin resource scope is closed."); }
    function own(dispose: PluginDisposer) {
        assertOpen();
        const id = Symbol();
        let pending: Promise<void> | undefined;
        function release(): Promise<void> {
            if (!resources.has(id)) return Promise.resolve();
            if (pending) return pending;
            pending = Promise.resolve().then(() => measure ? measure("dispose", dispose) : dispose()).then(() => { resources.delete(id); }, problem => { pending = undefined; throw problem; });
            return pending;
        }
        resources.set(id, release);
        return release;
    }
    return {
        own,
        get size() { return resources.size; },
        get closed() { return closed; },
        interval(callback: () => void, delay: number) {
            assertOpen();
            if (!Number.isFinite(delay) || delay < 1 || delay > 2_147_483_647) throw new Error("Invalid interval delay.");
            let active = true;
            const id = setInterval(() => { if (active && !closed) callback(); }, delay);
            return own(() => { active = false; clearInterval(id); });
        },
        timeout(callback: () => void, delay: number) {
            assertOpen();
            if (!Number.isFinite(delay) || delay < 0 || delay > 2_147_483_647) throw new Error("Invalid timeout delay.");
            let active = true;
            const id = setTimeout(() => {
                if (!active || closed) return;
                void release();
                callback();
            }, delay);
            const release = own(() => { active = false; clearTimeout(id); });
            return release;
        },
        listen(target: EventTarget, type: string, callback: (event: Event) => void, capture = false) {
            assertOpen();
            let active = true;
            const listener = (event: Event) => { if (active && !closed) callback(event); };
            target.addEventListener(type, listener, capture);
            return own(() => { active = false; target.removeEventListener(type, listener, capture); });
        },
        async dispose() {
            closed = true;
            const errors: unknown[] = [];
            for (const release of [...resources.values()].reverse()) {
                try { await release(); } catch (problem) { errors.push(problem); }
            }
            return { errors, remaining: resources.size };
        }
    };
}

export type PluginResources = ReturnType<typeof createPluginResources>;
