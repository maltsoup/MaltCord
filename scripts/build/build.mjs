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

import { createPackage } from "@electron/asar";
import { copyFile, cp, mkdir, readdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { editorBuildConfigs } from "./editorAssets.mjs";

import {
    BUILD_TIMESTAMP,
    buildIdentity,
    commonOpts,
    exists,
    globPlugins,
    IS_DEV,
    IS_REPORTER,
    IS_COMPANION_TEST,
    IS_STANDALONE,
    IS_UPDATER_DISABLED,
    resolvePluginName,
    VERSION,
    commonRendererPlugins,
    watch,
    buildOrWatchAll,
    stringifyValues,
    IS_ANTI_CRASH_TEST,
} from "./common.mjs";

const defines = stringifyValues({
    IS_STANDALONE,
    IS_DEV,
    IS_REPORTER,
    IS_COMPANION_TEST,
    IS_UPDATER_DISABLED,
    IS_ANTI_CRASH_TEST,
    IS_WEB: false,
    IS_EXTENSION: false,
    IS_USERSCRIPT: false,
    VERSION,
    BUILD_TIMESTAMP,
});

if (defines.IS_STANDALONE === "false") {
    // If this is a local build (not standalone), optimize
    // for the specific platform we're on
    defines["process.platform"] = JSON.stringify(process.platform);
}



/**
 * @type {import("esbuild").BuildOptions}
 */
const nodeCommonOpts = {
    ...commonOpts,
    define: defines,
    format: "cjs",
    platform: "node",
    target: ["esnext"],
    external: [
        "electron",
        "original-fs",
        "~pluginNatives",
        ...(commonOpts.external ?? []),
    ],
};

const sourceMapFooter = (s) =>
    watch ? "" : `//# sourceMappingURL=vencord://${s}.js.map`;
const sourcemap = watch ? "inline" : "external";

/**
 * @type {import("esbuild").Plugin}
 */
const globNativesPlugin = {
    name: "glob-natives-plugin",
    setup: (build) => {
        const filter = /^~pluginNatives$/;
        build.onResolve({ filter }, (args) => {
            return {
                namespace: "import-natives",
                path: args.path,
            };
        });

        build.onLoad({ filter, namespace: "import-natives" }, async () => {
            const pluginDirs = [
                "plugins",
                "userplugins",
                "equicordplugins",
                "testcordplugins",
                "kittencordplugins",
                "Betterdiscordplugins",
            ];
            let code = "";
            let i = 0;
            const entries = new Map();
            /**
             * @type {string[]}
             */
            const watchFiles = [];
            for (const dir of pluginDirs) {
                const dirPath = join("src", dir);
                if (!(await exists(dirPath))) continue;
                const plugins = await readdir(dirPath, { withFileTypes: true });
                for (const file of plugins) {
                    const fileName = file.name;
                    const nativePath = join(dirPath, fileName, "native.ts");
                    const indexNativePath = join(
                        dirPath,
                        fileName,
                        "native/index.ts",
                    );

                    watchFiles.push(
                        resolve(nativePath),
                        resolve(indexNativePath),
                    );

                    if (
                        !(await exists(nativePath)) &&
                        !(await exists(indexNativePath))
                    )
                        continue;

                    const pluginName = await resolvePluginName(dirPath, file);

                    const mod = `p${i}`;
                    code += `import * as ${mod} from "./${dir}/${fileName}/native";\n`;
                    entries.set(pluginName, mod);
                    i++;
                }
            }
            let natives = "\n";
            for (const [pluginName, mod] of entries) {
                natives += `${JSON.stringify(pluginName)}:${mod},\n`;
            }
            code += `export default {${natives}};`;
            return {
                contents: code,
                resolveDir: "./src",
                watchDirs: pluginDirs.map((d) => resolve("src", d)),
                watchFiles,
            };
        });
    },
};

/** @type {import("esbuild").BuildOptions[]} */
const buildConfigs = [
    // Discord Desktop main & renderer & preload
    {
        ...nodeCommonOpts,
        entryPoints: [
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../src/main/index.ts",
            ),
        ],
        outfile: "dist/desktop/patcher.js",
        footer: {
            js:
                "//# sourceURL=file:///VencordPatcher\n" +
                sourceMapFooter("patcher"),
        },
        sourcemap,
        plugins: [
            // @ts-ignore this is never undefined
            ...nodeCommonOpts.plugins,
            globNativesPlugin,
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "false",
        },
    },
    {
        ...commonOpts,
        entryPoints: [
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../src/Vencord.ts",
            ),
        ],
        outfile: "dist/desktop/renderer.js",
        format: "iife",
        target: ["esnext"],
        footer: {
            js:
                "//# sourceURL=file:///VencordRenderer\n" +
                sourceMapFooter("renderer"),
        },
        globalName: "Vencord",
        sourcemap,
        plugins: [globPlugins("discordDesktop"), ...commonOpts.plugins],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "false",
        },
    },
    {
        ...nodeCommonOpts,
        entryPoints: [
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../src/preload.ts",
            ),
        ],
        outfile: "dist/desktop/preload.js",
        footer: {
            js:
                "//# sourceURL=file:///VencordPreload\n" +
                sourceMapFooter("preload"),
        },
        sourcemap,
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "false",
        },
    },

    // Vencord Desktop main & renderer & preload
    {
        ...nodeCommonOpts,
        entryPoints: [
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../src/main/index.ts",
            ),
        ],
        outfile: "dist/equibop/main.js",
        footer: {
            js:
                "//# sourceURL=file:///VencordDesktopMain\n" +
                sourceMapFooter("main"),
        },
        sourcemap,
        plugins: [...nodeCommonOpts.plugins, globNativesPlugin],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "true",
        },
    },
    {
        ...commonOpts,
        entryPoints: [
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../src/Vencord.ts",
            ),
        ],
        outfile: "dist/equibop/renderer.js",
        format: "iife",
        target: ["esnext"],
        footer: {
            js:
                "//# sourceURL=file:///VencordDesktopRenderer\n" +
                sourceMapFooter("renderer"),
        },
        globalName: "Vencord",
        sourcemap,
        plugins: [globPlugins("equibop"), ...commonRendererPlugins],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "true",
        },
    },
    {
        ...nodeCommonOpts,
        entryPoints: [
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../src/preload.ts",
            ),
        ],
        outfile: "dist/equibop/preload.js",
        footer: {
            js:
                "//# sourceURL=file:///VencordPreload\n" +
                sourceMapFooter("preload"),
        },
        sourcemap,
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "false",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "true",
        },
    },
];

for (const target of ["desktop", "equibop"]) buildConfigs.push({
    ...nodeCommonOpts,
    entryPoints: ["src/isolated-preload.ts"],
    outfile: `dist/${target}/isolated-preload.js`,
    sourcemap,
});

for (const target of ["desktop", "equibop"]) buildConfigs.push({ ...nodeCommonOpts, entryPoints: ["src/studio-preload.ts"], outfile: `dist/${target}/studio-preload.js`, sourcemap });
for (const target of ["desktop", "equibop"]) buildConfigs.push({ ...nodeCommonOpts, entryPoints: ["src/security-worker.ts"], outfile: `dist/${target}/security-worker.js`, sourcemap });
await buildOrWatchAll([...buildConfigs, ...editorBuildConfigs("dist/studio")]);

for (const file of ["studio.html", "native-studio.html", "studio.css", "editor.css"]) await copyFile(`browser/${file}`, `dist/studio/${file}`);
for (const target of ["desktop", "equibop"]) {
    await mkdir(`dist/${target}/studio`, { recursive: true });
    await cp("dist/studio", `dist/${target}/studio`, { recursive: true });
}

const compilerRequire = createRequire(createRequire(import.meta.url).resolve("esbuild"));
const esbuildPackage = process.platform === "win32" ? `@esbuild/win32-${process.arch}/esbuild.exe` : `@esbuild/${process.platform}-${process.arch}/bin/esbuild`;
for (const target of ["desktop", "equibop"]) {
    await mkdir(`dist/${target}/native-studio`, { recursive: true });
    await copyFile(compilerRequire.resolve(esbuildPackage), `dist/${target}/native-studio/${process.platform === "win32" ? "esbuild.exe" : "esbuild"}`);
}

await Promise.all([
    writeFile(
        "dist/desktop/package.json",
        JSON.stringify({
            name: "kittencord",
            version: VERSION,
            main: "patcher.js",
        }),
    ),
    writeFile(
        "dist/equibop/package.json",
        JSON.stringify({
            name: "kittencord",
            version: VERSION,
            main: "main.js",
        }),
    ),
]);

await Promise.all([
    createPackage("dist/desktop", "dist/desktop.asar"),
    createPackage("dist/equibop", "dist/equibop.asar"),
]);

await Promise.all([
    copyFile("dist/desktop.asar", "dist/kittycord-desktop.asar"),
    copyFile("dist/equibop.asar", "dist/kittycord-equibop.asar"),
    copyFile("dist/desktop.asar", "dist/kittencord-desktop.asar"),
    copyFile("dist/equibop.asar", "dist/kittencord-equibop.asar"),
    writeFile("dist/kittencord-desktop.json", JSON.stringify(buildIdentity, null, 4)),
    writeFile("dist/kittycord-desktop.json", JSON.stringify(buildIdentity, null, 4))
]);
