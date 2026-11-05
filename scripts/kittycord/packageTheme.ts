/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

import { checkedObject } from "../../src/shared/kittycord/manifest";
import { verifyThemePackage } from "../../src/shared/kittycord/themePackage";

async function main() {
    const [manifestPath, artifactPath, outputPath, ...extra] = process.argv.slice(2);
    if (!manifestPath || !artifactPath || !outputPath || extra.length) throw new Error("Usage: pnpm exec tsx scripts/kittycord/packageTheme.ts manifest.json theme.json output.kittycord.json");
    if ((await stat(manifestPath)).size > 65_536 || (await stat(artifactPath)).size > 4096) throw new Error("Manifest or theme data exceeds the supported size.");
    const input: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("The manifest must be an object.");
    const artifact = await readFile(artifactPath, "utf8");
    const manifest = { ...checkedObject(input, Object.keys(input), "Manifest"), integrity: { algorithm: "sha256", digest: createHash("sha256").update(artifact).digest("hex") } };
    const bundle = await verifyThemePackage({ schemaVersion: 1, manifest, artifact });
    await writeFile(outputPath, JSON.stringify(bundle, null, 4) + "\n", { flag: "wx" });
    process.stdout.write(`Created a validated theme package. SHA-256: ${bundle.manifest.integrity.digest}\nPublisher identity has not been authenticated. Review the package in External Plugin Manager before activation.\n`);
}

main().catch(() => {
    process.stderr.write("Theme packaging failed. Check the v1 manifest, supported color tokens, input paths and that the output file does not already exist. No client configuration was changed.\n");
    process.exitCode = 1;
});
