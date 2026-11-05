/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { PLATFORMS } from "../../src/shared/kittycord/manifest";
import { analyzeSourceCompatibility } from "./sourceCompatibility";

async function main() {
    const [sourcePath, requestedPlatform, output, ...extra] = process.argv.slice(2);
    const platform = PLATFORMS.find(value => value === requestedPlatform);
    if (!sourcePath || !platform || !output || extra.length) throw new Error("Usage: inspectCompatibility.ts plugin.tsx windows|linux|macos|chrome|edge|firefox unused-report.json");
    if ((await stat(sourcePath)).size > 1024 * 1024) throw new Error("Source analysis is limited to 1 MiB.");
    const bytes = await readFile(sourcePath);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const aliases = { "@api/": "src/api", "@utils/": "src/utils", "@components/": "src/components", "@webpack/": "src/webpack", "@plugins/": "src/plugins", "@equicordplugins/": "src/equicordplugins", "@testcordplugins/": "src/testcordplugins" };
    const report = analyzeSourceCompatibility(source, platform, name => {
        if (name === "@webpack") name = "@webpack/index";
        if (["~plugins", "~git-hash", "~git-branch"].includes(name)) return true;
        const alias = Object.entries(aliases).find(([prefix]) => name.startsWith(prefix));
        if (!alias) return false;
        const root = resolve(alias[1]);
        const candidate = resolve(root, name.slice(alias[0].length));
        if (!candidate.startsWith(root + sep)) return false;
        return [".ts", ".tsx", "/index.ts", "/index.tsx"].some(suffix => existsSync(candidate + suffix));
    });
    await writeFile(output, JSON.stringify({ ...report, sourceSha256: createHash("sha256").update(bytes).digest("hex") }, null, 4) + "\n", { flag: "wx" });
    process.stdout.write("Static compatibility report written. Source was not executed or modified. This is not installation approval.\n");
}

main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Compatibility inspection failed."}\n`); process.exitCode = 1; });
