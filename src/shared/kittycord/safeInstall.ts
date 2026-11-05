/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { analyzePluginConflicts, type ConflictPlugin } from "./conflicts";
import { type PluginManifest, type PluginPlatform } from "./manifest";

export interface SourceFinding { code: string; blocked: boolean; message: string; }

export function inspectPluginSource(source: string, permissions: readonly string[]): SourceFinding[] {
    if (new TextEncoder().encode(source).byteLength > 1024 * 1024) throw new Error("Source inspection is limited to 1 MiB.");
    const findings: SourceFinding[] = [];
    const check = (pattern: RegExp, permission: string | undefined, code: string, message: string) => {
        if (pattern.test(source)) findings.push({ code, blocked: !permission || !permissions.includes(permission), message });
    };
    check(/(?:getToken\s*\(|(?:localStorage|sessionStorage)\s*(?:\.token|\[\s*["']token["']\s*\]|\.getItem\(\s*["']token["']))/, undefined, "authentication-access", "Source appears to access authentication state. This package is blocked pending review.");
    check(/(?:from\s*|require\s*\(\s*)["'](?:node:)?child_process["']/, "process", "native-execution", "Source references native process execution.");
    check(/(?:from\s*|require\s*\(\s*)["'](?:node:)?fs(?:\/promises)?["']/, "filesystem", "filesystem-access", "Source references filesystem access.");
    check(/\bfetch\s*\(|\bWebSocket\s*\(/, "network", "network-access", "Source references network access.");
    check(/\beval\s*\(|\b(?:new\s+)?Function\s*\(/, undefined, "dynamic-code", "Source references dynamic code evaluation. Static inspection cannot establish its behavior.");
    check(/\bimport\s*\(\s*["']https?:\/\//, undefined, "remote-code", "Source references remotely hosted executable code.");
    return findings;
}

export function reviewPluginManifest(manifest: PluginManifest, installed: readonly ConflictPlugin[], platform: PluginPlatform, apiVersion: string, blockedDigests: ReadonlySet<string> = new Set()) {
    const findings = analyzePluginConflicts([...installed, manifest], { platform, apiVersion }).filter(finding => finding.plugins.includes(manifest.id));
    const browser = ["chrome", "edge", "firefox"].includes(platform);
    const reasons: string[] = [];
    if (blockedDigests.has(manifest.integrity.digest)) reasons.push("The artifact is blocked by trusted security metadata.");
    if (browser && manifest.loadingMode !== "browser-packaged") reasons.push("Browser extensions only support reviewed packaged plugins. Remote runtime installation is unavailable.");
    if (browser && manifest.permissions.some(permission => ["native", "filesystem", "process"].includes(permission))) reasons.push("This package requests desktop-only privileges.");
    if (findings.some(finding => finding.classification === "Confirmed conflict")) reasons.push("Resolve the confirmed compatibility or dependency findings before activation.");
    const highRisk = manifest.permissions.filter(permission => ["network", "filesystem", "native", "process"].includes(permission));
    const compatibility = reasons.length ? "Unsafe or blocked" : findings.length || manifest.loadingMode === "build-time" || manifest.loadingMode === "browser-packaged"
        ? "Requires rebuild or restart" : "Native";
    return { compatibility, trust: "Unknown source" as const, highRiskPermissions: highRisk, reasons, findings, canActivate: false as const };
}

export async function verifyPluginArtifact(bytes: Uint8Array, expectedDigest: string) {
    if (!bytes.byteLength || bytes.byteLength > 16 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("Invalid package size or digest. Maximum size is 16 MiB.");
    const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== expectedDigest) throw new Error("Package integrity verification failed. The artifact does not match the manifest.");
}
