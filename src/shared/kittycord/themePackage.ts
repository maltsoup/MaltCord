/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject, parsePluginManifest, type PluginManifest } from "./manifest";
import type { RuntimeDefinition } from "./runtime";
import { verifyPluginArtifact } from "./safeInstall";

export const THEME_TOKENS = ["--background-primary", "--background-secondary", "--background-tertiary", "--background-base-low", "--background-base-lower", "--background-base-lowest", "--text-normal", "--text-default", "--text-muted", "--brand-500"] as const;
export interface ThemePackage { schemaVersion: 1; manifest: PluginManifest; artifact: string; }
export const THEME_PACKAGE_LIMIT = 131_072;

export function parseThemeArtifact(input: string): Record<string, string> {
    if (new TextEncoder().encode(input).byteLength > 4096) throw new Error("Theme data exceeds 4 KiB.");
    let value: unknown;
    try { value = JSON.parse(input); } catch { throw new Error("Theme data must be valid JSON."); }
    const data = checkedObject(value, ["schemaVersion", "kind", "colors"], "Theme data");
    if (data.schemaVersion !== 1 || data.kind !== "theme-tokens") throw new Error("Unsupported declarative theme format.");
    const colors = checkedObject(data.colors, THEME_TOKENS, "Theme colors");
    if (!Object.keys(colors).length) throw new Error("Choose at least one supported theme color.");
    const result: Record<string, string> = {};
    for (const [token, color] of Object.entries(colors)) {
        if (typeof color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(color)) throw new Error("Theme values must be six digit hexadecimal colors. CSS expressions and URLs are unsupported.");
        result[token] = color;
    }
    return result;
}

export function parseThemePackage(value: unknown): ThemePackage {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > THEME_PACKAGE_LIMIT) throw new Error("Theme packages must not exceed 128 KiB.");
    const data = checkedObject(value, ["schemaVersion", "manifest", "artifact"], "Theme package");
    if (data.schemaVersion !== 1 || typeof data.artifact !== "string") throw new Error("Unsupported theme package envelope.");
    const manifest = parsePluginManifest(JSON.stringify(data.manifest));
    const colors = parseThemeArtifact(data.artifact);
    const expected = Object.keys(colors).map(token => `theme.${token.slice(2)}`).sort();
    if (manifest.loadingMode !== "runtime" || manifest.entrypoints.desktop !== "theme.json" || manifest.entrypoints.browser
        || manifest.platforms.some(platform => ["chrome", "edge", "firefox"].includes(platform))
        || manifest.permissions.length !== 1 || manifest.permissions[0] !== "styles"
        || JSON.stringify([...manifest.capabilities].sort()) !== JSON.stringify(["kittycord.theme-tokens.v1", ...expected].sort())
        || JSON.stringify([...manifest.exclusiveCapabilities].sort()) !== JSON.stringify(expected))
        throw new Error("Only desktop theme.json packages with the styles permission, theme token capability and exact exclusive token declarations are supported.");
    return { schemaVersion: 1, manifest, artifact: data.artifact };
}

export async function verifyThemePackage(value: unknown): Promise<ThemePackage> {
    const bundle = parseThemePackage(value);
    await verifyPluginArtifact(new TextEncoder().encode(bundle.artifact), bundle.manifest.integrity.digest);
    return bundle;
}

export function defineThemePackage(bundle: ThemePackage, document: Pick<Document, "createElement" | "head">): RuntimeDefinition {
    const colors = parseThemeArtifact(bundle.artifact);
    return { manifest: bundle.manifest, start({ resources }) {
        const style = document.createElement("style");
        style.dataset.kittycordPlugin = bundle.manifest.id;
        style.textContent = `.theme-dark,.theme-light{${Object.entries(colors).map(([token, color]) => `${token}:${color}!important;`).join("")}}`;
        resources.own(() => { style.remove(); });
        document.head.appendChild(style);
    } };
}
