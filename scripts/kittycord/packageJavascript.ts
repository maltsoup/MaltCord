/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

import { readBoundedJson } from "../../src/main/kittycord/files";
import { parseExternalPackage } from "../../src/shared/kittycord/javascriptPackage";
import { checkedObject } from "../../src/shared/kittycord/manifest";

async function main() {
    const [manifestPath, sourcePath, output, ...extra] = process.argv.slice(2);
    if (!manifestPath || !sourcePath || !output || extra.length) throw new Error("Usage: packageJavascript.ts manifest.json plugin.js unused-package.json");
    if ((await stat(sourcePath)).size > 65_536) throw new Error("JavaScript source exceeds 64 KiB.");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(sourcePath));
    const manifest = checkedObject(readBoundedJson(manifestPath, 65_536), ["schemaVersion", "id", "name", "version", "author", "publisher", "description", "minApiVersion", "platforms", "loadingMode", "dependencies", "optionalDependencies", "capabilities", "exclusiveCapabilities", "permissions", "requiredPatches", "incompatibleWith", "entrypoints", "provenance", "integrity", "updateSource", "discordBuild"], "Manifest");
    const bundle = parseExternalPackage({ schemaVersion: 1, artifact: source, manifest: { ...manifest, integrity: { algorithm: "sha256", digest: createHash("sha256").update(source).digest("hex") } } });
    await writeFile(output, JSON.stringify(bundle, null, 4) + "\n", { flag: "wx" });
    process.stdout.write("Packaged isolated JavaScript without executing it. Import the JSON into External Plugin Manager for review; packaging does not certify safety.\n");
}
main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "JavaScript packaging failed."}\n`); process.exitCode = 1; });
