/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./kittycordTools.css";
import "./kittenDesign.css";

import { Heading } from "@components/Heading";
import { InfoIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import type { IconProps } from "@utils/types";
import type { ComponentType, PropsWithChildren } from "react";

export function KittyToolHeader({ Icon, title, description }: { Icon: ComponentType<IconProps>; title: string; description: string; }) {
    return <header className="kc-tool-header">
        <div className="kc-page-heading"><Heading tag="h2">{title}</Heading><Paragraph>{description}</Paragraph></div>
        <span className="kc-tool-icon"><Icon width={22} height={22} aria-hidden="true" /></span>
    </header>;
}

export function KittyToolDetails({ title = "How it works", children }: PropsWithChildren<{ title?: string; }>) {
    return <details className="kc-tool-details"><summary><InfoIcon width={16} height={16} aria-hidden="true" />{title}</summary><div>{children}</div></details>;
}
