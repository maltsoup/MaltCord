/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { getProfileSettings } from "@api/KittycordProfiles";
import { isPluginSelected } from "@api/PluginManager";
import { PlainSettings, Settings } from "@api/Settings";
import { reapplyThemes } from "@api/Themes";
import { type AccountSetup,accountSetup, accountSetupKey } from "@shared/kittycord/accountSetup";
import { UserStore } from "@webpack/common";

import Plugins from "~plugins";

let activeAccount: string | undefined, revision=0;
export function captureAccountSetup(id:string) {
    const preferences: NonNullable<AccountSetup["preferences"]>={};
    for(const definition of getProfileSettings()){
        const value:unknown=Settings.plugins[definition.pluginId]?.[definition.key];
        if(typeof value===definition.type&&(typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value))) (preferences[definition.pluginId]??={})[definition.key]=value;
    }
    return accountSetup({ schemaVersion:1,accountId:id,plugins:Object.fromEntries(Object.values(Plugins).filter(plugin=>!plugin.required).map(plugin=>[plugin.name,isPluginSelected(plugin.name)])),themes:[...Settings.enabledThemes],preferences,appearance:{ themeLinks:[...Settings.themeLinks],enabledThemeLinks:[...Settings.enabledThemeLinks],enableOnlineThemes:Settings.enableOnlineThemes,useQuickCss:Settings.useQuickCss } },id,getProfileSettings());
}
export function applyAccountPreferences(setup:AccountSetup) {
    if(UserStore.getCurrentUser()?.id!==setup.accountId)throw Error("The account changed. Nothing was applied.");
    const value=accountSetup(setup,setup.accountId,getProfileSettings());
    for(const [plugin,preferences]of Object.entries(value.preferences??{})) for(const [key,setting]of Object.entries(preferences)) if(Plugins[plugin]) Settings.plugins[plugin][key]=setting;
    Settings.enabledThemes=[...value.themes];
    if(value.appearance){ Settings.themeLinks=[...value.appearance.themeLinks];Settings.enabledThemeLinks=[...value.appearance.enabledThemeLinks];Settings.enableOnlineThemes=value.appearance.enableOnlineThemes;Settings.useQuickCss=value.appearance.useQuickCss; }
    reapplyThemes();
}
export function applyAccountPluginSelection(setup:AccountSetup) {
    if(UserStore.getCurrentUser()?.id!==setup.accountId)throw Error("The account changed. Nothing was applied.");
    const value=accountSetup(setup,setup.accountId,getProfileSettings());
    for(const [name,enabled]of Object.entries(value.plugins)){
        const plugin=Plugins[name];if(!plugin||plugin.required)continue;
        Settings.plugins[plugin.id??name].enabled=enabled;
        if(plugin.id&&plugin.id!==name)Settings.plugins[name].enabled=enabled;
    }
}
export async function commitAccountSetup(setup: AccountSetup) {
    const value = accountSetup(setup, setup.accountId, getProfileSettings());
    if (UserStore.getCurrentUser()?.id !== value.accountId) throw Error("The account changed. Nothing was applied.");
    const before = captureAccountSetup(value.accountId);
    await DataStore.set(accountSetupKey(value.accountId) + ":previous", before);
    try {
        applyAccountPreferences(value);
        applyAccountPluginSelection(value);
        await VencordNative.settings.set(PlainSettings);
        if (UserStore.getCurrentUser()?.id !== value.accountId) throw Error("The account changed before the setup was saved.");
        await DataStore.set(accountSetupKey(value.accountId), value);
    } catch (error) {
        if (UserStore.getCurrentUser()?.id === before.accountId) {
            applyAccountPreferences(before);
            applyAccountPluginSelection(before);
            await VencordNative.settings.set(PlainSettings);
        }
        throw error;
    }
}
export async function switchAccountSetup(id?:string){
    if (id === activeAccount) return;
    const request=++revision;
    const previous=activeAccount?captureAccountSetup(activeAccount):undefined;
    activeAccount=undefined;
    if(previous)await DataStore.set(accountSetupKey(previous.accountId),previous);
    if(!id||request!==revision)return;
    const stored=await DataStore.get<unknown>(accountSetupKey(id));
    if(request!==revision||UserStore.getCurrentUser()?.id!==id)return;
    if(stored===undefined){ await DataStore.set(accountSetupKey(id),captureAccountSetup(id));if(request===revision)activeAccount=id;return; }
    const value=accountSetup(stored,id,getProfileSettings());
    applyAccountPreferences(value);activeAccount=id;
    const changed=Object.entries(value.plugins).filter(([name,enabled])=>Plugins[name]&&!Plugins[name].required&&isPluginSelected(name)!==enabled);
    if (!changed.length) return;
    // MaltCord keeps the plugins that are on right now instead of asking to restart into an older saved
    // selection. The account's saved setup is updated to match, so there is no prompt on the next start.
    if (request !== revision || UserStore.getCurrentUser()?.id !== id) return;
    await DataStore.set(accountSetupKey(id), captureAccountSetup(id));
}
