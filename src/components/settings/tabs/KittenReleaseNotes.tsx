/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cloudReleaseHistory } from "@api/KittycordCloudReleases";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { KittycordIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import config from "@shared/kittycord/cloudConfig.json";
import { cloudOrigin } from "@shared/kittycord/cloudOrigin";
import { catalogImageUrl } from "@shared/kittycord/imageSources";
import { React, useEffect, useState } from "@webpack/common";

import { KittenTabs } from "./KittenUI";

export function KittenReleaseNotes(){
    const [selected,setSelected]=useState("latest"),[history,setHistory]=useState<Awaited<ReturnType<typeof cloudReleaseHistory>>>({ items:[],next:null });
    const [failure,setFailure]=useState(""),[busy,setBusy]=useState(false);
    const origin=cloudOrigin(config),panelId=React.useId();
    useEffect(()=>{ let active=true;if(origin)void cloudReleaseHistory().then(value=>{ if(active)setHistory(value); },()=>{ if(active)setFailure("Published releases could not be loaded."); });return()=>{ active=false; }; },[origin]);
    const published=[...new Map(history.items.filter(item=>item.channel!=="development").map(item=>[`${item.channel}:${item.version}`,item])).values()].sort((a,b)=>b.issuedAt-a.issuedAt);
    const entries=selected==="latest"?published.slice(0,1):published.slice(1);
    return <section className="kc-premium-settings kc-tool-page kc-release-notes"><div className="kc-tool-header"><span className="kc-tool-icon"><KittycordIcon width={24} height={24}/></span><div><Heading>What’s new in MaltCord</Heading><Paragraph>Published releases.</Paragraph></div></div>
        {failure&&<Paragraph role="status">{failure}</Paragraph>}
        {published.length>1&&<KittenTabs label="Release notes" panelId={panelId} selected={selected} onSelect={setSelected} tabs={[{ id:"latest",label:"Latest release" },{ id:"history",label:"Previous releases" }]}/>}
        {!published.length&&!failure&&<Paragraph>No published releases available.</Paragraph>}
        <div id={panelId}>{entries.map(entry=><article className="kc-release kc-tools-card" key={entry.id}><div className="kc-release-head"><Heading>MaltCord {entry.version}{entry.important?" · Important":""}</Heading><span>{entry.channel}</span><time dateTime={new Date(entry.issuedAt).toISOString()}>{new Date(entry.issuedAt).toLocaleDateString()}</time></div><pre className="kc-cloud-message">{entry.notes}</pre><div className="kc-cloud-screenshots">{entry.screenshots.map(ref=><img key={ref} src={catalogImageUrl(ref,origin)} alt="Release screenshot" loading="lazy" referrerPolicy="no-referrer"/>)}</div></article>)}</div>
        {history.next&&<Button disabled={busy} onClick={()=>{ setBusy(true);void cloudReleaseHistory(history.next??undefined).then(value=>setHistory(previous=>({ items:[...previous.items,...value.items],next:value.next })),()=>setFailure("Older releases could not be loaded.")).finally(()=>setBusy(false)); }}>Older releases</Button>}
    </section>;
}
