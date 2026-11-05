/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isAbsolute, join } from "path";

export function resolveKittycordDataDir(env: NodeJS.ProcessEnv, userData: string, development: boolean) {
    const override = env.KITTYCORD_USER_DATA_DIR;
    if (override) {
        if (!isAbsolute(override)) throw new Error("KITTYCORD_USER_DATA_DIR must be an absolute path.");
        return override;
    }

    const parent = env.DISCORD_USER_DATA_DIR ?? userData;
    return join(parent, "..", env.DISCORD_USER_DATA_DIR ? "KittycordData" : "Kittycord", development ? "dev" : "");
}
