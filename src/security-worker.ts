/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parentPort } from "node:worker_threads";

import { analyzePluginSource } from "@main/kittycord/securityAnalysis";

parentPort?.on("message", (data: { id: number; source: string; permissions: string[]; }) => {
    void analyzePluginSource(data.source, data.permissions).then(report => parentPort?.postMessage({ id: data.id, report }), () => parentPort?.postMessage({ id: data.id, error: "Source analysis could not complete within its supported limits." }));
});
