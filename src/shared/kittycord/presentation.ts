/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginManifest } from "./manifest";
import { checkedHttps, checkedObject, checkedText } from "./validation";

export const CONTENT_TYPES = ["plugin", "theme", "css-snippet", "ui-customization", "animation-pack", "icon-pack", "visual-effect", "layout-preset", "appearance-enhancement", "interface-component"] as const;
export type ContentType = typeof CONTENT_TYPES[number];
export const contentLabels: Record<ContentType, string> = { plugin: "Functional plugin", theme: "Theme", "css-snippet": "CSS snippet", "ui-customization": "UI customization", "animation-pack": "Animation pack", "icon-pack": "Icon pack", "visual-effect": "Visual effect", "layout-preset": "Layout preset", "appearance-enhancement": "Appearance enhancement", "interface-component": "Interface component" };
export const ORIGINS = ["original", "edition", "ported-testcord", "ported-other"] as const;
export const originLabels = { original: "KittenCord Original", edition: "KittenCord Edition", "ported-testcord": "Ported from TestCord", "ported-other": "Ported from another client" } as const;
export interface PluginPresentation {
    contentType: ContentType;
    category: string;
    icon: string;
    readme: string;
    github?: { username: string; repository?: string; };
    origin?: { kind: typeof ORIGINS[number]; project: string; author: string; repository: string; compatibility: string; };
}
export const README_LIMIT = 24000;
export function githubUsername(value: unknown) {
    if (typeof value === "string" && value.startsWith("https://")) {
        const url = new URL(checkedHttps(value, "GitHub profile"));
        if (url.origin !== "https://github.com" || !/^\/[A-Za-z\d-]+\/?$/.test(url.pathname)) throw new Error("Use a GitHub username or public profile URL.");
        value = url.pathname.replace(/^\/|\/$/g, "");
    }
    if (typeof value !== "string" || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(value) || value.includes("--")) throw new Error("Enter a valid GitHub username.");
    return value;
}
export function githubRepository(value: unknown) {
    const url = new URL(checkedHttps(value, "GitHub repository"));
    if (url.hostname !== "github.com" || !/^\/[A-Za-z\d-]+\/[A-Za-z\d_.-]+\/?$/.test(url.pathname) || url.pathname.includes("..")) throw new Error("Use a GitHub repository URL such as https://github.com/author/project.");
    return url.href.replace(/\/$/, "");
}
export function parsePresentation(value: unknown): PluginPresentation {
    const data = checkedObject(value, ["contentType", "category", "icon", "readme", "github", "origin"], "Plugin presentation");
    const contentType = CONTENT_TYPES.find(type => type === data.contentType);
    if (!contentType) throw new Error("Choose a supported content type.");
    if (typeof data.readme !== "string" || new TextEncoder().encode(data.readme).byteLength > README_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(data.readme)) throw new Error("README must be UTF-8 Markdown up to 24 KiB.");
    const icon = checkedText(data.icon, "Plugin icon", 12000);
    if (!["puzzle", "code", "clock", "palette", "search", "shield"].includes(icon) && !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(icon)) throw new Error("Choose a built-in icon or a small PNG/JPEG. SVG and remote icon URLs are not accepted.");
    let github: PluginPresentation["github"];
    if (data.github !== undefined) { const item = checkedObject(data.github, ["username", "repository"], "GitHub metadata"); github = { username: githubUsername(item.username), ...(item.repository ? { repository: githubRepository(item.repository) } : {}) }; }
    let origin: PluginPresentation["origin"];
    if (data.origin !== undefined) {
        const item = checkedObject(data.origin, ["kind", "project", "author", "repository", "compatibility"], "Origin metadata");
        const kind = ORIGINS.find(kind => kind === item.kind); if (!kind) throw new Error("Choose a supported source edition.");
        origin = { kind, project: checkedText(item.project, "Original project"), author: checkedText(item.author, "Original author"), repository: checkedHttps(item.repository, "Original repository"), compatibility: checkedText(item.compatibility, "Compatibility version", 128) };
    }
    return { contentType, category: checkedText(data.category, "Category", 60), icon, readme: data.readme, ...(github ? { github } : {}), ...(origin ? { origin } : {}) };
}
export function packageContentType(manifest: PluginManifest): ContentType {
    return manifest.presentation?.contentType ?? (manifest.capabilities.includes("kittycord.utility-js.v1") ? "plugin" : manifest.capabilities.some(value => value === "kittycord.theme-tokens.v1" || value.startsWith("theme.")) ? "theme" : "plugin");
}
export function validatePresentationRuntime(manifest: PluginManifest) {
    if (!manifest.presentation) return;
    const utility = manifest.capabilities.includes("kittycord.utility-js.v1") || manifest.capabilities.includes("kittycord.desktop-js.v1");
    if (utility && manifest.presentation.contentType !== "plugin") throw new Error("Functional utility code belongs in Plugins, not the visual Market.");
    if (!utility && manifest.capabilities.some(value => value.startsWith("theme.")) && manifest.presentation.contentType === "plugin") throw new Error("Color packages belong in the visual Market.");
    if (!utility && manifest.presentation.contentType !== "theme") throw new Error("This visual pack type has no supported runtime format yet. Export a theme package or keep the project for future development.");
}
