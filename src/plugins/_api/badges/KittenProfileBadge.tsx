/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./kittenBadges.css";

import { useCloudBadges } from "@api/KittycordCloud";
import ErrorBoundary from "@components/ErrorBoundary";
import { OwnerCrownIcon } from "@components/Icons";
import { Tooltip } from "@webpack/common";

export const KittenNameCrown = ErrorBoundary.wrap(function KittenNameCrown({ userId }: { userId: string; }) {
    const opal = useCloudBadges(userId).find(badge => badge.id === "opal");
    if (!opal) return null;
    return <Tooltip text="MaltCord developer">{props => <span {...props} className="vc-kitten-name-crown" role="img" aria-label="MaltCord developer"><OwnerCrownIcon width={16} height={16} aria-hidden="true" aria-label={undefined} /></span>}</Tooltip>;
}, { noop: true });
