/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import ts from "typescript";

import { planBuiltinDependencies } from "../../src/shared/kittycord/builtinDependencies";
import { parseDevs, parseEquicordDevs, parseFile, parseTestcordDevs } from "../utils";

async function main() {
    const [input, output, ...extra] = process.argv.slice(2);
    if (!input || !output || extra.length) throw new Error("Usage: auditBuiltinDependencies.ts source-map.json unused-report.json");
    if ((await stat(input)).size > 80 * 1024 * 1024) throw new Error("Source map exceeds the audit limit.");
    const mapText = await readFile(input, "utf8");
    const map: { sources: string[]; sourcesContent: string[]; } = JSON.parse(mapText);
    if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent) || map.sources.length !== map.sourcesContent.length || map.sources.length > 30_000)
        throw new Error("Expected a bounded build source map with source content.");
    const registry = map.sources.indexOf("import-plugins:~plugins");
    if (registry < 0) throw new Error("No generated built-in registry found in this source map.");
    const root = resolve("src");
    const contents = new Map(map.sources.map((source, index) => [resolve(dirname(input), source), map.sourcesContent[index]]));
    const ast = ts.createSourceFile("registry.ts", map.sourcesContent[registry], ts.ScriptTarget.Latest, true);
    parseDevs(); parseEquicordDevs(); parseTestcordDevs();
    const entries: { name: string; id?: string; aliases: string[]; dependencies: string[]; source: string; sha256: string; }[] = [];
    for (const statement of ast.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const source = resolve(root, statement.moduleSpecifier.text);
        const child = relative(root, source);
        if (isAbsolute(child) || child.startsWith("..")) throw new Error("Registry import escapes the source directory.");
        const path = [source + ".ts", source + ".tsx", resolve(source, "index.ts"), resolve(source, "index.tsx")].find(existsSync);
        if (!path) throw new Error(`Missing plugin entry: ${child}`);
        const text = await readFile(path, "utf8");
        if (contents.get(path) !== text) throw new Error(`Source changed since this build: ${child}. Rebuild before auditing.`);
        const [metadata] = await parseFile(path);
        if (await readFile(path, "utf8") !== text) throw new Error(`Source changed during audit: ${child}. Retry with a stable checkout.`);
        entries.push({ name: metadata.name, ...(metadata.id ? { id: metadata.id } : {}), aliases: metadata.aliases ?? [], dependencies: metadata.dependencies ?? [],
            source: relative(process.cwd(), path).replaceAll("\\", "/"), sha256: createHash("sha256").update(text).digest("hex") });
    }
    if (!entries.length) throw new Error("No plugin entries found.");
    const raw = new Map(entries.map(plugin => [plugin.name, plugin]));
    const aliases = new Map<string, typeof entries[number]>();
    for (const plugin of raw.values()) for (const name of [plugin.id, plugin.name, ...plugin.aliases]) {
        if (name) { aliases.set(name, plugin); aliases.set(name.toLowerCase(), plugin); }
    }
    const lookup = (name: string) => raw.get(name) ?? aliases.get(name) ?? aliases.get(name.toLowerCase());
    const findings = [...raw.values()].flatMap(plugin => {
        const plan = planBuiltinDependencies(plugin, lookup);
        return plan.problem ? [{ plugin: plugin.name, source: plugin.source, ...plan.problem }] : [];
    });
    const report = { schemaVersion: 1, scope: "Static declared built-in dependencies from the exact generated build registry and matching source files. No plugin execution, API/patch safety proof or runtime readiness assessment.",
        sourceMapSha256: createHash("sha256").update(mapText).digest("hex"), registryEntries: entries.length, uniqueNames: raw.size, findings, entries };
    await writeFile(output, JSON.stringify(report, null, 4) + "\n", { flag: "wx" });
    process.stdout.write(`${entries.length} registry entries, ${raw.size} unique names, ${findings.length} dependency findings. Report: ${output}\n`);
    if (findings.length) process.exitCode = 1;
}

main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Built-in dependency audit failed."}\n`); process.exitCode = 1; });
