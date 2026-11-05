/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./developerTools.css";

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { CloudDownloadIcon, CodeIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings/tabs/BaseTab";
import { settings } from "@plugins/_core/settings";
import { newNativeProject } from "@shared/kittycord/nativeStudio";
import { saveFile } from "@utils/web";
import { useState } from "@webpack/common";

import { KittenTabs } from "../KittenUI";
import { Workshop } from "../kittycordWorkshop";
import { NativeStudioPanel, openNativeProject } from "../kittycordWorkshop/NativeStudio";
import { KittyToolDetails, KittyToolHeader } from "../KittyToolLayout";
import PatchHelper from "../patchHelper";

export default function DeveloperTools() {
    const { developerMode } = settings.use(["developerMode"]);
    const [tab, setTab] = useState("studio");
    const example = newNativeProject("ui");
    return <SettingsTab><div className="kc-tool-page">
        <section className="kc-dev-hero">
            <div className="kc-dev-heading"><KittyToolHeader Icon={CodeIcon} title="Developer tools" description="Write, test and run your next plugin." /><span className={`kc-dev-status${developerMode ? " kc-dev-status-enabled" : ""}`}>{developerMode ? "Enabled" : "Hidden"}</span></div>
            <div className="kc-dev-facts"><span>JavaScript &amp; TypeScript</span><span>Shared plugin engine</span><span>{IS_WEB ? "Browser build" : "Desktop workspace"}</span></div>
            <FormSwitch title="Enable developer tools" value={developerMode} onChange={value => { settings.store.developerMode = value; }} description="Show Studio, examples and patch tools. Installed plugins keep working when these tools are hidden." />
        </section>
        {developerMode && <>
            <div className="kc-dev-shortcuts"><div><strong>Start with a working example</strong><Paragraph>A channel toolbar button with start and stop cleanup.</Paragraph></div><div className="kc-tools-actions"><Button size="small" onClick={() => openNativeProject(example)}><CodeIcon width={16} height={16} />Open toolbar starter</Button><Button size="small" variant="secondary" onClick={() => void saveFile(new File([JSON.stringify(example, null, 4)], "toolbar-button.native-project.json", { type: "application/json" }))}><CloudDownloadIcon width={16} height={16} />Download source</Button></div></div>
            <KittenTabs label="Developer tools" tabs={[{ id: "studio", label: "Studio" }, { id: "projects", label: "Projects" }, { id: "advanced", label: "Advanced" }]} selected={tab} onSelect={setTab} />
            <NativeStudioPanel workspaceView={tab} onNavigate={setTab} />
            {tab === "projects" && <KittyToolDetails title="Legacy projects"><Workshop /></KittyToolDetails>}
            {tab === "advanced" && <><KittyToolDetails title="Build your first plugin"><section className="kc-tools-card">
                <Heading>A button in the channel toolbar</Heading>
                <Paragraph>This example uses definePlugin and the existing HeaderBar API. The engine adds the button on start and removes it on stop.</Paragraph>
                <ol className="kc-dev-steps"><li>Open Plugin Studio and choose Project Settings.</li><li>Select Toolbar button and edit its source.</li><li>Choose Install &amp; run. Find the new button in a channel header.</li><li>Use Stop to remove the button, or Export to share the editable project.</li></ol>
                <div className="kc-dev-code-heading"><CodeIcon width={16} height={16} /><span>{example.entry}</span><span>Toolbar starter</span></div><pre className="kc-source-diff kc-dev-source">{example.files[example.entry]}</pre>
                <div className="kc-tools-actions"><Button onClick={() => setTab("studio")}>Open Plugin Studio</Button><Button variant="secondary" onClick={() => void saveFile(new File([JSON.stringify(example, null, 4)], "toolbar-button.native-project.json", { type: "application/json" }))}>Download example</Button></div>
            </section></KittyToolDetails>{!IS_STANDALONE && PatchHelper && <KittyToolDetails title="Patch tools"><PatchHelper /></KittyToolDetails>}</>}

        </>}
    </div></SettingsTab>;
}
