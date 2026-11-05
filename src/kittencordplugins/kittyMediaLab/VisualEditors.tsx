/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, useEffect, useRef, useState } from "@webpack/common";
import type { PointerEvent } from "react";

import { type Crop, cropFromDrag, type CropHandle } from "./processor";

export function ImageCropEditor({ url, size, crop, disabled, onChange }: { url: string; size: { width: number; height: number; }; crop: Crop; disabled: boolean; onChange(value: Crop): void; }) {
    const stage = useRef<HTMLDivElement>(null);
    const drag = useRef<{ mode: CropHandle; point: { x: number; y: number; }; crop: Crop; } | null>(null);
    function point(event: PointerEvent) {
        const bounds = stage.current?.getBoundingClientRect();
        return bounds ? { x: Math.max(0, Math.min(size.width, (event.clientX - bounds.left) / bounds.width * size.width)), y: Math.max(0, Math.min(size.height, (event.clientY - bounds.top) / bounds.height * size.height)) } : { x: 0, y: 0 };
    }
    function begin(event: PointerEvent, mode: CropHandle) {
        if (disabled || event.button !== 0 || !stage.current) return;
        event.preventDefault(); event.stopPropagation();
        drag.current = { mode, point: point(event), crop };
        stage.current.setPointerCapture(event.pointerId);
    }
    return <div className="kc-media-image-editor">
        <div className="kc-media-canvas"><div ref={stage} className="kc-media-crop-stage" onPointerDown={event => begin(event, "new")} onPointerMove={event => {
            if (!drag.current) return;
            onChange(cropFromDrag(drag.current.crop, drag.current.point, point(event), drag.current.mode, size));
        }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            <img src={url} alt="Image to crop" draggable={false} />
            <div className="kc-media-crop-selection" style={{ left: `${crop.x / size.width * 100}%`, top: `${crop.y / size.height * 100}%`, width: `${crop.cropWidth / size.width * 100}%`, height: `${crop.cropHeight / size.height * 100}%` }} onPointerDown={event => begin(event, "move")}>
                <div className="kc-media-thirds" aria-hidden="true" />
                {(["nw", "ne", "sw", "se"] as const).map(handle => <button key={handle} className={`kc-media-crop-handle kc-media-crop-${handle}`} aria-label={`Resize crop ${handle}`} disabled={disabled} onPointerDown={event => begin(event, handle)} onKeyDown={event => {
                    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 10 : 1, origin = { x: handle.endsWith("e") ? crop.x + crop.cropWidth : crop.x, y: handle.startsWith("s") ? crop.y + crop.cropHeight : crop.y };
                    onChange(cropFromDrag(crop, origin, { x: origin.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), y: origin.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0) }, handle, size));
                }} />)}
            </div>
        </div></div>
        <div className="kc-media-toolbar"><span>Drag the frame or its corners to crop.</span><strong>{crop.cropWidth} × {crop.cropHeight}</strong><Button size="small" variant="secondary" disabled={disabled} onClick={() => onChange({ x: 0, y: 0, cropWidth: size.width, cropHeight: size.height })}>Reset crop</Button></div>
    </div>;
}

function timestamp(value: number) { return `${Math.floor(value / 60)}:${(value % 60).toFixed(1).padStart(4, "0")}`; }
export function VideoTrimEditor({ url, start, duration, disabled, onChange }: { url: string; start: number; duration: number; disabled: boolean; onChange(start: number, duration: number): void; }) {
    const player = useRef<HTMLVideoElement>(null);
    const timeline = useRef<HTMLDivElement>(null);
    const [total, setTotal] = useState(0), [frames, setFrames] = useState<string[]>([]), [failed, setFailed] = useState(false);
    const end = Math.min(total, start + duration);
    useEffect(() => {
        if (!total) return;
        let active = true;
        const video = document.createElement("video"); video.muted = true; video.preload = "auto"; video.src = url;
        const canvas = document.createElement("canvas"); canvas.width = 112; canvas.height = 64;
        const context = canvas.getContext("2d");
        video.onloadeddata = () => { void (async () => {
            if (!context) return;
            const images: string[] = [];
            for (let index = 0; index < 8 && active; index++) {
                const time = Math.min(total - .001, (index + .5) / 8 * total);
                await new Promise<void>(resolve => { video.onseeked = () => resolve(); video.onerror = () => resolve(); video.currentTime = time; });
                if (!active) return;
                context.drawImage(video, 0, 0, canvas.width, canvas.height); images.push(canvas.toDataURL("image/jpeg", .6));
            }
            if (active) setFrames(images);
        })().catch(() => { if (active) setFrames([]); }); };
        return () => { active = false; video.pause(); video.removeAttribute("src"); video.load(); };
    }, [url, total]);
    function change(nextStart: number, nextEnd: number) {
        onChange(nextStart, nextEnd - nextStart);
        if (player.current) { player.current.pause(); player.current.currentTime = nextStart; }
    }
    return <div className="kc-media-video-editor">
        <video ref={player} src={url} controls muted preload="metadata" onError={() => setFailed(true)} onLoadedMetadata={event => {
            const length = event.currentTarget.duration;
            if (!Number.isFinite(length) || length <= .1 || length > 86400) { setFailed(true); return; }
            setTotal(length); onChange(0, Math.min(length, 600));
        }} onTimeUpdate={event => { if (event.currentTarget.currentTime >= end && end > 0) event.currentTarget.pause(); }} onPlay={event => { if (event.currentTarget.currentTime < start || event.currentTarget.currentTime >= end) event.currentTarget.currentTime = start; }} />
        {failed ? <p role="alert">This video cannot be previewed. Choose an MP4 or WebM supported by Discord.</p> : total > 0 && <>
            <div className="kc-media-trim-labels"><span>In <strong>{timestamp(start)}</strong></span><span>{(end - start).toFixed(1)}s selected</span><span>Out <strong>{timestamp(end)}</strong></span></div>
            <div className="kc-media-timeline" ref={timeline}>
                <div className="kc-media-filmstrip" aria-hidden="true">{frames.map((frame, index) => <img key={index} src={frame} alt="" />)}</div>
                <div className="kc-media-trim-selection" style={{ left: `${start / total * 100}%`, right: `${100 - end / total * 100}%` }} />
                {(["start", "end"] as const).map(handle => {
                    const value = handle === "start" ? start : end;
                    function update(time: number) { if (handle === "start") change(Math.max(0, end - 600, Math.min(time, end - .1)), end); else change(start, Math.max(start + .1, Math.min(time, total, start + 600))); }
                    return <button key={handle} className="kc-media-trim-handle" role="slider" aria-label={`Trim ${handle}`} disabled={disabled} aria-valuemin={handle === "start" ? Math.max(0, end - 600) : start + .1} aria-valuemax={handle === "start" ? end - .1 : Math.min(total, start + 600)} aria-valuenow={value} aria-valuetext={timestamp(value)} style={{ left: `calc(${value / total * 100}% - ${value / total * 16}px)` }} onPointerDown={event => { event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => {
                        if (event.buttons !== 1 || !timeline.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                        const bounds = timeline.current.getBoundingClientRect(); update((event.clientX - bounds.left - 8) / (bounds.width - 16) * total);
                    }} onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); update(event.key === "Home" ? 0 : event.key === "End" ? total : value + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? .1 : .01)); }} />;
                })}
            </div>
            <div className="kc-media-toolbar"><span>Drag either handle to trim. Play to preview the selected clip.</span><Button size="small" variant="secondary" disabled={disabled} onClick={() => change(0, Math.min(total, 600))}>Reset trim</Button></div>
        </>}
    </div>;
}
