/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

import { extractFile } from "@electron/asar";

if (process.platform !== "win32") throw new Error("The Windows installer requires the Windows .NET Framework compiler.");
const args = process.argv.slice(2);
const options = new Map();
const usage = "Usage: buildInstaller.mjs [--artwork original|user-supplied-image.png|mambo.mp4] [--output directory] [--release-base url] [--embed-core]";
for (let index = 0; index < args.length; index++) {
    if (args[index] === "--embed-core" && !options.has("--embed-core")) { options.set("--embed-core", true); continue; }
    if (!["--artwork", "--output", "--release-base"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error(usage);
    options.set(args[index], args[++index]);
}
// Release setups download the core from the GitHub release they are attached to.
// --embed-core keeps the core inside the setup for local testing and offline use.
const embedCore = options.get("--embed-core") === true;
const releaseBase = String(options.get("--release-base") ?? "https://github.com/xtufa7/KittenCord/releases/download").replace(/\/+$/, "");
if (!releaseBase.startsWith("https://github.com/")) throw new Error("--release-base must be a GitHub release download address.");
const localArtwork = existsSync("mambo.mp4") ? "mambo.mp4" : "work/installer-mekaiime-user-supplied.png";
const artworkOption = options.get("--artwork");
const artwork = artworkOption === "original" ? undefined : artworkOption ?? (existsSync(localArtwork) ? localArtwork : undefined);
const artworkHash = artwork ? createHash("sha256").update(await readFile(artwork)).digest("hex") : undefined;
const video = artwork && extname(artwork).toLowerCase() === ".mp4";
if (artworkHash && artworkHash !== (video ? "df275b5ef459449189efce8be5aaa30b0dda4eb393c77f4deef2e5e1c07910f1" : "6c70e31c0e2d001bbf2ad6b0b9c07f841e621a21631b06d26134c82cae3d1008")) throw new Error("The selected media differs from the user-supplied file. Review attribution before changing this asset.");
const core = resolve("dist/kittencord-desktop.asar");
const bytes = await readFile(core);
const metadata = JSON.parse(extractFile(core, "package.json").toString());
const pkg = JSON.parse(await readFile("package.json", "utf8"));
if (metadata.name !== "kittencord" || metadata.version !== pkg.version || metadata.main !== "patcher.js") throw new Error("Build the matching Kittencord desktop ASAR first.");
const compiler = resolve(process.env.WINDIR ?? "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
const output = resolve(options.get("--output") ?? "dist/installer");
await mkdir(output, { recursive: true });
const artworkResource = resolve(output, video ? "video.mp4" : "artwork.png");
if (artwork) await writeFile(artworkResource, await readFile(artwork));
const coreProvenance = JSON.parse(await readFile("dist/kittencord-desktop.json", "utf8"));
const tag = `v${pkg.version}${coreProvenance.channel === "beta" ? `-beta.${pkg.kittencordBeta ?? 1}` : ""}`;
const coreFile = `kittencord-core-${tag.slice(1)}.asar.gz`;
await writeFile(resolve(output, coreFile), gzipSync(bytes, { level: 9 }));
const details = { coreUrl: `${releaseBase}/${tag}/${coreFile}`, coreFile, coreEmbedded: String(embedCore), product: "Kittencord", version: pkg.version, channel: coreProvenance.channel, setupRevision: "2", betaSequence: String(pkg.kittencordBeta ?? 1), coreSourceCommit: coreProvenance.sourceCommit, setupSourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), setupModified: execFileSync("git", ["status", "--porcelain", "--", "installer", "scripts/kittycord/buildInstaller.mjs"], { encoding: "utf8" }).trim().length > 0, sha256: createHash("sha256").update(bytes).digest("hex"), brandLogoSha256: createHash("sha256").update(await readFile("installer/brand-logo.png")).digest("hex"), artwork: video ? "mambo-user-supplied-video" : artwork ? "mekaiime-user-supplied" : "project-original" };
await writeFile(resolve(output, "metadata.json"), JSON.stringify(details, null, 4));
const executable = resolve(output, "KittencordSetup.exe");
const png = await readFile("installer/brand-icon.png");
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
if (width > 256 || height > 256) throw new Error("Installer icon must be at most 256 pixels.");
const icon = Buffer.alloc(22); icon.writeUInt16LE(1, 2); icon.writeUInt16LE(1, 4); icon[6] = width % 256; icon[7] = height % 256; icon.writeUInt16LE(1, 10); icon.writeUInt16LE(32, 12); icon.writeUInt32LE(png.length, 14); icon.writeUInt32LE(22, 18);
await writeFile(resolve(output, "Kittencord.ico"), Buffer.concat([icon, png]));
await writeFile(resolve(output, "AssemblyInfo.cs"), `using System.Reflection;\n[assembly: AssemblyTitle("Kittencord Setup")]\n[assembly: AssemblyProduct("Kittencord")]\n[assembly: AssemblyVersion("${pkg.version}.${details.setupRevision}")]\n[assembly: AssemblyFileVersion("${pkg.version}.${details.setupRevision}")]\n[assembly: AssemblyCopyright("GPL-3.0-or-later. Kittencord and upstream contributors.")]\n`);
const flags = ["/nologo", "/target:winexe", "/optimize+", "/platform:anycpu", `/out:${executable}`, `/win32icon:${resolve(output, "Kittencord.ico")}`, `/win32manifest:${resolve("installer/app.manifest")}`, "/r:System.Windows.Forms.dll", "/r:System.Drawing.dll", "/r:System.Web.Extensions.dll", ...(embedCore ? [`/resource:${core},core.asar`] : []), `/resource:${resolve(output, "metadata.json")},metadata.json`, `/resource:${resolve("LICENSE")},LICENSE`, `/resource:${resolve("installer/github.png")},github.png`, `/resource:${resolve("installer/brand-logo.png")},brand-logo.png`, ...(artwork ? [`/resource:${artworkResource},${video ? "video.mp4" : "artwork.png"}`] : []), resolve("installer/InstallService.cs"), resolve("installer/Program.cs"), resolve("installer/CreditsForm.cs"), resolve("installer/VideoBackdrop.cs"), resolve(output, "AssemblyInfo.cs")];
const result = spawnSync(compiler, flags, { encoding: "utf8", windowsHide: true });
if (result.status !== 0) throw new Error(result.stdout + result.stderr);
await writeFile(resolve(output, "receipt.json"), JSON.stringify({ ...details, artworkSha256: artworkHash, artworkSource: artworkHash && !video ? "https://x.com/mekaiime/status/1521144757543747584" : undefined, installerSha256: createHash("sha256").update(await readFile(executable)).digest("hex"), authenticode: "unsigned-development", redistribution: artwork ? "Local custom installer. Media redistribution permission unverified; do not publish this variant." : "GPL-3.0-or-later; source and contributor attribution required." }, null, 4));
process.stdout.write(`Built ${executable}\n`);
