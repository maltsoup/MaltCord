/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { KittycordUtility } from "@api/KittycordUtility";
import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { Notice } from "@components/Notice";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import type { UtilityValue } from "@shared/kittycord/utility";
import { React, TextArea, TextInput, useEffect, useState } from "@webpack/common";

export function LocalSettings({ id }: { id: string; }) {
    const fieldId = React.useId();
    const [surface, setSurface] = useState(() => KittycordUtility.snapshot(id));
    const [draft, setDraft] = useState<Record<string, UtilityValue>>({});
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        const refresh = () => setSurface(KittycordUtility.snapshot(id));
        refresh(); return KittycordUtility.subscribe(refresh);
    }, [id]);
    useEffect(() => { if (surface) setDraft(surface.values); }, [JSON.stringify(surface?.values)]);
    if (!surface) return <Paragraph>Enable this local utility to open its controls.</Paragraph>;
    return <section aria-label={`Local plugin controls: ${id}`}>
        <Heading>{surface.panel.title}</Heading><TextArea readOnly aria-label={`${surface.panel.title} result`} value={surface.panel.text} onChange={() => {}} rows={5} />
        {error && <Notice.Warning>{error}</Notice.Warning>}
        <div className="kc-tools-actions">{surface.panel.actions.map(action => <Button key={action.id} onClick={() => {
            try { KittycordUtility.action(id, action.id); setError(""); } catch (problem) { setError(problem instanceof Error ? problem.message : "Plugin action failed."); }
        }}>{action.label}</Button>)}</div>
        {surface.panel.settings.map(field => <div className="kc-tool-field" key={field.id}><label htmlFor={`${fieldId}-${field.id}`}>{field.label}</label>
            {field.type === "boolean" ? <Switch aria-label={field.label} checked={draft[field.id] === true} onChange={value => setDraft({ ...draft, [field.id]: value })} />
                : field.type === "text" ? <TextArea id={`${fieldId}-${field.id}`} aria-label={field.label} rows={3} value={String(draft[field.id] ?? field.default)} onChange={value => setDraft({ ...draft, [field.id]: value })} />
                    : <TextInput id={`${fieldId}-${field.id}`} aria-label={field.label} type="number" value={String(draft[field.id] ?? field.default)} onChange={value => setDraft({ ...draft, [field.id]: Number(value) })} />}
        </div>)}
        {surface.panel.settings.length > 0 && <div className="kc-tools-actions"><Button disabled={busy} onClick={() => {
            setBusy(true); setError(""); void KittycordUtility.save(id, draft).catch(problem => setError(problem instanceof Error ? problem.message : "Local settings were not saved.")).finally(() => setBusy(false));
        }}>Save local settings</Button></div>}
        <Paragraph>These local preferences are global to this MaltCord installation. Do not enter passwords or Discord credentials.</Paragraph>
    </section>;
}
