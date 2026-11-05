/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const TOKEN = /\b[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}\b/g;
const MFA_TOKEN = /\bmfa\.[\w-]{20,}\b/g;
const COOKIE_HEADER = /(\b(?:cookie|set-cookie)["']?\s*[:=]\s*)[^\r\n]+/gi;
const QUOTED_SECRET = /(\b(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|token|api[_-]?key|password|secret)["']?\s*[:=]\s*)(["'])[^\r\n"']*\2/gi;
const URL = /https?:\/\/[^\s"'<>]+/gi;
const USER_ID = /\b\d{17,20}\b/g;
const WINDOWS_PATH = /\b[A-Za-z]:\\[^\r\n"']+/g;
const POSIX_PATH = /\/(?:Users|home|tmp|var\/folders)\/[^\r\n"']+/g;
const AUTHORIZATION = /(authorization["']?\s*[:=]\s*["']?)(?:(?:Bearer|Bot|Basic)\s+)?[^\s,;}"']+["']?/gi;
const SECRET_ASSIGNMENT = /(\b(?:access[_-]?token|refresh[_-]?token|session[_-]?token|client[_-]?secret|token|api[_-]?key|password|secret|cookie|set-cookie)["']?\s*[:=]\s*["']?)[^\s,;}"']+["']?/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@(?:[A-Z0-9-]+\.)+[A-Z]{2,}\b/gi;

export function redactDiagnosticString(value: string): string {
    return value
        .replace(COOKIE_HEADER, "$1[redacted]")
        .replace(QUOTED_SECRET, "$1[redacted]")
        .replace(AUTHORIZATION, "$1[redacted]")
        .replace(SECRET_ASSIGNMENT, "$1[redacted]")
        .replace(TOKEN, "[redacted-token]")
        .replace(MFA_TOKEN, "[redacted-token]")
        .replace(URL, "[redacted-url]")
        .replace(WINDOWS_PATH, "[redacted-path]")
        .replace(POSIX_PATH, "[redacted-path]")
        .replace(USER_ID, "[redacted-user-id]")
        .replace(EMAIL, "[redacted-email]");
}

export function redactDiagnosticValue(value: unknown): unknown {
    const seen = new WeakSet<object>();
    function visit(nested: unknown, depth: number): unknown {
        if (depth > 8) return "[depth limit]";
        if (typeof nested === "string") return redactDiagnosticString(nested);
        if (nested == null || typeof nested !== "object") return nested;
        if (seen.has(nested)) return "[repeated reference]";
        seen.add(nested);
        if (Array.isArray(nested)) return nested.slice(0, 200).map(item => visit(item, depth + 1));
        const redacted: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(nested).slice(0, 200)) {
            if (["__proto__", "prototype", "constructor"].includes(key)) continue;
            redacted[key] = /^(?:content|message|body|text|headers?|email|phone|username|userId|accountId)$/i.test(key) || /token|authorization|password|secret|cookie|api[_-]?key/i.test(key)
                ? "[redacted]" : visit(item, depth + 1);
        }
        return redacted;
    }
    return visit(value, 0);
}
