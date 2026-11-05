/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { exclusiveProjects } from "../../src/shared/kittycord/exclusives";
import { buildStudioPackage } from "../../src/shared/kittycord/studio";
import { compileStudioProject } from "./compileStudio";

async function main() {
    const [output, ...extra] = process.argv.slice(2);
    if (!output || extra.length) throw new Error("Usage: exportUtilities.ts new-output-directory");
    const directory = resolve(output);
    const compiled = await Promise.all(exclusiveProjects.map(({ project }) => compileStudioProject(project)));
    for (const result of compiled) if (!result.bundle) throw new Error(JSON.stringify(result.diagnostics));
    await mkdir(directory);
    for (const { project, description } of exclusiveProjects) {
        const bundle = await buildStudioPackage(project);
        bundle.manifest.description = description;
        for (const [name, value] of [[`${project.metadata.id}.project.json`, project], [`${project.metadata.id}-${project.metadata.version}.kittycord.json`, bundle]] as const)
            await writeFile(resolve(directory, name), JSON.stringify(value, null, 4) + "\n", { flag: "wx" });
    }
    process.stdout.write(`Exported ${exclusiveProjects.length} compiled and validated utility projects and packages. No plugin code was executed.\n`);
}
main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Utility export failed."}\n`); process.exitCode = 1; });
