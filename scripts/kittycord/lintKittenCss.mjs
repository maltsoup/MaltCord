/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Guards MaltCord settings CSS (UI_REDESIGN_SPEC_090 §7):
 *   colors     no hardcoded colors; use Discord variables and color-mix so every theme applies
 *   motion     only the ten spec motions: transitions/animations timed with --kc-t1..t3, the
 *              kc-rise/kc-pop/kc-fade/kc-ping keyframes, and no hover transforms except the chevron nudge
 *   selectors  every selector carries a .kc- or .vc- class so it cannot restyle native Discord UI
 *
 * Ratchet: counts per file may go down, never up. Pages still waiting for their redesign slice
 * keep a baseline; run with --update after removing offenders to lower it (it never raises one).
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = process.env.KITTEN_CSS_ROOTS?.split(",") ?? ["src/components/settings", "src/api"];
const BASELINE_FILE = process.env.KITTEN_CSS_BASELINE ?? "scripts/kittycord/kittenCssBaseline.json";
const ALLOWED_KEYFRAMES = new Set(["kc-rise", "kc-pop", "kc-fade", "kc-ping"]);
const NAMED_COLORS = /(?<![-\w])(black|white|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia)(?![-\w])/i;
const HARD_COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(/i;

function cssFiles(dir) {
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return cssFiles(path);
        if (!name.endsWith(".css")) return [];
        if (dir.replaceAll("\\", "/").startsWith("src/api")) return /^kittycord/i.test(name) ? [path] : [];
        return [path];
    });
}

/** Minimal CSS walker: yields { selector, prop, value, keyframes } for each declaration. */
function* declarations(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const stack = [];
    let buffer = "";
    for (const char of css) {
        if (char === "{") { stack.push(buffer.trim()); buffer = ""; continue; }
        if (char === "}") {
            if (buffer.trim()) yield* split(buffer, stack);
            buffer = ""; stack.pop(); continue;
        }
        if (char === ";" && stack.length) { yield* split(buffer, stack); buffer = ""; continue; }
        buffer += char;
    }
}

function* split(text, stack) {
    const index = text.indexOf(":");
    if (index < 0) return;
    const prop = text.slice(0, index).trim().toLowerCase(), value = text.slice(index + 1).trim();
    if (!prop || prop.includes("{")) return;
    const selector = [...stack].reverse().find(entry => !entry.startsWith("@")) ?? "";
    const keyframes = stack.some(entry => entry.startsWith("@keyframes"));
    yield { selector, prop, value, keyframes };
}

function topLevelParts(selector) {
    const parts = [];
    let depth = 0, current = "";
    for (const char of selector) {
        if (char === "(") depth++;
        if (char === ")") depth--;
        if (char === "," && depth === 0) { parts.push(current.trim()); current = ""; continue; }
        current += char;
    }
    return [...parts, current.trim()].filter(Boolean);
}

function selectorsOf(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const result = [];
    const stack = [];
    let buffer = "";
    for (const char of css) {
        if (char === "{") {
            const head = buffer.trim();
            const inKeyframes = stack.some(entry => entry.startsWith("@keyframes"));
            // Nested rules (CSS nesting) inherit the scope of the rule they sit in.
            const scoped = stack.some(entry => !entry.startsWith("@") && /\.(kc|vc)-/.test(entry));
            if (head && !head.startsWith("@") && !inKeyframes) result.push(...topLevelParts(head).map(part => scoped ? `.kc-scoped ${part}` : part));
            stack.push(head); buffer = ""; continue;
        }
        if (char === "}") { stack.pop(); buffer = ""; continue; }
        if (char === ";") { buffer = ""; continue; }
        buffer += char;
    }
    return result;
}

function check(file) {
    const css = readFileSync(file, "utf8");
    const findings = { colors: [], motion: [], selectors: [] };
    for (const { selector, prop, value, keyframes } of declarations(css)) {
        if (HARD_COLOR.test(value) || NAMED_COLORS.test(value)) findings.colors.push(`${selector} { ${prop}: ${value} }`);
        if (keyframes) continue;
        if ((prop === "transition" || prop === "transition-duration") && !/^none\b/.test(value) && !/var\(--kc-t[123]\)/.test(value))
            findings.motion.push(`${selector} { ${prop}: ${value} }`);
        if ((prop === "animation" || prop === "animation-name") && !/^none\b/.test(value) && !(value.match(/\bkc-[\w-]+/g) ?? []).some(name => ALLOWED_KEYFRAMES.has(name)))
            findings.motion.push(`${selector} { ${prop}: ${value} }`);
        if (prop === "transform" && selector.includes(":hover") && !(selector.includes("chevron") && value === "translateX(3px)"))
            findings.motion.push(`${selector} { transform: ${value} } (hover movement)`);
    }
    for (const match of css.matchAll(/@keyframes\s+([\w-]+)/g)) if (!ALLOWED_KEYFRAMES.has(match[1])) findings.motion.push(`@keyframes ${match[1]}`);
    for (const selector of selectorsOf(css)) if (!/\.(kc|vc)-/.test(selector)) findings.selectors.push(selector);
    return findings;
}

const init = process.argv.includes("--init");
if (init && existsSync(BASELINE_FILE)) throw new Error("A baseline already exists. Use --update to lower it.");
const update = init || process.argv.includes("--update");
const baseline = init ? null : JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
const next = {};
let failed = false;
for (const file of ROOTS.flatMap(cssFiles).map(path => relative(".", path).replaceAll("\\", "/")).sort()) {
    const findings = check(file);
    const counts = Object.fromEntries(Object.entries(findings).map(([key, list]) => [key, list.length]));
    const allowed = baseline ? baseline[file] ?? { colors: 0, motion: 0, selectors: 0 } : counts;
    for (const key of Object.keys(counts)) {
        if (counts[key] > allowed[key]) {
            failed = true;
            console.error(`${file}: ${counts[key]} ${key} findings, baseline ${allowed[key]}`);
            for (const finding of findings[key].slice(0, 12)) console.error(`  ${finding}`);
        }
    }
    const kept = Object.fromEntries(Object.keys(counts).map(key => [key, Math.min(counts[key], allowed[key])]));
    if (Object.values(kept).some(Boolean)) next[file] = kept;
}
if (update) {
    writeFileSync(BASELINE_FILE, JSON.stringify(next, null, 4) + "\n");
    console.log(`Baseline lowered where possible: ${Object.keys(next).length} files still have findings.`);
}
if (failed) process.exit(1);
const total = Object.values(next).reduce((sum, entry) => sum + entry.colors + entry.motion + entry.selectors, 0);
console.log(`MaltCord CSS ok. Remaining baseline findings: ${total} in ${Object.keys(next).length} files.`);
