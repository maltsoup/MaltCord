/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordCloudCatalog } from "@api/KittycordCloudCatalog";
import { KittycordPackages } from "@api/KittycordPackages";
import { NativeStudio } from "@api/NativeStudio";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import { openSettingsTabModal, SettingsTab } from "@components/settings/tabs/BaseTab";
import { CLOUD_ORIGINS, type CloudCatalogItem, MARKET_CATEGORIES } from "@shared/kittycord/cloudCatalog";
import { catalogImageUrl } from "@shared/kittycord/imageSources";
import { isNativeProject, type NativeCompilation, type NativeDiagnostic } from "@shared/kittycord/nativeStudio";
import { compareVersions } from "@shared/kittycord/versions";
import { saveFile } from "@utils/web";
import { React, TextInput, useEffect, useRef, useState } from "@webpack/common";

import { CompactNotice, EmptyState } from "../KittenUI";
import { openExternalPackageReview } from "../kittycordPackages";
import { reviewNativeImport } from "../kittycordWorkshop/NativeImportReview";
import { KittyToolDetails } from "../KittyToolLayout";
import { SleepingCat } from "./SleepingCat";

function CloudDetails({ item }: { item: CloudCatalogItem; }) {
    const [installedVersion, setInstalledVersion] = useState<string>();
    useEffect(() => {
        const refresh = () => setInstalledVersion(NativeStudio.snapshot().find(status => status.id === item.id)?.version ?? KittycordPackages.snapshot().entries.find(entry => entry.manifest.id === item.id)?.manifest.version);
        refresh(); const native = NativeStudio.subscribe(refresh), local = KittycordPackages.subscribe(refresh);
        return () => { native(); local(); };
    }, [item.id]);
    const [detail,setDetail]=useState(item);
    const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
    const [selected, setSelected] = useState(item.versions[0]?.version);
    const version = detail.versions.find(version => version.version === selected);
    useEffect(()=>{ let active=true;void KittycordCloudCatalog.detail(item).then(value=>{ if(active)setDetail(value); },error=>{ if(active)setError(String(error)); });return()=>{ active=false; }; },[item]);
    async function install() {
        if (!version) return;
        setBusy(true); setError("");
        try {
            const bundle = await KittycordCloudCatalog.download(item, version);
            if (isNativeProject(bundle)) {
                reviewNativeImport(bundle, async project => {
                    const result = await VencordNative.nativeStudio.request<{ compilation?: NativeCompilation; diagnostics: NativeDiagnostic[]; }>("compile", project);
                    if (!result.compilation) throw new Error(result.diagnostics.map(diagnostic => diagnostic.message).join("\n"));
                    await NativeStudio.command({ id: item.id, digest: result.compilation.digest, operation: "register" });
                    setMessage(item.kind === "marketplace" ? "Installed in Market → Installed. Enable it there when ready. Source patches require a reload." : "Installed in Plugins. Enable it there when ready. Source patches require a reload.");
                }, { description: item.metadata.description, origin: `${CLOUD_ORIGINS[item.metadata.origin]} · Verified Discord publisher ${item.publisher.username} (${item.publisher_id})`, repository: item.metadata.repository });
            } else openExternalPackageReview(bundle);
        } catch (error) { setError(error instanceof Error ? error.message : "Installation failed."); }
        finally { setBusy(false); }
    }
    return <SettingsTab><div className="kc-tool-page"><Heading>{item.metadata.name}</Heading><Paragraph>{item.metadata.description}</Paragraph><Paragraph>{CLOUD_ORIGINS[item.metadata.origin]} · by {item.metadata.author} · publisher {item.publisher.username}</Paragraph>
        {item.authorGithub && <div className="kc-cloud-publisher"><img className="kc-cloud-avatar" src={item.authorGithub.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" /><Link href={item.authorGithub.url}>{item.authorGithub.login}</Link><span>GitHub verified through Discord connection</span></div>}
        {item.metadata.source && <Paragraph>Original: {item.metadata.source.project} by {item.metadata.source.author}. <Link href={item.metadata.source.repository}>Original source</Link></Paragraph>}
        {item.metadata.repository && <Link href={item.metadata.repository}>GitHub repository</Link>} {item.metadata.github && <Link href={`https://github.com/${item.metadata.github}`}>GitHub profile</Link>}
        <div className="kc-cloud-screenshots">{item.metadata.screenshots.map(image => <img key={image} src={catalogImageUrl(image, KittycordCloudCatalog.origin)} alt={`${item.metadata.name} screenshot`} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />)}</div>
        <KittyToolDetails title="README"><pre className="kc-catalog-source">{item.metadata.readme}</pre></KittyToolDetails>
        <Select options={detail.versions.map(version => ({ label:`v${version.version}`,value:version.version }))} isSelected={value=>value===selected} select={setSelected} serialize={String} />
        {detail.nextVersion && <Button variant="secondary" disabled={busy} onClick={()=>{ setBusy(true);void KittycordCloudCatalog.detail(item,detail.nextVersion??undefined).then(value=>setDetail(previous=>({ ...value,versions:[...previous.versions,...value.versions] })),error=>setError(String(error))).finally(()=>setBusy(false)); }}>Older versions</Button>}
        {installedVersion && <Paragraph>Installed version: {installedVersion}. Replacing native source stops the current version until you enable it again.</Paragraph>}
        {version && <><Heading>v{version.version}</Heading><Paragraph>{version.compatibility}</Paragraph><Paragraph>Access: {version.permissions.join(", ") || "No additional package permissions"}.</Paragraph>{version.format === "native-project" && <CompactNotice>Native source uses the full inherited plugin API. Review the source before installing.</CompactNotice>}<KittyToolDetails title="Changelog & integrity"><pre className="kc-catalog-source">{version.changelog}</pre><Paragraph>SHA-256: {version.digest}</Paragraph></KittyToolDetails><Button variant="secondary" disabled={busy} onClick={()=>{ setBusy(true);void KittycordCloudCatalog.download(item,version).then(bundle=>saveFile(new File([JSON.stringify(bundle,null,4)],`${item.id}-${version.version}.json`,{ type:"application/json" })),error=>setError(String(error))).finally(()=>setBusy(false)); }}>Download source</Button><Button disabled={IS_WEB || busy} onClick={() => void install()}>{busy ? "Verifying…" : version.format === "native-project" ? installedVersion ? compareVersions(version.version, installedVersion) > 0 ? "Update native source" : compareVersions(version.version, installedVersion) < 0 ? "Switch to selected version" : "Reinstall native source" : "Install native source" : installedVersion ? "Review update" : "Review & install"}</Button></>}
        {IS_WEB && <CompactNotice>Browser plugins are distributed in reviewed extension builds. Native runtime installation requires desktop.</CompactNotice>}{error && <CompactNotice tone="critical">{error}</CompactNotice>}{message && <Paragraph role="status">{message}</Paragraph>}
    </div></SettingsTab>;
}

export function CloudCatalog({ visual }: { visual: boolean; }) {
    const [native,setNative]=useState(NativeStudio.snapshot),[local,setLocal]=useState(KittycordPackages.snapshot);
    useEffect(()=>{ const one=NativeStudio.subscribe(()=>setNative(NativeStudio.snapshot())),two=KittycordPackages.subscribe(()=>setLocal(KittycordPackages.snapshot()));return()=>{ one();two(); }; },[]);
    const revision = useRef(0);
    const [retry, setRetry] = useState(0), [category, setCategory] = useState("all"), [collection, setCollection] = useState<"all" | "kittencord">("all");
    const [search, setSearch] = useState(""), [items, setItems] = useState<CloudCatalogItem[]>([]), [next, setNext] = useState<number | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; const generation = ++revision.current; setBusy(true); setItems([]); setNext(null); const timer = setTimeout(() => { void KittycordCloudCatalog.list(visual, search, undefined, undefined, category==="all"?undefined:category, collection==="all"?undefined:collection).then(value => { if (active && generation === revision.current) { setItems([...new Map(value.items.map(item => [item.id, item])).values()]); setNext(value.next); setError(""); } }, error => { if (active && generation === revision.current) setError(String(error)); }).finally(() => { if (active && generation === revision.current) setBusy(false); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [visual, search, retry, category, collection]);
    return <div className="kc-tool-page"><TextInput value={search} onChange={setSearch} aria-label="Search Cloud catalog" placeholder="Search published items…" />{!visual && <Select aria-label="Plugin collection" options={[{ label:"All plugins",value:"all" },{ label:"KittenCord Plugins",value:"kittencord" }]} isSelected={value=>value===collection} select={setCollection} serialize={String} />}{visual && <Select aria-label="Customization category" options={[{ label:"All types",value:"all" },...MARKET_CATEGORIES.map(value => ({ label:value,value }))]} isSelected={value => value === category} select={setCategory} serialize={String} />}{busy && <Paragraph role="status">Loading…</Paragraph>}{error && <CompactNotice tone="critical">{error}<Button size="small" variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry</Button></CompactNotice>}<div className="kc-market-grid">{items.filter(item => category === "all" || item.metadata.category === category).map(item => <article key={item.id} className="kc-tools-card kc-gallery-card">{item.metadata.screenshots[0] && <img className="kc-market-cover" src={catalogImageUrl(item.metadata.screenshots[0], KittycordCloudCatalog.origin)} alt={`${item.metadata.name} preview`} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<div className="kc-package-title">{item.metadata.icon && <img className="kc-cloud-avatar" src={catalogImageUrl(item.metadata.icon, KittycordCloudCatalog.origin)} alt="" />}<div><Heading>{item.metadata.name}</Heading><span className="kc-package-version">v{item.versions[0]?.version} · {CLOUD_ORIGINS[item.metadata.origin]}</span></div></div><Paragraph>{item.metadata.description}</Paragraph><div className="kc-cloud-publisher">{item.publisher.avatar && <img className="kc-cloud-avatar" src={item.publisher.avatar ?? ""} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<span>{item.publisher.username}<small>Verified publisher · {item.publisher_id}</small></span></div><div className="kc-package-footer"><span>{(() => { const version = native.find(status => status.id === item.id)?.version ?? local.entries.find(entry => entry.manifest.id === item.id)?.manifest.version; return version ? `Installed v${version}${item.versions[0] && compareVersions(item.versions[0].version, version) > 0 ? " / Update available" : ""} / ` : native.some(status => status.id === item.id) ? "Installed / " : ""; })()}{item.downloads} downloads</span><Button size="small" variant="secondary" onClick={() => { function Details() { return <CloudDetails item={item} />; } openSettingsTabModal(Details); }}>Details & versions</Button></div></article>)}</div>{!busy && !items.length && !error && (visual ? <SleepingCat /> : <EmptyState title="No published plugins">Try another search.</EmptyState>)}{next && <Button disabled={busy} onClick={() => { const generation = revision.current; setBusy(true); void KittycordCloudCatalog.list(visual, search, next, undefined, category==="all"?undefined:category, collection==="all"?undefined:collection).then(value => { if (generation !== revision.current) return; setItems(previous => [...new Map([...previous, ...value.items].map(item => [item.id, item])).values()]); setNext(value.next); setError(""); }, error => { if (generation === revision.current) setError(String(error)); }).finally(() => { if (generation === revision.current) setBusy(false); }); }}>Load more</Button>}{items.length > 0 && <Paragraph>Downloads count completed package requests. GitHub attribution is supplied by the publisher; Discord identity is verified separately.</Paragraph>}</div>;
}
