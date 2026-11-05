/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import type { SearchableSelect, Select } from "@vencord/discord-types";
import { React, SearchableSelect as DiscordSearchableSelect, Select as DiscordSelect, useEffect, useRef, useState } from "@webpack/common";
import type { ComponentProps } from "react";

function useSelectAnchor(props: { popoutClassName?: string; onOpen?(): void; onClose?(): void; }) {
    const root = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const id = "kc-select-popup-" + React.useId().replace(/[^a-z0-9_-]/gi, "");
    useEffect(() => {
        const element = root.current;
        if (!element) return;
        let ownedPopup = false;
        const observe = () => {
            const found = element.querySelector('[role="listbox"]') !== null;
            if (found !== ownedPopup) { ownedPopup = found; setOpen(found); }
        };
        const observer = new MutationObserver(observe);
        observer.observe(element, { subtree: true, childList: true });
        observe();
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (!open) return;
        let frame = 0, settling = 18;
        let popup: HTMLElement | undefined;
        let translate = "", translatePriority = "", maxHeight = "", overflow = "";
        const restore = () => {
            if (!popup) return;
            if (translate) popup.style.setProperty("translate", translate, translatePriority); else popup.style.removeProperty("translate");
            if (maxHeight) popup.style.maxHeight = maxHeight; else popup.style.removeProperty("max-height");
            if (overflow) popup.style.overflowY = overflow; else popup.style.removeProperty("overflow-y");
        };
        const resize = new ResizeObserver(() => schedule());
        function position() {
            frame = 0;
            const listbox = root.current?.querySelector<HTMLElement>('[role="listbox"]');
            const found = document.querySelector<HTMLElement>("." + id)
                ?? listbox?.closest<HTMLElement>("[data-floating-ui-focusable]") ?? listbox;
            const trigger = root.current?.firstElementChild;
            if (found && trigger instanceof HTMLElement) {
                if (popup !== found) {
                    restore(); popup = found;
                    translate = popup.style.getPropertyValue("translate"); translatePriority = popup.style.getPropertyPriority("translate");
                    maxHeight = popup.style.maxHeight; overflow = popup.style.overflowY;
                    resize.observe(popup); resize.observe(trigger);
                }
                restore();
                const viewport = window.visualViewport;
                const leftEdge = (viewport?.offsetLeft ?? 0) + 8, topEdge = (viewport?.offsetTop ?? 0) + 8;
                const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 16, bottomEdge = topEdge + (viewport?.height ?? innerHeight) - 16;
                const anchor = trigger.getBoundingClientRect();
                let rect = popup.getBoundingClientRect();
                const above = Math.max(0, anchor.top - topEdge - 4), belowSpace = Math.max(0, bottomEdge - anchor.bottom - 4);
                const downward = rect.height <= belowSpace || belowSpace >= above;
                const available = downward ? belowSpace : above;
                if (rect.height > available) {
                    const style = getComputedStyle(popup), scale = rect.height / popup.offsetHeight || 1;
                    const extra = style.boxSizing === "border-box" ? 0 : popup.offsetHeight - parseFloat(style.height);
                    popup.style.maxHeight = `${Math.max(0, available / scale - extra)}px`; popup.style.overflowY = "auto";
                    rect = popup.getBoundingClientRect();
                }
                const x = Math.max(leftEdge, Math.min(anchor.left, rightEdge - rect.width));
                const below = anchor.bottom + 4;
                const y = Math.max(topEdge, Math.min(downward ? below : anchor.top - rect.height - 4, bottomEdge - rect.height));
                const scaleX = rect.width / popup.offsetWidth || 1, scaleY = rect.height / popup.offsetHeight || 1;
                popup.style.setProperty("translate", `${(x - rect.left) / scaleX}px ${(y - rect.top) / scaleY}px`);
            }
            if (settling-- > 0) schedule();
        }
        function schedule() { if (!frame) frame = requestAnimationFrame(position); }
        schedule();
        window.addEventListener("scroll", schedule, true); window.addEventListener("resize", schedule);
        window.visualViewport?.addEventListener("resize", schedule); window.visualViewport?.addEventListener("scroll", schedule);
        return () => {
            cancelAnimationFrame(frame); resize.disconnect(); restore();
            window.removeEventListener("scroll", schedule, true); window.removeEventListener("resize", schedule);
            window.visualViewport?.removeEventListener("resize", schedule); window.visualViewport?.removeEventListener("scroll", schedule);
        };
    }, [open, id]);
    return { root, popup: { popoutClassName: classes(id, "kc-select-popout", props.popoutClassName), onOpen: () => { setOpen(true); props.onOpen?.(); }, onClose: () => { setOpen(false); props.onClose?.(); } } };
}

export function KittenSelect(props: ComponentProps<Select>) {
    const anchor = useSelectAnchor(props);
    return <div className="kc-select-anchor" ref={anchor.root}><DiscordSelect {...props} {...anchor.popup} maxVisibleItems={props.maxVisibleItems ?? 8} className={classes("kc-select", props.className)} /></div>;
}

export function KittenSearchableSelect(props: ComponentProps<SearchableSelect>) {
    const anchor = useSelectAnchor(props);
    return <div className="kc-select-anchor" ref={anchor.root}><DiscordSearchableSelect {...props} {...anchor.popup} wrapperClassName={classes("kc-search-select", props.wrapperClassName)} /></div>;
}
