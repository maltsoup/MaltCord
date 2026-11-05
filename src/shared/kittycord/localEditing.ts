/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type ExternalPackage, verifyExternalPackage } from "./javascriptPackage";

export async function prepareLocalEdit(original: ExternalPackage, source: string, id: string, version: string, name: string) {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))), byte => byte.toString(16).padStart(2, "0")).join("");
    return verifyExternalPackage({ ...original, artifact: source, manifest: { ...original.manifest, id, version, name,
        author: original.manifest.author, publisher: original.manifest.publisher, updateSource: undefined,
        provenance: { source: original.manifest.provenance.source, revision: `local-edit:${original.manifest.version}:${original.manifest.integrity.digest.slice(0, 12)}` },
        integrity: { algorithm: "sha256", digest } } });
}
