/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useRef, useState } from "@webpack/common";

/**
 * Renders a long catalog in batches. Rendering hundreds of cards with preview images at once froze
 * Discord's settings while scrolling; the next batch now mounts when the end of the list comes near.
 */
export function useIncrementalList<T>(items: readonly T[], step = 24) {
    const [limit, setLimit] = useState(step);
    const sentinel = useRef<HTMLDivElement>(null);
    useEffect(() => setLimit(step), [items, step]);
    useEffect(() => {
        const node = sentinel.current;
        if (!node || limit >= items.length || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) setLimit(current => Math.min(items.length, current + step));
        }, { rootMargin: "600px 0px" });
        observer.observe(node);
        return () => observer.disconnect();
    }, [items.length, limit, step]);
    return {
        shown: items.slice(0, limit),
        more: limit < items.length ? <div ref={sentinel} className="kc-list-sentinel" aria-hidden="true" /> : null,
    };
}
