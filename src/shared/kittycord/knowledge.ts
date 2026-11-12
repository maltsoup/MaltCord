/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const featureKnowledge = [
    { id: "security", title: "MaltCord Security Engine", keywords: "scan malware permissions quarantine security فحص صلاحيات امان حجر", path: "Settings → Privacy & Security → Plugin security", detail: "Desktop AST source indicators, integrity and configurable periodic installed-package scans. High-risk source is blocked; false positives require source review or repair. Passed Scan is not proof of safety. General DOM, network and native privileges remain unavailable to external packages." },
    { id: "updates", title: "MaltCord Updates", keywords: "update changelog restart version اصدار تحديث ريستارت تغييرات", path: "Settings → About & System → Updates", detail: "Configured Windows channels verify signed release notes and installer bytes, then ask native confirmation before closing Discord and restarting. URL and pinned keys are not configured in this development build. Browser extensions use browser distribution rules." },
    { id: "voice", title: "KittyVoiceLab", keywords: "voice change microphone pitch robot صوت تغيير مايك روبوت", path: "Settings → Plugins → Installed → KittyVoiceLab", detail: "Browser getUserMedia voice effects with robot, deep, chipmunk and echo presets. Reuses TestCord DSP. Reconnect voice after enabling. Native voice capture, unattended joining and AFK automation are unsupported." },
    { id: "plugins", title: "Plugin Manager", keywords: "plugins enable disable addons اضافات بلوقن تفعيل تعطيل", path: "Settings → Plugins → Installed", detail: "Search and configure the packaged TestCord-compatible plugins. Built-in patch plugins can require restart." },
    { id: "packages", title: "Local plugins", keywords: "link json timestamp timezone local custom own settings functional focus timer كوستم محلي خاصة مؤقت", path: "Settings → Plugins → Local", detail: "Import a reviewed desktop runtime JSON package, install disabled, enable explicitly and open its local utility settings/actions. Browser external JavaScript installation is unavailable." },
    { id: "doctor", title: "Kitty Doctor", keywords: "health errors crashes conflicts diagnostics repair profiler doctor دكتور اخطاء تعطل اصلاح", path: "Settings → Kitty Doctor → Doctor", detail: "Unified TestCord diagnostics, impact, startup timing, module finder and local package integrity/recovery. Nothing is uploaded automatically." },
    { id: "marketplace", title: "MaltCord Market", keywords: "marketplace store versions exclusives متجر حصرية نسخة اصدار", path: "Settings → MaltCord Market", detail: "Browse visual customization packages and manage them in Installed. Functional utilities live separately in Plugins → Catalog. Executable visual content uses the same security review." },
    { id: "performance", title: "Performance", keywords: "lag cpu memory speed performance بطء لاق اداء", path: "Settings → Performance", detail: "Controls profiler sampling. Super Performance reduces measurement overhead; whole-client speed improvements have not been established. Discord visuals remain unchanged by default." },
    { id: "profiles", title: "Profiles & rules", keywords: "profiles account server rules settings حساب سيرفر قواعد اعدادات", path: "Settings → Profiles & Rules", detail: "Account-keyed overrides for reviewed live settings. General plugin enablement and patch settings remain global or require restart." },
    { id: "studio", title: "Plugin Studio", keywords: "studio code create develop javascript typescript plugin اصنع تطوير كود بلوقن", path: "Settings → Plugins → Studio", detail: "Enable developer tools, open Plugin Studio and use Install & run for native JS, TS, JSX or TSX. Source patches need a client reload; native.ts helpers use the source build." },
    { id: "discovery", title: "Smart Discovery", keywords: "discovery recommend find search بحث اقتراح وين مكان", path: "Settings → Plugins → Discover", detail: "Local metadata search recommends actual catalog and curated packaged plugins without automatic installation." }
] as const;
export type FeatureId = typeof featureKnowledge[number]["id"];
export function validFeatureId(value: unknown): value is FeatureId { return typeof value === "string" && featureKnowledge.some(feature => feature.id === value); }
export function findFeatures(query: string) {
    if (query.length > 4000) throw new Error("Feature questions are limited to 4000 characters.");
    const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(word => word.length > 1).slice(0, 40);
    return featureKnowledge.map(feature => ({ ...feature, score: words.filter(word => `${feature.title} ${feature.keywords} ${feature.detail}`.toLowerCase().includes(word)).length }))
        .filter(feature => feature.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}
export function featurePrompt(question: string) {
    if (!question.trim()) throw new Error("Enter a feature question first.");
    const selected = findFeatures(question);
    return `Answer this MaltCord feature-location question in the user's language using only this versioned public index. Explain the exact settings path. Say when a feature is partial or unavailable; do not invent plugins, capabilities or installation. No Discord account data was provided.\nIndex: ${JSON.stringify(selected.length ? selected : featureKnowledge)}\nQuestion: ${question}`;
}
