/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { imageReference } from "./imageSources";

export const CLOUD_NOTIFICATION_CATEGORIES=["release","changelog","plugin","plugin-update","security","announcement","maintenance"] as const;
export interface CloudNotification { id:number;category:typeof CLOUD_NOTIFICATION_CATEGORIES[number];title:string;message:string;url:string;image?:string;publish_at:number;read:boolean; }
export interface CloudFeed { items:CloudNotification[];next:number|null;authenticated:boolean;categories:string[];unreadCount?:number; }
export interface CloudClientResult { configured?:boolean;authenticated?:boolean;user?:{ id:string;username:string; }|null;pending?:boolean;code?:string;verificationUri?:string;expiresAt?:number;error?:string;feed?:CloudFeed;saved?:boolean; }
export type CloudClientCommand="context"|"session"|"start"|"poll"|"logout"|"feed"|"read"|"unread"|"delete"|"clear"|"preferences"|"badge-preferences";

export interface LocalNotificationState { read: number[]; unread: number[]; removed: number[]; readThrough: number; clearThrough: number; }
export function localNotificationState(value?: unknown): LocalNotificationState {
    const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const ids = (key: string) => Array.isArray(input[key]) ? [...new Set(input[key].filter((id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))].slice(-5000) : [];
    const cursor = (key: string) => typeof input[key] === "number" && Number.isSafeInteger(input[key]) && input[key] >= 0 ? input[key] : 0;
    return { read: ids("read"), unread: ids("unread"), removed: ids("removed"), readThrough: cursor("readThrough"), clearThrough: cursor("clearThrough") };
}
export function localNotificationFeed(feed: CloudFeed, state: LocalNotificationState): CloudFeed {
    const removed = new Set(state.removed), read = new Set(state.read), unread = new Set(state.unread);
    const items = feed.items.filter(item => item.id > state.clearThrough && !removed.has(item.id)).map(item => ({ ...item, read: unread.has(item.id) ? false : item.id <= state.readThrough || read.has(item.id) || item.read }));
    return { ...feed, items, unreadCount: items.filter(item => !item.read).length };
}

export function parseCloudFeed(value:unknown):CloudFeed{
    if(!value||typeof value!=="object"||!("items"in value)||!Array.isArray(value.items)||value.items.length>100||!("authenticated"in value)||typeof value.authenticated!=="boolean"||!("categories"in value)||!Array.isArray(value.categories)||value.categories.some(category=>!CLOUD_NOTIFICATION_CATEGORIES.includes(category))||!("next"in value)||value.next!==null&&(typeof value.next!=="number"||!Number.isSafeInteger(value.next)||value.next<1))throw new Error("Invalid notification feed.");
    const items=value.items.map((value:unknown)=>{ if(!value||typeof value!=="object")throw new Error("Invalid notification.");const item=value as Record<string,unknown>;
        if(typeof item.id!=="number"||!Number.isSafeInteger(item.id)||item.id<1||!CLOUD_NOTIFICATION_CATEGORIES.includes(item.category as typeof CLOUD_NOTIFICATION_CATEGORIES[number])||typeof item.title!=="string"||item.title.length>160||typeof item.message!=="string"||item.message.length>8000||typeof item.url!=="string"||item.url.length>2048||typeof item.publish_at!=="number"||!Number.isSafeInteger(item.publish_at)||typeof item.read!=="boolean")throw new Error("Invalid notification content.");
        if(item.url){ const destination=new URL(item.url);if(destination.protocol!=="https:"||destination.username||destination.password)throw new Error("Invalid notification link."); }
        return { id:item.id,category:item.category as CloudNotification["category"],title:item.title,message:item.message,url:item.url,image:item.image?imageReference(item.image):undefined,publish_at:item.publish_at,read:item.read }; });
    const count="unreadCount" in value?value.unreadCount:undefined;
    if(count!==undefined&&(typeof count!=="number"||!Number.isSafeInteger(count)||count<0))throw new Error("Invalid unread count.");
    return{ items,unreadCount:typeof count==="number"?count:undefined,next:value.next,authenticated:value.authenticated,categories:value.categories as string[] };
}
