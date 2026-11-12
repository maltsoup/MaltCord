/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject, checkedPluginIdentifier, checkedText, checkedVersion } from "./manifest";
import { quickActionsProject } from "./nativeQuickActions";
import { safeDeafenProject } from "./nativeVoiceProject";
import { CONTENT_TYPES, type ContentType } from "./presentation";

export const nativeStudioModules = [
    "@utils/types", "@utils/constants", "@utils/Logger", "@utils/misc", "@utils/css", "@utils/text", "@utils/react", "@utils/lazy", "@utils/discord", "@utils/modal", "@api/KittycordVoice",
    "@webpack", "@webpack/common", "@webpack/patcher", "@api/Settings", "@api/PluginManager", "@api/DataStore", "@api/Styles", "@api/Notifications", "@api/Notices", "@api/Commands", "@api/ContextMenu", "@api/ChatButtons", "@api/HeaderBar", "@api/UserArea", "@api/Badges", "@api/MessageEvents", "@api/MessageAccessories", "@api/MessageDecorations", "@api/MessagePopover", "@api/NicknameIcons", "@api/MemberListDecorators", "@api/ProfileCollections", "@api/ProfileSections", "@api/AudioPlayer", "@api/PluginHealth", "@api/KittycordLegacyStudio",
    "@components/Button", "@components/Heading", "@components/Paragraph", "@components/Icons", "@components/Link", "@components/Switch", "@components/Card", "@components/ErrorBoundary"
] as const;
export interface NativeStudioProject {
    schemaVersion: 1; kind: "kittencord-native-studio";
    metadata: { id: string; name: string; version: string; author: string; contentType?: ContentType; };
    entry: string; files: Record<string, string>;
}
export interface NativeDiagnostic { stage: "validation" | "compilation"; message: string; file?: string; line?: number; column?: number; }
export interface NativeCompilation { project: NativeStudioProject; code: string; digest: string; imports: string[]; diagnostics: NativeDiagnostic[]; compilerVersion: string; }
export type NativeStage = "registration" | "activation" | "webpack" | "patches" | "cleanup";
export interface NativePluginStatus { id: string; name: string; version?: string; contentType?: ContentType; registered: boolean; running: boolean; reloadRequired: boolean; stages: Partial<Record<NativeStage, string>>; error?: string; stack?: string; }
export function nativeProject(value: unknown): NativeStudioProject {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 1_048_576) throw new Error("Native projects are limited to 1 MiB.");
    const data = checkedObject(value, ["schemaVersion", "kind", "metadata", "entry", "files"], "Native Studio project");
    if (data.schemaVersion !== 1 || data.kind !== "kittencord-native-studio") throw new Error("Choose a native Studio project.");
    const metadata = checkedObject(data.metadata, ["id", "name", "version", "author", "contentType"], "Native project metadata");
    const contentType = CONTENT_TYPES.find(type => type === metadata.contentType);
    if (metadata.contentType !== undefined && !contentType) throw new Error("Choose a supported native content type.");
    const files = checkedObject(data.files, data.files && typeof data.files === "object" ? Object.keys(data.files) : [], "Native source files");
    if (!Object.keys(files).length || Object.keys(files).length > 32) throw new Error("Native projects need between one and 32 source files.");
    for (const [name, source] of Object.entries(files)) {
        if (!/^[a-z\d_.\-/]+\.(?:[cm]?[jt]sx?|css|json)$/i.test(name) || name.startsWith("/") || name.split("/").some(part => !part || part === "." || part === "..") || name.length > 160) throw new Error(`Invalid project-relative source path: ${name}.`);
        if (typeof source !== "string" || source.length > 262144) throw new Error(`Source file is too large: ${name}.`);
    }
    if (typeof data.entry !== "string" || !Object.hasOwn(files, data.entry) || !/\.[jt]sx?$/i.test(data.entry)) throw new Error("Select a JavaScript, TypeScript, JSX or TSX entry in this project.");
    return { schemaVersion: 1, kind: "kittencord-native-studio", metadata: { id: checkedPluginIdentifier(metadata.id), name: checkedText(metadata.name, "Plugin name", 100), version: checkedVersion(metadata.version, "Plugin version"), author: checkedText(metadata.author, "Plugin author"), ...(contentType ? { contentType } : {}) }, entry: data.entry, files: Object.fromEntries(Object.entries(files).map(([name, source]) => [name, String(source)])) };
}
export function isNativeProject(value: unknown): value is NativeStudioProject { return !!value && typeof value === "object" && "kind" in value && value.kind === "kittencord-native-studio"; }
export function newNativeProject(example: "basic" | "ui" | "webpack" | "patch" | "settings" | "safe-deafen" | "quick-actions" = "ui"): NativeStudioProject {
    if (example === "quick-actions") return quickActionsProject();
    if (example === "safe-deafen") return safeDeafenProject();
    const names = { basic: "StudioBasic", ui: "StudioToolbar", webpack: "StudioWebpack", patch: "StudioPatch", settings: "StudioSettings" };
    const common = "import definePlugin from \"@utils/types\";\nimport { Devs } from \"@utils/constants\";\nimport { Logger } from \"@utils/Logger\";\n";
    const source = example === "settings" ? `${common}import { OptionType } from "@utils/types";\nimport { definePluginSettings } from "@api/Settings";\nimport { ChannelToolbarButton } from "@api/HeaderBar";\nimport { KittycordIcon } from "@components/Icons";\nimport { React, showToast, Toasts } from "@webpack/common";\n\nconst settings = definePluginSettings({\n    showGreeting: { type: OptionType.BOOLEAN, description: "Show a greeting when the toolbar button is pressed.", default: true },\n    message: { type: OptionType.STRING, description: "Greeting text.", default: "Hello from MaltCord!" }\n});\n\nexport default definePlugin({\n    name: "StudioSettings", description: "A native toolbar button with persistent plugin settings.", authors: [Devs.Kittencord], settings,\n    headerBarButton: { location: "channeltoolbar", render: () => <ChannelToolbarButton icon={KittycordIcon} tooltip="Studio greeting" onClick={() => { if (settings.store.showGreeting) showToast(settings.store.message, Toasts.Type.SUCCESS); }} /> },\n    start() { new Logger("StudioSettings").info("Settings example started."); },\n    stop() { new Logger("StudioSettings").info("Settings example stopped."); }\n});\n`
        : example === "ui" ? `${common}import { ChannelToolbarButton } from "@api/HeaderBar";\nimport { KittycordIcon } from "@components/Icons";\nimport { React, showToast, Toasts } from "@webpack/common";\n\nexport default definePlugin({\n    name: "StudioToolbar",\n    description: "A real native toolbar button, removed by PluginManager on stop.",\n    authors: [Devs.Kittencord],\n    dependencies: ["HeaderBarAPI"],\n    headerBarButton: { location: "channeltoolbar", render: () => <ChannelToolbarButton icon={KittycordIcon} tooltip="Native Studio is running" onClick={() => showToast("Hello from the native plugin engine!", Toasts.Type.SUCCESS)} /> },\n    start() { new Logger("StudioToolbar").info("Native UI plugin started."); },\n    stop() { new Logger("StudioToolbar").info("Native UI plugin stopped."); }\n});\n`
        : example === "webpack" ? `${common}import { findByProps } from "@webpack";\n\nexport default definePlugin({\n    name: "StudioWebpack", description: "Read-only access through the existing webpack finder.", authors: [Devs.Kittencord],\n    start() {\n        const store = findByProps("getCurrentUser", "getUser");\n        if (!store || typeof store.getCurrentUser !== "function") throw new Error("The user-store module was not found.");\n        new Logger("StudioWebpack").info("Read-only module access succeeded.", typeof store.getCurrentUser);\n    },\n    stop() { new Logger("StudioWebpack").info("Stopped."); }\n});\n`
            : example === "patch" ? `${common}\nexport default definePlugin({\n    name: "StudioPatch", description: "Developer example for source patches. Needs a client reload.", authors: [Devs.Kittencord],\n    patches: [{ find: "KITTENCORD_NATIVE_PATCH_FIXTURE", replacement: { match: /"native-before"/, replace: '"native-after"' } }],\n});\n`
                : `${common}\nexport default definePlugin({\n    name: "StudioBasic", description: "Native lifecycle example.", authors: [Devs.Kittencord],\n    start() { new Logger("StudioBasic").info("Started through PluginManager."); },\n    stop() { new Logger("StudioBasic").info("Stopped through PluginManager."); }\n});\n`;
    return { schemaVersion: 1, kind: "kittencord-native-studio", metadata: { id: `local.native.${example}`, name: names[example], version: "1.0.0", author: "xtufa7" }, entry: "index.tsx", files: { "index.tsx": source } };
}

export function newNativeAppearanceProject(kind: "theme" | "snippet"): NativeStudioProject {
    const name = kind === "theme" ? "KittenSurfaces" : "KittenCompactControls";
    const css = kind === "theme"
        ? ".kc-premium-settings .kc-tools-card { background: color-mix(in srgb, var(--background-secondary) 94%, var(--text-normal) 6%); border-color: color-mix(in srgb, var(--text-normal) 18%, transparent); }\n.kc-premium-settings .kc-tool-header { border-bottom: 1px solid var(--border-subtle); padding-bottom: 16px; }\n"
        : ".kc-premium-settings .vc-btn-base { border-radius: 6px; min-height: 30px; }\n.kc-premium-settings .kc-tools-actions { gap: 6px; }\n";
    return nativeProject({ schemaVersion: 1, kind: "kittencord-native-studio", metadata: { id: `local.kitten.${kind}`, name, version: "1.0.0", author: "xtufa7", contentType: kind === "theme" ? "theme" : "ui-customization" }, entry: "index.ts", files: {
        "index.ts": `import definePlugin from "@utils/types";\nimport { Devs } from "@utils/constants";\nimport style from "./appearance.css";\n\nexport default definePlugin({\n    name: "${name}",\n    description: "${kind === "theme" ? "Subtle MaltCord surfaces that follow your Discord theme." : "Compact MaltCord controls with gently rounded corners."}",\n    authors: [Devs.Kittencord],\n    managedStyle: style,\n});\n`,
        "appearance.css": css
    } });
}
