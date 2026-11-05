/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

let local: "loading" | "running" | "attention" = "loading";
let cloud: "idle" | "connecting" | "online" | "offline" = "idle";
let root: HTMLDivElement | undefined, localLabel: HTMLElement, cloudLabel: HTMLElement, progress: HTMLProgressElement;
let hide: ReturnType<typeof setTimeout> | undefined;
function paint() {
    if (!root) return;
    root.dataset.state = local;
    localLabel.textContent = local === "loading" ? "Loading core modules…" : local === "running" ? "KittenCord is running" : "Running with startup issues";
    cloudLabel.textContent = cloud === "connecting" ? "Connecting to Cloud…" : cloud === "online" ? "Cloud connected" : cloud === "offline" ? "Cloud unavailable · local features remain available" : "Local client";
    if (local === "loading") progress.removeAttribute("value"); else progress.value = 1;
    clearTimeout(hide);
    if (local !== "loading" && cloud !== "connecting") hide = setTimeout(() => { if (root) root.hidden = true; }, 7000);
}
export function startStartupIndicator() {
    const mount = () => {
        if (root) return;
        root = document.createElement("div"); root.className = "kc-startup-progress"; root.setAttribute("role", "status"); root.setAttribute("aria-live", "polite");
        localLabel = document.createElement("strong"); cloudLabel = document.createElement("small"); progress = document.createElement("progress"); progress.max = 1; progress.setAttribute("aria-label", "Local startup");
        const close = document.createElement("button"); close.textContent = "Dismiss"; close.setAttribute("aria-label", "Dismiss startup status"); close.onclick = () => { if (root) root.hidden = true; clearTimeout(hide); };
        root.append(localLabel, cloudLabel, progress, close); document.body.append(root); paint();
    };
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount, { once: true });
}
export function completeLocalStartup(issues: boolean) { local = issues ? "attention" : "running"; paint(); }
export function setStartupCloudState(value: typeof cloud) { cloud = value; paint(); }
