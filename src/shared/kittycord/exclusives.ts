/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { newUtilityProject, type StudioProject } from "./studio";

export const exclusiveProjects: { description: string; project: StudioProject; }[] = [
    {
        description: "Inspect links without opening them. Remove common tracking parameters, reveal the hostname and flag credentials or disguised domains.",
        project: {
            ...newUtilityProject(), metadata: { id: "local.link-lens", name: "Link Lens", version: "1.0.0", author: "MaltCord contributors" },
            source: `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({
    start(api) {
        let result = "Paste a public HTTP(S) link in settings. Nothing is opened or fetched.";
        const show = () => api.publishPanel({title:"Link Lens",text:result,actions:[{id:"inspect",label:"Inspect link"},{id:"clean",label:"Remove trackers"}],settings:[{id:"url",label:"Public link (no secrets)",type:"text",default:""},{id:"fragment",label:"Remove fragment when cleaning",type:"boolean",default:false}]});
        api.onAction(id => {
            try {
                const url = new URL(String(api.settings.url ?? ""));
                if (!['https:', 'http:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS links are supported.");
                if (url.username || url.password) throw new Error("This link contains credentials. Remove them before using this tool.");
                const warnings = [];
                if (url.protocol === "http:") warnings.push("Unencrypted HTTP");
                if (url.hostname.split('.').some(part => part.startsWith('xn--'))) warnings.push("International domain in punycode: verify the spelling");
                if (/^[0-9.]+$/.test(url.hostname) || url.hostname.startsWith('[')) warnings.push("IP address instead of a domain");
                let removed = 0;
                if (id === "clean") for (const key of Array.from(url.searchParams.keys())) {
                    if (/^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid)$/i.test(key)) { removed += url.searchParams.getAll(key).length; url.searchParams.delete(key); }
                }
                if (id === "clean" && api.settings.fragment === true) url.hash = "";
                result = "Host: " + url.hostname + "\\n" + (warnings.join(". ") || "No listed URL warning detected") + ". This is not a safety verdict.\\n" + (id === "clean" ? "Tracking values removed: " + removed + ". Check the destination before sharing.\\n" : "") + url.href;
                if (result.length > 2000) throw new Error("Result is too long. Use a shorter link.");
            } catch (error) { result = error instanceof Error ? error.message : "Invalid link."; }
            show();
        }); show();
    }
});`
        }
    },
    {
        description: "Validate, format, minify and inspect JSON using JSON Pointer. No eval, code execution or external service.",
        project: {
            ...newUtilityProject(), metadata: { id: "local.json-workbench", name: "JSON Workbench", version: "1.0.0", author: "MaltCord contributors" },
            source: `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({
    start(api) {
        let result = "Save JSON in settings, then format, minify or inspect a JSON Pointer.";
        const show = () => api.publishPanel({title:"JSON Workbench",text:result,actions:[{id:"format",label:"Format JSON"},{id:"minify",label:"Minify JSON"},{id:"pointer",label:"Read pointer"}],settings:[{id:"json",label:"JSON input",type:"text",default:'{"hello":"MaltCord"}'},{id:"pointer",label:"JSON Pointer (e.g. /items/0)",type:"text",default:""}]});
        api.onAction(id => {
            try {
                let value = JSON.parse(String(api.settings.json ?? ""));
                if (id === "pointer") {
                    const pointer = String(api.settings.pointer ?? "");
                    if (pointer && !pointer.startsWith('/')) throw new Error("A JSON Pointer must be empty or begin with /.");
                    for (const encoded of pointer ? pointer.slice(1).split('/') : []) {
                        if (/~(?:[^01]|$)/.test(encoded)) throw new Error("Invalid pointer escape. Use ~0 for ~ and ~1 for /.");
                        const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
                        if (value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key) || Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) throw new Error("Pointer does not exist in this document.");
                        value = value[key];
                    }
                }
                result = JSON.stringify(value, null, id === "minify" ? 0 : 2);
                if (result.length > 2000) throw new Error("Formatted result exceeds 2000 characters. Use Minify JSON or select a smaller value with a pointer.");
            } catch (error) { result = error instanceof Error ? error.message : "Invalid JSON."; }
            show();
        }); show();
    }
});`
        }
    },
    {
        description: "Turn an explicit date and timezone offset into Discord timestamps. Generate every display style for events across timezones.",
        project: {
            ...newUtilityProject(), metadata: { id: "local.timestamp-studio", name: "Timestamp Studio", version: "1.0.0", author: "MaltCord contributors" },
            source: `globalThis.kittycordPlugin = /** @type {KittyPlugin} */ ({
    start(api) {
        let result = "Use YYYY-MM-DDTHH:mm:ssZ or an explicit offset such as +03:00. Discord renders the result in each reader's timezone.";
        const show = () => api.publishPanel({title:"Timestamp Studio",text:result,actions:[{id:"generate",label:"Generate timestamps"},{id:"now",label:"Use current time"}],settings:[{id:"date",label:"Date with timezone",type:"text",default:"2026-12-31T21:00:00Z"}]});
        api.onAction(id => {
            try {
                const input = String(api.settings.date ?? "");
                if (id !== "now" && !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(Z|[+-]\\d{2}:\\d{2})$/.test(input)) throw new Error("Specify a date, seconds and timezone. Example: 2026-12-31T21:00:00+03:00.");
                const date = id === "now" ? new Date() : new Date(input);
                if (!Number.isFinite(date.getTime())) throw new Error("Invalid date or timezone.");
                if (id !== "now") {
                    const parts = input.slice(0, 19).split(/[-T:]/).map(Number);
                    const calendar = new Date(0); calendar.setUTCFullYear(parts[0], parts[1] - 1, parts[2]); calendar.setUTCHours(parts[3], parts[4], parts[5], 0);
                    if (calendar.getUTCFullYear() !== parts[0] || calendar.getUTCMonth() !== parts[1] - 1 || calendar.getUTCDate() !== parts[2] || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) throw new Error("Invalid calendar date or time.");
                }
                const seconds = Math.floor(date.getTime() / 1000);
                result = "UTC: " + date.toISOString() + "\\nUnix seconds: " + seconds + "\\n" + ['t','T','d','D','f','F','R'].map(style => '<t:' + seconds + ':' + style + '>').join('\\n') + "\\nCopy a tag into your message. Nothing is sent automatically.";
            } catch (error) { result = error instanceof Error ? error.message : "Invalid date."; }
            show();
        }); show();
    }
});`
        }
    }
];
