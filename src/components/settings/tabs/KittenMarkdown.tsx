/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Link } from "@components/Link";
import { markdownInline, parseMarkdown } from "@shared/kittycord/markdown";
import { React, useState } from "@webpack/common";

export function KittenMarkdown({ source, repository }: { source: string; repository?: string; }) {
    const [images, setImages] = useState(false);
    const inline = (text: string) => markdownInline(text, repository ? `${repository}/blob/HEAD/` : undefined).map((token, index) => token.type === "link" && token.href ? <Link key={index} href={token.href} target="_blank" rel="noreferrer noopener">{token.text}</Link> : token.type === "image" ? token.href && images ? <img key={index} src={token.href.replace("/blob/", "/raw/")} alt={token.text} referrerPolicy="no-referrer" loading="lazy" /> : <span key={index} className="kc-readme-image">Image: {token.text || "Untitled"} {token.href && <Button variant="secondary" size="small" onClick={() => setImages(true)}>Load external images</Button>}</span> : token.type === "code" ? <code key={index}>{token.text}</code> : token.type === "strong" ? <strong key={index}>{token.text}</strong> : token.type === "emphasis" ? <em key={index}>{token.text}</em> : <span key={index}>{token.text}</span>);
    return <div className="kc-markdown">{parseMarkdown(source).map((block, index) => {
        if (block.type === "heading") { const Tag = block.level <= 2 ? "h3" : "h4"; return <Tag key={index}>{inline(block.text)}</Tag>; }
        if (block.type === "code") return <pre key={index}><code>{block.text}</code></pre>;
        if (block.type === "list") { const Tag = block.ordered ? "ol" : "ul"; return <Tag key={index}>{block.items.map((value, item) => <li key={item}>{inline(value)}</li>)}</Tag>; }
        if (block.type === "table") return <div className="kc-readme-table" key={index}><table><thead><tr>{block.head.map((text, column) => <th key={column}>{inline(text)}</th>)}</tr></thead><tbody>{block.rows.map((row, item) => <tr key={item}>{block.head.map((_text, column) => <td key={column}>{inline(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>;
        return block.type === "quote" ? <blockquote key={index}>{inline(block.text)}</blockquote> : <p key={index}>{inline(block.text)}</p>;
    })}</div>;
}
