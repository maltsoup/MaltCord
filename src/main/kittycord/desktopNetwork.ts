/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcEvents } from "@shared/IpcEvents";
import { parseNetworkOrigins } from "@shared/kittycord/desktopPlugin";
import { lookup } from "dns/promises";
import { ipcMain } from "electron";
import { request } from "https";
import { BlockList, isIP } from "net";

const privateAddresses = new BlockList();
const privateV6Addresses = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["2002::", 16], ["2001::", 32], ["64:ff9b::", 96]] as const) privateV6Addresses.addSubnet(address, prefix, "ipv6");
export function isPublicPluginAddress(address: string) {
    const family = isIP(address);
    return family !== 0 && !(family === 4 ? privateAddresses.check(address, "ipv4") : privateV6Addresses.check(address, "ipv6"));
}
export async function downloadPluginResource(input: string, origins: readonly string[], signal: AbortSignal, redirects = 0): Promise<{ status: number; text: string; contentType: string; }> {
    if (typeof input !== "string" || input.length > 2048 || redirects > 3) throw new Error("The download URL or redirect limit is invalid.");
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port || !origins.includes(url.origin)) throw new Error("This HTTPS origin is not declared by the plugin.");
    const addresses = await new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
        const cancel = () => reject(new Error("The plugin download was cancelled."));
        if (signal.aborted) { cancel(); return; }
        signal.addEventListener("abort", cancel, { once: true });
        void lookup(url.hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
    });
    if (!addresses.length || addresses.some(item => !isPublicPluginAddress(item.address))) throw new Error("Plugin downloads require a public internet destination.");
    if (signal.aborted) throw new Error("The plugin download was cancelled.");
    const address = addresses[0];
    return new Promise((resolve, reject) => {
        const connection = request({ hostname: address.address, family: address.family, port: 443, servername: url.hostname, path: url.pathname + url.search, method: "GET", agent: false, signal,
            headers: { Host: url.hostname, Accept: "application/json, text/plain, application/javascript, text/css, */*", "User-Agent": "Kittencord-Plugin-Downloads" } }, response => {
            const status = response.statusCode ?? 0;
            if (status >= 300 && status < 400 && response.headers.location) {
                response.resume();
                void downloadPluginResource(new URL(response.headers.location, url).href, origins, signal, redirects + 1).then(resolve, reject);
                return;
            }
            if (status < 200 || status >= 300) { response.resume(); reject(new Error(`The resource server returned HTTP ${status}.`)); return; }
            const parts: Buffer[] = []; let size = 0;
            response.on("data", (part: Buffer) => {
                size += part.length;
                if (size > 1_048_576) { response.destroy(); reject(new Error("Plugin downloads are limited to 1 MiB.")); }
                else parts.push(part);
            });
            response.on("error", () => reject(new Error("The plugin resource could not be downloaded.")));
            response.on("end", () => {
                try { resolve({ status, text: new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)), contentType: String(response.headers["content-type"] ?? "text/plain").slice(0, 120) }); }
                catch { reject(new Error("The resource must contain UTF-8 text.")); }
            });
        });
        connection.on("error", () => reject(new Error(signal.aborted ? "The plugin download was cancelled." : "The plugin resource could not be downloaded.")));
        connection.end();
    });
}

const downloads = new Map<string, Set<AbortController>>();
ipcMain.handle(IpcEvents.KITTYCORD_PLUGIN_NETWORK, async (event, action: unknown, token: unknown, input?: unknown, declared?: unknown) => {
    if (event.senderFrame !== event.sender.mainFrame || !/^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com$/.test(new URL(event.sender.getURL()).origin)) return { error: "Open plugins from Discord settings." };
    if (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token)) return { error: "Invalid plugin request." };
    const key = `${event.sender.id}:${token}`;
    if (action === "close") { for (const job of downloads.get(key) ?? []) job.abort(); downloads.delete(key); return {}; }
    if (action !== "get" || typeof input !== "string") return { error: "Unsupported plugin network action." };
    let origins: string[];
    try { origins = parseNetworkOrigins(declared); } catch { return { error: "Declare public HTTPS origins before downloading resources." }; }
    if ([...downloads.values()].reduce((count, jobs) => count + jobs.size, 0) >= 16 || (downloads.get(key)?.size ?? 0) >= 4) return { error: "Wait for the current plugin downloads to finish." };
    const controller = new AbortController(); const jobs = downloads.get(key) ?? new Set<AbortController>(); jobs.add(controller); downloads.set(key, jobs);
    const timeout = setTimeout(() => controller.abort(), 8000);
    try { return { result: await downloadPluginResource(input, origins, controller.signal) }; }
    catch (error) { return { error: error instanceof Error ? error.message : "Plugin download failed." }; }
    finally { clearTimeout(timeout); jobs.delete(controller); if (!jobs.size && downloads.get(key) === jobs) downloads.delete(key); }
});
