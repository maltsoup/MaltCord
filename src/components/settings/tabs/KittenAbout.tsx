/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { DiscordIcon, GithubIcon, InfoIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { SettingsTab } from "@components/settings/tabs/BaseTab";
import { Kittycord } from "@shared/kittycord";
import { Devs } from "@utils/constants";
import { fetchUserProfile } from "@utils/discord";
import { React, useEffect, UserStore, useStateFromStores } from "@webpack/common";

import { KittyToolHeader } from "./KittyToolLayout";

export default function KittenAbout() {
    const creatorId=String(Devs.Kittencord.id);
    const creator=useStateFromStores([UserStore],()=>UserStore.getUser(creatorId));
    useEffect(()=>{ if(!creator)void fetchUserProfile(creatorId).catch(()=>undefined); },[creatorId,creator]);
    return <SettingsTab><div className="kc-tool-page"><KittyToolHeader Icon={InfoIcon} title="About MaltCord" description={`Version ${VERSION}`} />
        <div className="kc-creator-grid"><article className="kc-tools-card kc-account-identity">{creator&&<img src={creator.getAvatarURL(undefined,128,true)} alt="" referrerPolicy="no-referrer"/>}<div><Heading><DiscordIcon width={18} height={18}/> Creator</Heading><Link href={`https://discord.com/users/${creatorId}`} target="_blank" rel="noreferrer noopener">{creator?.globalName||creator?.username||"0x.kitty"}</Link><small>{creatorId}</small></div></article><article className="kc-tools-card kc-account-identity"><img src="https://github.com/xtufa7.png?size=128" alt="" loading="lazy" referrerPolicy="no-referrer" onError={event=>{ event.currentTarget.hidden=true; }}/><div><Heading><GithubIcon width={18} height={18}/> GitHub</Heading><Link href={Kittycord.maintainer.url} target="_blank" rel="noreferrer noopener">xtufa7</Link><small>Made and maintained by xtufa7</small></div></article></div>

    </div></SettingsTab>;
}
