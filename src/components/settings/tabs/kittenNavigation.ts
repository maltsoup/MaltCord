/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type KittenPageId, kittenPages, type KittenSegment, resolveSettingsRoute, segmentOf } from "@shared/kittycord/settingsNavigation";
import { SettingsRouter, useEffect, useState } from "@webpack/common";

const pending = new Map<KittenPageId, string>();
const listeners = new Set<(page: KittenPageId, segment: string) => void>();

/** Opens a KittenCord page in Discord's settings, optionally on a segment. */
export function openKittenPage<P extends KittenPageId>(page: P, segment?: KittenSegment<P>) {
    if (segment) {
        pending.set(page, segment);
        for (const listener of listeners) listener(page, segment);
    }
    SettingsRouter.openUserSettings(`${kittenPages[page].key}_panel`);
}

/** Opens any current or retired KittenCord settings key; returns false for keys that are not KittenCord's. */
export function openSettingsRoute(key: string) {
    const route = resolveSettingsRoute(key);
    if (!route) return false;
    openKittenPage(route.page, segmentOf(route.page, route.segment));
    return true;
}

export function useKittenSegment<P extends KittenPageId>(page: P, fallback: KittenSegment<P>) {
    const [segment, setSegment] = useState<KittenSegment<P>>(() => {
        const requested = segmentOf(page, pending.get(page));
        pending.delete(page);
        return requested ?? fallback;
    });
    useEffect(() => {
        const listener = (target: KittenPageId, next: string) => {
            const requested = target === page ? segmentOf(page, next) : undefined;
            if (requested) { pending.delete(page); setSegment(requested); }
        };
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, [page]);
    return [segment, setSegment] as const;
}
