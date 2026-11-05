/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { studioTheme } from "@shared/kittycord/studioTheme";
import * as monaco from "monaco-editor/esm/vs/editor/editor.main.js";

export function initializeStudioTheme() {
    const bridge: unknown = Reflect.get(globalThis, "KittyStudio");
    async function update() {
        if (!bridge || typeof bridge !== "object" || !("request" in bridge) || typeof bridge.request !== "function") return;
        try {
            const colors = studioTheme(await bridge.request("theme"));
            for (const [key, color] of Object.entries(colors)) if (CSS.supports("color", color)) document.documentElement.style.setProperty(key, color);
            const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
            if (!context) return;
            function hex(value: string) { if (!context) return ""; context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return "#" + [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => channel.toString(16).padStart(2, "0")).join(""); }
            const foreground = colors["--text-default"] ?? colors["--text-normal"];
            if (!colors["--background-primary"] || !foreground) return;
            const background = hex(colors["--background-primary"]);
            const luminance = [1, 3, 5].map(index => parseInt(background.slice(index, index + 2), 16)).reduce((sum, channel) => sum + channel, 0) / 3;
            document.documentElement.style.colorScheme = luminance > 140 ? "light" : "dark";
            monaco.editor.defineTheme("kittencord-client", { base: luminance > 140 ? "vs" : "vs-dark", inherit: true, rules: [], colors: { "editor.background": background, "editor.foreground": hex(foreground), ...(colors["--text-muted"] ? { "editorLineNumber.foreground": hex(colors["--text-muted"]) } : {}), ...(colors["--brand-500"] ? { "editorCursor.foreground": hex(colors["--brand-500"]), "editor.selectionBackground": hex(colors["--brand-500"]) + "44" } : {}) } });
            monaco.editor.setTheme("kittencord-client");
        } catch { return; }
    }
    const focus = () => { void update(); };
    focus(); window.addEventListener("focus", focus);
    window.addEventListener("pagehide", () => window.removeEventListener("focus", focus), { once: true });
}
