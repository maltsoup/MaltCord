/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { getProfileSettings } from "@api/KittycordProfiles";
import { FormSwitch } from "@components/FormSwitch";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect as Select } from "@components/settings/KittenSelect";
import type { AccountSetup } from "@shared/kittycord/accountSetup";
import { TextInput, useState } from "@webpack/common";

import Plugins from "~plugins";

import { KittenTabs } from "../KittenUI";

export function SetupEditor({ value, onChange }: { value: AccountSetup; onChange(value: AccountSetup): void; }) {
    const [tab, setTab] = useState("plugins"), [search, setSearch] = useState("");
    const [setting, setSetting] = useState("");
    const definitions = getProfileSettings();
    const definition = definitions.find(item => `${item.pluginId}:${item.key}` === setting) ?? definitions[0];
    const entries = Object.entries(value.plugins).filter(([name]) => name.toLowerCase().includes(search.toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
    const { appearance } = value;
    return <div className="kc-account-setup-editor">
        <KittenTabs label="Saved account setup" tabs={[{ id: "plugins", label: "Plugins" }, { id: "themes", label: "Themes" }, { id: "settings", label: "Settings" }]} selected={tab} onSelect={setTab} />
        {tab === "plugins" && <>
            <TextInput aria-label="Search saved plugins" placeholder="Search saved plugins" value={search} onChange={setSearch} />
            <div className="kc-account-setup-scroll">{entries.map(([name, enabled]) => <FormSwitch key={name} title={name} description={!Plugins[name] ? "Currently unavailable; saved selection is preserved." : undefined} value={enabled} onChange={enabled => onChange({ ...value, plugins: { ...value.plugins, [name]: enabled } })} />)}</div>
            {!entries.length && <Paragraph>No matching saved plugin selections.</Paragraph>}
        </>}
        {tab === "themes" && <>
            <Paragraph>Local theme filenames or IDs, one per line. Applying a setup uses themes already installed on this device.</Paragraph>
            <textarea className="kc-account-theme-input" aria-label="Saved local themes" value={value.themes.join("\n")} onChange={event => onChange({ ...value, themes: event.currentTarget.value.split("\n").filter(Boolean) })} />
            {appearance && <>
                <FormSwitch title="Online themes" value={appearance.enableOnlineThemes} onChange={enableOnlineThemes => onChange({ ...value, appearance: { ...appearance, enableOnlineThemes } })} />
                <FormSwitch title="QuickCSS" description="Uses this device's existing QuickCSS; no CSS is copied between accounts." value={appearance.useQuickCss} onChange={useQuickCss => onChange({ ...value, appearance: { ...appearance, useQuickCss } })} />
                {appearance.themeLinks.map(link => <FormSwitch key={link} title={link} value={appearance.enabledThemeLinks.includes(link)} onChange={enabled => onChange({ ...value, appearance: { ...appearance, enabledThemeLinks: enabled ? [...appearance.enabledThemeLinks, link] : appearance.enabledThemeLinks.filter(item => item !== link) } })} />)}
            </>}
        </>}
        {tab === "settings" && <>
            {definitions.length ? <Select options={definitions.map(item => ({ label: `${item.pluginId}: ${item.label}`, value: `${item.pluginId}:${item.key}` }))} serialize={String} isSelected={value => value === `${definition?.pluginId}:${definition?.key}`} select={setSetting} /> : <Paragraph>No reviewed settings are available.</Paragraph>}
            {definition && (() => {
                const current = value.preferences?.[definition.pluginId]?.[definition.key];
                const update = (setting: boolean | number) => onChange({ ...value, preferences: { ...value.preferences, [definition.pluginId]: { ...value.preferences?.[definition.pluginId], [definition.key]: setting } } });
                return definition.type === "boolean" ? <FormSwitch title={definition.label} description={current === undefined ? "No override saved." : undefined} value={current === true} onChange={update} /> : <TextInput aria-label={definition.label} type="number" value={current === undefined ? "" : String(current)} onChange={input => { const number = Number(input); if (input.trim() && Number.isFinite(number)) update(number); }} />;
            })()}
        </>}
    </div>;
}
