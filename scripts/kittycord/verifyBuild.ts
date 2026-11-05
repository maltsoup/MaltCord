/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

import { extractFile } from "@electron/asar";

import { Kittycord } from "../../src/shared/kittycord";
import { verifyBrowserManifest } from "../../src/shared/kittycord/browser";

const root = process.cwd();
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const foundation = JSON.parse(readFileSync("kittycord-upstream.json", "utf8"));
const browserRestrictions: Record<string, string> = JSON.parse(readFileSync("browser/plugin-restrictions.json", "utf8"));
const browserSources: string[] = JSON.parse(readFileSync("dist/browser/extension.js.map", "utf8")).sources;
const browserBundle = readFileSync("dist/browser/extension.js", "utf8");
assert.ok(!browserBundle.includes("Run Snippet"), "Executable support snippets must not be offered by browser builds.");
assert.ok(browserBundle.includes("JavaScript evaluation is unavailable in browser builds."), "The browser LiveFix evaluation rejection is missing.");
for (const [directory, reason] of Object.entries(browserRestrictions)) {
    assert.ok(existsSync(join("src", directory)), `Restricted plugin source must remain available: ${directory}`);
    assert.ok(!browserSources.some(source => source.replaceAll("\\", "/").includes(`/src/${directory}/index.`)), `Restricted plugin entry was bundled for browsers: ${directory}`);
    assert.ok(browserBundle.includes(reason), `Missing browser restriction explanation: ${directory}`);
}
assert.ok(!browserSources.some(source => source.replaceAll("\\", "/").includes("/src/testcordplugins/PanelLayout/modules/registry.tsx")), "The imported module evaluator was bundled for browsers.");
assert.equal(pkg.name, Kittycord.id);
assert.equal(foundation.commit, Kittycord.upstreamCommit);

for (const target of ["desktop", "equibop"]) {
    const file = `dist/kittycord-${target}.asar`;
    assert.ok(statSync(file).size > 0);
    const metadata = JSON.parse(extractFile(file, "package.json").toString("utf8"));
    assert.equal(metadata.name, Kittycord.id);
    assert.equal(metadata.version, pkg.version);
    assert.equal(metadata.main, target === "desktop" ? "patcher.js" : "main.js");
    assert.equal(createHash("sha256").update(readFileSync(`dist/kittencord-${target}.asar`)).digest("hex"), createHash("sha256").update(readFileSync(file)).digest("hex"), "Canonical Kittencord artifact and compatibility alias must match.");
    const isolatedPreload = extractFile(file, "isolated-preload.js").toString("utf8");
    assert.ok(isolatedPreload.includes("KittycordSandboxPort"), "Missing isolated runtime preload relay.");
    assert.doesNotMatch(isolatedPreload, /VencordNative/, "The isolated runtime must not expose the host native bridge.");
    assert.ok(extractFile(file, "security-worker.js").length > 0, "The bounded AST scanner must be packaged separately from the startup module.");
}

for (const target of ["desktop", "web"]) {
    const receipt = JSON.parse(readFileSync(`dist/kittycord-${target}.json`, "utf8"));
    assert.equal(receipt.name, Kittycord.name);
    assert.equal(receipt.version, pkg.version);
    assert.equal(receipt.foundation.commit, foundation.commit);
    assert.equal(receipt.updaterEnabled, false);
    assert.match(receipt.sourceCommit, /^[a-f0-9]{40}$/);
}

for (const [target, version] of [["chromium", 3], ["firefox", 2]] as const) {
    const directory = join(root, `dist/browser/kittycord-${target}-unpacked`);
    const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
    assert.match(manifest.name, /^Kittencord/);
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.manifest_version, version);
    verifyBrowserManifest(manifest, target);
    if (version === 2) assert.equal(manifest.browser_specific_settings.gecko.id, "kittycord-development@kittycord.invalid");
    const files: string[] = [
        ...Object.values<string>(manifest.icons),
        ...manifest.content_scripts.flatMap((script: { js: string[]; }) => script.js),
        ...(manifest.background.scripts ?? [manifest.background.service_worker]),
        ...(manifest.declarative_net_request?.rule_resources.map((rule: { path: string; }) => rule.path) ?? [])
    ];
    for (const file of files) {
        const path = join(directory, file);
        const child = relative(directory, path);
        assert.ok(!isAbsolute(child) && !child.startsWith(".."), `Packaged path escapes the extension: ${file}`);
        assert.ok(existsSync(path), `Missing extension resource: ${file}`);
    }
    assert.ok(existsSync(join(directory, "dist/Kittycord.css")));
    assert.ok(readFileSync(join(directory, "content.js"), "utf8").includes('getURL("dist/Kittycord.css")'), "Extension CSS metadata must keep its packaged resource path.");
    for (const file of ["editor.html", "editor.css", "studio.html", "studio.css", "vendor/monaco/index.js", "vendor/monaco/index.css", "vendor/monaco/studio.js", "vendor/monaco/studio.css", "vendor/monaco/vs/editor/editor.worker.js", "vendor/monaco/vs/language/css/css.worker.js", "vendor/monaco/vs/language/typescript/ts.worker.js", "vendor/monaco/vs/language/json/json.worker.js"])
        assert.ok(statSync(join(directory, file)).size > 0, `Missing packaged editor resource: ${file}`);
    for (const file of ["editor.html", "studio.html", "assistant.html"]) assert.doesNotMatch(readFileSync(join(directory, file), "utf8"), /https?:\/\/|<script(?!\s+(?:type="module"\s+)?src=)/);
    for (const file of ["assistant.html", "assistant.js", "assistant.css"]) assert.ok(statSync(join(directory, file)).size > 0);
    for (const legacy of ["background.js", "service-worker.js", "modifyResponseHeaders.json", "monacoWin.html", "patch-worker.js"])
        assert.ok(!existsSync(join(directory, legacy)), `Obsolete browser bypass resource was packaged: ${legacy}`);
}

for (const browser of ["chrome", "firefox"]) {
    assert.ok(statSync(`dist/kittycord-extension-${browser}.zip`).size > 0);
    assert.equal(createHash("sha256").update(readFileSync(`dist/kittencord-extension-${browser}.zip`)).digest("hex"), createHash("sha256").update(readFileSync(`dist/kittycord-extension-${browser}.zip`)).digest("hex"));
}

assert.ok(statSync("dist/Kittycord.user.js").size > 0);
process.stdout.write("Verified Kittencord desktop metadata, provenance, compatibility aliases and packaged extension resources. Live client and browser behavior still require testing.\n");
