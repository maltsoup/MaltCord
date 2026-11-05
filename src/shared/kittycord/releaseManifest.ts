/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedObject, checkedVersion } from "./manifest";
import { compareVersions } from "./versions";

export type ReleaseChannel = "stable" | "beta" | "development";
export interface ReleaseArtifact { platform: "win32" | "linux" | "darwin"; target: "desktop" | "equibop" | "windows-installer"; filename: string; sha256: string; size: number; }
export interface ReleaseManifest { schemaVersion: 1; product: "Kittycord"; version: string; channel: ReleaseChannel; minApiVersion: string; issuedAt: number; expiresAt: number; notes: string; artifacts: ReleaseArtifact[]; }
export interface ReleaseContext { platform: ReleaseArtifact["platform"]; target: ReleaseArtifact["target"]; channel: ReleaseChannel; apiVersion: string; now?: number; purpose?: "update" | "rollback"; }
export const MAX_RELEASE_BYTES = 128 * 1024 * 1024;

export function parseReleaseManifest(parsed: unknown, context: ReleaseContext) {
    const manifest = checkedObject(parsed, ["schemaVersion", "product", "version", "channel", "minApiVersion", "issuedAt", "expiresAt", "notes", "artifacts"], "Release manifest");
    if (manifest.schemaVersion !== 1 || manifest.product !== "Kittycord" || manifest.channel !== context.channel) throw new Error("Release schema, product or channel does not match this distribution.");
    const version = checkedVersion(manifest.version, "Release version"), minApiVersion = checkedVersion(manifest.minApiVersion, "Minimum API version");
    if (compareVersions(context.apiVersion, minApiVersion) < 0) throw new Error("Release requires an unsupported Kittycord API.");
    const now = context.now ?? Date.now();
    if (typeof manifest.issuedAt !== "number" || typeof manifest.expiresAt !== "number" || !Number.isSafeInteger(manifest.issuedAt) || !Number.isSafeInteger(manifest.expiresAt) || manifest.issuedAt > now + 300_000 || manifest.expiresAt <= manifest.issuedAt || manifest.expiresAt - manifest.issuedAt > 90 * 86_400_000 || context.purpose !== "rollback" && manifest.expiresAt <= now) throw new Error("Release metadata is expired or has an invalid validity interval.");
    if (!Array.isArray(manifest.artifacts) || !manifest.artifacts.length || manifest.artifacts.length > 12) throw new Error("Invalid release artifact list.");
    const artifacts: ReleaseArtifact[] = manifest.artifacts.map(item => {
        const artifact = checkedObject(item, ["platform", "target", "filename", "sha256", "size"], "Release artifact");
        if (!["win32", "linux", "darwin"].includes(String(artifact.platform)) || !["desktop", "equibop", "windows-installer"].includes(String(artifact.target)) || artifact.target === "windows-installer" && artifact.platform !== "win32" || artifact.filename !== (artifact.target === "windows-installer" ? "KittencordSetup.exe" : `kittycord-${artifact.target}.asar`) || typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256) || typeof artifact.size !== "number" || !Number.isSafeInteger(artifact.size) || artifact.size < 1 || artifact.size > MAX_RELEASE_BYTES) throw new Error("Invalid release artifact identity, digest or size.");
        return { platform: artifact.platform as ReleaseArtifact["platform"], target: artifact.target as ReleaseArtifact["target"], filename: artifact.filename, sha256: artifact.sha256, size: artifact.size };
    });
    if (new Set(artifacts.map(artifact => `${artifact.platform}:${artifact.target}`)).size !== artifacts.length) throw new Error("Duplicate release artifact targets are not allowed.");
    const artifact = artifacts.find(item => item.platform === context.platform && item.target === context.target);
    if (!artifact) throw new Error("Release has no artifact for this platform and target.");
    if (typeof manifest.notes !== "string" || manifest.notes.length > 8000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(manifest.notes)) throw new Error("Invalid release notes.");
    const release: ReleaseManifest = { schemaVersion: 1, product: "Kittycord", version, minApiVersion, channel: context.channel, issuedAt: manifest.issuedAt, expiresAt: manifest.expiresAt, notes: manifest.notes, artifacts };
    return { release, artifact };
}
