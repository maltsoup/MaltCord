/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordPackages } from "@api/KittycordPackages";
import { NativeStudio } from "@api/NativeStudio";
import { PluginHealth } from "@api/PluginHealth";
import { getPluginApiDependencies, getPluginRuntimeState, subscribePluginRegistry } from "@api/PluginManager";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { packageContentType } from "@shared/kittycord/presentation";
import { TextInput, useEffect, UserStore, useState } from "@webpack/common";

import gitRemote from "~git-remote";
import plugins, { PluginMeta } from "~plugins";

import { PublisherIdentity } from "../KittenUI";

export function InstalledAccess() {
    const [search, setSearch] = useState(""), [running, setRunning] = useState(false), [limit, setLimit] = useState(40);
    const [, update] = useState(0);
    useEffect(() => {
        const refresh = () => update(value => value + 1);
        const listeners = [PluginHealth.subscribe(refresh), subscribePluginRegistry(refresh), NativeStudio.subscribe(refresh), KittycordPackages.subscribe(refresh)];
        return () => { listeners.forEach(stop => stop()); };
    }, []);
    const query = search.toLowerCase();
    const native = Object.values(plugins).filter(plugin => !plugin.required && !plugin.hidden && !plugin.name.endsWith("API") && (!running || getPluginRuntimeState(plugin.name)?.running) && `${plugin.name} ${Array.isArray(plugin.authors) ? plugin.authors.map(author => author?.name ?? "").join(" ") : ""}`.toLowerCase().includes(query));
    const local = KittycordPackages.snapshot().entries.filter(item => packageContentType(item.manifest) === "plugin" && (!running || item.runtime?.state === "running") && `${item.manifest.name} ${item.manifest.author}`.toLowerCase().includes(query));
    return <section className="kc-tool-page"><Heading>Installed plugin access</Heading>
        <Paragraph>Native plugins use the trusted client runtime. Listed API integrations and package permissions are declarations, not individually enforced access switches.</Paragraph>
        <TextInput aria-label="Search installed plugin access" placeholder="Search plugin or author" value={search} onChange={value => { setSearch(value); setLimit(40); }} />
        <div className="kc-package-footer"><span id="kc-access-running">Running only</span><Switch aria-labelledby="kc-access-running" checked={running} onChange={value => { setRunning(value); setLimit(40); }} /></div>
        <Paragraph>{native.length + local.length} matching plugins</Paragraph>
        {native.slice(0, limit).map(plugin => {
            const meta = PluginMeta[plugin.name], path = meta?.folderName ?? "";
            const state = getPluginRuntimeState(plugin.name);
            const origin = path.startsWith("src/userplugins/.studio/") ? "KittenCord Studio" : path.startsWith("src/testcordplugins/") ? "TestCord" : path.startsWith("src/equicordplugins/") ? "Equicord" : path.startsWith("src/plugins/") ? "Vencord" : "Local";
            const declared = [...new Set([...(plugin.dependencies ?? []), ...getPluginApiDependencies(plugin)])];
            return <article className="kc-tools-card" key={plugin.name}><div className="kc-package-footer"><Heading>{plugin.name}</Heading><span>{state?.quarantined ? "Quarantined" : state?.failed ? "Needs attention" : state?.paused ? "Paused" : state?.running ? "Running" : state?.selected ? "Selected" : "Disabled"}</span></div>
                {(Array.isArray(plugin.authors) && plugin.authors.length ? plugin.authors : [undefined]).map((author, index) => <PublisherIdentity key={index} author={author?.name ?? "Unlisted contributor"} github={author?.github} avatar={author?.id ? UserStore.getUser(String(author.id))?.getAvatarURL() : undefined} source={index ? "" : origin} />)}
                <Paragraph>{declared.length ? `Declared integrations: ${declared.join(", ")}.` : "No API integrations declared."} Native runtime access is not restricted by this list.</Paragraph>
                {gitRemote && path && !meta?.userPlugin && <Link href={`https://github.com/${gitRemote}/tree/HEAD/${path}`} target="_blank" rel="noreferrer noopener">Source code ↗</Link>}
            </article>;
        })}
        {local.slice(0, Math.max(0, limit - native.length)).map(item => <article className="kc-tools-card" key={item.manifest.id}><div className="kc-package-footer"><Heading>{item.manifest.name} · v{item.manifest.version}</Heading><span>{item.security?.status === "Blocked" ? "Quarantined by policy" : item.runtime?.state ?? "Inactive"}</span></div><PublisherIdentity author={item.manifest.author} github={item.manifest.presentation?.github?.username} source="Local package" /><Paragraph>Declared permissions: {item.manifest.permissions.join(", ") || "None"}.</Paragraph>{item.manifest.presentation?.github?.repository && <Link href={item.manifest.presentation.github.repository}>Source code ↗</Link>}</article>)}
        {native.length + local.length > limit && <Button variant="secondary" onClick={() => setLimit(value => value + 40)}>Show more plugins</Button>}
    </section>;
}
