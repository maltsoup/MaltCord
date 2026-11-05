/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";

import { settings } from "./utils/settings";

export default definePlugin({
    name: "ThemeLibrary",
    description: "A library of themes for Vencord.",
    tags: ["Appearance", "Customisation"],
    authors: [EquicordDevs.Fafa],
    // KittenCord shows the library as a tab in Settings > Themes instead of a separate sidebar entry.
    required: true,
    settings,
    toolboxActions: {
        "Open Theme Library": () => {
            void import("@components/settings/tabs/kittenNavigation").then(({ openKittenPage }) => openKittenPage("themes", "library"));
        },
    },
});
