/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const placeholder = (value: string) => /^(?:hotpink|#ff69b4|rgb\(255,\s*105,\s*180\))$/i.test(value.trim());

export function repairThemePreviews(document: Document, color: (name: string) => string | undefined) {
    const changed = new Map<HTMLElement, Map<string, { value: string; priority: string; applied: string; }>>();
    let pending = 0;
    function set(element: HTMLElement, token: string, value: string) {
        const previous = changed.get(element) ?? new Map();
        if (!previous.has(token)) previous.set(token, { value: element.style.getPropertyValue(token), priority: element.style.getPropertyPriority(token), applied: value });
        changed.set(element, previous);
        element.style.setProperty(token, value);
    }
    function update() {
        pending = 0;
        for (const [element] of changed) if (!element.isConnected) changed.delete(element);
        for (const element of document.querySelectorAll<HTMLElement>('[role="radio"][class*="themeSelection_"]')) {
            const style = getComputedStyle(element);
            const token = /(?:^|\s)ashIcon_/.test(element.className) ? "primary-600" : /(?:^|\s)darkIcon_/.test(element.className) ? "plum-20" : undefined;
            if (token && placeholder(style.getPropertyValue(`--${token}`))) {
                const value = color(token.toUpperCase().replaceAll("-", "_"));
                if (value && /^#[a-f\d]{6}$/i.test(value)) set(element, `--${token}`, value);
            }
            if (element.style.background.includes("var(--background-gradient)") && /hotpink|rgb\(255,\s*105,\s*180\)/i.test(style.getPropertyValue("--background-gradient"))) set(element, "--background-gradient", "linear-gradient(transparent,transparent)");
        }
    }
    const observer = new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(update); });
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
        observer.disconnect(); cancelAnimationFrame(pending);
        for (const [element, tokens] of changed) for (const [token, previous] of tokens) if (element.style.getPropertyValue(token) === previous.applied) {
            if (previous.value) element.style.setProperty(token, previous.value, previous.priority);
            else element.style.removeProperty(token);
        }
        changed.clear();
    };
}
