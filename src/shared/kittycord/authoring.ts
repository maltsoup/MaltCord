/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DESKTOP_PLUGIN_API } from "./desktopPlugin";
import { verifyExternalPackage } from "./javascriptPackage";
import type { PluginPermission } from "./manifest";
import { THEME_TOKENS } from "./themePackage";

export const starterPluginSource = `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({
    start(api, previousState) {
        api.setColors({ "--brand-500": "#b783df" });
        const launches = previousState && typeof previousState === "object" && "launches" in previousState ? previousState.launches : 0;
        api.checkpoint({ launches: typeof launches === "number" ? launches + 1 : 1 });
    }
});`;

export async function createAuthoredPackage(input: { id: string; name: string; version: string; author: string; source: string; tokens?: readonly string[]; }) {
    const bytes = new TextEncoder().encode(input.source);
    if (bytes.byteLength > 65_536) throw new Error("JavaScript source exceeds 64 KiB.");
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    const tokens = input.tokens ?? ["--brand-500"];
    if (!tokens.length || new Set(tokens).size !== tokens.length || tokens.some(token => !THEME_TOKENS.some(known => known === token))) throw new Error("Declare unique supported theme tokens.");
    const capabilities = tokens.map(token => `theme.${token.slice(2)}`);
    return verifyExternalPackage({ schemaVersion: 1, artifact: input.source, manifest: {
        schemaVersion: 1, id: input.id, name: input.name, version: input.version,
        author: input.author, publisher: input.author, description: "Locally authored isolated Kittycord plugin.",
        minApiVersion: "1.0.0", platforms: ["windows", "linux", "macos"], loadingMode: "runtime",
        dependencies: [], optionalDependencies: [], capabilities: ["kittycord.isolated-js.v1", ...capabilities],
        exclusiveCapabilities: capabilities, permissions: ["styles"], requiredPatches: [], incompatibleWith: [],
        entrypoints: { desktop: "plugin.js" }, provenance: { source: "https://example.invalid/local-project", revision: "local" },
        integrity: { algorithm: "sha256", digest }
    } });
}

export async function createUtilityPackage(input: { id: string; name: string; version: string; author: string; source: string; }) {
    const base = await createAuthoredPackage(input);
    return verifyExternalPackage({ ...base, manifest: { ...base.manifest, minApiVersion: "1.1.0", description: "Locally authored functional utility with settings and user actions.", capabilities: ["kittycord.utility-js.v1"], exclusiveCapabilities: [], permissions: ["settings", "events"] } });
}

export async function createDesktopPackage(input: { id: string; name: string; version: string; author: string; source: string; permissions: PluginPermission[]; networkOrigins: string[]; }) {
    const bytes = new TextEncoder().encode(input.source);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
    return verifyExternalPackage({ schemaVersion: 1, artifact: input.source, manifest: {
        schemaVersion: 1, id: input.id, name: input.name, version: input.version, author: input.author, publisher: input.author,
        description: "A Kittencord desktop plugin with reviewed Discord and interface capabilities.", minApiVersion: "1.1.0",
        platforms: ["windows", "linux", "macos"], loadingMode: "runtime", dependencies: [], optionalDependencies: [],
        capabilities: [DESKTOP_PLUGIN_API], exclusiveCapabilities: [], permissions: input.permissions, networkOrigins: input.networkOrigins,
        requiredPatches: [], incompatibleWith: [], entrypoints: { desktop: "plugin.js" },
        provenance: { source: "https://example.invalid/local-project", revision: "local" }, integrity: { algorithm: "sha256", digest }
    } });
}
