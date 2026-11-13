/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { MaltcordCloud } from "@shared/maltcordCloud";
import { createHash, randomBytes } from "crypto";
import { app, type IpcMainInvokeEvent, safeStorage, shell } from "electron";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { createServer, type Server } from "http";
import { dirname, join } from "path";

// The owner signs in with Discord through MaltCord's Supabase project. The session lives in this (main)
// process, so the rest of Discord never sees the access token. Every change is checked again by the
// database's row level security rules, which only let accounts listed in the owners table write.

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SESSION_FILE = () => join(app.getPath("userData"), "MaltCord", "session.bin");
const TABLES = {
    badges: ["user_id", "tooltip", "icon"],
    announcements: ["title", "body", "url", "published"]
} as const;
type Table = keyof typeof TABLES;

interface Session { access: string; refresh: string; expiresAt: number; userId: string; name: string; }

let session: Session | null = null;
let pending: Server | null = null;
let restored = false;

const b64url = (buffer: Buffer) => buffer.toString("base64url");

async function auth(path: string, body: unknown) {
    const res = await fetch(`${MaltcordCloud.url}/auth/v1/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: MaltcordCloud.publishableKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error_description || json?.msg || json?.message || `Sign-in failed (HTTP ${res.status}).`);
    return json;
}

function toSession(json: any): Session {
    const meta = json.user?.user_metadata ?? {};
    return {
        access: String(json.access_token),
        refresh: String(json.refresh_token),
        expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000,
        userId: String(json.user?.id ?? ""),
        name: String(meta.custom_claims?.global_name ?? meta.full_name ?? meta.name ?? "Discord account")
    };
}

async function persist() {
    try {
        if (!session || !safeStorage.isEncryptionAvailable()) return;
        await mkdir(dirname(SESSION_FILE()), { recursive: true });
        await writeFile(SESSION_FILE(), safeStorage.encryptString(session.refresh));
    } catch { /* staying signed in across restarts is optional */ }
}

async function refreshSession(refresh: string) {
    session = toSession(await auth("token?grant_type=refresh_token", { refresh_token: refresh }));
    await persist();
}

async function restore() {
    if (restored) return;
    restored = true;
    try {
        if (!safeStorage.isEncryptionAvailable()) return;
        await refreshSession(safeStorage.decryptString(await readFile(SESSION_FILE())));
    } catch {
        session = null;
    }
}

async function token(): Promise<string | null> {
    await restore();
    if (!session) return null;
    if (session.expiresAt - 60_000 < Date.now()) {
        try { await refreshSession(session.refresh); } catch { session = null; return null; }
    }
    return session.access;
}

async function rest(method: string, path: string, accessToken: string, body?: unknown, prefer?: string) {
    const res = await fetch(`${MaltcordCloud.url}/rest/v1/${path}`, {
        method,
        headers: {
            apikey: MaltcordCloud.publishableKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...(prefer ? { Prefer: prefer } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20_000)
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
}

export async function status(_: IpcMainInvokeEvent) {
    const access = await token();
    if (!access || !session) return { signedIn: false as const };
    const owner = await rest("POST", "rpc/is_owner", access, {}).catch(() => null);
    return { signedIn: true as const, userId: session.userId, name: session.name, isOwner: owner?.data === true };
}

export async function signIn(_: IpcMainInvokeEvent) {
    if (pending) return { ok: false as const, error: "A sign-in is already open. Finish it in your browser, or wait a few minutes." };

    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash("sha256").update(verifier).digest());

    return await new Promise<{ ok: true; } | { ok: false; error: string; }>(resolve => {
        const finish = (result: { ok: true; } | { ok: false; error: string; }) => {
            clearTimeout(timeout);
            server.close();
            pending = null;
            resolve(result);
        };
        const reply = (res: any, text: string) => {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`<!doctype html><meta charset="utf-8"><title>MaltCord</title><body style="font-family:system-ui;background:#1e1f22;color:#f2f3f5;display:grid;place-items:center;height:100vh;margin:0"><p>${text}</p>`);
        };

        const server = createServer(async (req, res) => {
            const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
            if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }
            const code = url.searchParams.get("code");
            const failure = url.searchParams.get("error_description") || url.searchParams.get("error");
            if (!code) {
                reply(res, "Sign-in did not finish. You can close this tab.");
                return finish({ ok: false, error: failure || "Sign-in did not finish." });
            }
            try {
                session = toSession(await auth("token?grant_type=pkce", { auth_code: code, code_verifier: verifier }));
                await persist();
                reply(res, "You are signed in to MaltCord. You can close this tab and go back to Discord.");
                finish({ ok: true });
            } catch (e) {
                reply(res, "Sign-in failed. You can close this tab.");
                finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
            }
        });
        const timeout = setTimeout(() => finish({ ok: false, error: "Sign-in timed out. Try again." }), 3 * 60_000);

        pending = server;
        server.once("error", e => finish({ ok: false, error: (e as NodeJS.ErrnoException).code === "EADDRINUSE" ? `Port ${PORT} is busy. Close whatever uses it and try again.` : String(e) }));
        server.listen(PORT, "127.0.0.1", () => {
            const authorize = new URL(`${MaltcordCloud.url}/auth/v1/authorize`);
            authorize.searchParams.set("provider", "discord");
            authorize.searchParams.set("redirect_to", REDIRECT);
            authorize.searchParams.set("code_challenge", challenge);
            authorize.searchParams.set("code_challenge_method", "s256");
            authorize.searchParams.set("scopes", "identify");
            void shell.openExternal(authorize.toString());
        });
    });
}

export async function signOut(_: IpcMainInvokeEvent) {
    session = null;
    await rm(SESSION_FILE(), { force: true }).catch(() => { });
}

/** Reads or changes rows in the two MaltCord tables. The database decides whether the signed-in account may. */
export async function request(_: IpcMainInvokeEvent, method: unknown, table: unknown, query: unknown, body: unknown) {
    if (typeof table !== "string" || !(table in TABLES)) return { ok: false as const, status: 400, data: "Unknown table." };
    if (!["GET", "POST", "PATCH", "DELETE"].includes(String(method))) return { ok: false as const, status: 400, data: "Unknown method." };
    const q = typeof query === "string" ? query : "";
    if (q.length > 300 || !/^[A-Za-z0-9_=.,&*():%+-]*$/.test(q)) return { ok: false as const, status: 400, data: "Bad query." };

    let payload: Record<string, unknown> | undefined;
    if (method === "POST" || method === "PATCH") {
        if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false as const, status: 400, data: "Bad body." };
        const allowed = TABLES[table as Table] as readonly string[];
        payload = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
        if (JSON.stringify(payload).length > 250_000) return { ok: false as const, status: 400, data: "Too large." };
    }

    const access = await token();
    if (!access) return { ok: false as const, status: 401, data: "Sign in first." };
    return rest(String(method), `${table}${q ? `?${q}` : ""}`, access, payload, method === "GET" ? undefined : "return=representation");
}
