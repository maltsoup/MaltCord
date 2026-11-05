/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from "react";

// Icons are factories: JSX at module scope would run before the client finishes loading.
const paths = {
    home: () => <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>,
    plugin: () => <path d="M10 4a2 2 0 1 1 4 0v2h4v4h2a2 2 0 1 1 0 4h-2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4H4a2 2 0 1 1 0-4h2V6h4z" />,
    customize: () => <><path d="M14 4l6 6-8 8H6v-6z" /><path d="M4 20l2-2" /></>,
    account: () => <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
    health: () => <path d="M3 12h4l3-7 4 14 3-7h4" />,
    about: () => <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
    studio: () => <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" />,
    cloud: () => <path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z" />,
    shield: () => <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />,
    window: () => <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></>,
    bell: () => <><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
    plus: () => <path d="M12 5v14M5 12h14" />,
    chevron: () => <path d="M9 6l6 6-6 6" />,
    dots: () => <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    search: () => <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
    image: () => <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>,
    mic: () => <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    clock: () => <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    key: () => <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></>,
    type: () => <path d="M5 6h14M12 6v13" />,
    zap: () => <path d="M13 3L4 14h7l-1 7 9-11h-7z" />,
    eye: () => <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
    folder: () => <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
    restart: () => <><path d="M4 12a8 8 0 1 0 2.5-5.8" /><path d="M4 4v4h4" /></>,
    gear: () => <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></>,
    filter: () => <path d="M4 5h16l-6 7v6l-4 2v-8z" />,
    check: () => <path d="M5 12l5 5 9-10" />,
    close: () => <path d="M6 6l12 12M18 6L6 18" />,
    warning: () => <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.5" /></>,
    download: () => <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>,
    upload: () => <><path d="M12 20V9M7 14l5-5 5 5" /><path d="M5 4h14" /></>,
    trash: () => <><path d="M4 7h16M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
    copy: () => <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
    external: () => <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
    palette: () => <><path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2-1 3-1a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7" r="1" /></>,
    badge: () => <><circle cx="12" cy="9" r="5" /><path d="M9 13l-2 8 5-3 5 3-2-8" /></>,
    sync: () => <><path d="M20 8a8 8 0 0 0-14.5-2M4 4v4h4" /><path d="M4 16a8 8 0 0 0 14.5 2M20 20v-4h-4" /></>,
    book: () => <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>,
    layers: () => <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
    gauge: () => <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></>,
    users: () => <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.9 2.6 2.6 3 5.2" /></>,
    discord: () => <><path d="M8 7c-2 .4-3 1-3 1-1.5 3-2 6-1.5 9 1.2 1.1 2.6 1.8 4 2l1-2" /><path d="M16 7c2 .4 3 1 3 1 1.5 3 2 6 1.5 9-1.2 1.1-2.6 1.8-4 2l-1-2" /><path d="M7 16c3 1.5 7 1.5 10 0" /><circle cx="9.5" cy="12.5" r="1" /><circle cx="14.5" cy="12.5" r="1" /></>,
    github: () => <path d="M9 19c-4 1.3-4-2-6-2.5m12 4.5v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.5 2.5 5.5 2.8 5.5 2.8a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.2c0 4.7 2.8 5.7 5.5 6a3 3 0 0 0-.8 2.3V21" />,
} satisfies Record<string, () => ReactNode>;

export type KcIconName = keyof typeof paths;

export function isKcIconName(value: unknown): value is KcIconName {
    return typeof value === "string" && Object.hasOwn(paths, value);
}

export function KcIcon({ name, size = 18, className }: { name: KcIconName; size?: number; className?: string; }) {
    return <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]()}</svg>;
}

/** Sidebar entry icon in the same set, sized by Discord's settings sidebar. */
export function kittenIcon(name: KcIconName) {
    return function KittenSidebarIcon({ width = 20 }: { width?: number | string; }) {
        return <KcIcon name={name} size={Number(width) || 20} />;
    };
}
