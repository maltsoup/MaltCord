/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { exportPerformanceReport, getPerformancePreferences, savePerformancePreferences, subscribePerformancePreferences } from "@api/KittycordPerformance";
import { PluginProfiler } from "@api/PluginProfiler";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, LogIcon, PerformanceIcon, ResetIcon } from "@components/Icons";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { openSettingsTabModal, SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { Switch } from "@components/Switch";
import { saveFile } from "@utils/web";
import { React, TextInput, useEffect, useRef, useState } from "@webpack/common";

import HealthTab from "../health";
import { KittyToolHeader } from "../KittyToolLayout";

function PerformanceTab() {

    const [initial] = useState(getPerformancePreferences);

    const [preferences, setPreferences] = useState(initial.preferences);

    const [error, setError] = useState(initial.error);

    const [busy, setBusy] = useState(false);

    const [saved, setSaved] = useState(false);

    const [report, setReport] = useState(exportPerformanceReport);

    const [activity, setActivity] = useState<number[]>([]);

    const previousTotal = useRef(0);

    useEffect(() => {

        previousTotal.current = exportPerformanceReport().profiles.reduce((sum, item) => sum + item.synchronousMs, 0);

        const timer = setInterval(() => {

            const current = exportPerformanceReport(), total = current.profiles.reduce((sum, item) => sum + item.synchronousMs, 0);

            setActivity(values => [...values.slice(-29), Math.max(0, total - previousTotal.current)]);

            previousTotal.current = total; setReport(current);

        }, 2000);

        return () => clearInterval(timer);

    }, []);

    useEffect(() => PluginProfiler.subscribe(() => setReport(exportPerformanceReport())), []);

    useEffect(() => {

        const refresh = () => { const current = getPerformancePreferences(); setPreferences(current.preferences); setError(current.error); };

        refresh();

        return subscribePerformancePreferences(refresh);

    }, []);

    async function save() {

        setBusy(true); setError(""); setSaved(false);

        try { await savePerformancePreferences(preferences); setSaved(true); }

        catch { setError("Performance preferences were not saved. Check local storage availability and the sampling interval."); }

        finally { setBusy(false); }

    }

    return <SettingsTab>

        <div className="kc-tool-page">

        <KittyToolHeader Icon={PerformanceIcon} title="Kitty Performance" description="Control measurement overhead without changing Discord visuals." />

        <Card className="kc-tools-card"><Heading>Measurement mode</Heading>

        <div className="kc-performance-modes" role="group" aria-label="Measurement mode">{([

            { mode: "balanced", label: "Balanced", text: "Measure every callback", path: "M12 3v18M4 7h16M4 7l-3 7h6ZM20 7l-3 7h6ZM7 21h10" },

            { mode: "super", label: "Super Performance", text: "Measure one in ten", path: "m13 2-9 12h7l-1 8 10-13h-7Z" },

            { mode: "custom", label: "Custom", text: "Choose your sampling", path: "M5 3v18M12 3v18M19 3v18M2 8h6M9 16h6M16 10h6" }

        ] as const).map(item => <Button key={item.mode} variant="secondary" aria-pressed={preferences.mode === item.mode} onClick={() => { setPreferences({ ...preferences, mode: item.mode }); setSaved(false); }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={item.path} /></svg><span>{item.label}<small>{item.text}</small></span></Button>)}</div>

        {preferences.mode === "custom" && <>

            <Paragraph id="kittycord-timing-label">Enable timing diagnostics</Paragraph>

            <Switch aria-labelledby="kittycord-timing-label" checked={preferences.custom.enabled} onChange={enabled => { setPreferences({ ...preferences, custom: { ...preferences.custom, enabled } }); setSaved(false); }} />

            <Paragraph>Measure one callback in every N calls (1 to 1000).</Paragraph>

            <TextInput aria-label="Profiler sampling interval" type="number" value={String(preferences.custom.sampleEvery)} onChange={value => { setPreferences({ ...preferences, custom: { ...preferences.custom, sampleEvery: Number(value) } }); setSaved(false); }} />

            <Paragraph id="kittycord-heap-label">Observe renderer heap changes while a profiler panel is open</Paragraph>

            <Switch aria-labelledby="kittycord-heap-label" checked={preferences.custom.observeHeap} onChange={observeHeap => { setPreferences({ ...preferences, custom: { ...preferences.custom, observeHeap } }); setSaved(false); }} />

        </>}

        <div className="kc-tools-actions"><Button disabled={busy} onClick={() => void save()}>Save and apply</Button></div>

        {saved && <Paragraph>Saved. Timing counters were reset if the diagnostic options changed. Resource tracking remains active.</Paragraph>}

        {error && <Notice.Warning>{error}</Notice.Warning>}

        </Card><Card className="kc-tools-card">

        <Heading>Measured plugin activity</Heading>

        <Paragraph>Session measurements · {report.options.enabled ? `one in ${report.options.sampleEvery} callbacks` : "timing disabled"}. Counts are observed samples, without extrapolation.</Paragraph>

        <div className="kc-tool-stats">

            <div><strong>{report.profiles.length}</strong>Monitored plugins</div>

            <div><strong>{report.profiles.reduce((sum, item) => sum + item.observedSlowCalls, 0)}</strong>Slow samples</div>

            <div><strong>{report.profiles.reduce((sum, item) => sum + item.observedCalls, 0)}</strong>Observed calls</div>

            <div><strong>{report.profiles.reduce((sum, item) => sum + item.synchronousMs, 0).toFixed(1)} ms</strong>Measured synchronous time</div>

            <div><strong>{Math.max(0, ...report.profiles.map(item => item.maxSynchronousMs)).toFixed(1)} ms</strong>Slowest measured callback</div>

        </div>

        {report.profiles.some(item => item.observedCalls) ? <table className="kc-measurement-table"><caption>Most measured synchronous time</caption><thead><tr><th>Plugin</th><th>Samples</th><th>Time</th></tr></thead><tbody>{report.profiles.filter(item => item.observedCalls).sort((a, b) => b.synchronousMs - a.synchronousMs).slice(0, 5).map(item => <tr key={item.pluginId}><td>{item.pluginId}</td><td>{item.observedCalls}</td><td>{item.synchronousMs.toFixed(1)} ms</td></tr>)}</tbody></table> : <Paragraph>No instrumented callbacks measured in this session.</Paragraph>}

        {activity.length > 1 && report.profiles.some(item => item.observedCalls) && <figure className="kc-activity-chart"><figcaption>Measured callback time · 2 second samples · {activity.at(-1)?.toFixed(1)} ms latest</figcaption><svg viewBox="0 0 600 90" role="img" aria-label="Measured synchronous callback time over the last minute"><polyline fill="none" stroke="currentColor" strokeWidth="2" points={activity.map((value, index) => `${index * 600 / Math.max(1, activity.length - 1)},${82 - value / Math.max(1, ...activity) * 72}`).join(" ")} /></svg></figure>}

        {report.profiles.some(item => item.observedCalls) && <table className="kc-measurement-table"><caption>Most expensive measured callbacks</caption><thead><tr><th>Callback</th><th>Samples</th><th>Time</th></tr></thead><tbody>{report.profiles.flatMap(item => item.callbacks.map(callback => ({ ...callback,plugin:item.pluginId }))).sort((a,b)=>b.totalMs-a.totalMs).slice(0,5).map(item => <tr key={`${item.plugin}:${item.name}`}><td>{item.plugin} / {item.name}</td><td>{item.calls}</td><td>{item.totalMs.toFixed(1)} ms</td></tr>)}</tbody></table>}

        <Paragraph>Inspect callback rankings or export local measurements.</Paragraph>

        <div className="kc-tools-actions">

        <Button variant="secondary" onClick={() => openSettingsTabModal(HealthTab)}><LogIcon aria-hidden="true" />Open diagnostics</Button>

        <Button variant="secondary" onClick={() => saveFile(new File([JSON.stringify(exportPerformanceReport(), null, 4)], "kittycord-performance.json", { type: "application/json" }))}><CloudDownloadIcon aria-hidden="true" />Export local performance report</Button>

        <Button variant="secondary" onClick={() => PluginProfiler.resetMetrics()}><ResetIcon aria-hidden="true" />Reset timing counters</Button>

        </div></Card>

        <Paragraph>Modes change diagnostic sampling. They do not change plugin execution or promise a higher frame rate.</Paragraph></div>

    </SettingsTab>;

}

export default wrapTab(PerformanceTab, "Kittencord Performance");
