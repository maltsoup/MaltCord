/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { README_LIMIT } from "./presentation";

export type MarkdownInline = { type: "text" | "code" | "strong" | "emphasis"; text: string; } | { type: "link" | "image"; text: string; href?: string; };
export type MarkdownBlock = { type: "heading"; level: number; text: string; } | { type: "paragraph" | "quote"; text: string; } | { type: "code"; language: string; text: string; } | { type: "list"; ordered: boolean; items: string[]; } | { type: "table"; head: string[]; rows: string[][]; };
export function markdownUrl(input: string, base?: string) {
    try {
        if (/^[\s\u0000-\u0020]|[\u0000-\u001f\u007f]/.test(input) || input.startsWith("//")) return undefined;
        const url = base ? new URL(input, base) : new URL(input);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
    } catch { return undefined; }
}
export function markdownInline(text: string, base?: string): MarkdownInline[] {
    const pattern = /(!?)\[([^\]\n]{0,500})\]\(([^\s)]{1,2048})\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
    const result: MarkdownInline[] = []; let offset = 0;
    for (const match of text.matchAll(pattern)) {
        if (result.length >= 300) break;
        if (match.index > offset) result.push({ type: "text", text: text.slice(offset, match.index) });
        if (match[2] !== undefined) result.push({ type: match[1] ? "image" : "link", text: match[2], href: markdownUrl(match[3], base) });
        else result.push({ type: match[4] ? "code" : match[5] ? "strong" : "emphasis", text: match[4] ?? match[5] ?? match[6] });
        offset = match.index + match[0].length;
    }
    if (offset < text.length) result.push({ type: "text", text: text.slice(offset) });
    return result;
}
export function parseMarkdown(source: string): MarkdownBlock[] {
    if (new TextEncoder().encode(source).byteLength > README_LIMIT) throw new Error("README exceeds 24 KiB.");
    const lines = source.replaceAll("\r\n", "\n").split("\n"); const result: MarkdownBlock[] = [];
    const cells = (line: string) => line.replace(/^\||\|$/g, "").split("|").slice(0, 16).map(value => value.trim());
    for (let index = 0; index < lines.length;) {
        if (result.length >= 400) throw new Error("README contains too many blocks.");
        const line = lines[index++]; if (!line.trim()) continue;
        const fence = /^\s*```([\w-]*)/.exec(line);
        if (fence) { const values: string[] = []; while (index < lines.length && !/^\s*```/.test(lines[index])) values.push(lines[index++]); if (index < lines.length) index++; result.push({ type: "code", language: fence[1], text: values.join("\n") }); continue; }
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading) { result.push({ type: "heading", level: heading[1].length, text: heading[2] }); continue; }
        if (line.includes("|") && index < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index])) {
            index++; const rows: string[][] = []; while (index < lines.length && lines[index].includes("|") && rows.length < 100) rows.push(cells(lines[index++])); result.push({ type: "table", head: cells(line), rows }); continue;
        }
        const list = /^\s*(-|\*|\d+\.)\s+(.+)$/.exec(line);
        if (list) { const ordered = /\d/.test(list[1]); const items = [list[2]]; while (index < lines.length) { const next = /^\s*(-|\*|\d+\.)\s+(.+)$/.exec(lines[index]); if (!next || /\d/.test(next[1]) !== ordered) break; items.push(next[2]); index++; } result.push({ type: "list", ordered, items }); continue; }
        if (/^>\s?/.test(line)) { result.push({ type: "quote", text: line.replace(/^>\s?/, "") }); continue; }
        const values = [line]; while (index < lines.length && lines[index].trim() && !/^(?:#{1,6}\s|\s*```|\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[index]) && !(lines[index].includes("|") && index + 1 < lines.length && lines[index + 1].includes("---"))) values.push(lines[index++]);
        result.push({ type: "paragraph", text: values.join("\n") });
    }
    return result;
}
