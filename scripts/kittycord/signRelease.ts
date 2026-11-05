/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractFile } from "@electron/asar";

import { verifySignedRelease } from "../../src/main/kittycord/releases";
import { Kittycord } from "../../src/shared/kittycord";
import { checkedText } from "../../src/shared/kittycord/manifest";

async function main() {
    const [artifactFile, privateKeyFile, keyName, channel, platform, output, ...extra] = process.argv.slice(2);
    if (!artifactFile || !privateKeyFile || !keyName || !["stable", "beta", "development"].includes(channel) || !["win32", "linux", "darwin"].includes(platform) || !output || extra.length) throw new Error("Usage: signRelease.ts artifact.asar private-key.pem key-id stable|beta|development win32|linux|darwin new-output-directory");
    const keyId = checkedText(keyName, "Release key identifier", 100); const key = createPrivateKey(await readFile(privateKeyFile));
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Release signing requires an Ed25519 private key.");
    const artifact = await readFile(artifactFile); const metadata = JSON.parse(extractFile(artifactFile, "package.json").toString("utf8"));
    if (!["kittycord", "kittencord"].includes(metadata.name) || metadata.main !== "patcher.js" || !extractFile(artifactFile, "patcher.js").byteLength) throw new Error("Select a built Kittencord desktop ASAR.");
    const now = Date.now();
    const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, product: "Kittycord", version: metadata.version, channel, minApiVersion: Kittycord.apiVersion, issuedAt: now, expiresAt: now + 14 * 86_400_000,
        notes: "Kittycord development artifact. Read the matching qualification report and platform limitations before promotion.", artifacts: [{ platform, target: "desktop", filename: "kittycord-desktop.asar", size: artifact.byteLength, sha256: createHash("sha256").update(artifact).digest("hex") }] }));
    const envelope = { schemaVersion: 1, keyId, payload: payload.toString("base64"), signature: sign(null, payload, key).toString("base64") };
    const publicKey = createPublicKey(key.export({ type: "pkcs8", format: "pem" })).export({ type: "spki", format: "pem" }).toString();
    verifySignedRelease(envelope, { [keyId]: publicKey }, { platform: platform as "win32" | "linux" | "darwin", target: "desktop", channel: channel as "stable" | "beta" | "development", apiVersion: Kittycord.apiVersion });
    await mkdir(output); const directory = resolve(output);
    await writeFile(resolve(directory, "release.json"), JSON.stringify(envelope, null, 4) + "\n", { flag: "wx" });
    await writeFile(resolve(directory, "core-public.pem"), publicKey, { flag: "wx" });
    await copyFile(artifactFile, resolve(directory, "kittycord-desktop.asar")); await copyFile("LICENSE", resolve(directory, "LICENSE.txt"));
    console.log("Release metadata signed and verified. Only public signing material was written to the new output directory. Signing does not establish production acceptance.");
}
main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Release signing failed."}\n`); process.exitCode = 1; });
