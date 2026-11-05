/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DATA_DIR } from "@main/utils/constants";
import { IpcEvents } from "@shared/IpcEvents";
import { Kittycord } from "@shared/kittycord";
import config from "@shared/kittycord/cloudConfig.json";
import { type CloudClientCommand, type CloudClientResult, parseCloudFeed } from "@shared/kittycord/cloudNotifications";
import { cloudOrigin } from "@shared/kittycord/cloudOrigin";
import { ipcMain, safeStorage, shell } from "electron";

const configured=!!cloudOrigin(config);
const legacyFilename=join(DATA_DIR,"cloud-session.json");
let accountId="", verified=false;
const sessionFilename=()=>join(DATA_DIR,`cloud-session-${accountId}.json`);
let accessToken="",deviceToken="",loaded=false;
async function load(){ if(loaded)return;loaded=true;if(!accountId)return;try{ let filename=sessionFilename();try{ await lstat(filename); }catch{ filename=legacyFilename; } const info=await lstat(filename);if(info.isSymbolicLink()||!info.isFile()||info.size>8192||!safeStorage.isEncryptionAvailable())return;const stored:unknown=JSON.parse(await readFile(filename,"utf8"));if(stored&&typeof stored==="object"&&"encrypted"in stored&&typeof stored.encrypted==="string"){ const token=safeStorage.decryptString(Buffer.from(stored.encrypted,"base64"));if(/^[a-f0-9]{64}$/.test(token))accessToken=token; } }catch{ accessToken=""; } }
async function persist(){ if(!accountId)return;const filename=sessionFilename(); await mkdir(DATA_DIR,{ recursive:true });if(!accessToken){ await rm(filename,{ force:true });return; }if(!safeStorage.isEncryptionAvailable())return;const temporary=filename+"."+randomUUID()+".tmp";try{ await writeFile(temporary,JSON.stringify({ encrypted:safeStorage.encryptString(accessToken).toString("base64") }),{ mode:0o600,flag:"wx" });await rename(temporary,filename); }finally{ await rm(temporary,{ force:true }); } }
export async function cloudRequest(path:string,input?:unknown,attachment?:Uint8Array,reportToken?:string){
    if(!configured)throw new Error("This build has no configured Cloud service.");await load();
    const requestAccount=accountId,requestToken=accessToken;
    const response=await fetch(config.origin+path,{ method:input===undefined&&!attachment?"GET":"POST",headers:{ ...(accessToken&&(verified||path==="/api/v1/auth/device/session")?{ Authorization:`Bearer ${accessToken}` }:{ }),...(attachment?{ "Content-Type":"application/octet-stream","Content-Length":String(attachment.length),"X-Artifact-Consent":"reviewed",...(/^[a-f0-9]{64}$/.test(reportToken??"")?{ "X-Report-Token":reportToken??"" }:{}) }:input===undefined?{}:{ "Content-Type":"application/json" }) },...(attachment?{ body:new Uint8Array(attachment) }:input===undefined?{}:{ body:JSON.stringify(input) }),credentials:"omit",redirect:"manual",signal:AbortSignal.timeout(20000) });
    if(!response.body)throw new Error("The Cloud service returned an empty response.");const reader=response.body.getReader(),decoder=new TextDecoder();let source="",size=0;
    try{ while(true){ const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1100000)throw new Error("The Cloud response exceeds its limit.");source+=decoder.decode(part.value,{ stream:true }); }source+=decoder.decode(); }finally{ await reader.cancel();reader.releaseLock(); }
    const value:unknown=JSON.parse(source);if(!response.ok){ if(response.status===401&&requestAccount===accountId&&requestToken===accessToken){ accessToken="";verified=false;await persist(); }let message="The Cloud request failed.";if(value&&typeof value==="object"&&"error"in value&&value.error&&typeof value.error==="object"&&"message"in value.error&&typeof value.error.message==="string")message=value.error.message;throw new Error(message); }
    if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("The Cloud service returned invalid data.");return value as Record<string,unknown>;
}
function session(value:Record<string,unknown>):CloudClientResult{ if(value.authenticated!==true)return{ configured:true,authenticated:false,user:null };const { user } = value;if(!user||typeof user!=="object"||!("id"in user)||typeof user.id!=="string"||!/^\d{17,20}$/.test(user.id)||!("username"in user)||typeof user.username!=="string"||user.username.length>100)throw new Error("Invalid connected identity.");return{ configured:true,authenticated:true,user:{ id:user.id,username:user.username } }; }
export async function cloudCommand(action:CloudClientCommand,envelope?:unknown):Promise<CloudClientResult>{
    if(action==="context"&&envelope&&typeof envelope==="object"&&"accountId"in envelope&&envelope.accountId===null){ accountId="";accessToken="";deviceToken="";loaded=false;verified=false;return{ configured }; }
    if(!envelope||typeof envelope!=="object"||!("accountId"in envelope)||typeof envelope.accountId!=="string"||!/^\d{17,20}$/.test(envelope.accountId))throw new Error("Sign in to Discord before connecting Cloud features.");
    if(envelope.accountId!==accountId){ accountId=envelope.accountId;accessToken="";deviceToken="";loaded=false;verified=false; }
    const input="payload"in envelope?envelope.payload:undefined;
    if(action==="context")return{ configured };
    if(!configured)return{ configured:false,error:"The Cloud service is not configured in this build." };
    await load();
    if(accessToken&&!verified){
        const connected=session(await cloudRequest("/api/v1/auth/device/session"));
        if(connected.user?.id!==accountId){ accessToken="";verified=false; }else{ verified=true;await persist(); }
    }
    if(action==="session")return verified?session(await cloudRequest("/api/v1/auth/device/session")):{ configured:true,authenticated:false,user:null };
    if(action==="start"){
        const result=await cloudRequest("/api/v1/auth/device/start",{ label:`KittenCord ${VERSION} desktop` });
        if(typeof result.deviceToken!=="string"||!/^[a-f0-9]{64}$/.test(result.deviceToken)||typeof result.code!=="string"||!/^[A-F0-9]{6}-[A-F0-9]{6}$/.test(result.code)||typeof result.verificationUri!=="string"||typeof result.expiresAt!=="number")throw new Error("Invalid client authorization response.");
        const destination=new URL(result.verificationUri);if(destination.origin!==config.origin||destination.pathname!=="/"||destination.searchParams.get("connect")!==result.code.replace("-",""))throw new Error("The verification link does not match this service.");deviceToken=result.deviceToken;await shell.openExternal(destination.href);return{ configured:true,pending:true,code:result.code,verificationUri:destination.href,expiresAt:result.expiresAt };
    }
    if(action==="poll"){ if(!deviceToken)throw new Error("Start client sign in first.");const result=await cloudRequest("/api/v1/auth/device/poll",{ deviceToken });if(result.pending===true)return{ pending:true };if(typeof result.accessToken!=="string"||!/^[a-f0-9]{64}$/.test(result.accessToken))throw new Error("Invalid client authorization token.");accessToken=result.accessToken;deviceToken="";const connected=session(await cloudRequest("/api/v1/auth/device/session"));if(connected.user?.id!==accountId){ accessToken="";verified=false;throw new Error("Approve Cloud connection using the account currently signed in to Discord."); }verified=true;await persist();return connected; }
    if(action==="logout"){ try{ await cloudRequest("/api/v1/auth/device/logout",{}); }finally{ accessToken="";deviceToken="";verified=false;await persist(); }return{ authenticated:false,user:null }; }
    if(action==="badge-preferences"){ await cloudRequest("/api/v1/badges/preferences",input);return{ saved:true }; }
    if(action==="feed"){ let before="";if(input&&typeof input==="object"&&"before"in input&&typeof input.before==="number"&&Number.isSafeInteger(input.before)&&input.before>0)before=`&before=${input.before}`;return{ feed:parseCloudFeed(await cloudRequest(`/api/v1/notifications?limit=50&channel=${Kittycord.channel}&version=${encodeURIComponent(VERSION)}${before}`)) }; }
    if(action==="read"||action==="unread"||action==="delete"||action==="clear"||action==="preferences"){ await cloudRequest(`/api/v1/notifications/${action}?channel=${Kittycord.channel}&version=${encodeURIComponent(VERSION)}`,input);return{ saved:true }; }
    throw new Error("Unsupported Cloud action.");
}
let commandQueue:Promise<unknown>=Promise.resolve();
ipcMain.handle(IpcEvents.KITTYCORD_CLOUD,async(event,action:CloudClientCommand,input:unknown)=>{
    if(event.senderFrame!==event.sender.mainFrame||!["https://discord.com","https://ptb.discord.com","https://canary.discord.com"].includes(new URL(event.sender.getURL()).origin))return{ error:"Open Cloud features from KittenCord settings." };
    try{ const operation=commandQueue.then(()=>cloudCommand(action,input));commandQueue=operation.catch(()=>undefined);return await operation; }catch(error){ return{ error:error instanceof Error?error.message:"The Cloud request failed." }; }
});
