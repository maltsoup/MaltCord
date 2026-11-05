/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { repairThemePreviews } from "@shared/kittycord/themePreviews";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";

const palette: { unsafe_rawColors: Record<string, { resolve(options: { saturation: number; }): { hex(): string; }; }>; } = findByPropsLazy("unsafe_rawColors");
let dispose: (() => void) | undefined;

export default definePlugin({
    name: "NativeThemePreviews",
    description: "Keeps Discord theme previews compatible with its current color tokens.",
    authors: [Devs.Kittencord],
    kittencordOrigin: "original",
    required: true,
    start() {
        dispose = repairThemePreviews(document, name => palette.unsafe_rawColors[name]?.resolve({ saturation: 1 }).hex());
    },
    stop() { dispose?.(); dispose = undefined; }
});
