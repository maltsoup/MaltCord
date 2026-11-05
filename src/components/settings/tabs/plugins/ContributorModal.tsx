/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ContributorModal.css";

import { KittycordCloudCatalog } from "@api/KittycordCloudCatalog";
import { verifiedNativeSource, verifiedSourceLabel } from "@api/KittycordPackageSource";
import { useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { PublisherIdentity } from "@components/settings/tabs/KittenUI";
import { type CloudCatalogItem } from "@shared/kittycord/cloudCatalog";
import { EquicordDevsById, TestcordDevsById, VencordDevsById } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { fetchUserProfile } from "@utils/discord";
import { pluralize } from "@utils/misc";
import { RenderModalProps, User } from "@vencord/discord-types";
import { Modal, openModal, showToast, useEffect, useMemo, UserProfileStore, useState, useStateFromStores } from "@webpack/common";

import Plugins, { PluginMeta } from "~plugins";

import { PluginCard } from "./PluginCard";
import { GithubButton, WebsiteButton } from "./PluginModalButtons";

const cl = classNameFactory("vc-author-modal-");

export function openContributorModal(user: User) {
    openModal(modalProps => <ContributorModal user={user} modalProps={modalProps} />);
}

function ContributorModal({ user, modalProps }: { user: User; modalProps: RenderModalProps; }) {
    useSettings();
    const [published,setPublished]=useState<CloudCatalogItem[]>([]),[next,setNext]=useState<number|null>(null),[failure,setFailure]=useState(""),[loading,setLoading]=useState(false),[verifiedIds,setVerifiedIds]=useState<string[]>([]);
    useEffect(()=>{ let active=true;setPublished([]);setNext(null);setFailure("");if(KittycordCloudCatalog.enabled){ setLoading(true);void KittycordCloudCatalog.list(false,"",undefined,user.id).then(value=>{ if(active){ setPublished(value.items);setNext(value.next); } },()=>{ if(active)setFailure("Published projects could not be loaded."); }).finally(()=>{ if(active)setLoading(false); }); }return()=>{ active=false; }; },[user.id]);
    useEffect(()=>{ let active=true;void Promise.all(published.map(item=>verifiedNativeSource(item.id).then(value=>value?.id,()=>undefined))).then(ids=>{ if(active)setVerifiedIds(ids.filter((id):id is string=>!!id)); });return()=>{ active=false; }; },[published]);

    const profile = useStateFromStores([UserProfileStore], () => UserProfileStore.getUserProfile(user.id));

    useEffect(() => {
        if (!profile && !user.bot && user.id)
            void fetchUserProfile(user.id).catch(() => { });
    }, [user.id, user.bot, profile]);

    const dev = VencordDevsById[user.id] || EquicordDevsById[user.id] || TestcordDevsById[user.id];
    const githubName = profile?.connectedAccounts?.find(a => a.type === "github")?.name || dev?.github;
    const website = profile?.connectedAccounts?.find(a => a.type === "domain")?.name;

    const plugins = useMemo(() => {
        const allPlugins = Object.values(Plugins);
        const pluginsByAuthor = dev
            ? allPlugins.filter(p => p.authors?.includes(dev))
            : allPlugins.filter(p =>
                PluginMeta[p.name]?.userPlugin && p.authors?.some(a => a?.id.toString() === user.id)
            );

        return pluginsByAuthor
            .filter(p => !p.name.endsWith("API") && !verifiedIds.includes(p.id ?? ""))
            .sort((a, b) => Number(a.required ?? false) - Number(b.required ?? false));
    }, [user.id, verifiedIds]);

    const ContributedHyperLink = <Link href="https://github.com/TestcordDev/TestCord">contributed</Link>;

    const hasLinks = website || githubName;

    return (
        <Modal
            {...modalProps}
            title={
                <div className={cl("header")}>
                    <img
                        className={cl("avatar")}
                        src={user.getAvatarURL(void 0, 512, true)}
                        alt=""
                    />
                    <Heading tag="h2" className={cl("name")}>{user.username}</Heading>
                </div>
            }
            subtitle={
                (plugins.length+published.length)
                    ? (
                        <Paragraph>
                            {user.username} has {ContributedHyperLink} to {pluralize(plugins.length+published.length, "project")}!
                        </Paragraph>
                    )
                    : (
                        <Paragraph>
                            No installed contributions or published projects were found for this account.
                        </Paragraph>
                    )
            }
            actionBarInput={
                hasLinks && (
                    <div
                        className={cl("links")}
                        style={{ width: "100%", justifyContent: "flex-end" }}
                    >
                        {website && (
                            <WebsiteButton
                                text={website}
                                href={`https://${website}`}
                            />
                        )}
                        {githubName && (
                            <GithubButton
                                text={githubName}
                                href={`https://github.com/${githubName}`}
                            />
                        )}
                    </div>
                )
            }
        >
            <div className={cl("root")}>
                {loading&&<Paragraph role="status">Loading published projects…</Paragraph>}{failure&&<Paragraph role="status">{failure}</Paragraph>}
                {published.map(item=><article key={item.id} className="kc-tools-card"><Heading>{item.metadata.name}</Heading><Paragraph>{item.metadata.description}</Paragraph><PublisherIdentity author={item.publisher.username} avatar={item.publisher.avatar??undefined} source={verifiedSourceLabel(item)}/><Paragraph>v{item.versions[0]?.version} · Published</Paragraph>{item.metadata.repository&&<Link href={item.metadata.repository}>Repository</Link>}{item.metadata.github&&<Link href={`https://github.com/${item.metadata.github}`}>Publisher supplied GitHub</Link>}</article>)}
                {next&&<Button disabled={loading} onClick={()=>{ setLoading(true);void KittycordCloudCatalog.list(false,"",next,user.id).then(value=>{ setPublished(previous=>[...new Map([...previous,...value.items].map(item=>[item.id,item])).values()]);setNext(value.next); },()=>setFailure("More projects could not be loaded.")).finally(()=>setLoading(false)); }}>More published projects</Button>}
                {!!plugins.length && (
                    <div className={cl("plugins")}>
                        {plugins.map(p =>
                            <PluginCard
                                key={p.name}
                                plugin={p}
                                disabled={p.required ?? false}
                                onRestartNeeded={() => showToast({ text: "Restart to apply changes!" })}
                            />
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
}
