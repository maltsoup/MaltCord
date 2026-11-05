/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { extractFile } from "@electron/asar";

import { createSourceScanner } from "../../src/main/kittycord/securityWorker";
import { newUtilityProject } from "../../src/shared/kittycord/studio";

async function main() {
    const results: { target: string; firstScanMs: number; warmScanMs: number; workerReused: boolean; passed: boolean; }[] = [];
    for (const target of ["desktop", "equibop"]) {
        const scan = createSourceScanner(extractFile(`dist/kittencord-${target}.asar`, "security-worker.js").toString("utf8"));
        try {
            const start = performance.now(); const allowed = await scan(newUtilityProject().source, ["settings", "events"]); const firstScanMs = performance.now() - start;
            const worker = scan.state().workerId; const next = performance.now(); const denied = await scan('document["cookie"]', []); const warmScanMs = performance.now() - next;
            assert.equal(allowed.status, "Passed Scan"); assert.equal(denied.status, "Blocked"); assert.equal(worker, scan.state().workerId);
            results.push({ target, firstScanMs, warmScanMs, workerReused: true, passed: true });
        } finally { await scan.dispose(); }
    }
    console.log(JSON.stringify({ scope: "Actual packaged scanner, not whole-client startup or Discord UI qualification.", results }, null, 2));
}
main().catch(() => { console.error("Packaged source-scanner verification failed."); process.exitCode = 1; });
