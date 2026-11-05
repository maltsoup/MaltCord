/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readBoundedJson } from "../../src/main/kittycord/files";
import { createPortableDistribution } from "../../src/main/kittycord/portable";

async function main() {
    const [command, directory, ...args] = process.argv.slice(2);
    if (!directory || !["initialize", "prepare", "status", "update", "repair-initial", "download", "rollback", "launch", "vanilla"].includes(command)) throw new Error("Usage: portable <initialize|prepare|status|update|repair-initial|download|rollback|launch|vanilla> absolute-root [arguments]. See PORTABLE.md.");
    const distribution = createPortableDistribution(directory);
    if (command === "initialize") {
        const [metadata, artifact, keyId, keyFile, channel, ...extra] = args;
        if (!metadata || !artifact || !keyId || !keyFile || !["stable", "beta", "development"].includes(channel) || extra.length) throw new Error("initialize requires signed-metadata artifact key-id public-key.pem stable|beta|development.");
        const result = distribution.initialize({ schemaVersion: 1, channel: channel as "stable" | "beta" | "development", trustRoots: { [keyId]: readFileSync(keyFile, "utf8") } }, readBoundedJson(metadata), readFileSync(artifact)); console.log(JSON.stringify(result)); return;
    }
    if (command === "prepare") { if (args.length !== 1) throw new Error("prepare requires the installed Discord application directory. Authentication data is never imported."); console.log(JSON.stringify(distribution.prepare(args[0]))); return; }
    if (command === "update") { if (args.length !== 2) throw new Error("update requires signed-metadata artifact. Close the portable client first."); console.log(JSON.stringify(distribution.install(readBoundedJson(args[0]), readFileSync(args[1])))); return; }
    if (command === "repair-initial") { if (args.length !== 2) throw new Error("repair-initial requires signed-metadata artifact and applies only to an unconfirmed first release with no fallback."); console.log(JSON.stringify(distribution.repairInitial(readBoundedJson(args[0]), readFileSync(args[1])))); return; }
    if (command === "download") { if (args.length !== 1) throw new Error("download requires the configured HTTPS release directory."); console.log(JSON.stringify(await distribution.download(args[0]))); return; }
    if (args.length) throw new Error("This command accepts no additional arguments.");
    if (command === "status") { console.log(JSON.stringify(distribution.status(), null, 2)); return; }
    if (command === "rollback") { console.log(JSON.stringify(distribution.rollback())); return; }
    const root = distribution.paths; if (!existsSync(root.executable)) throw new Error("Prepare the portable runtime first.");
    const boot = command === "launch" ? distribution.beginLaunch() : undefined;
    if (!boot) distribution.prepareVanilla();
    const shim = `const {app}=require("electron"),path=require("path");
const root=path.resolve(process.resourcesPath,"../..");
process.env.DISCORD_USER_DATA_DIR=path.join(root,"Data/Discord");process.env.KITTYCORD_USER_DATA_DIR=path.join(root,"Data/Kittycord");process.env.DISABLE_UPDATER_AUTO_PATCHING="1";
app.setPath("appData",path.join(root,"Data/AppData"));app.setPath("userData",path.join(root,"Data/Discord"));app.setPath("sessionData",path.join(root,"Data/Session"));
app.setAsDefaultProtocolClient=()=>false;app.removeAsDefaultProtocolClient=()=>false;app.setLoginItemSettings=()=>{};app.setUserTasks=()=>false;
${boot ? `try{const core=path.join(root,"Updates/versions",${JSON.stringify(boot.launch.slot + ".asar")});const hash=require("crypto").createHash("sha256").update(require("original-fs").readFileSync(core)).digest("hex");if(hash!==${JSON.stringify(createHash("sha256").update(readFileSync(boot.path)).digest("hex"))})throw Error("Core integrity changed after selection");require(path.join(core,"patcher.js"));}catch{console.error("[Kittycord Portable] Core bootstrap or integrity verification failed. The original Discord installation was not modified.");app.exit(1);}` : 'const original=path.join(process.resourcesPath,"_app.asar");const pkg=require(path.join(original,"package.json"));if(!require.main)throw Error("Missing Electron entry point");require.main.filename=path.join(original,pkg.main);app.setAppPath(original);require(require.main.filename);'}`;
    writeFileSync(join(root.root, "Runtime/resources/app.asar/index.js"), shim);
    let confirmed = false; let checking = false;
    let confirmationError = "";
    const observer = boot ? watch(join(root.kitty), { recursive: true }, () => {
        if (confirmed || checking) return; checking = true;
        try { if (distribution.confirm(boot.launch.id)) { confirmed = true; console.log("Portable Kittycord startup confirmed. Signed release retained."); observer?.close(); } } catch (problem) { if (!confirmationError) { confirmationError = problem instanceof Error ? problem.message : "Startup confirmation failed."; console.error(confirmationError); } } finally { checking = false; }
    }) : undefined;
    const child = spawn(root.executable, [], { windowsHide: true, stdio: "inherit", env: { ...process.env, ELECTRON_RUN_AS_NODE: "", DISCORD_USER_DATA_DIR: root.discord, KITTYCORD_USER_DATA_DIR: root.kitty, APPDATA: join(root.data, "AppData"), LOCALAPPDATA: join(root.data, "LocalAppData"), DISABLE_UPDATER_AUTO_PATCHING: "1" } });
    console.log(`Portable client started (PID ${child.pid}).`);
    try {
        const code = await new Promise<number | null>((resolveExit, reject) => { child.once("error", reject); child.once("exit", resolveExit); });
        if (boot && !confirmed) throw new Error("Portable startup was not confirmed. Kittycord currently confirms after Discord connects and plugin startup completes; a logged-out session cannot satisfy that gate. A previous signed release will be recovered on the next launch if available.");
        process.exitCode = code ?? 1;
    } finally { observer?.close(); if (boot) distribution.endLaunch(boot.launch.id); }
}
main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Portable operation failed."}\n`); process.exitCode = 1; });
