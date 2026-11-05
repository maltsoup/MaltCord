/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface ImageTransform { x: number; y: number; cropWidth: number; cropHeight: number; width: number; height: number; quality: number; format: "image/png" | "image/jpeg" | "image/webp"; }
export type Crop = Pick<ImageTransform, "x" | "y" | "cropWidth" | "cropHeight">;
export type CropHandle = "new" | "move" | "nw" | "ne" | "sw" | "se";
export function cropFromDrag(crop: Crop, from: { x: number; y: number; }, to: { x: number; y: number; }, mode: CropHandle, size: { width: number; height: number; }): Crop {
    const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)));
    if (mode === "move") return { ...crop, x: clamp(crop.x + to.x - from.x, 0, size.width - crop.cropWidth), y: clamp(crop.y + to.y - from.y, 0, size.height - crop.cropHeight) };
    const anchor = mode === "new" ? from : { x: mode.endsWith("e") ? crop.x : crop.x + crop.cropWidth, y: mode.startsWith("s") ? crop.y : crop.y + crop.cropHeight };
    const left = clamp(Math.min(anchor.x, to.x), 0, size.width - 1), top = clamp(Math.min(anchor.y, to.y), 0, size.height - 1);
    return { x: left, y: top, cropWidth: clamp(Math.abs(anchor.x - to.x), 1, size.width - left), cropHeight: clamp(Math.abs(anchor.y - to.y), 1, size.height - top) };
}
export async function imageInfo(file: Blob) {
    if (!file.size || file.size > 67_108_864 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG or WebP image up to 64 MiB.");
    const bitmap = await createImageBitmap(file);
    try { if (bitmap.width * bitmap.height > 40_000_000) throw new Error("Choose an image up to 40 megapixels."); return { width: bitmap.width, height: bitmap.height }; }
    finally { bitmap.close(); }
}
export async function processImage(file: File, options: ImageTransform) {
    const info = await imageInfo(file);
    for (const key of ["x", "y", "cropWidth", "cropHeight", "width", "height"] as const) if (!Number.isSafeInteger(options[key]) || options[key] < (key === "x" || key === "y" ? 0 : 1)) throw new Error("Use valid whole-pixel dimensions.");
    if (options.x + options.cropWidth > info.width || options.y + options.cropHeight > info.height || options.width > 8192 || options.height > 8192 || options.width * options.height > 40_000_000 || !Number.isFinite(options.quality) || options.quality < .1 || options.quality > 1 || !["image/png", "image/jpeg", "image/webp"].includes(options.format)) throw new Error("Check the crop, output size and quality.");
    const bitmap = await createImageBitmap(file), canvas = new OffscreenCanvas(options.width, options.height), context = canvas.getContext("2d");
    if (!context) { bitmap.close(); throw new Error("Image processing is unavailable in this client."); }
    try {
        if (options.format === "image/jpeg") { context.fillStyle = "white"; context.fillRect(0, 0, options.width, options.height); }
        context.drawImage(bitmap, options.x, options.y, options.cropWidth, options.cropHeight, 0, 0, options.width, options.height);
        const output = await canvas.convertToBlob({ type: options.format, quality: options.quality });
        if (output.type !== options.format) throw new Error("This output format is not supported by your client.");
        return new File([output], file.name.replace(/\.[^.]+$/, "") + "." + ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[options.format]), { type: output.type });
    } finally { bitmap.close(); }
}
