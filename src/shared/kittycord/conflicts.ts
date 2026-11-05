/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginDependency, PluginLoadingMode, PluginPlatform } from "./manifest";
import { compareVersions, versionInInterval } from "./versions";

export interface ConflictPlugin {
    id: string;
    version?: string;
    dependencies: Pick<PluginDependency, "id">[] | PluginDependency[];
    optionalDependencies?: PluginDependency[];
    requiredPatches?: string[];
    incompatibleWith?: string[];
    exclusiveCapabilities?: string[];
    platforms?: PluginPlatform[];
    minApiVersion?: string;
    loadingMode?: PluginLoadingMode;
}
export interface ConflictFinding {
    classification: "Confirmed conflict" | "Likely conflict" | "Potential overlap";
    code: string;
    plugins: string[];
    message: string;
    remediation: string;
}

export function analyzePluginConflicts(plugins: readonly ConflictPlugin[], context?: { platform: PluginPlatform; apiVersion: string; }): ConflictFinding[] {
    if (plugins.length > 2048) throw new Error("Plugin analysis is limited to 2048 entries.");
    const findings: ConflictFinding[] = [];
    const byId = new Map<string, ConflictPlugin>();
    const anchors = new Map<string, string[]>();
    const exclusive = new Map<string, string[]>();
    const requirements = new Map<string, { owner: string; minVersion: string; maxVersionExclusive?: string; }[]>();
    const add = (code: string, ids: string[], message: string, remediation: string, classification: ConflictFinding["classification"] = "Confirmed conflict") => {
        findings.push({ code, classification, plugins: ids, message, remediation });
    };
    for (const plugin of plugins) {
        const key = plugin.id.toLowerCase();
        const previous = byId.get(key);
        if (previous) add("duplicate-id", [previous.id, plugin.id], "Multiple plugins claim the same identifier.", "Keep one reviewed implementation or assign a new identifier with an explicit settings migration.");
        else byId.set(key, plugin);
        if (context && plugin.platforms && !plugin.platforms.includes(context.platform)) add("platform", [plugin.id], "The plugin does not support this platform.", "Use a supported platform or a reviewed packaged build.");
        if (context && plugin.minApiVersion && compareVersions(context.apiVersion, plugin.minApiVersion) < 0) add("api-version", [plugin.id], "The plugin requires a newer Kittycord API.", "Upgrade through a verified release or choose a compatible plugin version.");
        if (plugin.loadingMode === "quarantined" || plugin.loadingMode === "unsupported") add("blocked-mode", [plugin.id], "The plugin is blocked or unsupported.", "Do not activate it until its trust and compatibility findings are resolved.");
        for (const anchor of plugin.requiredPatches ?? []) anchors.set(anchor, [...(anchors.get(anchor) ?? []), plugin.id]);
        for (const capability of plugin.exclusiveCapabilities ?? []) exclusive.set(capability, [...(exclusive.get(capability) ?? []), plugin.id]);
    }
    for (const plugin of plugins) {
        for (const [dependencies, optional] of [[plugin.dependencies, false], [plugin.optionalDependencies ?? [], true]] as const) {
            for (const dependency of dependencies) {
                if (!optional && "minVersion" in dependency) {
                    const key = dependency.id.toLowerCase();
                    requirements.set(key, [...(requirements.get(key) ?? []), { owner: plugin.id, minVersion: dependency.minVersion, maxVersionExclusive: dependency.maxVersionExclusive }]);
                }
                const found = byId.get(dependency.id.toLowerCase());
                if (!found) {
                    if (!optional) add("missing-dependency", [plugin.id, dependency.id], "A required dependency is missing.", "Install the required compatible dependency before activation.");
                } else if ("minVersion" in dependency) {
                    if (!found.version) add("unknown-version", [plugin.id, found.id], "A dependency version cannot be verified.", "Review the built-in API contract or provide versioned metadata.", "Potential overlap");
                    else if (!versionInInterval(found.version, dependency)) add("dependency-version", [plugin.id, found.id], "The installed dependency is outside the requested version interval.", "Choose versions whose declared dependency intervals agree.");
                }
            }
        }
        for (const id of plugin.incompatibleWith ?? []) {
            const found = byId.get(id.toLowerCase());
            if (found) add("incompatible", [plugin.id, found.id], "The plugin declares an incompatible combination.", "Disable one of the affected plugins before activation.");
        }
    }
    for (const [id, intervals] of requirements) {
        let minimum = intervals[0].minVersion;
        let maximum: string | undefined;
        for (const interval of intervals) {
            if (compareVersions(interval.minVersion, minimum) > 0) minimum = interval.minVersion;
            if (interval.maxVersionExclusive && (!maximum || compareVersions(interval.maxVersionExclusive, maximum) < 0)) maximum = interval.maxVersionExclusive;
        }
        if (maximum && compareVersions(minimum, maximum) >= 0)
            add("incompatible-requirements", [...new Set(intervals.map(interval => interval.owner)), id], "Required dependency version intervals cannot be satisfied together.", "Choose plugin versions that share a compatible dependency interval.");
    }
    const visited = new Set<string>();
    const path: string[] = [];
    const active = new Set<string>();
    function visit(key: string) {
        if (active.has(key)) {
            add("dependency-cycle", path.slice(path.indexOf(key)), "Required dependencies contain a cycle.", "Remove the circular dependency before activation.");
            return;
        }
        if (visited.has(key)) return;
        visited.add(key);
        active.add(key);
        path.push(key);
        for (const dependency of byId.get(key)?.dependencies ?? []) if (byId.has(dependency.id.toLowerCase())) visit(dependency.id.toLowerCase());
        path.pop();
        active.delete(key);
    }
    for (const key of byId.keys()) visit(key);
    for (const ids of anchors.values()) if (ids.length > 1) add("patch-overlap", ids, "Plugins target the same declared patch anchor.", "Review replacement order and test the combination. Shared anchors alone do not prove a conflict.", "Potential overlap");
    for (const ids of exclusive.values()) if (ids.length > 1) add("exclusive-capability", ids, "Plugins claim the same exclusive behavior.", "Enable only one provider of this exclusive behavior.");
    return findings;
}
