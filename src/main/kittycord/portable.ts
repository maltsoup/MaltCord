/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { extractFile } from "@electron/asar";
import { Kittycord } from "@shared/kittycord";
import { checkedObject } from "@shared/kittycord/manifest";
import { parseStartupJournal } from "@shared/kittycord/recovery";

import { atomicWriteJson, readBoundedJson } from "./files";
import { type ReleaseChannel, verifyArtifact, verifySignedRelease } from "./releases";
import { createReleaseSlots } from "./releaseSlots";

interface PortableConfig { schemaVersion: 1; channel: ReleaseChannel; trustRoots: Record<string, string>; }
interface PortableBoot { schemaVersion: 1; id: string; slot: string; confirmed: boolean; pid?: number; recoverySession?: string; }
function contained(root: string, child: string) { const result = resolve(root, child); if (!relative(root, result) || relative(root, result).startsWith("..") || isAbsolute(relative(root, result))) throw new Error("Portable path escaped its root."); return result; }
function treeWithoutLinks(path: string) {
    if (lstatSync(path).isSymbolicLink()) throw new Error("Portable input cannot contain symbolic links.");
    if (lstatSync(path).isDirectory()) for (const file of readdirSync(path)) treeWithoutLinks(join(path, file));
}
export function createPortableDistribution(root: string, alive: (pid: number) => boolean = pid => { try { process.kill(pid, 0); return true; } catch { return false; } }) {
    if (!isAbsolute(root)) throw new Error("Portable root must be absolute.");
    mkdirSync(root, { recursive: true }); if (lstatSync(root).isSymbolicLink()) throw new Error("Portable root cannot be a symbolic link.");
    const configFile = contained(root, "portable.json"); const bootFile = contained(root, "launch.json");
    const data = contained(root, "Data"); const kitty = contained(root, "Data/Kittycord"); const discord = contained(root, "Data/Discord");
    function boot(): PortableBoot | undefined {
        if (!existsSync(bootFile)) return;
        if (lstatSync(bootFile).isSymbolicLink()) throw new Error("Portable launch state cannot be a link.");
        const value = checkedObject(readBoundedJson(bootFile), ["schemaVersion", "id", "slot", "confirmed", "pid", "recoverySession"], "Portable launch");
        if (value.schemaVersion !== 1 || typeof value.id !== "string" || !/^[a-f0-9-]{36}$/.test(value.id) || typeof value.slot !== "string" || !/^[a-f0-9]{64}$/.test(value.slot) || typeof value.confirmed !== "boolean" || value.pid !== undefined && (!Number.isSafeInteger(value.pid) || Number(value.pid) < 1) || value.recoverySession !== undefined && typeof value.recoverySession !== "string") throw new Error("Invalid portable launch state.");
        return { schemaVersion: 1, id: value.id, slot: value.slot, confirmed: value.confirmed, ...(value.pid !== undefined ? { pid: Number(value.pid) } : {}), ...(typeof value.recoverySession === "string" ? { recoverySession: value.recoverySession } : {}) };
    }
    function idle() { const previous = boot(); if (previous?.pid && alive(previous.pid)) throw new Error("Close the portable client before changing or launching its release."); }
    function validateCore(input: unknown, artifact: Uint8Array, config: PortableConfig) {
        const verified = verifySignedRelease(input, config.trustRoots, { platform: process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux", target: "desktop", channel: config.channel, apiVersion: Kittycord.apiVersion });
        verifyArtifact(artifact, verified.artifact);
        const directory = contained(root, "Verified"); mkdirSync(directory, { recursive: true }); if (lstatSync(directory).isSymbolicLink()) throw new Error("Verified release storage cannot be a link.");
        const file = join(directory, `${verified.artifact.sha256}.asar`);
        if (!existsSync(file)) writeFileSync(file, artifact, { flag: "wx", mode: 0o600 });
        if (lstatSync(file).isSymbolicLink()) throw new Error("Verified release cannot be a link."); verifyArtifact(readFileSync(file), verified.artifact);
        const bytes = extractFile(file, "package.json"); if (bytes.byteLength > 4096) throw new Error("Core metadata exceeds its limit.");
        const metadata = checkedObject(JSON.parse(bytes.toString("utf8")), ["name", "version", "main"], "Kittycord core");
        if (!["kittycord", "kittencord"].includes(String(metadata.name)) || metadata.version !== verified.release.version || metadata.main !== "patcher.js" || !extractFile(file, "patcher.js").byteLength) throw new Error("Release does not contain the declared Kittencord desktop core.");
    }
    function slots() {
        if (lstatSync(configFile).isSymbolicLink()) throw new Error("Portable configuration cannot be a link.");
        const value = checkedObject(readBoundedJson(configFile), ["schemaVersion", "channel", "trustRoots"], "Portable configuration");
        if (value.schemaVersion !== 1 || !["stable", "beta", "development"].includes(String(value.channel))) throw new Error("Invalid portable channel.");
        const trustRoots = checkedObject(value.trustRoots, Object.keys(value.trustRoots && typeof value.trustRoots === "object" ? value.trustRoots : {}), "Release trust roots");
        if (!Object.keys(trustRoots).length || Object.keys(trustRoots).length > 8 || Object.values(trustRoots).some(key => typeof key !== "string" || key.length > 4096 || key.includes("PRIVATE KEY"))) throw new Error("Configure one to eight public signing keys.");
        const config = { schemaVersion: 1, channel: value.channel, trustRoots } as PortableConfig;
        return { ...createReleaseSlots(contained(root, "Updates"), config.trustRoots, { platform: process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux", target: "desktop", channel: config.channel, apiVersion: Kittycord.apiVersion }), config };
    }
    function install(envelope: unknown, artifact: Uint8Array, repairInitial = false) {
        idle(); const releases = slots(); validateCore(envelope, artifact, releases.config);
        if (existsSync(kitty)) { treeWithoutLinks(kitty); const backupRoot = contained(root, "Backups"); mkdirSync(backupRoot, { recursive: true }); if (lstatSync(backupRoot).isSymbolicLink()) throw new Error("Portable backups cannot redirect outside their root."); const backup = contained(root, `Backups/kittycord-${randomUUID()}`); cpSync(kitty, backup, { recursive: true, errorOnExist: true, force: false }); }
        return releases.install(envelope, artifact, repairInitial);
    }
    return {
        paths: { root, data, kitty, discord, executable: contained(root, "Runtime/Discord.exe") },
        initialize(config: PortableConfig, envelope: unknown, artifact: Uint8Array) {
            if (existsSync(configFile)) throw new Error("Portable configuration already exists. Use the signed update command.");
            validateCore(envelope, artifact, config);
            atomicWriteJson(configFile, config);
            return slots().install(envelope, artifact);
        },
        install: (envelope: unknown, artifact: Uint8Array) => install(envelope, artifact),
        repairInitial(envelope: unknown, artifact: Uint8Array) {
            const result = install(envelope, artifact, true);
            if (existsSync(bootFile)) { const backupRoot = contained(root, "Backups"); mkdirSync(backupRoot, { recursive: true }); if (lstatSync(backupRoot).isSymbolicLink()) throw new Error("Portable backups cannot redirect outside their root."); renameSync(bootFile, contained(root, `Backups/launch-before-repair-${randomUUID()}.json`)); }
            return result;
        },
        async download(source: string, fetcher: typeof fetch = fetch) {
            idle(); const endpoint = new URL(source);
            if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith("/")) throw new Error("Configure an HTTPS release directory without credentials, query or fragment.");
            async function receive(path: string, limit: number) {
                const response = await fetcher(new URL(path, endpoint), { credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(60_000) });
                if (!response.ok || !response.body) throw new Error(`Release download failed with HTTP ${response.status}.`);
                const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
                try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > limit) throw new Error("Release download exceeds its declared limit."); chunks.push(chunk.value); } } finally { await reader.cancel(); reader.releaseLock(); }
                return Buffer.concat(chunks);
            }
            const envelope = JSON.parse((await receive("release.json", 131_072)).toString("utf8"));
            const { config } = slots();
            const verified = verifySignedRelease(envelope, config.trustRoots, { platform: process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux", target: "desktop", channel: config.channel, apiVersion: Kittycord.apiVersion });
            return install(envelope, await receive(verified.artifact.filename, verified.artifact.size));
        },
        status() { return { release: slots().status(), current: slots().current().release, launch: boot() }; },
        rollback() { idle(); return slots().rollback(); },
        beginLaunch() {
            idle(); const releases = slots(); const previous = boot(); const state = releases.status();
            if (state.pending || previous && !previous.confirmed && previous.slot === state.current) {
                if (!state.previous && state.awaitingConfirmation) throw new Error("The first release never confirmed startup. Repair it or launch the portable Discord copy in vanilla mode.");
                releases.recover();
            }
            const current = releases.current();
            for (const directory of [data, kitty, discord, contained(root, "Data/AppData"), contained(root, "Data/LocalAppData"), contained(root, "Data/Session")]) { mkdirSync(directory, { recursive: true }); if (lstatSync(directory).isSymbolicLink()) throw new Error("Portable data cannot redirect outside its root."); }
            let recoverySession: string | undefined;
            const journal = join(kitty, "settings/kittycord-startup.json");
            if (existsSync(journal)) recoverySession = parseStartupJournal(readBoundedJson(journal)).session;
            const launch: PortableBoot = { schemaVersion: 1, id: randomUUID(), slot: current.id, confirmed: false, pid: process.pid, ...(recoverySession ? { recoverySession } : {}) };
            atomicWriteJson(bootFile, launch); return { ...current, launch, journal };
        },
        confirm(id: string) {
            const launch = boot(); if (!launch || launch.id !== id || launch.confirmed) throw new Error("Only the current startup attempt can be confirmed.");
            const file = join(kitty, "settings/kittycord-startup.json"); if (!existsSync(file)) return false;
            const journal = parseStartupJournal(readBoundedJson(file));
            if (journal.phase !== "healthy" || journal.session === launch.recoverySession) return false;
            slots().confirm(launch.slot); atomicWriteJson(bootFile, { ...launch, confirmed: true });
            return true;
        },
        prepareVanilla() { idle(); for (const directory of [data, discord, kitty, contained(root, "Data/AppData"), contained(root, "Data/LocalAppData"), contained(root, "Data/Session")]) mkdirSync(directory, { recursive: true }); },
        endLaunch(id: string) { const launch = boot(); if (!launch || launch.id !== id) throw new Error("Startup attempt changed."); const { pid, ...rest } = launch; atomicWriteJson(bootFile, rest); },
        prepare(source: string) {
            if (process.platform !== "win32") throw new Error("Portable Discord preparation is currently Windows-only.");
            idle(); const origin = resolve(source); const toRoot = relative(origin, root); const toSource = relative(root, origin);
            if (!isAbsolute(source) || origin === root || !toRoot.startsWith("..") && !isAbsolute(toRoot) || !toSource.startsWith("..") && !isAbsolute(toSource)) throw new Error("Use a separate absolute Discord application directory.");
            if (!existsSync(join(origin, "Discord.exe"))) throw new Error("Select the Discord application directory containing Discord.exe.");
            const buildInfo = checkedObject(readBoundedJson(join(origin, "resources/build_info.json")), Object.keys(JSON.parse(readFileSync(join(origin, "resources/build_info.json"), "utf8"))), "Discord build info");
            if (typeof buildInfo.version !== "string" || !/^\d+\.\d+\.\d+$/.test(buildInfo.version)) throw new Error("Discord build version is invalid.");
            const original = existsSync(join(origin, "resources/_app.asar")) ? join(origin, "resources/_app.asar") : join(origin, "resources/app.asar");
            if (!lstatSync(original).isFile() || lstatSync(original).isSymbolicLink()) throw new Error("Original Discord ASAR is unavailable.");
            const destination = contained(root, "Runtime"); if (existsSync(destination)) throw new Error("Portable runtime already exists. It was preserved.");
            const stage = contained(root, `Runtime.pending-${randomUUID()}`); mkdirSync(stage);
            for (const entry of readdirSync(origin, { withFileTypes: true })) {
                if (entry.isDirectory() ? !["resources", "locales", "modules", "swiftshader"].includes(entry.name) : !/\.(?:exe|dll|node|bin|pak|dat|sig|manifest|ico)$/i.test(entry.name) && !["vk_swiftshader_icd.json", "LICENSE", "LICENSE.electron.txt", "LICENSES.chromium.html"].includes(entry.name)) continue;
                const from = join(origin, entry.name); treeWithoutLinks(from);
                cpSync(from, join(stage, entry.name), { recursive: true, errorOnExist: true, force: false, filter: path => !["resources/app.asar", "resources/app", "resources/_app.asar"].some(blocked => relative(origin, path).replaceAll("\\", "/") === blocked) });
            }
            cpSync(original, join(stage, "resources/_app.asar"), { errorOnExist: true, force: false }); mkdirSync(join(stage, "resources/app.asar"));
            writeFileSync(join(stage, "resources/app.asar/package.json"), JSON.stringify({ name: "kittycord-portable-loader", main: "index.js" }), { flag: "wx" });
            const moduleRoot = join(discord, "discord", buildInfo.version, "modules"); mkdirSync(moduleRoot, { recursive: true }); const installed: Record<string, { installedVersion: number; }> = {};
            for (const entry of readdirSync(join(stage, "modules"), { withFileTypes: true })) { const match = /^(discord_[a-z_]+)-(\d+)$/.exec(entry.name); if (!entry.isDirectory() || !match) continue; cpSync(join(stage, "modules", entry.name, match[1]), join(moduleRoot, match[1]), { recursive: true, errorOnExist: true, force: false }); installed[match[1]] = { installedVersion: Number(match[2]) }; }
            atomicWriteJson(join(moduleRoot, "installed.json"), installed); atomicWriteJson(join(discord, "discord/settings.json"), { SKIP_HOST_UPDATE: true, SKIP_MODULE_UPDATE: true });
            renameSync(stage, destination);
            return { runtime: destination, discordVersion: buildInfo.version };
        }
    };
}
