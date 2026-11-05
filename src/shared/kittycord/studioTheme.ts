/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const studioThemeTokens = ["--background-primary", "--background-secondary", "--background-floating", "--text-normal", "--text-default", "--text-strong", "--text-muted", "--brand-500", "--border-subtle", "--input-background"] as const;

/** Old and current Discord variable names for each Studio color, tried in order. */
export const studioThemeAliases: Record<typeof studioThemeTokens[number], string[]> = {
    "--background-primary": ["--background-primary", "--background-base-lower", "--bg-base-primary"],
    "--background-secondary": ["--background-secondary", "--background-base-low", "--bg-base-secondary"],
    "--background-floating": ["--background-floating", "--background-surface-highest", "--bg-surface-overlay"],
    "--text-normal": ["--text-normal", "--text-default"],
    "--text-default": ["--text-default", "--text-normal"],
    "--text-strong": ["--text-strong", "--header-primary"],
    "--text-muted": ["--text-muted", "--text-subtle"],
    "--brand-500": ["--brand-500", "--control-brand-foreground", "--button-filled-brand-background", "--brand-experiment"],
    "--border-subtle": ["--border-subtle", "--border-normal", "--background-modifier-accent"],
    "--input-background": ["--input-background", "--input-background-default", "--background-tertiary"],
};

export function studioTheme(value: unknown): Partial<Record<typeof studioThemeTokens[number], string>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(studioThemeTokens.flatMap(key => {
        const color: unknown = Reflect.get(value, key);
        return typeof color === "string" && color.length <= 200 && !/[;{}\u0000-\u001f]|url\(|var\(/i.test(color) && /^(?:#[a-f0-9]{3,8}|(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^()]+\))$/i.test(color.trim()) ? [[key, color.trim()]] : [];
    }));
}
