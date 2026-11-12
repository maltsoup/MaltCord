/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

import type { SecurityReport } from "@shared/kittycord/security";

export function createSourceScanner(trustedPackagedWorker: string) {
    interface Job { id: number; source: string; permissions: readonly string[]; resolve(report: SecurityReport): void; reject(error: Error): void; }
    let worker: Worker | undefined;
    let active: Job | undefined;
    let nextId = 0;
    let stopping = false;
    let disposed = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const queue: Job[] = [];
    async function stop() {
        const retained = worker; worker = undefined;
        if (deadline) clearTimeout(deadline); if (idle) clearTimeout(idle);
        if (retained) { retained.removeAllListeners("message"); retained.removeAllListeners("exit"); await retained.terminate(); retained.removeAllListeners(); }
    }
    function finish(error?: Error, report?: SecurityReport) {
        const job = active; if (!job) return; active = undefined; if (deadline) clearTimeout(deadline);
        if (error || !report) {
            stopping = true;
            void stop().then(() => { stopping = false; job.reject(error ?? new Error("Source analysis failed.")); pump(); }, () => { stopping = false; job.reject(new Error("Scanner cleanup failed.")); pump(); });
            return;
        }
        job.resolve(report); pump();
    }
    function pump() {
        if (active || stopping || disposed) return;
        if (idle) clearTimeout(idle);
        const job = queue.shift();
        if (!job) { worker?.unref(); idle = setTimeout(() => { void stop().catch(() => console.warn("MaltCord scanner idle cleanup failed.")); }, 10000); idle.unref(); return; }
        active = job;
        try {
            if (!worker) {
                worker = new Worker(trustedPackagedWorker, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 2 } });
                const candidate = worker;
                worker.on("message", (value: { id?: number; report?: SecurityReport; error?: string; }) => { if (value.id === active?.id) finish(value.report ? undefined : new Error("Source analysis failed."), value.report); });
                worker.on("error", () => { if (worker === candidate) finish(new Error("Source analysis exceeded its resource limits or failed.")); });
                worker.on("exit", () => { if (worker === candidate) { worker = undefined; finish(new Error("The source scanner ended without a report.")); } });
            }
            worker.ref(); deadline = setTimeout(() => finish(new Error("Source analysis exceeded ten seconds.")), 10000);
            worker.postMessage({ id: job.id, source: job.source, permissions: job.permissions });
        } catch { finish(new Error("The source scanner could not start.")); }
    }
    const scan = (source: string, permissions: readonly string[]) => new Promise<SecurityReport>((resolve, reject) => {
        if (disposed) { reject(new Error("Scanner disposed.")); return; }
        if (typeof source !== "string" || source.length > 1_048_576 || !Array.isArray(permissions) || permissions.length > 64 || permissions.some(value => typeof value !== "string" || value.length > 100)) { reject(new Error("Invalid scan input.")); return; }
        if (queue.length >= 16) { reject(new Error("The source scan queue is full.")); return; }
        queue.push({ id: ++nextId, source, permissions, resolve, reject }); pump();
    });
    return Object.assign(scan, { state: () => ({ workerId: worker?.threadId, queued: queue.length, busy: !!active }), async dispose() { disposed = true; const current = active; active = undefined; current?.reject(new Error("Scanner disposed.")); for (const job of queue.splice(0)) job.reject(new Error("Scanner disposed.")); await stop(); } });
}

let scanner: Promise<ReturnType<typeof createSourceScanner>> | undefined;
export async function scanInWorker(source: string, permissions: readonly string[]) {
    scanner ??= readFile(join(__dirname, "security-worker.js"), "utf8").then(code => createSourceScanner(code));
    return (await scanner)(source, permissions);
}
