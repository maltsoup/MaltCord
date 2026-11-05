#!/usr/bin/node
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

// @ts-check

import { existsSync, readFileSync } from "fs";
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rename, writeFile } from "fs/promises";
import path, { join } from "path";
import Zip from "zip-local";
import { editorBuildConfigs } from "./editorAssets.mjs";

import { BUILD_TIMESTAMP, buildIdentity, commonOpts, gitBranchPlugin, globPlugins, IS_DEV, IS_ANTI_CRASH_TEST, IS_REPORTER, IS_COMPANION_TEST, IS_STANDALONE, VERSION, commonRendererPlugins, buildOrWatchAll, stringifyValues } from "./common.mjs";

/**
 * @type {import("esbuild").BuildOptions}
 */
const commonOptions = {
    ...commonOpts,
    entryPoints: ["browser/Vencord.ts"],
    format: "iife",
    globalName: "Vencord",
    external: ["~plugins", "~git-hash", "~git-branch", "~git-remote", "/assets/*"],
    target: ["esnext"],
    plugins: [
        globPlugins("web"),
        gitBranchPlugin,
        ...commonRendererPlugins
    ],
    define: stringifyValues({
        IS_WEB: true,
        IS_EXTENSION: false,
        IS_USERSCRIPT: false,
        IS_STANDALONE,
        IS_DEV,
        IS_REPORTER,
        IS_COMPANION_TEST,
        IS_ANTI_CRASH_TEST,
        IS_DISCORD_DESKTOP: false,
        IS_VESKTOP: false,
        IS_EQUIBOP: false,
        IS_UPDATER_DISABLED: true,
        VERSION,
        BUILD_TIMESTAMP,

    }),
};

/** @param {string} name @returns {import("esbuild").Plugin} */
function editorInventory(name) {
    return { name: `kittycord-editor-${name}`, setup(build) {
        build.onEnd(async result => {
            if (result.errors.length || !result.metafile) return;
            await writeFile(`dist/browser/${name}-assets.json`, JSON.stringify(Object.keys(result.metafile.outputs).map(file => file.replaceAll("\\", "/"))));
        });
    } };
}

/** @type {import("esbuild").BuildOptions[]} */
const buildConfigs = [
    { entryPoints: ["browser/assistant.ts"], bundle: true, format: "esm", outfile: "dist/browser/assistant.js" },
    { entryPoints: ["browser/editor-bridge.ts"], bundle: true, format: "iife", outfile: "dist/browser/editor-bridge.js" },
    ...editorBuildConfigs("dist/browser", [editorInventory("worker")], [editorInventory("editor")]),
    {
        ...commonOptions,
        outfile: "dist/browser/browser.js",
        footer: { js: "//# sourceURL=file:///VencordWeb" }
    },
    {
        ...commonOptions,
        outfile: "dist/browser/extension.js",
        define: {
            ...commonOptions.define,
            IS_EXTENSION: "true"
        },
        footer: { js: "//# sourceURL=file:///VencordWeb" }
    },
    {
        ...commonOptions,
        inject: ["browser/GMPolyfill.js", ...(commonOptions?.inject || [])],
        define: {
            ...commonOptions.define,
            IS_USERSCRIPT: "true",
            window: "unsafeWindow",
        },
        outfile: "dist/Kittycord.user.js",
        banner: {
            js: readFileSync("browser/userscript.meta.js", "utf-8").replace("%version%", `${VERSION}.${new Date().getTime()}`)
        },
        footer: {
            // UserScripts get wrapped in an iife, so define Vencord prop on window that returns our local
            js: "Object.defineProperty(unsafeWindow,'Vencord',{get:()=>Vencord});"
        }
    }
];

await buildOrWatchAll(buildConfigs);

async function loadEditorAssets() {
    const files = [...JSON.parse(await readFile("dist/browser/worker-assets.json", "utf8")), ...JSON.parse(await readFile("dist/browser/editor-assets.json", "utf8"))];
    if (files.length > 256 || files.some(file => typeof file !== "string" || !file.startsWith("dist/browser/vendor/monaco/") || file.includes(".."))) throw new Error("Invalid packaged editor asset inventory.");
    return Object.fromEntries(await Promise.all(files.map(async file => [file.slice("dist/browser/".length), await readFile(file)])));
}

/**
  * @type {(target: string, files: string[]) => Promise<void>}
 */
async function buildExtension(target, files) {
    if (!/^kittycord-(chromium|firefox)-unpacked$/.test(target))
        throw new Error("Invalid Kittycord extension build target.");

    const entries = {
        "assistant.js": await readFile("dist/browser/assistant.js"),
        "editor-bridge.js": await readFile("dist/browser/editor-bridge.js"),
        "dist/Kittycord.js": await readFile("dist/browser/extension.js"),
        "dist/Kittycord.css": await readFile("dist/browser/extension.css"),
        ...await loadEditorAssets(),
        ...Object.fromEntries(await Promise.all(files.map(async f => {
            let content = await readFile(join("browser", f));
            if (f.startsWith("manifest")) {
                const json = JSON.parse(content.toString("utf-8"));
                json.version = VERSION;
                content = Buffer.from(new TextEncoder().encode(JSON.stringify(json)));
            }

            return [
                f.startsWith("manifest") ? "manifest.json" : f,
                content
            ];
        })))
    };

    await mkdir("work", { recursive: true });
    const transaction = await mkdtemp(join("work", "kittycord-extension-"));
    const staged = join(transaction, "next");
    const previous = join(transaction, "previous");
    const output = join("dist/browser", target);
    await Promise.all(Object.entries(entries).map(async ([file, content]) => {
        const dest = join(staged, file);
        const parentDirectory = join(dest, "..");
        await mkdir(parentDirectory, { recursive: true });
        await writeFile(dest, content);
    }));

    const hadPrevious = existsSync(output);
    if (hadPrevious) await rename(output, previous);
    try {
        await rename(staged, output);
    } catch (error) {
        if (hadPrevious) await rename(previous, output);
        throw error;
    }

    console.info("Unpacked Extension written to dist/browser/" + target);
}

await writeFile("dist/kittycord-web.json", JSON.stringify(buildIdentity, null, 4));
await writeFile("dist/kittencord-web.json", JSON.stringify(buildIdentity, null, 4));

const appendCssRuntime = readFile("dist/Kittycord.user.css", "utf-8").then(content => {
    const cssRuntime = `unsafeWindow._vcUserScriptRendererCss=\`${content.replaceAll("`", "\\`")}\``;

    return appendFile("dist/Kittycord.user.js", cssRuntime);
});

if (!process.argv.includes("--skip-extension")) {
    await Promise.all([
        appendCssRuntime,
        buildExtension("kittycord-chromium-unpacked", ["keybinds.js", "content.js", "manifest.json", "kittycord.png", "editor.html", "editor.css", "studio.html", "studio.css", "assistant.html", "assistant.css"]),
        buildExtension("kittycord-firefox-unpacked", ["keybinds.js", "content.js", "manifestv2.json", "kittycord.png", "editor.html", "editor.css", "studio.html", "studio.css", "assistant.html", "assistant.css"]),
    ]);

    await Promise.all(["chrome", "firefox"].map(browser => new Promise((resolve, reject) => {
        const directory = browser === "chrome" ? "chromium" : "firefox";
        Zip.zip(`dist/browser/kittycord-${directory}-unpacked`, (error, zip) => {
            if (error) return reject(error);
            try {
                zip.compress().save(`dist/kittycord-extension-${browser}.zip`, error => {
                    if (error) return reject(error);
                    console.info(`Packed Kittencord ${browser} extension.`);
                    resolve(undefined);
                });
            } catch (error) {
                reject(error);
            }
        });
    })));
    await Promise.all(["chrome", "firefox"].map(browser => copyFile(`dist/kittycord-extension-${browser}.zip`, `dist/kittencord-extension-${browser}.zip`)));
} else {
    await appendCssRuntime;
}
