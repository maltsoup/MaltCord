/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NativeStudio } from "@api/NativeStudio";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { contentLabels } from "@shared/kittycord/presentation";
import { saveFile } from "@utils/web";
import { Alerts, React, useEffect, useState } from "@webpack/common";

import { CompactNotice } from "../KittenUI";

export function NativeVisuals() {
    const [statuses,setStatuses]=useState(NativeStudio.snapshot),[busy,setBusy]=useState(false),[error,setError]=useState("");
    useEffect(()=>NativeStudio.subscribe(()=>setStatuses(NativeStudio.snapshot())),[]);
    async function action(id:string,operation:string) { setBusy(true);setError("");try{ await NativeStudio.command({ id,operation }); }catch(error){ setError(String(error)); }finally{ setBusy(false); } }
    return <div className="kc-tool-page">{error&&<CompactNotice tone="critical">{error}</CompactNotice>}{statuses.filter(status=>status.contentType&&status.contentType!=="plugin").map(status=><article className="kc-tools-card kc-gallery-card" key={status.id}><Heading>{status.name}</Heading><Paragraph>{status.contentType?contentLabels[status.contentType]:"Customization"} · v{status.version} · {status.running?"Enabled":status.reloadRequired?"Reload required":"Disabled"}</Paragraph>{status.error&&<CompactNotice tone="critical">{status.error}</CompactNotice>}<div className="kc-tools-actions"><Button disabled={busy||IS_WEB||!status.registered} onClick={()=>void action(status.id,status.running?"disable":"enable")}>{status.running?"Disable":"Enable"}</Button><Button variant="secondary" disabled={IS_WEB} onClick={()=>{ const project=NativeStudio.project(status.id);void saveFile(new File([JSON.stringify(project,null,4)],`${status.id}.native-project.json`,{ type:"application/json" })); }}>Export source</Button><Button variant="dangerSecondary" disabled={busy||IS_WEB} onClick={()=>Alerts.show({ title:`Remove ${status.name}?`,body:"Disables this customization and removes its approval. Applied source patches require a Discord reload.",confirmText:"Remove",cancelText:"Cancel",onConfirm:()=>void action(status.id,"unregister") })}>Remove</Button>{status.reloadRequired&&<Button variant="secondary" onClick={()=>Alerts.show({ title:"Reload Discord?",body:"Reload to apply saved source changes. Calls can disconnect.",confirmText:"Reload",cancelText:"Cancel",onConfirm:()=>location.reload() })}>Reload Discord</Button>}</div></article>)}</div>;
}
