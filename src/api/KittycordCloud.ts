/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createCloudBadgeCache } from "@shared/kittycord/cloudBadges";
import configuration from "@shared/kittycord/cloudConfig.json";
import { cloudOrigin } from "@shared/kittycord/cloudOrigin";
import { React, useCallback, useEffect } from "@webpack/common";

const origin = cloudOrigin(configuration);
export const cloudBadges = createCloudBadgeCache({ enabled:!!origin,origin });
export function useCloudBadges(userId: string) {
    const subscribe = useCallback((listener: () => void) => cloudBadges.subscribe(userId, listener), [userId]);
    const snapshot = useCallback(() => cloudBadges.peek(userId), [userId]);
    const badges = React.useSyncExternalStore(subscribe, snapshot, snapshot);
    useEffect(() => {
        if (!cloudBadges.enabled) return;
        void cloudBadges.load(userId);
        const timer = setInterval(() => { void cloudBadges.load(userId); }, 60000);
        const reconnect = () => { void cloudBadges.load(userId, true); };
        window.addEventListener("online", reconnect);
        return () => { clearInterval(timer); window.removeEventListener("online", reconnect); };
    }, [userId]);
    return badges;
}
