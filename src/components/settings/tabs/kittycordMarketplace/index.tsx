/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordCloudCatalog } from "@api/KittycordCloudCatalog";
import { MarketplaceIcon, PluginsIcon } from "@components/Icons";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { React, useState } from "@webpack/common";

import { EmptyState, KittenTabs } from "../KittenUI";
import { PackagesTab } from "../kittycordPackages";
import { KittyToolHeader } from "../KittyToolLayout";
import { CloudCatalog } from "./CloudCatalog";
import { NativeVisuals } from "./NativeVisuals";

export function CatalogBrowser({ visual=false }:{ visual?:boolean; }) {
    const [view,setView]=useState("gallery");
    return <SettingsTab><div className="kc-tool-page"><KittyToolHeader Icon={visual?MarketplaceIcon:PluginsIcon} title={visual?"KittenCord Market":"Cloud plugins"} description={visual?"Themes, snippets and appearance packages.":"Published plugins."}/>
        <KittenTabs label={visual?"KittenCord Market":"Cloud plugins"} selected={view} onSelect={setView} tabs={[{ id:"gallery",label:"Gallery" },{ id:"installed",label:"Installed" }]}/>
        {view==="gallery"?(KittycordCloudCatalog.enabled?<CloudCatalog visual={visual}/>:<EmptyState title="Catalog unavailable">Connect to the configured KittenCord service to browse published packages.</EmptyState>):<><PackagesTab embedded content={visual?"visual":"plugins"}/>{visual&&<NativeVisuals/>}</>}
    </div></SettingsTab>;
}
export const FunctionalCatalog=wrapTab(CatalogBrowser,"Cloud plugins");
function VisualMarket(){ return <CatalogBrowser visual/>; }
export default wrapTab(VisualMarket,"KittenCord Market");
