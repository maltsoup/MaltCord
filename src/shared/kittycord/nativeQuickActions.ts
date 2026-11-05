/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NativeStudioProject } from "./nativeStudio";

export function quickActionsProject(): NativeStudioProject {
    return {
        schemaVersion: 1, kind: "kittencord-native-studio",
        metadata: { id: "local.kitten.quick-actions", name: "KittyQuickActions", version: "1.0.0", author: "xtufa7", contentType: "plugin" },
        entry: "index.tsx",
        files: { "index.tsx": `import definePlugin, { OptionType } from "@utils/types";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { definePluginSettings } from "@api/Settings";
import { findGroupChildrenByChildId } from "@api/ContextMenu";
import { CopyIcon } from "@components/Icons";
import { ChannelStore, Menu, React } from "@webpack/common";

const settings = definePluginSettings({
    includeLink: { type: OptionType.BOOLEAN, description: "Include the original message link below copied quotes.", default: true }
});
function link(message) {
    return "https://discord.com/channels/" + (ChannelStore.getChannel(message.channel_id)?.guild_id ?? "@me") + "/" + message.channel_id + "/" + message.id;
}
function quote(message) {
    const author = (message.author?.globalName ?? message.author?.global_name ?? message.author?.username ?? "Message").replace(/[\\r\\n]/g, " ");
    const content = message.content || message.attachments?.map(item => item.url).join("\\n") || "[Message has no text]";
    const text = "**" + author.replace(/([*_~\\x60\\\\])/g, "\\\\$1") + "**\\n" + content.split(/\\r?\\n/).map(line => "> " + line).join("\\n");
    return copyWithToast(text + (settings.store.includeLink ? "\\n\\n" + link(message) : ""), "Message quote copied.");
}
export default definePlugin({
    name: "KittyQuickActions", description: "Copy message quotes from the toolbar or context menu. Right-click the toolbar action to copy its link.",
    authors: [Devs.Kittencord], kittencordOrigin: "original", tags: ["Chat", "Utility"],
    dependencies: ["MessagePopoverAPI", "ContextMenuAPI"], settings,
    messagePopoverButton: { icon: CopyIcon, render: message => ({
        label: "Copy Markdown quote · right-click for link", icon: CopyIcon, message,
        onClick: () => void quote(message), onContextMenu: event => { event.preventDefault(); void copyWithToast(link(message), "Message link copied."); }
    }) },
    contextMenus: { "message": (children, { message }) => {
        if (!message?.id || !message.channel_id) return;
        const group = findGroupChildrenByChildId(["copy-text", "copy-link", "copy-message-link"], children) ?? children;
        group.push(<Menu.MenuItem id="kitty-copy-quote" label="Copy Markdown Quote" action={() => void quote(message)} />);
        if (!findGroupChildrenByChildId(["copy-link", "copy-message-link"], children)) group.push(<Menu.MenuItem id="kitty-copy-message-link" label="Copy Message Link" action={() => void copyWithToast(link(message))} />);
    } }
});
` }
    };
}
