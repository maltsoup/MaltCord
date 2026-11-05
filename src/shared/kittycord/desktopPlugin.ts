/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { PluginManifest, PluginPermission } from "./manifest";
import { checkedObject, checkedText } from "./validation";

export const DESKTOP_PLUGIN_API = "kittycord.desktop-js.v1";
export const DESKTOP_PERMISSIONS: readonly PluginPermission[] = ["settings", "events", "styles", "discord", "interface", "network", "scripts"];
export const DESKTOP_BUTTON_LOCATIONS = ["chat-input", "channel-header", "user-area"] as const;
export type DesktopButtonLocation = typeof DESKTOP_BUTTON_LOCATIONS[number];
export interface DesktopPluginBridge {
    attach(manifest: PluginManifest, send: (message: object) => void): { request(method: string, input: unknown): Promise<unknown>; dispose(): void | Promise<void>; };
}
export function isDesktopPlugin(manifest: Pick<PluginManifest, "capabilities">) { return manifest.capabilities.includes(DESKTOP_PLUGIN_API); }
export function parseNetworkOrigins(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 16) throw new Error("Declare at most 16 HTTPS origins.");
    const origins = value.map(input => {
        const text = checkedText(input, "Network origin", 256); const url = new URL(text);
        if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/" || !url.hostname.includes(".")
            || /^(?:localhost|.*\.localhost|.*\.local|.*\.internal|[\d.]+|\[.*\])$/i.test(url.hostname)) throw new Error("Use a public HTTPS origin such as https://raw.githubusercontent.com, without a path or credentials.");
        return url.origin;
    });
    if (new Set(origins).size !== origins.length) throw new Error("Network origins must be unique.");
    return origins;
}
export const desktopStarterSource = `globalThis.kittycordPlugin = {
    async start(api) {
        const show = async () => {
            const channel = await api.readDiscord("selectedChannel");
            const messages = await api.readDiscord("messages", { limit: 100 });
            api.publishPanel({ title: "Channel companion", text: "Channel: " + (channel?.name ?? "Direct messages") + ". Loaded messages: " + messages.length, actions: [{ id: "inspect", label: "Inspect current channel" }], settings: [] });
        };
        api.onAction(async id => { if (id === "inspect") await show(); });
        await api.addButton({ id: "inspect", label: "Channel companion", location: "channel-header", icon: "search" });
        await show();
    }
};`;

export const desktopApiDeclarations = `interface KittyPluginApi {
    readonly settings: Record<string, string | number | boolean>;
    publishPanel(panel: {title:string;text:string;actions:{id:string;label:string}[];settings:object[]}):void;
    onAction(listener:(id:string)=>unknown):void; onSettings(listener:(values:object)=>unknown):void;
    checkpoint(state:unknown):void;
    readDiscord<K extends keyof KittyDiscordData>(resource:K, options?:{channelId?:string;guildId?:string;limit?:number}):Promise<KittyDiscordData[K]>;
    addButton(button:{id:string;label:string;location:"chat-input"|"channel-header"|"user-area";icon?:"puzzle"|"search"|"code"|"clock"|"palette"|"shield"}):Promise<void>;
    addStyle(css:string):Promise<void>;
    fetch(url:string):Promise<{status:number;text:string;contentType:string}>;
    loadScript(url:string,sha256:string):Promise<void>;
}
interface KittyDiscordUser {id:string;username:string;displayName?:string;avatar?:string;}
interface KittyDiscordChannel {id:string;name:string;type:number;guildId?:string;topic?:string;}
interface KittyDiscordData {currentUser:KittyDiscordUser|null;selectedChannel:KittyDiscordChannel|null;guilds:{id:string;name:string;icon?:string}[];channels:KittyDiscordChannel[];messages:{id:string;channelId:string;content:string;author:KittyDiscordUser;attachments:{url:string;filename:string}[]}[];members:{id:string;nick?:string;roles:string[]}[];}
interface KittyPlugin { start(api:KittyPluginApi,previousState?:unknown):void|Promise<void>; }
declare var kittycordPlugin:KittyPlugin;
`;

export function previewDesktopRequest(method: unknown, input: unknown): unknown {
    const request = checkedObject(input, ["resource", "channelId", "guildId", "limit", "id", "label", "location", "icon", "css", "url"], "Preview request");
    if (method === "discord") {
        if (request.resource === "selectedChannel") return { id: "100000000000000000", name: "studio-preview", type: 0 };
        if (request.resource === "currentUser") return null;
        if (["guilds", "channels", "members", "messages"].includes(String(request.resource))) return [];
        throw new Error("Choose a supported Discord resource.");
    }
    if (method === "button" || method === "styles") return;
    throw new Error("Preview does not download resources. Test network scripts after installing to Local.");
}
