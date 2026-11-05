/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { extensionMetadata } from "@shared/kittycord/browser";

export let EXTENSION_VERSION: string;
export let EXTENSION_BASE_URL: string;
export let RENDERER_CSS_URL: string;

let resolveMetaReady: () => void;
export const metaReady = new Promise<void>(res => resolveMetaReady = res);

if (IS_EXTENSION) {
    const listener = (e: MessageEvent) => {
        if (e.source === window && e.origin === location.origin && e.data?.type === "vencord:meta") {
            let metadata: ReturnType<typeof extensionMetadata>;
            try { metadata = extensionMetadata(e.data.meta); } catch { return; }
            ({ EXTENSION_BASE_URL, EXTENSION_VERSION, RENDERER_CSS_URL } = metadata);
            window.removeEventListener("message", listener);
            resolveMetaReady();
        }
    };

    window.addEventListener("message", listener);
}
