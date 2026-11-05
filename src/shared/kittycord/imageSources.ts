/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function publicImageUrl(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 2048 || value !== value.trim()) throw new Error("Use a direct public HTTPS image URL.");
    let url: URL;
    try { url = new URL(value); } catch { throw new Error("Use a valid image URL."); }
    const host = url.hostname.toLowerCase(), ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443" || !host.includes(".") || host.endsWith(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || host.includes(":")) throw new Error("Use a public HTTPS image host without credentials.");
    if (ipv4) {
        const a = Number(ipv4[1]), b = Number(ipv4[2]);
        if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)) throw new Error("Private image addresses are not supported.");
    }
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname); } catch { throw new Error("Use a valid image path."); }
    if (/\.(?:svgz?|html?|xhtml|xml|js|mjs)(?:$|\/)/i.test(pathname)) throw new Error("Use a raster image such as PNG, JPEG, WebP, GIF or AVIF.");
    for (const [key, item] of url.searchParams) {
        if (/(?:token|secret|signature|credential|password|authorization|api.?key|x-amz-|x-goog-)/i.test(key) || /^(?:auth|sig|hm|expires|exp)$/i.test(key) || /^(?:svg|svgz|html|xml)$/i.test(item)) throw new Error("Image URLs cannot contain private credentials or active formats.");
    }
    return url.href;
}

export function imageReference(value: unknown): string {
    if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) return value;
    return publicImageUrl(value);
}

export function catalogImageUrl(reference: string, origin: string): string {
    return reference.startsWith("https:") ? publicImageUrl(reference) : `${origin}/api/v1/catalog/assets/${imageReference(reference)}`;
}
