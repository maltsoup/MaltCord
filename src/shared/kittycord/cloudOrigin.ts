/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function cloudOrigin(configuration:{ enabled:boolean;origin:string; }){ try{ const url=new URL(configuration.origin);return configuration.enabled&&url.protocol==="https:"&&url.origin===configuration.origin?url.origin:""; }catch{ return ""; } }
