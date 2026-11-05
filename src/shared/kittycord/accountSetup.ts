/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseProfile, type ProfileSetting, type ProfileValues } from "./profiles";

export interface AccountSetup { schemaVersion: 1; accountId: string; plugins: Record<string, boolean>; themes: string[]; preferences?: ProfileValues; appearance?: { themeLinks: string[]; enabledThemeLinks: string[]; enableOnlineThemes: boolean; useQuickCss: boolean; }; }

export function accountSetup(value: unknown, accountId: string, supported: readonly ProfileSetting[] = []): AccountSetup {
    if (!/^\d{17,20}$/.test(accountId) || !value || typeof value !== "object" || Array.isArray(value)) throw Error("Select a signed-in account.");
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(key => !["schemaVersion", "accountId", "plugins", "themes", "preferences", "appearance"].includes(key)) || record.schemaVersion !== 1 || record.accountId !== accountId || !record.plugins || typeof record.plugins !== "object" || Array.isArray(record.plugins) || !Array.isArray(record.themes)) throw Error("This setup does not belong to the current account.");
    const entries = Object.entries(record.plugins);
    if (entries.length > 5000 || entries.some(([key, enabled]) => (!key.trim() || key.length > 150 || /[\u0000-\u001f\u007f]/.test(key)) || ["__proto__", "constructor", "prototype"].includes(key) || typeof enabled !== "boolean")) throw Error("Invalid plugin selection.");
    if (record.themes.length > 100 || record.themes.some(theme => typeof theme !== "string" || !theme.length || theme.length > 200 || /[/\\\0]/.test(theme) || theme === "." || theme === "..")) throw Error("Invalid local theme selection.");
    let preferences: ProfileValues | undefined, appearance: AccountSetup["appearance"];
    if (record.preferences !== undefined) preferences = parseProfile({ schemaVersion:1,revision:0,rules:[{ scope:"account",target:"",values:record.preferences }] },supported).rules[0].values;
    if (record.appearance !== undefined) {
        if (!record.appearance || typeof record.appearance!=="object" || Array.isArray(record.appearance)) throw Error("Invalid appearance preferences.");
        const value=record.appearance as Record<string,unknown>;
        if(Object.keys(value).some(key=>!["themeLinks","enabledThemeLinks","enableOnlineThemes","useQuickCss"].includes(key))||typeof value.enableOnlineThemes!=="boolean"||typeof value.useQuickCss!=="boolean")throw Error("Invalid appearance preferences.");
        const links=(urls:unknown):string[]=>{ if(!Array.isArray(urls)||urls.length>100)throw Error("Invalid online themes.");return [...new Set(urls.map(item=>{ if(typeof item!=="string"||item.length>2048)throw Error("Invalid theme URL.");const url=new URL(item);if(url.protocol!=="https:"||url.username||url.password||url.hash||[...url.searchParams.keys()].some(key=>/token|secret|signature|credential|key/i.test(key)))throw Error("Use public HTTPS theme links without credentials.");return url.href; }))]; };
        appearance={ themeLinks:links(value.themeLinks),enabledThemeLinks:links(value.enabledThemeLinks),enableOnlineThemes:value.enableOnlineThemes,useQuickCss:value.useQuickCss };
        if(appearance.enabledThemeLinks.some(link=>!appearance?.themeLinks.includes(link)))throw Error("Enabled themes must belong to this account's theme list.");
    }
    return { ...(preferences?{ preferences }:{}),...(appearance?{ appearance }:{}),schemaVersion: 1, accountId, plugins: Object.fromEntries(entries) as Record<string, boolean>, themes: [...new Set(record.themes)] };
}

export function accountSetupKey(accountId: string) {
    if (!/^\d{17,20}$/.test(accountId)) throw Error("Select a signed-in account.");
    return `kittencord.account-setup.v1:${accountId}`;
}
