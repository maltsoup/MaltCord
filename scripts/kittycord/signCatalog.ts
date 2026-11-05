/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";

import { CATALOG_LIMIT, catalogBase64, verifyPluginCatalog } from "../../src/shared/kittycord/catalog";
import { checkedText } from "../../src/shared/kittycord/manifest";

async function main() {
    const [input, keyPath, keyId, output, ...extra] = process.argv.slice(2);
    if (!input || !keyPath || !keyId || !output || extra.length) throw new Error("Usage: signCatalog.ts payload.json private-key.pem development-key-id unused-envelope.json");
    checkedText(keyId, "Catalog key identifier", 100);
    if ((await stat(input)).size > CATALOG_LIMIT || (await stat(keyPath)).size > 8192) throw new Error("Catalog or signing key exceeds supported size.");
    const payload = await readFile(input, "utf8");
    const key = createPrivateKey(await readFile(keyPath));
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Catalog signing requires an Ed25519 private key.");
    const publicKey = createPublicKey({ key: key.export({ format: "pem", type: "pkcs8" }), format: "pem" }).export({ format: "jwk" }).x;
    if (!publicKey) throw new Error("The signing key has no public component.");
    const envelope = { schemaVersion: 1, keyId, payload, signature: catalogBase64(sign(null, Buffer.from(payload), key)) };
    await verifyPluginCatalog(envelope, [{ id: keyId, publicKey, minimumRevision: 1, development: true }]);
    await writeFile(output, JSON.stringify(envelope, null, 4) + "\n", { flag: "wx" });
    process.stdout.write("Development catalog signed and verified. Private key was not exported. Pin the corresponding public key separately.\n");
}

main().catch(problem => { process.stderr.write(`${problem instanceof Error ? problem.message : "Catalog signing failed."}\n`); process.exitCode = 1; });
