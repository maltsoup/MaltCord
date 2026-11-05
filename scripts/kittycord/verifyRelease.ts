/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync, statSync } from "node:fs";

import { readBoundedJson } from "../../src/main/kittycord/files";
import { MAX_RELEASE_BYTES, type ReleaseChannel, verifyArtifact, verifySignedRelease } from "../../src/main/kittycord/releases";
import { Kittycord } from "../../src/shared/kittycord";

function main() {
    const [metadata, keyId, publicKeyFile, artifactFile, channel, target] = process.argv.slice(2);
    if (!metadata || !keyId || !publicKeyFile || !artifactFile || !["stable", "beta", "development"].includes(channel) || !["desktop", "equibop", "windows-installer"].includes(target))
        throw new Error("Usage: pnpm kittycord:verify-release <signed JSON> <key ID> <public PEM> <artifact> <stable|beta|development> <desktop|equibop|windows-installer>");
    const { platform } = process;
    if (platform !== "win32" && platform !== "linux" && platform !== "darwin") throw new Error("Unsupported desktop platform.");
    if (statSync(publicKeyFile).size > 4096 || statSync(artifactFile).size > MAX_RELEASE_BYTES) throw new Error("Public key or artifact exceeds the verification size limit.");
    const key = readFileSync(publicKeyFile, "utf8");
    const result = verifySignedRelease(readBoundedJson(metadata, 128 * 1024), { [keyId]: key }, {
        platform, target: target as "desktop" | "equibop" | "windows-installer", channel: channel as ReleaseChannel, apiVersion: Kittycord.apiVersion
    });
    verifyArtifact(readFileSync(artifactFile), result.artifact);
    process.stdout.write(`Kittycord ${result.release.version}: signature and artifact verified against the supplied public key. Nothing was installed or activated.\n`);
}

try { main(); } catch {
    process.stderr.write("Release verification failed. Check the arguments, configured public key, signature, platform, channel, validity window and artifact integrity. Nothing was installed.\n");
    process.exitCode = 1;
}
