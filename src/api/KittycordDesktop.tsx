/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addChatBarButton, ChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import { addChannelToolbarButton, ChannelToolbarButton, removeChannelToolbarButton } from "@api/HeaderBar";
import { addUserAreaButton, removeUserAreaButton, UserAreaButton } from "@api/UserArea";
import { ClockIcon, CodeIcon, PaintbrushIcon, PluginsIcon, SearchIcon, ShieldIcon } from "@components/Icons";
import { DESKTOP_BUTTON_LOCATIONS, type DesktopPluginBridge } from "@shared/kittycord/desktopPlugin";
import { checkedObject, checkedPluginIdentifier, checkedText } from "@shared/kittycord/manifest";
import { ChannelStore, GuildChannelStore, GuildMemberStore, GuildStore, MessageStore, React, SelectedChannelStore, UserStore } from "@webpack/common";

const icons = { puzzle: PluginsIcon, search: SearchIcon, code: CodeIcon, clock: ClockIcon, palette: PaintbrushIcon, shield: ShieldIcon };
function channelData(channel: { id: string; name?: string | null; type: number; guild_id?: string | null; topic?: string | null; } | undefined) {
    return channel ? { id: channel.id, name: channel.name ?? "Direct messages", type: channel.type, guildId: channel.guild_id ?? undefined, topic: channel.topic ?? undefined } : null;
}
function userData(user: { id: string; username: string; globalName?: string | null; avatar?: string | null; } | undefined) {
    return user ? { id: user.id, username: user.username, displayName: user.globalName ?? user.username, avatar: user.avatar ?? undefined } : null;
}
export function readPluginDiscordData(input: unknown) {
    const data = checkedObject(input, ["resource", "channelId", "guildId", "limit"], "Discord data request");
    for (const key of ["channelId", "guildId"]) if (data[key] !== undefined && (typeof data[key] !== "string" || !/^\d{16,22}$/.test(data[key]))) throw new Error("Use a valid Discord channel or server identifier.");
    const limit = data.limit === undefined ? 50 : data.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Choose a data limit from 1 to 200.");
    const channelId = typeof data.channelId === "string" ? data.channelId : SelectedChannelStore.getChannelId();
    const channel = channelId ? ChannelStore.getChannel(channelId) : undefined;
    const guildId = typeof data.guildId === "string" ? data.guildId : channel?.guild_id;
    switch (data.resource) {
        case "currentUser": return userData(UserStore.getCurrentUser());
        case "selectedChannel": return channelData(channel);
        case "guilds": return Object.values(GuildStore.getGuilds()).slice(0, limit).map(guild => ({ id: guild.id, name: guild.name, icon: guild.icon }));
        case "channels": return (guildId ? [...GuildChannelStore.getChannels(guildId).SELECTABLE, ...GuildChannelStore.getChannels(guildId).VOCAL].map(item => item.channel) : ChannelStore.getSortedPrivateChannels()).slice(0, limit).map(channelData);
        case "members": return guildId ? GuildMemberStore.getMembers(guildId).slice(0, limit).map(member => ({ id: member.userId, nick: member.nick, roles: [...member.roles] })) : [];
        case "messages": return channelId && channel ? MessageStore.getMessages(channelId)._array.slice(-limit).map(message => ({ id: message.id, channelId: message.channel_id, content: message.content.slice(0, 4000), author: userData(message.author), attachments: message.attachments.slice(0, 10).map(attachment => ({ url: attachment.url, filename: attachment.filename })) })) : [];
        default: throw new Error("Choose currentUser, selectedChannel, guilds, channels, members or messages.");
    }
}

export const KittycordDesktop = { bridge: { attach(manifest, send) {
    let disposed = false;
    let disposal: Promise<void> | undefined;
    const buttons = new Map<string, () => void>();
    const token = crypto.randomUUID().replaceAll("-", "");
    const style = document.createElement("style"); style.dataset.kittencordDesktopPlugin = manifest.id;
    function requirePermission(permission: string) {
        if (disposed) throw new Error("This desktop plugin has stopped.");
        if (!manifest.permissions.some(item => item === permission)) throw new Error(`Enable the declared ${permission} permission for this plugin.`);
    }
    return {
        async request(method, input) {
            if (method === "discord") { requirePermission("discord"); return readPluginDiscordData(input); }
            if (method === "button") {
                requirePermission("interface");
                const data = checkedObject(input, ["id", "label", "location", "icon"], "Discord button");
                const id = checkedPluginIdentifier(data.id); const label = checkedText(data.label, "Button label", 70);
                if (!DESKTOP_BUTTON_LOCATIONS.some(location => location === data.location)) throw new Error("Choose chat-input, channel-header or user-area for the button.");
                const icon = data.icon === undefined ? "puzzle" : data.icon;
                if (typeof icon !== "string" || !Object.hasOwn(icons, icon)) throw new Error("Choose a supported button icon.");
                if (!buttons.has(id) && buttons.size >= 6) throw new Error("A desktop plugin can own at most six Discord buttons.");
                const Icon = icons[icon as keyof typeof icons]; const key = `kittencord-local:${manifest.id}:${id}`;
                const onClick = () => { if (!disposed) send({ type: "action", id }); };
                buttons.get(id)?.();
                if (data.location === "channel-header") { addChannelToolbarButton(key, () => <ChannelToolbarButton icon={Icon} tooltip={label} aria-label={label} onClick={onClick} />); buttons.set(id, () => removeChannelToolbarButton(key)); }
                else if (data.location === "user-area") { addUserAreaButton(key, () => <UserAreaButton icon={<Icon width={20} height={20} />} tooltipText={label} aria-label={label} onClick={onClick} />); buttons.set(id, () => removeUserAreaButton(key)); }
                else { addChatBarButton(key, () => <ChatBarButton tooltip={label} onClick={onClick}><Icon width={20} height={20} /></ChatBarButton>, Icon); buttons.set(id, () => removeChatBarButton(key)); }
                return;
            }
            if (method === "styles") {
                requirePermission("styles");
                const data = checkedObject(input, ["css"], "Plugin stylesheet"); const css = checkedText(data.css, "Stylesheet", 6000);
                if (/\\|@import|@font-face|\bsrc\s*\(|\burl\s*\(|\bimage-set\s*\(|expression\s*\(/i.test(css)) throw new Error("Use local CSS without remote URLs or imports. Download text resources through api.fetch.");
                style.textContent = css; if (!style.isConnected) document.head.appendChild(style);
                return;
            }
            if (method === "network" || method === "script") {
                requirePermission("network"); if (method === "script") requirePermission("scripts");
                const data = checkedObject(input, ["url"], "Resource download"); const url = checkedText(data.url, "Resource URL", 2048);
                if (!manifest.networkOrigins?.includes(new URL(url).origin)) throw new Error("Add this resource's HTTPS origin to the plugin's declared network origins.");
                if (!VencordNative.pluginNetwork) throw new Error("Update the desktop host before using plugin downloads.");
                const response = await VencordNative.pluginNetwork.request("get", token, url, manifest.networkOrigins);
                if (disposed) throw new Error("The plugin stopped during the download.");
                if (!response.result) throw new Error(response.error ?? "The resource could not be downloaded.");
                if (method === "script") {
                    const bytes = new TextEncoder().encode(response.result.text);
                    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), value => value.toString(16).padStart(2, "0")).join("");
                    return { ...response.result, sha256 };
                }
                return response.result;
            }
            throw new Error("This desktop API method is unsupported.");
        },
        dispose() {
            if (disposal) return disposal;
            disposed = true;
            for (const remove of buttons.values()) remove(); buttons.clear(); style.remove();
            disposal = VencordNative.pluginNetwork ? VencordNative.pluginNetwork.request("close", token).then(() => {}) : Promise.resolve();
            return disposal;
        }
    };
} } } satisfies { bridge: DesktopPluginBridge; };
