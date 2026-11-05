/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { Kittycord } from "@shared/kittycord";
import { kittencordCredits } from "@shared/kittycord/credits";
import { gitRemote } from "@shared/vencordUserAgent";

import { PrefGroup, PrefLinkRow } from "./KittenUI";

/** Community, source and maintainer links plus KittenCord credits (moved here from Home). */
export function KittenAboutLinks() {
    return <PrefGroup title="Links and credits">
        <PrefLinkRow icon="discord" label="KittenCord community" onClick={() => VencordNative.native.openExternal(Kittycord.communityUrl)} />
        {gitRemote && <PrefLinkRow icon="github" label="Source code" detail={gitRemote} onClick={() => VencordNative.native.openExternal("https://github.com/" + gitRemote)} />}
        <PrefLinkRow icon="github" label="Maintainer" detail={Kittycord.maintainer.name} onClick={() => VencordNative.native.openExternal(Kittycord.maintainer.url)} />
        <div className="kc-pref-row kc-pref-block">
            <details className="kc-pref-credits"><summary>Credits and license</summary>
                <ul>{kittencordCredits.map(credit => <li key={credit.name}><Link href={credit.url}>{credit.name}</Link><span>{credit.contribution}</span></li>)}</ul>
                <Paragraph>GPL-3.0-or-later. Original contributor attribution is preserved. Full third-party notices remain in the source distribution. Recorded TestCord foundation: {Kittycord.upstreamCommit}.</Paragraph>
            </details>
        </div>
    </PrefGroup>;
}
