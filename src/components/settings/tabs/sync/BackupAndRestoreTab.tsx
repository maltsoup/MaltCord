/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useSettings } from "@api/Settings";
import { downloadSettingsBackup, importSettings } from "@api/SettingsSync/offline";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { parseSettingsBackup, type SettingsBackup, type SettingsBackupType } from "@shared/kittycord/settingsBackup";
import { Margins } from "@utils/margins";
import { chooseFile } from "@utils/web";
import { useState } from "@webpack/common";

import Plugins from "~plugins";

import { CompactNotice } from "../KittenUI";

function BackupAndRestoreTab() {
    const settings = useSettings();
    const [pending, setPending] = useState<{ name: string; type: SettingsBackupType; data: SettingsBackup; }>();
    const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
    async function selectBackup(type: SettingsBackupType) {
        setBusy(true); setError(""); setMessage("");
        try {
            const file = await chooseFile("application/json,.json");
            if (!file) return;
            if (file.size > 64 * 1024 * 1024) throw Error("Backup exceeds 64 MiB. Import a separate section instead.");
            setPending({ name: file.name, type, data: parseSettingsBackup(await file.text(), type) });
        } catch (error) { setError(error instanceof Error ? error.message : "The backup could not be opened."); }
        finally { setBusy(false); }
    }
    const plugins = pending?.data.settings?.plugins;
    const names = plugins && typeof plugins === "object" ? Object.keys(plugins) : [];
    const available = names.filter(name => Object.hasOwn(Plugins, name)).length;

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>Backup & Restore</Heading>
            <Paragraph className={Margins.bottom20}>
                Import and export your Kittencord settings as a JSON file. This allows you to easily transfer your settings to another device, or recover them after reinstalling Kittencord or Discord.
            </Paragraph>

            <Heading>Import Settings</Heading>
            <Paragraph className={Margins.bottom16}>
                Choose a Kittencord, TestCord, Equicord or Vencord JSON backup, then review its contents. Imported values replace matching settings; other settings are kept. Export your current setup before restoring an older backup.
            </Paragraph>

            <Flex gap="8px" className={Margins.bottom20} style={{ flexWrap: "wrap" }}>
                <Button
                    disabled={busy} onClick={() => void selectBackup("all")}
                    size="small"
                    variant="secondary"
                >
                    Import All Settings
                </Button>
                <Button
                    disabled={busy} onClick={() => void selectBackup("plugins")}
                    size="small"
                >
                    Import Plugins
                </Button>
                <Button
                    disabled={busy} onClick={() => void selectBackup("css")}
                    size="small"
                >
                    Import QuickCSS
                </Button>
                <Button
                    disabled={busy} onClick={() => void selectBackup("datastore")}
                    size="small"
                >
                    Import DataStore
                </Button>
            </Flex>

            {pending && <section aria-label="Backup review" aria-busy={busy} className={Margins.bottom20}>
                <Heading>Review {pending.name}</Heading>
                {(pending.type === "all" || pending.type === "plugins") && <Paragraph>{names.length.toLocaleString()} plugin settings · {available.toLocaleString()} available in this build. Settings for unavailable plugins are preserved; a settings backup does not install plugin source.</Paragraph>}
                {pending.type === "all" && <Paragraph>General settings{pending.data.quickCss !== undefined ? ", QuickCSS" : ""}{pending.data.dataStore ? ` and ${pending.data.dataStore.length.toLocaleString()} DataStore entries` : ""} will also be restored.</Paragraph>}
                {pending.type === "css" && <Paragraph>Restore QuickCSS only.</Paragraph>}
                {pending.type === "datastore" && <Paragraph>Restore {pending.data.dataStore?.length.toLocaleString()} DataStore entries only.</Paragraph>}
                <Flex gap="8px"><Button disabled={busy} size="small" onClick={() => {
                    setBusy(true); setError("");
                    void importSettings(pending.data, pending.type).then(() => {
                        setMessage("Backup imported. Reload Discord to start the selected plugins and apply source patches."); setPending(undefined);
                    }, error => setError(error instanceof Error ? error.message : "Import failed.")).finally(() => setBusy(false));
                }}>{busy ? "Importing…" : "Apply backup"}</Button><Button disabled={busy} size="small" variant="secondary" onClick={() => setPending(undefined)}>Cancel</Button></Flex>
            </section>}
            {error && <CompactNotice tone="critical">{error}</CompactNotice>}
            {message && <CompactNotice>{message}<Button size="small" variant="secondary" onClick={() => location.reload()}>Reload Discord</Button></CompactNotice>}

            <Divider className={Margins.bottom20} />

            <Heading>Export Settings</Heading>
            <Paragraph className={Margins.bottom16}>
                Download your complete setup or a single section. Credentials are excluded.
            </Paragraph>

            <Flex gap="8px" style={{ flexWrap: "wrap" }}>
                <Button
                    onClick={() => downloadSettingsBackup("all", { forceDataStore: settings.experimentalDataStoreExport })}
                    size="small"
                    variant="secondary"
                >
                    Export All Settings
                </Button>
                <Button
                    onClick={() => downloadSettingsBackup("plugins")}
                    size="small"
                >
                    Export Plugins
                </Button>
                <Button
                    onClick={() => downloadSettingsBackup("css")}
                    size="small"
                >
                    Export QuickCSS
                </Button>
                <Button
                    onClick={() => downloadSettingsBackup("datastore", { forceDataStore: settings.experimentalDataStoreExport })}
                    size="small"
                >
                    Export DataStore
                </Button>
            </Flex>

            <Divider className={Margins.bottom20} />

            <FormSwitch
                title="Large DataStore Export"
                description="Force export and import of DataStore even when it's too large. Uses chunked processing to avoid memory issues but may still fail on extremely large datasets."
                value={settings.experimentalDataStoreExport}
                onChange={(v: boolean) => settings.experimentalDataStoreExport = v}
            />
        </SettingsTab>
    );
}

export default wrapTab(BackupAndRestoreTab, "Backup & Restore");
