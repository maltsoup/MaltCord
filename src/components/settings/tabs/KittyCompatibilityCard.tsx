/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import type { packageCompatibility } from "@shared/kittycord/compatibility";
import { React } from "@webpack/common";

export function KittyCompatibilityCard({ report }: { report: ReturnType<typeof packageCompatibility>; }) {
    return <Card className="kc-tools-card" aria-label="MaltCord compatibility report">
        <Heading>Compatibility: {report.classification}</Heading>
        <Paragraph>{report.loading}</Paragraph>
        <Paragraph>Permissions: {report.permissions.join(", ") || "None"}. Publisher unverified.</Paragraph>
        {report.reasons.map(reason => <Paragraph key={reason}>{reason}</Paragraph>)}
        {report.findings.map((finding, index) => <Paragraph key={index}>{finding.classification}: {finding.plugins.join(", ")}. {finding.message} {finding.remediation}</Paragraph>)}
    </Card>;
}
