/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === "--export")) throw new Error("Usage: preparePublication.mjs [--export output-directory]");
const files = [...new Set(git("ls-files", "-c", "-o", "--exclude-standard", "-z").split("\0").filter(Boolean))];
const inheritedKeys = new Set(["src/testcordplugins/TranslatePremium/index.tsx", "src/testcordplugins/nativeTranslate/utils.ts", "src/plugins/translate/utils.ts"]);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{30,}\b/, /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, /\bAIza[A-Za-z0-9_-]{30,}\b/, /\bsk-(?:proj-)?[A-Za-z0-9_-]{35,}\b/];
const findings = [];
for (const file of files) {
    if (/^(?:work|dist|settings)(?:\/|$)|(?:^|\/)(?:node_modules|\.cache|\.secrets)(?:\/|$)|^website\/dist\//.test(file) || /(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|pfx|p12|exe|asar|zip|sqlite|log)$/i.test(file)) findings.push({ file, reason: "Private or generated file in the publication source set." });
    const location = path.resolve(root, file);
    let info;
    try { info = await stat(location); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (info.size > 5 * 1024 * 1024 || /\.(?:png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp3|mp4|ogg)$/i.test(file)) continue;
    const content = await readFile(location, "utf8");
    if (patterns.some(pattern => pattern.test(content))) {
        const inherited = inheritedKeys.has(file) && git("show", `af92dbaec665c7e7106c3503cfb6691248d03623:${file}`) === content;
        if (!inherited) findings.push({ file, reason: "Credential pattern requires review." });
    }
}
const report = { sourceCommit: git("rev-parse", "HEAD").trim(), files: files.length, findings, note: "Heuristic source hygiene check, not proof that no secret exists. No remote writes are performed." };
await mkdir(path.resolve(root, "work"), { recursive: true });
await writeFile(path.resolve(root, "work/publication-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (findings.length) throw new Error("Resolve publication findings before exporting.");
if (args.length) {
    if (git("status", "--porcelain").trim()) throw new Error("Commit the reviewed changes before exporting an exact publication snapshot.");
    const output = path.resolve(root, args[1]);
    if (output === root) throw new Error("Choose an output directory separate from the source root.");
    await mkdir(output, { recursive: true });
    const version = JSON.parse(await readFile(path.resolve(root, "package.json"), "utf8")).version;
    const archive = path.resolve(output, `Kittencord-${version}-Source.zip`);
    const bundle = path.resolve(output, `Kittencord-${version}-History.bundle`);
    git("archive", "--format=zip", "--prefix=Kittencord/", `--output=${archive}`, "HEAD");
    git("bundle", "create", bundle, "HEAD");
    git("bundle", "verify", bundle);
    const hashes = {};
    for (const file of [archive, bundle]) hashes[path.basename(file)] = createHash("sha256").update(await readFile(file)).digest("hex");
    await writeFile(path.resolve(output, "publication.json"), JSON.stringify({ ...report, version, hashes }, null, 2));
    console.log(`Clean source and complete HEAD ancestry exported to ${output}.`);
}
