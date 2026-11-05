/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseNetworkOrigins } from "./desktopPlugin";
import { parsePresentation, type PluginPresentation, validatePresentationRuntime } from "./presentation";
import { checkedHttps, checkedObject, checkedText, checkedVersion } from "./validation";
import { compareVersions, type VersionInterval } from "./versions";
export { checkedHttps, checkedObject, checkedText, checkedVersion } from "./validation";

export const PLATFORMS = ["windows", "linux", "macos", "chrome", "edge", "firefox"] as const;
export type PluginPlatform = typeof PLATFORMS[number];
export const PERMISSIONS = ["settings", "styles", "events", "storage", "network", "filesystem", "native", "process", "discord", "interface", "scripts"] as const;
export type PluginPermission = typeof PERMISSIONS[number];
export const LOADING_MODES = ["built-in", "runtime", "build-time", "browser-packaged", "unsupported", "quarantined"] as const;
export type PluginLoadingMode = typeof LOADING_MODES[number];

export interface PluginDependency extends VersionInterval { id: string; }
export interface PluginManifest {
    schemaVersion: 1;
    id: string;
    name: string;
    version: string;
    author: string;
    publisher: string;
    description: string;
    minApiVersion: string;
    platforms: PluginPlatform[];
    loadingMode: PluginLoadingMode;
    dependencies: PluginDependency[];
    optionalDependencies: PluginDependency[];
    capabilities: string[];
    exclusiveCapabilities: string[];
    permissions: PluginPermission[];
    requiredPatches: string[];
    incompatibleWith: string[];
    entrypoints: { desktop?: string; browser?: string; };
    provenance: { source: string; revision: string; };
    integrity: { algorithm: "sha256"; digest: string; };
    updateSource?: string;
    networkOrigins?: string[];
    presentation?: PluginPresentation;
    discordBuild?: { min: number; max?: number; };
}

function identifier(value: unknown) {
    const id = checkedText(value, "Plugin identifier", 100);
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) || ["constructor", "prototype"].includes(id))
        throw new Error("Plugin identifiers must use lowercase dotted or hyphenated names.");
    return id;
}

export { identifier as checkedPluginIdentifier };

function list<T extends string>(value: unknown, label: string, parse: (item: unknown) => T): T[] {
    if (!Array.isArray(value) || value.length > 64) throw new Error(`${label} must be an array of at most 64 entries.`);
    const parsed = value.map(parse);
    if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contains duplicate entries.`);
    return parsed;
}

function choice<T extends string>(value: unknown, choices: readonly T[], label: string): T {
    const matched = choices.find(item => item === value);
    if (matched === undefined) throw new Error(`${label} is unsupported.`);
    return matched;
}

function dependencies(value: unknown): PluginDependency[] {
    if (!Array.isArray(value) || value.length > 64) throw new Error("Dependencies must be an array of at most 64 entries.");
    const parsed = value.map(item => {
        const dep = checkedObject(item, ["id", "minVersion", "maxVersionExclusive"], "Dependency");
        const minVersion = checkedVersion(dep.minVersion, "Dependency minimum version");
        const maxVersionExclusive = dep.maxVersionExclusive === undefined ? undefined : checkedVersion(dep.maxVersionExclusive, "Dependency maximum version");
        if (maxVersionExclusive && compareVersions(minVersion, maxVersionExclusive) >= 0) throw new Error("Dependency version interval is empty.");
        return { id: identifier(dep.id), minVersion, ...(maxVersionExclusive ? { maxVersionExclusive } : {}) };
    });
    if (new Set(parsed.map(dep => dep.id)).size !== parsed.length) throw new Error("Dependencies contain duplicate identifiers.");
    return parsed;
}

export function checkedEntryPath(value: unknown): string {
    const path = checkedText(value, "Entry point", 200);
    if (!/^[\w./-]+$/.test(path) || path.split("/").some(part => !part || part === "." || part === ".." || part.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
        throw new Error("Entry points must be portable relative paths without traversal or reserved names.");
    if (!/\.(js|mjs|ts|tsx|json)$/.test(path)) throw new Error("Unsupported entry point extension.");
    return path;
}

export function parsePluginManifest(input: string): PluginManifest {
    if (new TextEncoder().encode(input).byteLength > 65_536) throw new Error("Plugin manifest exceeds 64 KiB.");
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { throw new Error("Plugin manifest is not valid JSON."); }
    const data = checkedObject(parsed, ["schemaVersion", "id", "name", "version", "author", "publisher", "description", "minApiVersion", "platforms", "loadingMode", "dependencies", "optionalDependencies", "capabilities", "exclusiveCapabilities", "permissions", "requiredPatches", "incompatibleWith", "entrypoints", "provenance", "integrity", "updateSource", "discordBuild", "presentation", "networkOrigins"], "Plugin manifest");
    if (data.schemaVersion !== 1) throw new Error("Unsupported plugin manifest schema.");
    const entries = checkedObject(data.entrypoints, ["desktop", "browser"], "Entry points");
    const entrypoints = {
        ...(entries.desktop === undefined ? {} : { desktop: checkedEntryPath(entries.desktop) }),
        ...(entries.browser === undefined ? {} : { browser: checkedEntryPath(entries.browser) })
    };
    if (!Object.keys(entrypoints).length) throw new Error("At least one entry point is required.");
    const source = checkedObject(data.provenance, ["source", "revision"], "Provenance");
    const integrity = checkedObject(data.integrity, ["algorithm", "digest"], "Integrity");
    if (integrity.algorithm !== "sha256" || typeof integrity.digest !== "string" || !/^[a-f0-9]{64}$/.test(integrity.digest)) throw new Error("A SHA-256 artifact digest is required.");
    let discordBuild: PluginManifest["discordBuild"];
    if (data.discordBuild !== undefined) {
        const build = checkedObject(data.discordBuild, ["min", "max"], "Discord compatibility");
        if (typeof build.min !== "number" || !Number.isSafeInteger(build.min) || build.min < 0 || (build.max !== undefined && (typeof build.max !== "number" || !Number.isSafeInteger(build.max) || build.max < build.min)))
            throw new Error("Invalid Discord build interval.");
        discordBuild = { min: build.min, ...(typeof build.max === "number" ? { max: build.max } : {}) };
    }
    const manifest: PluginManifest = {
        schemaVersion: 1, id: identifier(data.id), name: checkedText(data.name, "Display name"),
        version: checkedVersion(data.version, "Plugin version"), author: checkedText(data.author, "Author"), publisher: checkedText(data.publisher, "Publisher"),
        description: checkedText(data.description, "Description", 2000), minApiVersion: checkedVersion(data.minApiVersion, "API version"),
        platforms: list(data.platforms, "Platforms", item => choice(item, PLATFORMS, "Platform")),
        loadingMode: choice(data.loadingMode, LOADING_MODES, "Loading mode"),
        dependencies: dependencies(data.dependencies), optionalDependencies: dependencies(data.optionalDependencies),
        capabilities: list(data.capabilities, "Capabilities", identifier), exclusiveCapabilities: list(data.exclusiveCapabilities, "Exclusive capabilities", identifier),
        permissions: list(data.permissions, "Permissions", item => choice(item, PERMISSIONS, "Permission")),
        requiredPatches: list(data.requiredPatches, "Required patches", item => checkedText(item, "Patch anchor", 500)),
        incompatibleWith: list(data.incompatibleWith, "Incompatibilities", identifier), entrypoints,
        provenance: { source: checkedHttps(source.source, "Source"), revision: checkedText(source.revision, "Source revision") },
        integrity: { algorithm: "sha256", digest: integrity.digest },
        ...(data.updateSource === undefined ? {} : { updateSource: checkedHttps(data.updateSource, "Update source") }),
        ...(data.networkOrigins === undefined ? {} : { networkOrigins: parseNetworkOrigins(data.networkOrigins) }),
        ...(data.presentation === undefined ? {} : { presentation: parsePresentation(data.presentation) }),
        ...(discordBuild ? { discordBuild } : {})
    };
    if (!manifest.platforms.length) throw new Error("At least one platform is required.");
    if (manifest.dependencies.some(dep => dep.id === manifest.id) || manifest.optionalDependencies.some(dep => dep.id === manifest.id)) throw new Error("A plugin cannot depend on itself.");
    if (manifest.dependencies.some(dep => manifest.optionalDependencies.some(optional => optional.id === dep.id))) throw new Error("A dependency cannot be both required and optional.");
    if (manifest.exclusiveCapabilities.some(capability => !manifest.capabilities.includes(capability))) throw new Error("Exclusive capabilities must also be declared capabilities.");
    if (manifest.loadingMode === "runtime" && (manifest.requiredPatches.length || manifest.permissions.some(permission => ["native", "filesystem", "process"].includes(permission))))
        throw new Error("Runtime plugins cannot declare early patches or native execution. Use the reviewed build workflow.");
    if (manifest.platforms.some(platform => ["chrome", "edge", "firefox"].includes(platform)) && !manifest.entrypoints.browser) throw new Error("Browser platforms require a browser entry point.");
    if (manifest.platforms.some(platform => ["windows", "linux", "macos"].includes(platform)) && !manifest.entrypoints.desktop) throw new Error("Desktop platforms require a desktop entry point.");
    validatePresentationRuntime(manifest);
    return manifest;
}
