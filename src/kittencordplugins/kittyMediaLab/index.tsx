/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton } from "@api/ChatButtons";
import { Button } from "@components/Button";
import { ImageIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { KittenSelect } from "@components/settings/KittenSelect";
import { Devs } from "@utils/constants";
import { getCurrentChannel } from "@utils/discord";
import { ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { type PluginNative } from "@utils/types";
import { chooseFile, saveFile } from "@utils/web";
import { Menu, React, TextInput, UploadHandler, useEffect, useState } from "@webpack/common";
import type { ComponentProps } from "react";

import { imageInfo, type ImageTransform, processImage } from "./processor";
import style from "./style.css?managed";
import { ImageCropEditor, VideoTrimEditor } from "./VisualEditors";

const native = IS_WEB ? undefined : VencordNative.pluginHelpers.KittyMediaLab as PluginNative<typeof import("./native")>;
function useMediaUrl(file?: File) {
    const [url, setUrl] = useState("");
    useEffect(() => { if (!file) { setUrl(""); return; } const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value); }, [file]);
    return url;
}
function Preview({ file, title }: { file: File; title: string; }) {
    const url = useMediaUrl(file);
    return <figure><figcaption>{title} · {(file.size / 1024).toFixed(1)} KiB</figcaption>{file.type.startsWith("video/") ? <video src={url} controls preload="metadata" /> : <img src={url} alt={title} />}</figure>;
}
function MediaLab(props: ComponentProps<typeof ModalRoot> & { onClose(): void; }) {
    const [source, setSource] = useState<File>(), [output, setOutput] = useState<File>();
    const [transform, setTransform] = useState<ImageTransform>({ x: 0, y: 0, cropWidth: 1, cropHeight: 1, width: 1, height: 1, quality: .85, format: "image/webp" });
    const [busy, setBusy] = useState(false), [error, setError] = useState(""), [video, setVideo] = useState(false);
    const [start, setStart] = useState(0), [duration, setDuration] = useState(10);
    const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
    const sourceUrl = useMediaUrl(source);
    useEffect(() => { let active = true; if (native) void native.capabilities().then(result => { if (active) setVideo(result.video); }, () => { if (active) setVideo(false); }); return () => { active = false; }; }, []);
    async function work(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : "Media processing failed."); } finally { setBusy(false); } }
    async function load(file: File) {
        if (file.size > 67_108_864) throw new Error("Choose a file up to 64 MiB.");
        if (file.type.startsWith("video/")) { if (!video) throw new Error("Video processing needs a local FFmpeg installation in the desktop app."); }
        else { const info = await imageInfo(file); setImageSize(info); setTransform({ x: 0, y: 0, cropWidth: info.width, cropHeight: info.height, ...info, quality: .85, format: "image/webp" }); }
        setSource(file); setOutput(undefined);
    }
    function edit<K extends keyof ImageTransform>(key: K, value: ImageTransform[K]) { setTransform({ ...transform, [key]: value }); setOutput(undefined); }
    const isVideo = source?.type.startsWith("video/");
    return <ModalRoot {...props} className="kc-media-lab"><ModalHeader className="kc-media-header"><ImageIcon width={24} height={24} /><div className="kc-media-heading"><strong>Kitty Media Lab</strong><small>Crop, trim and export on your device.</small></div></ModalHeader><ModalContent className="kc-media-content">
        <div className={`kc-media-drop${source ? " kc-media-drop-loaded" : ""}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file && !busy) void work(() => load(file)); }}>
            {!source && <ImageIcon width={40} height={40} />}
            <div><strong title={source?.name}>{source ? source.name : "Your next edit starts here"}</strong><span>{source ? `${(source.size / 1024).toFixed(1)} KiB · ${isVideo ? "Video" : `${imageSize.width} × ${imageSize.height}`}` : `Drop a PNG, JPEG or WebP${video ? ", MP4 or WebM" : ""}.`}</span></div>
            <Button disabled={busy} variant="secondary" onClick={() => void work(async () => { const file = await chooseFile(video ? "image/png,image/jpeg,image/webp,video/mp4,video/webm" : "image/png,image/jpeg,image/webp"); if (file) await load(file); })}>{source ? "Replace file" : "Choose file"}</Button>
        </div>
        {source && sourceUrl && <div className="kc-media-workspace" data-output={Boolean(output)}><div className="kc-media-edit-pane">
            {isVideo ? <VideoTrimEditor key={sourceUrl} url={sourceUrl} start={start} duration={duration} disabled={busy} onChange={(nextStart, nextDuration) => { setStart(nextStart); setDuration(nextDuration); setOutput(undefined); }} /> : <ImageCropEditor url={sourceUrl} size={imageSize} crop={transform} disabled={busy} onChange={crop => { setTransform({ ...transform, ...crop, width: crop.cropWidth, height: crop.cropHeight }); setOutput(undefined); }} />}
            {!isVideo && <div className="kc-media-export-options"><label>Format<KittenSelect options={([{ value: "image/webp", label: "WebP" }, { value: "image/jpeg", label: "JPEG" }, { value: "image/png", label: "PNG" }] as const)} serialize={String} isSelected={value => value === transform.format} select={value => edit("format", value)} /></label><label>Size<KittenSelect options={[{ value: 1, label: "Original crop size" }, { value: .75, label: "75%" }, { value: .5, label: "50%" }, { value: .25, label: "25%" }]} serialize={String} isSelected={value => transform.width === Math.max(1, Math.round(transform.cropWidth * value)) && transform.height === Math.max(1, Math.round(transform.cropHeight * value))} select={value => { setTransform({ ...transform, width: Math.max(1, Math.round(transform.cropWidth * value)), height: Math.max(1, Math.round(transform.cropHeight * value)) }); setOutput(undefined); }} /></label></div>}
            <details className="kc-media-advanced"><summary>Advanced</summary><fieldset disabled={busy}><div className="kc-media-fields">
                {isVideo ? <><label>Start (seconds)<TextInput type="number" min={0} value={String(start)} onChange={value => { setStart(Number(value)); setOutput(undefined); }} /></label><label>Length (seconds)<TextInput type="number" min={.1} max={600} value={String(duration)} onChange={value => { setDuration(Number(value)); setOutput(undefined); }} /></label></> : <>
                    {([ ["x", "Crop left"], ["y", "Crop top"], ["cropWidth", "Crop width"], ["cropHeight", "Crop height"], ["width", "Output width"], ["height", "Output height"] ] as const).map(([key, label]) => <label key={key}>{label}<TextInput type="number" min={key === "x" || key === "y" ? 0 : 1} value={String(transform[key])} onChange={value => edit(key, Number(value))} /></label>)}
                    <label>Quality (10–100%)<TextInput type="number" min={10} max={100} value={String(Math.round(transform.quality * 100))} onChange={value => edit("quality", Number(value) / 100)} /></label>
                </>}
            </div></fieldset><Paragraph>{isVideo ? "MP4 output, up to 1280 px. Clips can be up to ten minutes." : "PNG is lossless. Quality affects JPEG and WebP."} Original embedded metadata is removed.</Paragraph></details>
        </div>{output && <aside className="kc-media-result"><Preview file={output} title="Ready to export" /><Paragraph>{isVideo ? "MP4 clip" : `${transform.width} × ${transform.height}`} · {output.size < source.size ? `${Math.round((1 - output.size / source.size) * 100)}% smaller` : "Re-encoded"}</Paragraph></aside>}</div>}
        {!video && !source && <Paragraph>Images are ready. Video editing needs local FFmpeg.</Paragraph>}
        {error && <Paragraph role="alert">{error}</Paragraph>}
        {busy && <Paragraph role="status">Processing on your device…</Paragraph>}
    </ModalContent><ModalFooter className="kc-media-footer">{source && <Button disabled={busy} onClick={() => void work(async () => {
        if (isVideo && native) { const result = await native.processVideo({ bytes: new Uint8Array(await source.arrayBuffer()), start, duration }); if (!result.success) throw new Error(result.error); setOutput(new File([new Uint8Array(result.bytes)], source.name.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4" })); }
        else setOutput(await processImage(source, transform));
    })}>{busy ? "Processing…" : isVideo ? "Create clip" : "Create image"}</Button>}<Button variant="secondary" disabled={busy || !output} onClick={() => { if (output) void work(async () => { await saveFile(output); }); }}>Save file</Button><Button variant="secondary" disabled={busy || !output} onClick={() => void work(async () => { const channel = getCurrentChannel(); if (!channel || !output) throw new Error("Open a text channel before attaching the processed file."); await UploadHandler.promptToUpload([output], channel, 0); props.onClose(); })}>Attach to Discord</Button><Button variant="secondary" disabled={busy} onClick={props.onClose}>Close</Button></ModalFooter></ModalRoot>;
}
function open() { openModal(props => <MediaLab {...props} />); }
export default definePlugin({
    name: "KittyMediaLab", description: "Crop, resize and convert images locally. Trim and compress videos with local FFmpeg.",
    authors: [Devs.Kittencord], kittencordOrigin: "original", tags: ["Utility"],
    dependencies: ["ChatInputButtonAPI", "ContextMenuAPI"], managedStyle: style,
    settingsAboutComponent: () => <Button onClick={open}>Open Kitty Media Lab</Button>,
    chatBarButton: { icon: ImageIcon, render: ({ isMainChat, disabled }) => isMainChat && !disabled ? <ChatBarButton tooltip="Kitty Media Lab" onClick={open}><ImageIcon width={20} height={20} /></ChatBarButton> : null },
    contextMenus: { "channel-attach": children => { children.push(<Menu.MenuItem id="kitty-media-lab" label="Kitty Media Lab" icon={ImageIcon} action={open} />); } }
});
