/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { verifySignedRelease } from "../../src/main/kittycord/releases";
import { Kittycord } from "../../src/shared/kittycord";
import { kittycordChangelog } from "../../src/shared/kittycord/changelog";
import { checkedText, checkedVersion } from "../../src/shared/kittycord/manifest";

async function main() {
    const [installer, receiptFile, keyFile, keyId, channel, directory, notesFile, ...extra] = process.argv.slice(2);
    if (!installer || !receiptFile || !keyFile || !keyId || !["stable", "beta", "development"].includes(channel) || !directory || extra.length) throw new Error("Usage: signInstaller.ts installer.exe receipt.json private-key.pem key-id development|beta|stable new-output-directory [changelog.txt]");
    if ((await stat(installer)).size > 128 * 1024 * 1024 || (await stat(receiptFile)).size > 16384 || (await stat(keyFile)).size > 4096 || notesFile && (await stat(notesFile)).size > 8000) throw new Error("Signing input exceeds its size limit.");
    const artifact = await readFile(installer); const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
    if (receipt.product !== "Kittencord" || receipt.artwork !== "project-original" || receipt.installerSha256 !== createHash("sha256").update(artifact).digest("hex") || artifact.subarray(0, 2).toString() !== "MZ") throw new Error("Select the matching public installer and its exact build receipt. User-supplied artwork installers cannot be published by this helper.");
    const key = createPrivateKey(await readFile(keyFile)); if (key.asymmetricKeyType !== "ed25519") throw new Error("Use an Ed25519 private key.");
    const publicKey = createPublicKey(key.export({ type: "pkcs8", format: "pem" })).export({ type: "spki", format: "pem" }).toString();
    const now = Date.now(); const notes = notesFile ? await readFile(notesFile, "utf8") : kittycordChangelog.find(item => item.id === `${receipt.version}-development`)?.changes.join("\n");
    if (!notes) throw new Error("No matching changelog exists for this installer version.");
    const payload = Buffer.from(JSON.stringify({ schemaVersion: 1, product: "Kittycord", version: checkedVersion(receipt.version, "Installer version"), channel, minApiVersion: Kittycord.apiVersion, issuedAt: now, expiresAt: now + 30 * 86400000, notes,
        artifacts: [{ platform: "win32", target: "windows-installer", filename: "KittencordSetup.exe", size: artifact.length, sha256: receipt.installerSha256 }] }));
    const envelope = { schemaVersion: 1, keyId: checkedText(keyId, "Signing key ID", 100), payload: payload.toString("base64"), signature: sign(null, payload, key).toString("base64") };
    verifySignedRelease(envelope, { [keyId]: publicKey }, { platform: "win32", target: "windows-installer", channel: channel as "stable" | "beta" | "development", apiVersion: Kittycord.apiVersion });
    const output = resolve(directory); await mkdir(output);
    await writeFile(resolve(output, "release.json"), JSON.stringify(envelope, null, 2), { flag: "wx" });
    await writeFile(resolve(output, "release-public.pem"), publicKey, { flag: "wx" });
    await copyFile(installer, resolve(output, "KittencordSetup.exe")); await copyFile("LICENSE", resolve(output, "LICENSE.txt"));
    console.log("Signed installer channel prepared. Only public key material is in the new output directory. Pin that public key and a real HTTPS channel URL in updateChannel.json before distributing the client. No release was published.");
}
main().catch(() => { console.error("Installer signing failed. Check the public receipt, size limits, version, notes and private signing key. No publication occurred."); process.exitCode = 1; });
