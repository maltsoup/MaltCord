/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/// <reference path="../src/modules.d.ts" />
/// <reference path="../src/globals.d.ts" />

// Be very careful with imports in this file to avoid circular dependency issues.
// Only import pure modules that don't import other parts of Vencord.
import * as DataStore from "@api/DataStore";
import type { Settings } from "@api/Settings";
import { getThemeInfo } from "@main/themes";
import { Kittycord } from "@shared/kittycord";
import { unsupportedRecovery } from "@shared/kittycord/recovery";
import { localStorage } from "@utils/localStorage";
import { openQuickCssEditor } from "@utils/quickCssEditor";
import { getStylusWebStoreUrl } from "@utils/web";
import { EXTENSION_BASE_URL, metaReady, RENDERER_CSS_URL } from "@utils/web-metadata";

import gitRemote from "~git-remote";

// listeners for ipc.on
const cssListeners = new Set<(css: string) => void>();
const NOOP = () => { };
const NOOP_ASYNC = async () => { };
const browserManagedUpdates = async () => {
    throw new Error("Kittencord extension updates are managed by your browser. No in-client updater is available.");
};


const themeStore = DataStore.createStore("VencordThemes", "VencordThemeData");

// probably should make this less cursed at some point
window.VencordNative = {
    diagnostics: { command: async () => ({ error: "Use the desktop client to submit diagnostics. Browser diagnostics can be exported locally." }) },
    cloud: { command: async () => ({ configured: false, error: "Cloud account connection requires the desktop client." }) },
    updates: { command: async () => ({ configured: false, error: "Browser updates use browser distribution and signing rules." }) },
    pluginNetwork: { request: async () => ({ error: "Desktop plugin downloads require the desktop build." }) },
    github: { request: async () => ({ error: "Use supported public GitHub requests from the browser or paste metadata manually." }) },
    security: { scan: async () => ({ error: "AST source scanning requires the desktop security bridge. Browser code must be reviewed and packaged in a new extension build." }) },
    nativeStudio: { startup: () => ({plugins: [], errors: []}), request: async () => { throw new Error("Native source installation requires the desktop app. Browser plugins use the existing packaged build pipeline."); } },
    studio: { open: async () => { throw new Error("Open the packaged Studio through Kittencord settings in this browser."); } },
    sandbox: {
        open: async () => { throw new Error("External JavaScript is unavailable in browser extensions."); },
        close: async () => {}
    },
    recovery: {
        getStatus: () => unsupportedRecovery,
        complete: async () => { throw new Error("Persistent startup recovery is not yet supported in browsers."); },
        setRecovery: async () => { throw new Error("Persistent startup recovery is not yet supported in browsers."); },
        allowPlugin: async () => { throw new Error("Persistent startup recovery is not yet supported in browsers."); },
        restoreLastGood: async () => { throw new Error("Persistent startup recovery is not yet supported in browsers."); },
        markPlugin: () => { },
        blamePlugin: () => { }
    },
    themes: {
        uploadTheme: (fileName: string, fileData: string) => DataStore.set(fileName, fileData, themeStore),
        deleteTheme: (fileName: string) => DataStore.del(fileName, themeStore),
        getThemesList: () => DataStore.entries(themeStore).then(entries =>
            entries.map(([name, css]) => getThemeInfo(css, name.toString()))
        ),
        getThemeData: (fileName: string) => DataStore.get(fileName, themeStore),
        getSystemValues: async () => ({}),

        openFolder: async () => Promise.reject("themes:openFolder is not supported on web"),
    },

    native: {
        getVersions: () => ({}),
        supportsWindowsMaterial: () => false,
        openExternal: async (url) => void open(url, "_blank"),
        windowDrag: () => { },
        getRendererCss: async () => {
            if (IS_USERSCRIPT)
                // need to wait for next tick for _vcUserScriptRendererCss to be set
                return Promise.resolve().then(() => window._vcUserScriptRendererCss);

            await metaReady;

            return fetch(RENDERER_CSS_URL)
                .then(res => res.text());
        },
        onRendererCssUpdate: NOOP,
    },

    updater: {
        getRepo: async () => {
            if (!gitRemote) throw new Error("No public Kittencord repository is configured.");
            return { ok: true, value: `https://github.com/${gitRemote}` };
        },
        getUpdates: browserManagedUpdates,
        update: browserManagedUpdates,
        forceUpdate: browserManagedUpdates,
        rebuild: browserManagedUpdates,
    },

    quickCss: {
        get: () => DataStore.get("VencordQuickCss").then(s => s ?? ""),
        set: async (css: string) => {
            await DataStore.set("VencordQuickCss", css);
            cssListeners.forEach(l => l(css));
        },
        addChangeListener(cb) {
            cssListeners.add(cb);
        },
        addThemeChangeListener: NOOP,
        openFile: NOOP_ASYNC,
        async openEditor() {
            if (IS_USERSCRIPT) {
                const shouldOpenWebStore = confirm("QuickCSS is not supported on the Userscript. You can instead use the Stylus extension.\n\nDo you want to open the Stylus web store page?");
                if (shouldOpenWebStore) {
                    window.open(getStylusWebStoreUrl(), "_blank");
                }
                return;
            }

            if (!IS_EXTENSION) throw new Error("The packaged QuickCSS editor requires the Kittencord browser extension.");
            await metaReady;
            openQuickCssEditor({ baseUrl: EXTENSION_BASE_URL, getCss: () => VencordNative.quickCss.get(), setCss: css => VencordNative.quickCss.set(css), getTheme: () => this.getEditorTheme() === "vs-light" ? "vs-light" : "vs-dark",
                subscribe(listener) { cssListeners.add(listener); return () => { cssListeners.delete(listener); }; }, onError: message => alert(message) });
        },
        getEditorTheme: () => {
            const { getTheme, Theme } = require("@utils/discord");

            return getTheme() === Theme.Light
                ? "vs-light"
                : "vs-dark";
        }
    },

    settings: {
        get: () => {
            try {
                const settings = JSON.parse(localStorage.getItem(Kittycord.webSettingsKey) || "{}");
                return typeof settings === "string" ? JSON.parse(settings) : settings;
            } catch (e) {
                console.error("Failed to parse settings from localStorage: ", e);
                return {};
            }
        },
        set: async (s: Settings) => localStorage.setItem(Kittycord.webSettingsKey, JSON.stringify(s)),
        getSettingsDir: async () => "LocalStorage",
        openFolder: async () => Promise.reject("settings:openFolder is not supported on web"),
    },

    presets: {
        get: async () => {
            try {
                return JSON.parse(localStorage.getItem(Kittycord.webPresetsKey) || "{}");
            } catch {
                return {};
            }
        },
        set: async (data: any) => localStorage.setItem(Kittycord.webPresetsKey, JSON.stringify(data)),
    },

    pluginHelpers: {} as any,
    privacy: {} as any,
    csp: {} as any,
    // Desktop-only tray IPC, inert in the browser but needed for the stub to satisfy
    // the native surface type.
    tray: {
        setUpdateState: NOOP,
        onCheckUpdates: NOOP,
        onRepair: NOOP,
    },
};
