/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, createPublicKey, verify } from "node:crypto";

import { checkedObject, checkedText } from "@shared/kittycord/manifest";
import { MAX_RELEASE_BYTES, parseReleaseManifest, type ReleaseArtifact, type ReleaseContext } from "@shared/kittycord/releaseManifest";
export { MAX_RELEASE_BYTES, type ReleaseArtifact, type ReleaseChannel, type ReleaseContext, type ReleaseManifest } from "@shared/kittycord/releaseManifest";

export interface SignedEnvelope { schemaVersion: 1; keyId: string; payload: string; signature: string; }
function decodeBase64(value: unknown, max: number) {
    if (typeof value !== "string" || !value.length || value.length > Math.ceil(max / 3) * 4) throw new Error("Signed metadata encoding is invalid or too large.");
    const bytes = Buffer.from(value, "base64");
    if (bytes.length > max || bytes.toString("base64") !== value) throw new Error("Signed metadata must use canonical base64.");
    return bytes;
}

export function verifySignedRelease(input: unknown, trustRoots: Readonly<Record<string, string>>, context: ReleaseContext) {
    const data = checkedObject(input, ["schemaVersion", "keyId", "payload", "signature"], "Signed envelope");
    if (data.schemaVersion !== 1) throw new Error("Unsupported signed envelope schema.");
    const keyId = checkedText(data.keyId, "Signing key identifier", 100);
    if (!Object.hasOwn(trustRoots, keyId)) throw new Error("Release signer is not in the configured trust roots.");
    const pem = trustRoots[keyId];
    if (pem.includes("PRIVATE KEY")) throw new Error("Trust roots must contain public keys only.");
    let key;
    try { key = createPublicKey(pem); } catch { throw new Error("The configured release public key is invalid."); }
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Only Ed25519 release signatures are supported.");
    const payload = decodeBase64(data.payload, 65_536);
    const signature = decodeBase64(data.signature, 64);
    if (signature.length !== 64 || !verify(null, payload, key, signature)) throw new Error("Release signature verification failed.");
    let parsed: unknown;
    try { parsed = JSON.parse(payload.toString("utf8")); } catch { throw new Error("Signed release payload is not valid JSON."); }
    const { release, artifact } = parseReleaseManifest(parsed, context);
    const envelope: SignedEnvelope = { schemaVersion: 1, keyId, payload: payload.toString("base64"), signature: signature.toString("base64") };
    return { release, artifact, envelope };
}

export function verifyArtifact(bytes: Uint8Array, expected: Pick<ReleaseArtifact, "size" | "sha256">) {
    if (bytes.byteLength !== expected.size || bytes.byteLength > MAX_RELEASE_BYTES || createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
        throw new Error("Artifact size or SHA-256 integrity verification failed.");
}
