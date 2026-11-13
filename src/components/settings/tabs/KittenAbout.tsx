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

const GITHUB_URL = "https://github.com/maltsoup/MaltCord";

export default function KittenAbout() {
    const creatorId = String(Devs.Maltsoup.id);
    const creator = useStateFromStores([UserStore], () => UserStore.getUser(creatorId));
    useEffect(() => { if (!creator) void fetchUserProfile(creatorId).catch(() => undefined); }, [creatorId, creator]);
    return <SettingsTab><div className="kc-tool-page"><KittyToolHeader Icon={InfoIcon} title="About MaltCord" description={`Version ${VERSION}`} />
        <div className="kc-creator-grid">
            <article className="kc-tools-card kc-account-identity">
                {creator && <img src={creator.getAvatarURL(undefined, 128, true)} alt="" referrerPolicy="no-referrer" />}
                <div>
                    <Heading><DiscordIcon width={18} height={18} /> Creator</Heading>
                    <Link href={`https://discord.com/users/${creatorId}`} target="_blank" rel="noreferrer noopener">{creator?.globalName || creator?.username || Devs.Maltsoup.name}</Link>
                    <small>{creatorId}</small>
                </div>
            </article>
            <article className="kc-tools-card kc-account-identity">
                <img src="https://github.com/maltsoup.png?size=128" alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />
                <div>
                    <Heading><GithubIcon width={18} height={18} /> GitHub</Heading>
                    <Link href={GITHUB_URL} target="_blank" rel="noreferrer noopener">maltsoup/MaltCord</Link>
                    <small>Source code, downloads and bug reports</small>
                </div>
            </article>
            <article className="kc-tools-card kc-account-identity">
                <div>
                    <Heading><DiscordIcon width={18} height={18} /> Discord server</Heading>
                    <Link href={Kittycord.communityUrl} target="_blank" rel="noreferrer noopener">Join the MaltCord server</Link>
                    <small>{Kittycord.communityUrl.replace("https://", "")}</small>
                </div>
            </article>
        </div>
        <small>MaltCord is a fork of <Link href={Kittycord.maintainer.url} target="_blank" rel="noreferrer noopener">KittenCord by xtufa7</Link>, built on TestCord, Equicord and Vencord.</small>
    </div></SettingsTab>;
}
