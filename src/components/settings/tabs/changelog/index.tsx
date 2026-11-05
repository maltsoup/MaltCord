/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { React, useState } from "@webpack/common";

import { KittenReleaseNotes } from "../KittenReleaseNotes";
import { KittenTabs } from "../KittenUI";
import Updates from "../kittycordUpdates";

function Changelog(){ const [tab,setTab]=useState("notes");return <SettingsTab><KittenTabs tabs={[{ id:"notes",label:"Changelog" },{ id:"updates",label:"Updates" }]} selected={tab} onSelect={setTab} label="Changelog & Updates"/>{tab==="notes"?<KittenReleaseNotes/>:<Updates/>}</SettingsTab>; }
export default wrapTab(Changelog,"Changelog & Updates");
