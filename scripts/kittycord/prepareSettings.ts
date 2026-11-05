/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { open, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { prepareKittycordPreferencesImport } from "../../src/shared/kittycordMigration";

async function main() {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) throw new Error("Usage: pnpm kittycord:prepare-settings <legacy JSON> <new JSON>");
    const source = resolve(input);
    const destination = resolve(output);
    if (source === destination) throw new Error("Choose a new output file. The original backup must be preserved.");
    if ((await stat(source)).size > 8 * 1024 * 1024) throw new Error("The settings backup exceeds 8 MiB.");
    let parsed: unknown;
    const contents = await readFile(source, "utf8");
    try {
        parsed = JSON.parse(contents);
    } catch {
        throw new Error("The settings backup is not valid JSON. No output was created.");
    }
    const prepared = prepareKittycordPreferencesImport(parsed);
    const file = await open(destination, "wx", 0o600);
    try {
        await file.writeFile(JSON.stringify(prepared, null, 4) + "\n");
    } finally {
        await file.close();
    }
    process.stdout.write("Prepared Kittycord preferences. Review the JSON, export your current Kittycord settings, then import this file through Backup & Restore. Plugin credentials and arbitrary plugin values were excluded.\n");
}

main().catch((error: unknown) => {
    process.stderr.write((error instanceof Error ? error.message : "Settings preparation failed.") + "\n");
    process.exitCode = 1;
});
