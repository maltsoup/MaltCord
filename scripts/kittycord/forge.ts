/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { forgeProviders, parseForgeRequest } from "../../src/shared/kittycord/forge";

export function forgeConsent(value: unknown) {
    const request = parseForgeRequest(value);
    return createHash("sha256").update(JSON.stringify({ request, payload: forgeProviders[request.provider].payload(request) })).digest("hex");
}

export async function sendForgeRequest(value: unknown, consent: string, apiKey?: string) {
    const request = parseForgeRequest(value);
    if (consent !== forgeConsent(request)) throw new Error("AI consent does not match the exact endpoint, model and prompt. Preview again before sending.");
    if (request.provider === "ollama" && apiKey) throw new Error("Ollama requests do not accept cloud credentials through this adapter.");
    const response = await fetch(request.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(forgeProviders[request.provider].payload(request)) });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}. No output was imported.`);
    if (!response.body) throw new Error("AI provider returned no response body.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > 1024 * 1024) throw new Error("AI response exceeds 1 MiB.");
            chunks.push(chunk.value);
        }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    return forgeProviders[request.provider].output(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}

async function main() {
    const [mode, input, consent, output, ...extra] = process.argv.slice(2);
    if (!input || extra.length || !["--preview", "--send"].includes(mode)) throw new Error("Usage: forge.ts --preview request.json OR --send request.json approved-digest unused-project.json");
    if ((await stat(input)).size > 131_072) throw new Error("AI request exceeds 128 KiB.");
    const request = parseForgeRequest(JSON.parse(await readFile(input, "utf8")));
    if (mode === "--preview") {
        if (consent || output) throw new Error("Preview takes only the request path.");
        process.stdout.write(JSON.stringify({ endpoint: request.endpoint, provider: request.provider, model: request.model, prompt: request.prompt, approvalDigest: forgeConsent(request), sendsData: false }, null, 4) + "\n");
        return;
    }
    if (!consent || !output) throw new Error("Sending requires the reviewed approval digest and an unused project output path.");
    try { await stat(output); throw new Error("AI output already exists. Select an unused project path before sending."); }
    catch (problem) { if (!(problem instanceof Error) || !("code" in problem) || problem.code !== "ENOENT") throw problem; }
    const project = await sendForgeRequest(request, consent, request.provider === "openai-compatible" ? process.env.KITTYCORD_AI_API_KEY : undefined);
    await writeFile(output, JSON.stringify(project, null, 4) + "\n", { flag: "wx" });
    process.stdout.write("AI output saved as a Studio draft. It was not executed or installed. Review and compile before use.\n");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
    main().catch(() => { process.stderr.write("AI Forge failed. Check the request, consent, provider availability and output format. No successful output was confirmed.\n"); process.exitCode = 1; });
