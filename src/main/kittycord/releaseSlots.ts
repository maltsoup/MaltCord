/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import { checkedObject } from "@shared/kittycord/manifest";
import { compareVersions } from "@shared/kittycord/versions";

import { atomicWriteJson, readBoundedJson } from "./files";
import { MAX_RELEASE_BYTES, type ReleaseContext, verifyArtifact, verifySignedRelease } from "./releases";

interface SlotState {
    schemaVersion: 1; current?: string; previous?: string; pending?: string; awaitingConfirmation: boolean;
    lastRecovery?: "interrupted-activation" | "unconfirmed-startup" | "artifact-integrity" | "manual-rollback";
}

function parseState(input: unknown): SlotState {
    const data = checkedObject(input, ["schemaVersion", "current", "previous", "pending", "awaitingConfirmation", "lastRecovery"], "Release slots");
    if (data.schemaVersion !== 1 || typeof data.awaitingConfirmation !== "boolean") throw new Error("Invalid release slot state.");
    const result: SlotState = { schemaVersion: 1, awaitingConfirmation: data.awaitingConfirmation };
    if (data.lastRecovery !== undefined) {
        if (!["interrupted-activation", "unconfirmed-startup", "artifact-integrity", "manual-rollback"].includes(String(data.lastRecovery))) throw new Error("Invalid release recovery event.");
        result.lastRecovery = data.lastRecovery as SlotState["lastRecovery"];
    }
    for (const key of ["current", "previous", "pending"] as const) {
        if (data[key] !== undefined) {
            if (typeof data[key] !== "string" || !/^[a-f0-9]{64}$/.test(data[key])) throw new Error("Invalid release slot identifier.");
            result[key] = data[key];
        }
    }
    return result;
}

export function createReleaseSlots(root: string, trustRoots: Readonly<Record<string, string>>, context: ReleaseContext) {
    if (!isAbsolute(root)) throw new Error("Release slots require an absolute data directory.");
    mkdirSync(root, { recursive: true });
    const versions = join(root, "versions");
    mkdirSync(versions, { recursive: true });
    if (lstatSync(root).isSymbolicLink() || lstatSync(versions).isSymbolicLink()) throw new Error("Release directories cannot be symbolic links.");
    const stateFile = join(root, "activation.json");
    function load(): SlotState {
        if (existsSync(stateFile) && lstatSync(stateFile).isSymbolicLink()) throw new Error("Release slot state cannot be a symbolic link.");
        return existsSync(stateFile) ? parseState(readBoundedJson(stateFile)) : { schemaVersion: 1, awaitingConfirmation: false };
    }
    const slotId = (payload: string, digest: string) => createHash("sha256").update(payload).update(digest).digest("hex");
    function checkSlot(digest: string) {
        if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid release slot identifier.");
        const artifactFile = join(versions, digest + ".asar");
        const metadataFile = join(versions, digest + ".json");
        if (lstatSync(artifactFile).isSymbolicLink() || lstatSync(metadataFile).isSymbolicLink() || lstatSync(artifactFile).size > MAX_RELEASE_BYTES)
            throw new Error("Invalid release slot files.");
        const verified = verifySignedRelease(readBoundedJson(metadataFile), trustRoots, { ...context, purpose: "rollback" });
        if (slotId(verified.envelope.payload, verified.artifact.sha256) !== digest) throw new Error("Release metadata and slot identity disagree.");
        verifyArtifact(readFileSync(artifactFile), verified.artifact);
        return verified;
    }
    function rollback(state: SlotState, reason: SlotState["lastRecovery"] = "manual-rollback") {
        if (!state.previous) throw new Error("No verified previous release is available.");
        checkSlot(state.previous);
        const next: SlotState = { schemaVersion: 1, current: state.previous, ...(state.current && !state.awaitingConfirmation ? { previous: state.current } : {}), awaitingConfirmation: false, lastRecovery: reason };
        atomicWriteJson(stateFile, next);
        return next;
    }
    return {
        status: load,
        current() {
            const state = load();
            if (!state.current) throw new Error("No verified release is installed.");
            const verified = checkSlot(state.current);
            return { id: state.current, path: join(versions, state.current + ".asar"), release: verified.release };
        },
        install(input: unknown, bytes: Uint8Array, repairInitial = false) {
            const verified = verifySignedRelease(input, trustRoots, { ...context, purpose: "update" });
            verifyArtifact(bytes, verified.artifact);
            const state = load();
            if (repairInitial && (!state.current || state.previous || !state.awaitingConfirmation || state.pending)) throw new Error("Initial repair requires a failed first release with no verified fallback.");
            if (state.pending || state.awaitingConfirmation && !repairInitial) throw new Error("Recover or confirm the existing activation before installing another release.");
            if (state.current && !repairInitial && compareVersions(verified.release.version, checkSlot(state.current).release.version) <= 0) throw new Error("Updates must advance the version. Use explicit rollback for a previous release.");
            const digest = slotId(verified.envelope.payload, verified.artifact.sha256);
            const artifactFile = join(versions, digest + ".asar");
            const metadataFile = join(versions, digest + ".json");
            if (!existsSync(artifactFile)) {
                const descriptor = openSync(artifactFile, "wx", 0o600);
                try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); } finally { closeSync(descriptor); }
            } else {
                if (lstatSync(artifactFile).isSymbolicLink()) throw new Error("Release artifact cannot be a symbolic link.");
                verifyArtifact(readFileSync(artifactFile), verified.artifact);
            }
            atomicWriteJson(metadataFile, verified.envelope);
            checkSlot(digest);
            atomicWriteJson(stateFile, { ...state, pending: digest });
            const next: SlotState = { schemaVersion: 1, current: digest, ...(state.current && !repairInitial ? { previous: state.current } : {}), awaitingConfirmation: true };
            atomicWriteJson(stateFile, next);
            return next;
        },
        confirm(digest: string) {
            const state = load();
            if (state.pending || state.current !== digest) throw new Error("Only the active release can be confirmed.");
            checkSlot(digest);
            const next = { ...state, awaitingConfirmation: false };
            atomicWriteJson(stateFile, next);
            return next;
        },
        recover(): SlotState {
            let state = load();
            if (state.pending) {
                if (state.current) checkSlot(state.current);
                const { pending, ...rest } = state;
                const next: SlotState = { ...rest, lastRecovery: "interrupted-activation" };
                atomicWriteJson(stateFile, next);
                state = next;
            }
            if (state.awaitingConfirmation && state.previous) return rollback(state, "unconfirmed-startup");
            if (state.current) {
                try { checkSlot(state.current); } catch (error) {
                    if (state.previous) return rollback(state, "artifact-integrity");
                    throw error;
                }
            }
            return state;
        },
        rollback: () => rollback(load())
    };
}
