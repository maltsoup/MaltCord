/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { switchAccountSetup } from "@api/KittycordAccountSetup";
import { KittycordCloudNotifications } from "@api/KittycordCloudNotifications";
import { KittycordProfiles } from "@api/KittycordProfiles";
import { Logger } from "@utils/Logger";
import { ChannelStore, SelectedChannelStore, SelectedGuildStore, UserStore } from "@webpack/common";
import { waitForStore } from "@webpack/common/internal";

const logger = new Logger("KittycordProfiles");

export async function initializeKittycordContext() {
    await Promise.all(["UserStore", "ChannelStore", "SelectedGuildStore", "SelectedChannelStore"].map(name => new Promise<void>(resolve => waitForStore(name, () => resolve()))));
    const stores = [UserStore, ChannelStore, SelectedGuildStore, SelectedChannelStore];
    let cloudAccount: string | undefined;
    function updateContext() {
        try {
            const currentAccount = UserStore.getCurrentUser()?.id;
            if(currentAccount!==cloudAccount){ void switchAccountSetup(currentAccount).catch(()=>logger.error("This account setup could not be restored. Its saved data was preserved."));cloudAccount=currentAccount;KittycordCloudNotifications.clear();if(!IS_WEB)void KittycordCloudNotifications.command("context").catch(()=>undefined); }
            const channelId = SelectedChannelStore.getChannelId();
            const channel = ChannelStore.getChannel(channelId);
            void KittycordProfiles.switchContext({ accountId: UserStore.getCurrentUser()?.id, serverId: channel?.guild_id ?? SelectedGuildStore.getGuildId() ?? undefined, channelId: channelId ?? undefined }).catch(() => {
                void KittycordProfiles.switchContext({});
                logger.error("Discord account identity was invalid. Account overrides were cleared.");
            });
        } catch {
            void KittycordProfiles.switchContext({});
            logger.error("Discord context could not be read. Account overrides were cleared and global defaults restored.");
        }
    }
    function cleanup() {
        for (const store of stores) store.removeChangeListener(updateContext);
        window.removeEventListener("pagehide", onPageHide);
        void KittycordProfiles.switchContext({});
    }
    function onPageHide(event: PageTransitionEvent) { if (!event.persisted) cleanup(); }
    for (const store of stores) store.addChangeListener(updateContext);
    window.addEventListener("pagehide", onPageHide);
    updateContext();
    return cleanup;
}
