/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateKeyPairSync } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [input, ...extra] = process.argv.slice(2);
if (!input || extra.length) throw new Error("Usage: createSigningKey.mjs new-private-directory-outside-the-repository");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = path.resolve(input);
const child = path.relative(root, directory);
if (!child || !child.startsWith("..") && !path.isAbsolute(child)) throw new Error("Keep production signing keys outside the source checkout.");
try { await access(directory); throw new Error("The key directory already exists. Never overwrite a signing identity."); } catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(directory, { mode: 0o700 });
const keys = generateKeyPairSync("ed25519");
await writeFile(path.join(directory, "release-private.pem"), keys.privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
await writeFile(path.join(directory, "release-public.pem"), keys.publicKey.export({ type: "spki", format: "pem" }), { flag: "wx", mode: 0o644 });
console.log(`Signing keypair created in ${directory}. Keep the private PEM secret and backed up. Only the public PEM belongs in client trust roots. No files were uploaded.`);
