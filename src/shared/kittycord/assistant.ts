/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type AssistantProvider = "gemini" | "openai";
export const assistantOrigins = { gemini: "https://generativelanguage.googleapis.com", openai: "https://api.openai.com" } as const;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider response must be an object."); return value as Record<string, unknown>; }
async function request(provider: AssistantProvider, key: string, path: string, body?: object, fetcher: Fetcher = fetch) {
    if (!Object.hasOwn(assistantOrigins, provider) || !key.trim() || key.length > 4096 || /[\x00-\x1f\x7f]/.test(key)) throw new Error("Choose a supported provider and a valid API key.");
    const response = await fetcher(assistantOrigins[provider] + path, { method: body ? "POST" : "GET", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", ...(provider === "gemini" ? { "x-goog-api-key": key } : { Authorization: `Bearer ${key}` }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check key, model access, quota and provider availability.`);
    if (!response.body) throw new Error("Provider returned no body.");
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const value = await reader.read(); if (value.done) break; size += value.value.byteLength; if (size > 1024 * 1024) throw new Error("Provider response exceeds 1 MiB."); chunks.push(value.value); } }
    finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
export async function assistantModels(provider: AssistantProvider, key: string, fetcher?: Fetcher) {
    const values: { id: string; label: string; }[] = []; let pageToken = "";
    for (let page = 0; page < 5; page++) {
        const data = await request(provider, key, provider === "gemini" ? `/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}` : "/v1/models", undefined, fetcher);
        const models = provider === "gemini" ? data.models : data.data;
        if (!Array.isArray(models) || models.length > 2000) throw new Error("Invalid model catalog.");
        for (const value of models) {
            const model = record(value); const id = provider === "gemini" ? model.name : model.id;
            if (typeof id !== "string" || !/^(?:models\/)?[a-zA-Z0-9._:-]{1,180}$/.test(id)) continue;
            if (provider === "gemini" && (!Array.isArray(model.supportedGenerationMethods) || !model.supportedGenerationMethods.includes("generateContent"))) continue;
            values.push({ id, label: typeof model.displayName === "string" ? model.displayName.slice(0, 200) : id });
        }
        if (values.length > 2000) throw new Error("Model catalog exceeds limits.");
        if (provider !== "gemini" || !data.nextPageToken) break;
        if (typeof data.nextPageToken !== "string" || data.nextPageToken.length > 2048 || page === 4) throw new Error("Model catalog pagination exceeded limits.");
        pageToken = data.nextPageToken;
    }
    const unique = [...new Map(values.map(value => [value.id, value])).values()];
    if (!unique.length) throw new Error("The provider returned no eligible models.");
    return unique;
}
export async function assistantAnswer(provider: AssistantProvider, key: string, model: string, prompt: string, consent: boolean, fetcher?: Fetcher) {
    if (!consent) throw new Error("Review the exact prompt and consent before sending.");
    if (!/^(?:models\/)?[a-zA-Z0-9._:-]{1,180}$/.test(model) || provider === "gemini" && !model.startsWith("models/")) throw new Error("Select a model returned by the provider.");
    if (!prompt.trim() || new TextEncoder().encode(prompt).byteLength > 98_304) throw new Error("Prompt must be nonempty and at most 96 KiB.");
    const data = await request(provider, key, provider === "gemini" ? `/v1beta/${model}:generateContent` : "/v1/responses", provider === "gemini" ? { contents: [{ role: "user", parts: [{ text: prompt }] }] } : { model, input: prompt, store: false }, fetcher);
    const fragments: string[] = [];
    const outputs = provider === "gemini" ? data.candidates : data.output;
    if (!Array.isArray(outputs)) throw new Error("Provider returned no answer.");
    for (const item of outputs) {
        const value = record(item);
        const parts = provider === "gemini" ? record(value.content).parts : value.content;
        if (!Array.isArray(parts)) continue;
        for (const part of parts) { const value = record(part); if (typeof value.text === "string") fragments.push(value.text); }
    }
    const text = fragments.join("\n");
    if (!text.trim() || text.length > 131_072) throw new Error("Provider answer is empty or too large.");
    return text;
}
