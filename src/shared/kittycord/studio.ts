/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createAuthoredPackage, createDesktopPackage, createUtilityPackage, starterPluginSource } from "./authoring";
import { DESKTOP_PERMISSIONS, desktopApiDeclarations, desktopStarterSource, isDesktopPlugin, parseNetworkOrigins } from "./desktopPlugin";
import { verifyExternalPackage } from "./javascriptPackage";
import { checkedObject, checkedPluginIdentifier, checkedText, checkedVersion, type PluginPermission } from "./manifest";
import { parsePresentation, type PluginPresentation } from "./presentation";
import { parseThemeArtifact, THEME_TOKENS } from "./themePackage";
import { utilityStarterSource } from "./utility";

export interface StudioProject {
    schemaVersion: 1; kind: "kittycord-studio"; language: "javascript" | "typescript" | "declarative";
    metadata: { id: string; name: string; version: string; author: string; };
    source: string; tokens: string[];
    api?: "utility-v1" | "desktop-v1";
    permissions?: PluginPermission[];
    networkOrigins?: string[];
    presentation?: PluginPresentation;
    description?: string;
    tests: { token: string; equals: string; }[];
}
export interface BuilderBlock { id: string; token: string; color: string; }
export interface BuilderDocument { schemaVersion: 1; kind: "kittycord-builder"; blocks: BuilderBlock[]; }
export const STUDIO_LIMIT = 131_072;
export const STUDIO_PROJECT_LIMIT = STUDIO_LIMIT;
export function studioTypeDeclarations(tokens: readonly string[] = THEME_TOKENS, utility = false, desktop = false) {
    if (desktop) return desktopApiDeclarations;
    if (utility) return `type UtilityValue = string | number | boolean;
interface KittyPluginApi {
    readonly settings: Readonly<Record<string, UtilityValue>>;
    publishPanel(panel: {title:string;text:string;actions:{id:string;label:string}[];settings:{id:string;label:string;type:"text"|"number"|"boolean";default:UtilityValue;min?:number;max?:number}[]}):void;
    onAction(callback:(id:string)=>void|Promise<void>):void;
    onSettings(callback:(values:Readonly<Record<string,UtilityValue>>)=>void|Promise<void>):void;
    checkpoint(state:unknown):void;
}
interface KittyPlugin { start(api:KittyPluginApi, previousState?:unknown):void|Promise<void>; }
declare var kittycordPlugin:KittyPlugin;`;
    if (!tokens.length || tokens.some(token => !THEME_TOKENS.some(known => known === token))) throw new Error("Unsupported compiler token declaration.");
    return `type KittyColorToken = ${tokens.map(token => JSON.stringify(token)).join(" | ")};
interface KittyPluginApi { setColors(colors: Partial<Record<KittyColorToken, string>>): void; checkpoint(state: unknown): void; }
interface KittyPlugin { start(api: KittyPluginApi, previousState?: unknown): void | Promise<void>; }
declare var kittycordPlugin: KittyPlugin;
`;
}

export const studioApiDeclarations = studioTypeDeclarations();

export function newStudioProject(): StudioProject {
    return { schemaVersion: 1, kind: "kittycord-studio", language: "javascript", metadata: { id: "local.my-plugin", name: "My Kittycord Plugin", version: "1.0.0", author: "Local author" }, source: starterPluginSource, tokens: ["--brand-500"], tests: [{ token: "--brand-500", equals: "#b783df" }] };
}

export function newUtilityProject(): StudioProject {
    return { ...newStudioProject(), api: "utility-v1", source: utilityStarterSource, tokens: [], tests: [], metadata: { id: "local.focus-sessions", name: "Focus Sessions", version: "1.0.0", author: "Local author" } };
}

export function newDesktopProject(): StudioProject {
    return { ...newUtilityProject(), api: "desktop-v1", source: desktopStarterSource, permissions: ["settings", "events", "discord", "interface"], networkOrigins: [], metadata: { id: "local.channel-companion", name: "Channel companion", version: "1.0.0", author: "xtufa7" }, presentation: { contentType: "plugin", category: "Utilities", icon: "search", github: { username: "xtufa7" }, readme: "# Channel companion\n\nAdds an Inspect button to the channel header. Open Local settings to see the selected channel and loaded message count. Source is editable in Studio. Requires Discord data and interface permissions." } };
}

export function newTextToolboxProject(): StudioProject {
    return { ...newUtilityProject(), metadata: { id: "local.text-toolbox", name: "Text Toolbox", version: "1.0.0", author: "Local author" }, source: `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({
    start(api) {
        let result = "Enter text in settings, then analyze it locally.";
        const show = () => api.publishPanel({title:"Text Toolbox",text:result,actions:[{id:"analyze",label:"Analyze text"},{id:"clear",label:"Clear result"}],settings:[{id:"text",label:"Text to analyze locally",type:"text",default:""}]});
        api.onAction(id => { if(id === "analyze") { const text = String(api.settings.text ?? ""); const words = text.match(/[\\p{L}\\p{N}]+/gu) ?? []; result = "Characters: " + Array.from(text).length + ". Words: " + words.length + ". Unique words: " + new Set(words.map(word => word.toLowerCase())).size; } else if(id === "clear") result = "Result cleared."; show(); });
        api.onSettings(() => { result = "Settings saved locally. Choose Analyze text."; show(); }); show();
    }
});` };
}

export function parseStudioProject(value: unknown): StudioProject {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > STUDIO_LIMIT) throw new Error("Studio project exceeds 128 KiB.");
    const data = checkedObject(value, ["schemaVersion", "kind", "language", "metadata", "source", "tokens", "tests", "api", "presentation", "description", "permissions", "networkOrigins"], "Studio project");
    if (data.api !== undefined && data.api !== "utility-v1" && data.api !== "desktop-v1") throw new Error("Unsupported Studio runtime API.");
    let desktop: { api: "desktop-v1"; permissions: PluginPermission[]; networkOrigins: string[]; } | undefined;
    if (data.api === "desktop-v1") {
        if (!Array.isArray(data.permissions) || data.permissions.some(value => !DESKTOP_PERMISSIONS.includes(value)) || new Set(data.permissions).size !== data.permissions.length || !data.permissions.includes("settings") || !data.permissions.includes("events")) throw new Error("Select supported desktop plugin permissions, including settings and actions.");
        desktop = { api: "desktop-v1", permissions: data.permissions as PluginPermission[], networkOrigins: parseNetworkOrigins(data.networkOrigins ?? []) };
    } else if (data.permissions !== undefined || data.networkOrigins !== undefined) throw new Error("Host permissions belong to a Desktop plugin project.");
    if (data.api && data.language === "declarative") throw new Error("Utility projects use JavaScript or TypeScript.");
    if (data.language === "theme-tokens") {
        if (typeof data.source !== "string") throw new Error("Legacy theme source must be a JSON string.");
        const blocks = Object.entries(parseThemeArtifact(data.source)).map(([token, color], index) => ({ id: `legacy-${index}`, token, color }));
        return parseStudioProject({ ...data, language: "declarative", source: JSON.stringify({ schemaVersion: 1, kind: "kittycord-builder", blocks }) });
    }
    if (data.schemaVersion !== 1 || data.kind !== "kittycord-studio" || !["javascript", "typescript", "declarative"].includes(String(data.language))) throw new Error("Unsupported Studio project format or language.");
    if (typeof data.source !== "string" || !data.source.trim() || new TextEncoder().encode(data.source).byteLength > 65_536) throw new Error("Project source must be nonempty and at most 64 KiB.");
    if (!Array.isArray(data.tokens) || !data.api && !data.tokens.length || data.api && data.tokens.length || data.tokens.length > THEME_TOKENS.length || new Set(data.tokens).size !== data.tokens.length || data.tokens.some(token => !THEME_TOKENS.some(known => known === token))) throw new Error("Declare supported color tokens, or no tokens for utility projects.");
    const metadata = checkedObject(data.metadata, ["id", "name", "version", "author"], "Project metadata");
    const inputTests = data.tests ?? [];
    if (!Array.isArray(inputTests) || inputTests.length > 16) throw new Error("Projects support at most 16 declarative color assertions.");
    const tests = inputTests.map(value => {
        const item = checkedObject(value, ["token", "equals"], "Studio assertion");
        if (typeof item.token !== "string" || !Array.isArray(data.tokens) || !data.tokens.includes(item.token) || typeof item.equals !== "string" || !/^#[a-f0-9]{6}$/i.test(item.equals)) throw new Error("Assertions must target a declared color token with a hexadecimal value.");
        return { token: item.token, equals: item.equals.toLowerCase() };
    });
    return { schemaVersion: 1, kind: "kittycord-studio", language: data.language as StudioProject["language"], source: data.source, tokens: [...data.tokens] as string[], tests, ...(desktop ?? (data.api ? { api: "utility-v1" as const } : {})),
        metadata: { id: checkedPluginIdentifier(metadata.id), name: checkedText(metadata.name, "Project name"), version: checkedVersion(metadata.version, "Project version"), author: checkedText(metadata.author, "Project author") }, ...(data.presentation === undefined ? {} : { presentation: parsePresentation(data.presentation) }), ...(data.description === undefined ? {} : { description: checkedText(data.description, "Description", 500) }) };
}

export async function importStudioProject(value: unknown): Promise<StudioProject> {
    if (!value || typeof value !== "object" || !("manifest" in value) || !("artifact" in value)) return parseStudioProject(value);
    const bundle = await verifyExternalPackage(value);
    const { manifest } = bundle;
    const metadata = { id: manifest.id, name: manifest.name, version: manifest.version, author: manifest.author };
    const desktop = isDesktopPlugin(manifest);
    const utility = desktop || manifest.capabilities.includes("kittycord.utility-js.v1");
    const tokens = utility ? [] : manifest.exclusiveCapabilities.filter(capability => capability.startsWith("theme.")).map(capability => `--${capability.slice(6)}`);
    const { presentation } = manifest;
    const { description } = manifest;
    if (manifest.entrypoints.desktop === "theme.json") {
        const blocks = Object.entries(parseThemeArtifact(bundle.artifact)).map(([token, color], index) => ({ id: `imported-${index}`, token, color }));
        return parseStudioProject({ ...builderProject({ schemaVersion: 1, kind: "kittycord-builder", blocks }, metadata), presentation, description });
    }
    return parseStudioProject({ schemaVersion: 1, kind: "kittycord-studio", language: "javascript", metadata, source: bundle.artifact, tokens, tests: [], ...(desktop ? { api: "desktop-v1", permissions: manifest.permissions, networkOrigins: manifest.networkOrigins ?? [] } : utility ? { api: "utility-v1" } : {}), presentation, description });
}

export async function importStudioFile(file: { name: string; size: number; text(): Promise<string>; }): Promise<StudioProject> {
    if (file.size > STUDIO_LIMIT) throw new Error("Project exceeds 128 KiB.");
    const text = await file.text();
    if (/\.(?:js|ts)$/i.test(file.name)) {
        const stem = file.name.replace(/\.(?:js|ts)$/i, "");
        const id = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "my-plugin";
        const base = /\b(?:readDiscord|addButton|addStyle|loadScript|fetch)\s*\(/.test(text) ? newDesktopProject() : /\bsetColors\s*\(/.test(text) ? newStudioProject() : newUtilityProject();
        return parseStudioProject({ ...base, metadata: { ...base.metadata, id: `local.${id}`, name: stem.slice(0, 200) || "My plugin" }, language: /\.ts$/i.test(file.name) ? "typescript" : "javascript", source: text });
    }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new Error("Choose a Studio project, plugin package, JavaScript or TypeScript file."); }
    return importStudioProject(value);
}

export function parseBuilderDocument(value: unknown): BuilderDocument {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8192) throw new Error("Builder document exceeds 8 KiB.");
    const data = checkedObject(value, ["schemaVersion", "kind", "blocks"], "Builder document");
    if (data.schemaVersion !== 1 || data.kind !== "kittycord-builder" || !Array.isArray(data.blocks) || !data.blocks.length || data.blocks.length > THEME_TOKENS.length) throw new Error("Add between one and ten color blocks.");
    const blocks = data.blocks.map(value => {
        const block = checkedObject(value, ["id", "token", "color"], "Color block");
        const id = checkedPluginIdentifier(block.id);
        const colors = parseThemeArtifact(JSON.stringify({ schemaVersion: 1, kind: "theme-tokens", colors: { [String(block.token)]: block.color } }));
        return { id, token: Object.keys(colors)[0], color: Object.values(colors)[0] };
    });
    if (new Set(blocks.map(block => block.id)).size !== blocks.length || new Set(blocks.map(block => block.token)).size !== blocks.length) throw new Error("Block identifiers and color tokens must be unique.");
    return { schemaVersion: 1, kind: "kittycord-builder", blocks };
}

export function builderProject(document: BuilderDocument, metadata = newStudioProject().metadata): StudioProject {
    const parsed = parseBuilderDocument(document);
    return parseStudioProject({ schemaVersion: 1, kind: "kittycord-studio", language: "declarative", metadata, source: JSON.stringify(parsed, null, 4), tokens: parsed.blocks.map(block => block.token), tests: parsed.blocks.map(block => ({ token: block.token, equals: block.color })) });
}

export function builderToSource(document: BuilderDocument): string {
    const colors = Object.fromEntries(parseBuilderDocument(document).blocks.map(block => [block.token, block.color]));
    return `globalThis.kittycordPlugin = { start(api) { api.setColors(${JSON.stringify(colors)}); } };`;
}

async function buildProjectSource(input: unknown, emittedJavascript?: string) {
    const project = parseStudioProject(input);
    if (project.language === "declarative") {
        const document = parseBuilderDocument(JSON.parse(project.source));
        if (JSON.stringify([...project.tokens].sort()) !== JSON.stringify(document.blocks.map(block => block.token).sort())) throw new Error("Builder tokens do not match declared project tokens.");
        const colors = Object.fromEntries(document.blocks.map(block => [block.token, block.color]));
        const artifact = JSON.stringify({ schemaVersion: 1, kind: "theme-tokens", colors });
        const base = await createAuthoredPackage({ ...project.metadata, source: builderToSource(document), tokens: project.tokens });
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(artifact))), byte => byte.toString(16).padStart(2, "0")).join("");
        return verifyExternalPackage({ ...base, artifact, manifest: { ...base.manifest, description: "Locally authored declarative color plugin.", entrypoints: { desktop: "theme.json" }, capabilities: ["kittycord.theme-tokens.v1", ...base.manifest.exclusiveCapabilities], integrity: { algorithm: "sha256", digest } } });
    }
    if (project.language === "typescript" && !emittedJavascript) throw new Error("TypeScript needs a successful Studio or CLI compilation before packaging.");
    if (project.api === "desktop-v1") return createDesktopPackage({ ...project.metadata, source: emittedJavascript ?? project.source, permissions: project.permissions ?? [], networkOrigins: project.networkOrigins ?? [] });
    if (project.api === "utility-v1") return createUtilityPackage({ ...project.metadata, source: emittedJavascript ?? project.source });
    return createAuthoredPackage({ ...project.metadata, tokens: project.tokens, source: emittedJavascript ?? project.source });
}

export async function buildStudioPackage(input: unknown, emittedJavascript?: string) {
    const project = parseStudioProject(input);
    const bundle = await buildProjectSource(project, emittedJavascript);
    return verifyExternalPackage({ ...bundle, manifest: { ...bundle.manifest, ...(project.presentation ? { presentation: project.presentation } : {}), ...(project.description ? { description: project.description } : {}) } });
}
