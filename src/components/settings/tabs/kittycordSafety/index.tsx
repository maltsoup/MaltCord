/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SafetyIcon } from "@components/Icons";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";

import { KittyToolHeader } from "../KittyToolLayout";
import { InstalledAccess } from "./InstalledAccess";

function SafetyTab() {
    return <SettingsTab><div className="kc-tool-page">
        <KittyToolHeader Icon={SafetyIcon} title="Plugin access" description="Installed plugins and their declared integrations." />
        <InstalledAccess />
    </div></SettingsTab>;
}

export default wrapTab(SafetyTab, "Plugin access");
