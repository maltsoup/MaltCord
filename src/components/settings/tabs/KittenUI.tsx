/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./kittenPrefs.css";

import { Button, type ButtonProps } from "@components/Button";
import { Heading } from "@components/Heading";
import { ClockIcon, CodeIcon, GithubIcon, InfoIcon, PaintbrushIcon, PluginsIcon, SearchIcon, ShieldIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { classes } from "@utils/misc";
import { Alerts, ContextMenuApi, Menu, React, Tooltip, useEffect, useLayoutEffect, useRef, useState } from "@webpack/common";
import type { PropsWithChildren, ReactNode } from "react";

import { isKcIconName, KcIcon, type KcIconName } from "./kittenIcons";

export function PluginGlyph({ icon, large = false }: { icon?: string; large?: boolean; }) {
    if (!icon) return null;
    const Icon = ({ puzzle: PluginsIcon, code: CodeIcon, clock: ClockIcon, palette: PaintbrushIcon, search: SearchIcon, shield: ShieldIcon } as Record<string, typeof CodeIcon>)[icon];
    if (!Icon && !icon.startsWith("data:image/")) return null;
    return <span className={large ? "kc-tool-icon kc-glyph-large" : "kc-tool-icon"}>{icon.startsWith("data:image/") ? <img src={icon} alt="" /> : <Icon width={22} height={22} aria-hidden="true" />}</span>;
}
export function KittenTabs({ tabs, selected, onSelect, label, panelId }: { tabs: readonly { id: string; label: string; }[]; selected: string; onSelect(id: string): void; label: string; panelId?: string; }) {
    const id = React.useId(); const root = useRef<HTMLDivElement>(null);
    return <div className="kc-group-tabs" role="tablist" aria-label={label} ref={root}>{tabs.map((tab, index) => <Button variant="none" key={tab.id} id={`${id}-${tab.id}`} role="tab" aria-controls={panelId} className="kc-group-tab" aria-selected={selected === tab.id} tabIndex={selected === tab.id ? 0 : -1} onClick={() => onSelect(tab.id)} onKeyDown={event => {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
        onSelect(tabs[next].id); root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{tab.label}</Button>)}</div>;
}
export function CompactNotice({ tone = "info", children }: PropsWithChildren<{ tone?: "info" | "warning" | "critical"; }>) {
    return <div className="kc-compact-notice" data-tone={tone} role={tone === "critical" ? "alert" : "status"}><InfoIcon width={16} height={16} aria-hidden="true" /><div>{children}</div></div>;
}
export function EmptyState({ title, children }: PropsWithChildren<{ title: string; }>) { return <div className="kc-empty-state"><PluginGlyph /><Heading>{title}</Heading><Paragraph>{children}</Paragraph></div>; }
export function ActionIcon({ label, children, onClick, disabled = false }: PropsWithChildren<{ label: string; onClick(event: React.MouseEvent<HTMLButtonElement>): void; disabled?: boolean; }>) {
    // Not Discord's Button: its design-system styles paint a brand fill on every button variant.
    return <Tooltip text={label}>{props => <button type="button" {...props} className="kc-icon-btn" aria-label={label} disabled={disabled} onClick={onClick}>{children}</button>}</Tooltip>;
}

export function PublisherIdentity({ author, github, avatar, source = "MaltCord Local" }: { author: string; github?: string; avatar?: string; source?: string; }) {
    const account = github && /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i.test(github) ? github : undefined;
    return <span className="kc-publisher">{(avatar || account) && <span className="kc-publisher-avatar"><img src={account ? `https://github.com/${account}.png?size=64` : avatar} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /></span>}<span className="kc-publisher-author">{author}</span>{account && <Link href={`https://github.com/${account}`} aria-label={`${author} on GitHub`}><GithubIcon width={17} height={17} /></Link>}{source && <span className="kc-source-badge">{source}</span>}</span>;
}

type TileIcon = KcIconName | ReactNode;

export function IconTile({ icon, brand = false }: { icon: TileIcon; brand?: boolean; }) {
    return <span className="kc-tile" data-brand={brand || undefined} aria-hidden="true">{isKcIconName(icon) ? <KcIcon name={icon} size={17} /> : icon}</span>;
}

export function PrefGroup({ title, description, footer, children, className }: PropsWithChildren<{ title?: string; description?: ReactNode; footer?: ReactNode; className?: string; }>) {
    return <section className={classes("kc-pref-group", className)}>
        {(title || description) && <header className="kc-pref-group-head">{title && <Heading tag="h3" className="kc-pref-group-title">{title}</Heading>}{description && <Paragraph color="text-muted" defaultColor={false} className="kc-pref-group-description">{description}</Paragraph>}</header>}
        <div className="kc-pref-list">{children}</div>
        {footer && <Paragraph color="text-muted" defaultColor={false} className="kc-pref-group-footer">{footer}</Paragraph>}
    </section>;
}

interface PrefRowProps { icon?: TileIcon; brand?: boolean; label: ReactNode; description?: ReactNode; detail?: ReactNode; }

function PrefRowText({ icon, brand, label, description }: PrefRowProps) {
    return <>
        {icon && <IconTile icon={icon} brand={brand} />}
        <span className="kc-pref-text"><span className="kc-pref-label">{label}</span>{description && <span className="kc-pref-description">{description}</span>}</span>
    </>;
}

export function PrefRow({ control, children, ...text }: PropsWithChildren<PrefRowProps & { control?: ReactNode; }>) {
    return <div className="kc-pref-row"><div className="kc-pref-main"><PrefRowText {...text} />{text.detail && <span className="kc-pref-detail">{text.detail}</span>}{control && <span className="kc-pref-control">{control}</span>}</div>{children && <div className="kc-pref-extra">{children}</div>}</div>;
}

export function PrefLinkRow({ onClick, disabled, ...text }: PrefRowProps & { onClick(): void; disabled?: boolean; }) {
    return <button type="button" className="kc-pref-row kc-pref-link" disabled={disabled} onClick={onClick}><span className="kc-pref-main"><PrefRowText {...text} />{text.detail && <span className="kc-pref-detail">{text.detail}</span>}<KcIcon name="chevron" size={16} className="kc-pref-chevron" /></span></button>;
}

export function PrefSwitchRow({ value, onChange, disabled, ...text }: PrefRowProps & { value: boolean; onChange(value: boolean): void; disabled?: boolean; }) {
    return <label className="kc-pref-row kc-pref-switch" data-enabled={value || undefined} data-disabled={disabled || undefined}><span className="kc-pref-main"><PrefRowText {...text} /><span className="kc-pref-control"><Switch checked={value} onChange={onChange} disabled={disabled} /></span></span></label>;
}

export type KcButtonLevel = "primary" | "secondary";

/** Primary is the one main next step of a view (at most one per view). Destructive actions use DangerZone or a danger OverflowItem. */
export function KcButton({ level = "secondary", inRow = false, className, ...props }: Omit<ButtonProps, "variant" | "size"> & { level?: KcButtonLevel; inRow?: boolean; }) {
    return <Button {...props} variant={level} size="small" className={classes("kc-btn", inRow && "kc-btn-row", className)} />;
}

export interface OverflowItem {
    id: string;
    label: string;
    action(): void;
    disabled?: boolean;
    /** Destructive items always ask first and are listed last. */
    danger?: { title: string; body: string; confirmText: string; };
}

function confirmDanger(item: OverflowItem) {
    if (!item.danger) return item.action();
    Alerts.show({ title: item.danger.title, body: item.danger.body, confirmText: item.danger.confirmText, cancelText: "Cancel", confirmColor: "danger", onConfirm: item.action });
}

export function OverflowMenu({ items, label = "More actions" }: { items: OverflowItem[]; label?: string; }) {
    const safe = items.filter(item => !item.danger), danger = items.filter(item => item.danger);
    return <ActionIcon label={label} onClick={event => ContextMenuApi.openContextMenu(event, () => (
        <Menu.Menu navId="kc-overflow" onClose={ContextMenuApi.closeContextMenu} aria-label={label}>
            {safe.map(item => <Menu.MenuItem key={item.id} id={item.id} label={item.label} disabled={item.disabled} action={item.action} />)}
            {safe.length > 0 && danger.length > 0 && <Menu.MenuSeparator />}
            {danger.map(item => <Menu.MenuItem key={item.id} id={item.id} label={item.label} color="danger" disabled={item.disabled} action={() => confirmDanger(item)} />)}
        </Menu.Menu>
    ))}><KcIcon name="dots" /></ActionIcon>;
}

export function PageHeader({ title, description, primary, overflow, children }: PropsWithChildren<{ title: ReactNode; description?: ReactNode; primary?: ReactNode; overflow?: OverflowItem[]; }>) {
    return <header className="kc-page-header">
        <div className="kc-page-heading"><Heading tag="h2" className="kc-page-title">{title}</Heading>{description && <Paragraph color="text-muted" defaultColor={false} className="kc-page-description">{description}</Paragraph>}</div>
        <div className="kc-page-actions">{children}{primary}{overflow && overflow.length > 0 && <OverflowMenu items={overflow} />}</div>
    </header>;
}

export interface SegmentItem<T extends string> { id: T; label: string; count?: number; }

export function Segments<T extends string>({ items, value, onChange, label }: { items: readonly SegmentItem<T>[]; value: T; onChange(id: T): void; label: string; }) {
    const root = useRef<HTMLDivElement>(null);
    const [pill, setPill] = useState<{ left: number; width: number; }>();
    useLayoutEffect(() => {
        const active = root.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    }, [value, items]);
    if (items.length < 2) return null;
    return <div className="kc-segments" role="tablist" aria-label={label} ref={root}>
        {pill && <span className="kc-segment-pill" style={pill} aria-hidden="true" />}
        {items.map((item, index) => <button type="button" key={item.id} role="tab" className="kc-segment" aria-selected={item.id === value} tabIndex={item.id === value ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={event => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!step && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + step + items.length) % items.length;
            onChange(items[next].id);
            root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{item.label}{item.count !== undefined && <span className="kc-segment-count">{item.count}</span>}</button>)}
    </div>;
}

export function DangerZone({ children }: PropsWithChildren) {
    return <PrefGroup title="Danger zone" className="kc-danger-zone">{children}</PrefGroup>;
}

export function DangerRow({ label, description, actionLabel, confirm, onConfirm }: { label: ReactNode; description?: ReactNode; actionLabel: string; confirm: { title: string; body: string; }; onConfirm(): void; }) {
    return <PrefRow label={label} description={description} control={<Button variant="dangerSecondary" size="small" className="kc-btn kc-btn-row" onClick={() => Alerts.show({ title: confirm.title, body: confirm.body, confirmText: actionLabel, cancelText: "Cancel", confirmColor: "danger", onConfirm })}>{actionLabel}</Button>} />;
}

/** KittenCord-owned popover (Filter, notifications). Opens from its anchor corner; Escape or an outside click closes it. */
export function Popover({ open, onClose, align = "end", label, children }: PropsWithChildren<{ open: boolean; onClose(): void; align?: "start" | "end"; label: string; }>) {
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        root.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus();
        const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
        // Discord renders select menus in a layer outside the popover; picking from one is not an outside click.
        const pointer = (event: PointerEvent) => { if (event.target instanceof Element && !root.current?.parentElement?.contains(event.target) && !event.target.closest(".kc-select-popout, [role='listbox'], [role='option']")) onClose(); };
        document.addEventListener("keydown", key, true); document.addEventListener("pointerdown", pointer, true);
        return () => { document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", pointer, true); };
    }, [open, onClose]);
    return <div ref={root} className="kc-popover" data-align={align} data-open={open || undefined} role="dialog" aria-label={label} aria-hidden={!open} inert={!open}>{children}</div>;
}

export function Counter({ value, label }: { value: number; label?: string; }) {
    const previous = useRef(value);
    const [pop, setPop] = useState(0);
    useEffect(() => { if (previous.current !== value) { previous.current = value; setPop(n => n + 1); } }, [value]);
    return <span key={pop} className="kc-counter" data-pop={pop > 0 || undefined} aria-label={label}>{value}</span>;
}

export function StatusDot({ tone = "ok" }: { tone?: "ok" | "warning" | "danger"; }) {
    return <span className="kc-status-dot" data-tone={tone} aria-hidden="true" />;
}

/** Wraps a page so its groups enter once per navigation (give it a key per page). */
export function KcPage({ children }: PropsWithChildren) {
    return <div className="kc-page">{children}</div>;
}
