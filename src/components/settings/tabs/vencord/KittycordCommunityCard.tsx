/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./KittycordCommunityCard.css";

import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Kittycord } from "@shared/kittycord";
import logo from "file://../../../kittencord.png?base64";

import { type OverflowItem, OverflowMenu, StatusDot } from "../KittenUI";
import { NotificationBell } from "../kittycordNotifications";

/** Home header (spec §2, §7): the only place the mascot appears, the status line, the bell and rare actions. */
export function KittycordCommunityCard({ running, failing, overflow }: { running: number; failing: number; overflow: OverflowItem[]; }) {
    return <header className="kc-home-header" aria-label="KittenCord">
        <img className="kc-home-mascot" src={`data:image/png;base64,${logo}`} width={56} height={56} alt="" />
        <div className="kc-home-identity">
            <Heading tag="h2" className="kc-home-title">KittenCord</Heading>
            <Paragraph color="text-muted" defaultColor={false} className="kc-home-version"><StatusDot tone={failing ? "warning" : "ok"} />{VERSION} · {Kittycord.channel} · {running} plugins running{failing ? ` · ${failing} need attention` : ""}</Paragraph>
        </div>
        <div className="kc-home-actions"><NotificationBell /><OverflowMenu items={overflow} /></div>
    </header>;
}
