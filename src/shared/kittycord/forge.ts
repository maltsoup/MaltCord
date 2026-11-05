/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject, checkedText } from "./manifest";
import { newDesktopProject, parseStudioProject, type StudioProject } from "./studio";

export interface ForgeRequest { schemaVersion: 1; provider: "openai-compatible" | "ollama"; endpoint: string; model: string; prompt: string; }
export function parseForgeRequest(value: unknown): ForgeRequest {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 131_072) throw new Error("AI request exceeds 128 KiB.");
    const data = checkedObject(value, ["schemaVersion", "provider", "endpoint", "model", "prompt"], "AI request");
    if (data.schemaVersion !== 1 || !["openai-compatible", "ollama"].includes(String(data.provider))) throw new Error("Unsupported AI provider protocol.");
    const endpoint = new URL(checkedText(data.endpoint, "AI endpoint", 2048));
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.protocol !== "https:" && !(local && endpoint.protocol === "http:")) throw new Error("Use HTTPS, or explicit loopback HTTP for a local model, without credentials or query parameters.");
    const { prompt } = data;
    if (typeof prompt !== "string" || !prompt.trim() || new TextEncoder().encode(prompt).byteLength > 98_304) throw new Error("AI prompt must be nonempty and at most 96 KiB.");
    return { schemaVersion: 1, provider: data.provider as ForgeRequest["provider"], endpoint: endpoint.href, model: checkedText(data.model, "AI model", 200), prompt };
}

export function forgePrompt(description: string, project?: StudioProject) {
    if (!description.trim() || description.length > 4000) throw new Error("Describe the plugin in at most 4000 characters.");
    const example = project ? parseStudioProject(project) : newDesktopProject();
    return `Return only a JSON Kittycord Studio project with this exact schema: ${JSON.stringify(example)}\nTask: ${description}\nFor api utility-v1 use api.publishPanel, api.onAction, api.onSettings, api.settings and api.checkpoint with bounded text/buttons/settings. Empty tokens and tests for utility projects. Timers run only inside the disposable worker. Color projects instead use declared color tokens and api.setColors. For api desktop-v1 use api.readDiscord(resource, options), api.addButton({id,label,location,icon}), api.addStyle(css), api.fetch(url), or api.loadScript(url,sha256). Resources: currentUser, selectedChannel, guilds, channels, members, messages (loaded data only, limit 1..200). Button locations: chat-input, channel-header, user-area. Add the corresponding discord, interface, styles, network or scripts permissions; settings/events are mandatory. Downloads require explicit public HTTPS networkOrigins; scripts also require network and a pinned SHA-256. No unrestricted DOM, native access, imports or dynamic evaluation. Never request authentication data. The output will be reviewed and compiled before any execution.`;
}

export const forgeProviders = {
    "openai-compatible": {
        payload(request: ForgeRequest) { return { model: request.model, messages: [{ role: "user", content: request.prompt }], temperature: 0.2 }; },
        output(value: unknown) {
            if (!value || typeof value !== "object" || !("choices" in value) || !Array.isArray(value.choices)) throw new Error("AI response has no choices.");
            const choice: unknown = value.choices[0];
            if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object" || !("content" in choice.message) || typeof choice.message.content !== "string") throw new Error("AI response has no text project.");
            return parseStudioProject(JSON.parse(choice.message.content));
        }
    },
    ollama: {
        payload(request: ForgeRequest) { return { model: request.model, stream: false, messages: [{ role: "user", content: request.prompt }] }; },
        output(value: unknown) {
            if (!value || typeof value !== "object" || !("message" in value) || !value.message || typeof value.message !== "object" || !("content" in value.message) || typeof value.message.content !== "string") throw new Error("Local AI response has no text project.");
            return parseStudioProject(JSON.parse(value.message.content));
        }
    }
};
