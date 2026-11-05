/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { BaseText } from "@components/BaseText";

export function StockPluginsCard({ totalStockPlugins, enabledStockPlugins }: { totalStockPlugins: number; enabledStockPlugins: number; }) {
    return <div className="vc-plugin-stat-pair">
        <div className="vc-plugin-stats"><BaseText size="xl" weight="bold">{enabledStockPlugins}</BaseText><BaseText size="sm">Bundled selected</BaseText></div>
        <div className="vc-plugin-stats"><BaseText size="xl" weight="bold">{totalStockPlugins}</BaseText><BaseText size="sm">Bundled plugins</BaseText></div>
    </div>;
}

export function UserPluginsCard({ totalUserPlugins, enabledUserPlugins }: { totalUserPlugins: number; enabledUserPlugins: number; }) {
    return <div className="vc-plugin-stat-pair">
        <div className="vc-plugin-stats"><BaseText size="xl" weight="bold">{enabledUserPlugins}</BaseText><BaseText size="sm">Local selected</BaseText></div>
        <div className="vc-plugin-stats"><BaseText size="xl" weight="bold">{totalUserPlugins}</BaseText><BaseText size="sm">Local plugins</BaseText></div>
    </div>;
}
