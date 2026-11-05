/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** @param {string} root @param {import("esbuild").Plugin[]} workers @param {import("esbuild").Plugin[]} editors @returns {import("esbuild").BuildOptions[]} */
export function editorBuildConfigs(root, workers = [], editors = []) {
    return [{
        entryPoints: ["vs/language/css/css.worker.js", "vs/editor/editor.worker.js", "vs/language/typescript/ts.worker.js", "vs/language/json/json.worker.js"].map(entry => `node_modules/monaco-editor/esm/${entry}`),
        metafile: true, plugins: workers, legalComments: "eof", bundle: true, minify: !process.argv.includes("--watch"), format: "iife", outbase: "node_modules/monaco-editor/esm/", outdir: `${root}/vendor/monaco`
    }, {
        entryPoints: { index: "browser/monaco.ts", studio: "browser/studio.ts", "native-studio": "browser/native-studio.ts" }, metafile: true, plugins: editors, legalComments: "eof", bundle: true, minify: !process.argv.includes("--watch"), format: "esm", splitting: true, outdir: `${root}/vendor/monaco`, loader: { ".ttf": "file" }
    }];
}
