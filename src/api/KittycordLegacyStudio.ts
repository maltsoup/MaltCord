/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordDesktop } from "@api/KittycordDesktop";
import { KittycordUtility } from "@api/KittycordUtility";
import { PluginHealth } from "@api/PluginHealth";
import { stopPlugin } from "@api/PluginManager";
import { createPluginResources } from "@shared/kittycord/resources";
import { buildStudioPackage, parseStudioProject } from "@shared/kittycord/studio";
import { defineThemePackage } from "@shared/kittycord/themePackage";
import { Devs } from "@utils/constants";
import { defineIsolatedJavascript } from "@utils/isolatedPlugin";
import definePlugin from "@utils/types";

export function legacyStudioPlugin(input: unknown) {
    const project = parseStudioProject(input);
    let resources: ReturnType<typeof createPluginResources> | undefined;
    let capture: (() => unknown) | undefined;
    let previous: unknown;
    const plugin = definePlugin({
        name: project.metadata.name, description: project.description ?? "Preserved legacy Studio project using its existing isolated API.", authors: [Devs.Kittencord],
        dependencies: ["HeaderBarAPI", "ChatInputButtonAPI", "UserAreaAPI"],
        async start() {
            const bundle = await buildStudioPackage(project);
            resources = createPluginResources();
            const definition = bundle.manifest.entrypoints.desktop === "theme.json" ? defineThemePackage(bundle, document) : defineIsolatedJavascript(bundle, document, () => { PluginHealth.recordRuntimeError(plugin.name, "legacy worker", new Error("Legacy Studio worker failed.")); queueMicrotask(() => stopPlugin(plugin)); }, VencordNative.sandbox, KittycordUtility.bridge, KittycordDesktop.bridge);
            capture = definition.captureState;
            await definition.start({ resources, previousState: previous, signal: new AbortController().signal });
        },
        async stop() { previous = capture?.(); const report = await resources?.dispose(); if (report?.errors.length) throw new AggregateError(report.errors, "Legacy project cleanup failed."); }
    });
    return plugin;
}
