/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cloudBadges } from "@api/KittycordCloud";
import { KittycordCloudNotifications } from "@api/KittycordCloudNotifications";
import { Button } from "@components/Button";
import { ChevronSmallDownIcon, ChevronSmallUpIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { reorderOwnerBadges } from "@shared/kittycord/badges";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import { React, UserStore, useState } from "@webpack/common";

export function openOwnerBadgeLayout(userId: string, badges: readonly { id: string; description?: string; iconSrc?: string; }[]) {
    if (IS_WEB || UserStore.getCurrentUser()?.id !== userId) return;
    function Layout({ onClose, ...props }: { onClose(): void; transitionState: number; }) {
        const [display,setDisplay]=useState(()=>({ ...cloudBadges.display(userId),nitro:"default" as const,displayYear:null }));
        const [items,setItems]=useState(()=>reorderOwnerBadges(badges,display.order.map(id=>`kittencord_cloud_${id}`)));
        const [saving,setSaving]=useState(false),[error,setError]=useState("");
        const [dragged,setDragged]=useState<string | null>(null);
        const owner=badges.some(badge=>badge.id==="kittencord_cloud_opal");
        function move(index:number,direction:number){ const next=[...items],target=index+direction;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];setItems(next); }
        return <ModalRoot {...props} className="vc-kitten-layout-modal"><ModalHeader className="vc-kitten-layout-header"><strong>Badge appearance</strong></ModalHeader><ModalContent className="vc-kitten-layout-content">
            <Paragraph>Drag to arrange your badges, or use the arrow buttons. Changes sync with your connected account.</Paragraph>
            <div className="vc-kitten-cloud-badges vc-kitten-layout-preview" aria-label="Badge placement preview">{items.filter(item=>!display.hidden.includes(item.id.replace("kittencord_cloud_",""))).map(item=><img key={item.id} src={item.iconSrc} width={22} height={22} alt={item.description} referrerPolicy="no-referrer" />)}</div>
            <div className="vc-kitten-layout">{items.map((badge,index)=>{ const id=badge.id.replace("kittencord_cloud_","");return <div className="vc-kitten-layout-row" key={id} draggable={!saving} data-dragging={dragged === badge.id || undefined} onDragStart={event=>{ setDragged(badge.id);event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",badge.id); }} onDragEnd={()=>setDragged(null)} onDragOver={event=>{ if(dragged && !saving)event.preventDefault(); }} onDrop={event=>{ event.preventDefault();if(saving)return;const source=items.findIndex(item=>item.id===event.dataTransfer.getData("text/plain"));if(source<0||source===index)return;const next=[...items], [moved]=next.splice(source,1);next.splice(index,0,moved);setItems(next);setDragged(null); }}><img src={badge.iconSrc} width={24} height={24} alt="" referrerPolicy="no-referrer"/><span id={`badge-visibility-${id}`}>{badge.description}</span><Switch aria-labelledby={`badge-visibility-${id}`} checked={!display.hidden.includes(id)} onChange={visible=>setDisplay({ ...display,hidden:visible?display.hidden.filter(value=>value!==id):[...display.hidden,id] })}/><Button size="small" variant="secondary" aria-label={`Move ${badge.description} earlier`} disabled={saving||index===0} onClick={()=>move(index,-1)}><ChevronSmallUpIcon width={16} height={16}/></Button><Button size="small" variant="secondary" aria-label={`Move ${badge.description} later`} disabled={saving||index===items.length-1} onClick={()=>move(index,1)}><ChevronSmallDownIcon width={16} height={16}/></Button></div>; })}</div>
            <Button size="small" variant="secondary" disabled={saving} onClick={()=>{ setItems(reorderOwnerBadges(badges,[]));setDisplay({ ...display,order:[],hidden:[] }); }}>Reset to default</Button>
            {error&&<Paragraph role="alert">{error}</Paragraph>}
        </ModalContent><ModalFooter className="vc-kitten-layout-footer"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={()=>{ setSaving(true);void KittycordCloudNotifications.command("badge-preferences",{ ...display,order:items.map(item=>item.id.replace("kittencord_cloud_","")) }).then(()=>cloudBadges.load(userId,true)).then(onClose,error=>{ setSaving(false);setError(error instanceof Error?error.message:"Preferences were not saved."); }); }}>Save appearance</Button></ModalFooter></ModalRoot>;
    }
    openModal(props=><Layout {...props}/>);
}
