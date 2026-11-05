/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

namespace KittencordSetup {
    internal sealed class VideoBackdrop : IDisposable {
        const uint VideoStream = 0xfffffffc, AllStreams = 0xfffffffe;
        IntPtr stream, byteStream, reader;
        bool started, ended;
        Bitmap next;
        long nextTime, lastTime, frameInterval = 333333;
        int stride;
        readonly Stopwatch clock = new Stopwatch();
        public Bitmap Frame { get; private set; }
        public int Width { get; private set; }
        public int Height { get; private set; }
        public int DecodedFrames { get; private set; }
        public int Loops { get; private set; }

        [DllImport("mfplat.dll", ExactSpelling = true)] static extern int MFStartup(int version, int flags);
        [DllImport("mfplat.dll", ExactSpelling = true)] static extern int MFShutdown();
        [DllImport("mfplat.dll", ExactSpelling = true)] static extern int MFCreateAttributes(out IntPtr attributes, int size);
        [DllImport("mfplat.dll", ExactSpelling = true)] static extern int MFCreateMediaType(out IntPtr mediaType);
        [DllImport("mfplat.dll", ExactSpelling = true)] static extern int MFCreateMFByteStreamOnStream(IntPtr stream, out IntPtr byteStream);
        [DllImport("mfreadwrite.dll", ExactSpelling = true)] static extern int MFCreateSourceReaderFromByteStream(IntPtr stream, IntPtr attributes, out IntPtr reader);
        [DllImport("shlwapi.dll", ExactSpelling = true)] static extern IntPtr SHCreateMemStream(byte[] data, uint length);
        [DllImport("kernel32.dll", EntryPoint = "RtlMoveMemory")] static extern void CopyMemory(IntPtr destination, IntPtr source, UIntPtr length);

        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetUInt32(IntPtr self, ref Guid key, uint value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetUInt32(IntPtr self, ref Guid key, out uint value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetUInt64(IntPtr self, ref Guid key, out ulong value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetGuid(IntPtr self, ref Guid key, ref Guid value);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SelectStream(IntPtr self, uint index, [MarshalAs(UnmanagedType.Bool)] bool selected);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetMediaType(IntPtr self, uint index, IntPtr reserved, IntPtr mediaType);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int GetMediaType(IntPtr self, uint index, out IntPtr mediaType);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SetPosition(IntPtr self, ref Guid format, ref Position position);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int ReadSample(IntPtr self, uint index, uint flags, out uint actual, out uint status, out long timestamp, out IntPtr sample);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int SampleBuffer(IntPtr self, out IntPtr buffer);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int LockBuffer(IntPtr self, out IntPtr data, out uint capacity, out uint length);
        [UnmanagedFunctionPointer(CallingConvention.StdCall)] delegate int UnlockBuffer(IntPtr self);
        [StructLayout(LayoutKind.Explicit, Size = 24)] struct Position { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public long Value; }

        static T Method<T>(IntPtr instance, int slot) where T : class { return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(instance), slot * IntPtr.Size), typeof(T)); }
        static void Check(int result) { Marshal.ThrowExceptionForHR(result); }
        static void Release(ref IntPtr value) { if (value != IntPtr.Zero) { Marshal.Release(value); value = IntPtr.Zero; } }
        static void UInt32(IntPtr attributes, string key, uint value) { var id = new Guid(key); Check(Method<SetUInt32>(attributes, 21)(attributes, ref id, value)); }
        static void GuidValue(IntPtr attributes, string key, string value) { var id = new Guid(key); var setting = new Guid(value); Check(Method<SetGuid>(attributes, 24)(attributes, ref id, ref setting)); }

        public VideoBackdrop(byte[] bytes) {
            IntPtr attributes = IntPtr.Zero, mediaType = IntPtr.Zero, actualType = IntPtr.Zero;
            try {
                Check(MFStartup(0x20070, 0)); started = true;
                stream = SHCreateMemStream(bytes, (uint)bytes.Length);
                if (stream == IntPtr.Zero) throw new IOException("The video stream could not be opened.");
                Check(MFCreateMFByteStreamOnStream(stream, out byteStream));
                Check(MFCreateAttributes(out attributes, 2));
                UInt32(attributes, "fb394f3d-ccf1-42ee-bbb3-f9b845d5681d", 1);
                UInt32(attributes, "aa456cfd-3943-4a1e-a77d-1838c0ea2e35", 1);
                Check(MFCreateSourceReaderFromByteStream(byteStream, attributes, out reader));
                Check(Method<SelectStream>(reader, 4)(reader, AllStreams, false));
                Check(Method<SelectStream>(reader, 4)(reader, VideoStream, true));
                Check(MFCreateMediaType(out mediaType));
                GuidValue(mediaType, "48eba18e-f8c9-4687-bf11-0a74c9f96a8f", "73646976-0000-0010-8000-00aa00389b71");
                GuidValue(mediaType, "f7e34c9a-42e8-4714-b74b-cb29d72c35e5", "00000016-0000-0010-8000-00aa00389b71");
                Check(Method<SetMediaType>(reader, 7)(reader, VideoStream, IntPtr.Zero, mediaType));
                Check(Method<GetMediaType>(reader, 6)(reader, VideoStream, out actualType));
                var sizeKey = new Guid("1652c33d-d6b2-4012-b834-72030849a37d"); ulong size;
                Check(Method<GetUInt64>(actualType, 8)(actualType, ref sizeKey, out size));
                Width = (int)(size >> 32); Height = (int)(size & 0xffffffff);
                if (Width < 1 || Height < 1 || Width > 4096 || Height > 4096) throw new IOException("The video dimensions are unsupported.");
                var strideKey = new Guid("644b4e48-1e02-4516-b0eb-c01ca9d49ac6"); uint rawStride;
                stride = Method<GetUInt32>(actualType, 7)(actualType, ref strideKey, out rawStride) >= 0 ? unchecked((int)rawStride) : Width * 4;
                if (Math.Abs((long)stride) < Width * 4 || Math.Abs((long)stride) > Width * 4 + 4096) throw new IOException("The video stride is unsupported.");
                ReadNext(); Frame = next; next = null;
                if (Frame == null) throw new IOException("The video contains no readable frames.");
                ReadNext(); clock.Start();
            } catch { Dispose(); throw; }
            finally { Release(ref attributes); Release(ref mediaType); Release(ref actualType); }
        }

        void ReadNext() {
            for (var attempt = 0; attempt < 16; attempt++) {
                IntPtr sample = IntPtr.Zero, buffer = IntPtr.Zero;
                try {
                    uint actual, flags; long timestamp;
                    Check(Method<ReadSample>(reader, 9)(reader, VideoStream, 0, out actual, out flags, out timestamp, out sample));
                    if ((flags & 1) != 0) throw new IOException("The video decoder stopped.");
                    if (sample == IntPtr.Zero) {
                        if ((flags & 2) != 0) { ended = true; nextTime = lastTime + frameInterval; return; }
                        continue;
                    }
                    Check(Method<SampleBuffer>(sample, 41)(sample, out buffer));
                    IntPtr data; uint capacity, length;
                    Check(Method<LockBuffer>(buffer, 3)(buffer, out data, out capacity, out length));
                    try {
                        if (length < Math.Abs((long)stride) * Height) throw new IOException("The decoded video frame is incomplete.");
                        next = new Bitmap(Width, Height, PixelFormat.Format32bppRgb);
                        var pixels = next.LockBits(new Rectangle(0, 0, Width, Height), ImageLockMode.WriteOnly, PixelFormat.Format32bppRgb);
                        try { for (var row = 0; row < Height; row++) CopyMemory(IntPtr.Add(pixels.Scan0, row * pixels.Stride), IntPtr.Add(data, (stride < 0 ? Height - 1 - row : row) * Math.Abs(stride)), new UIntPtr((uint)(Width * 4))); }
                        finally { next.UnlockBits(pixels); }
                    } finally { Check(Method<UnlockBuffer>(buffer, 4)(buffer)); }
                    nextTime = timestamp;
                    if (timestamp > lastTime) frameInterval = timestamp - lastTime;
                    lastTime = timestamp; DecodedFrames++; return;
                } finally { Release(ref buffer); Release(ref sample); }
            }
            throw new IOException("The video contains no presentation samples.");
        }

        public bool Advance() {
            var changed = false;
            for (var count = 0; count < 8 && clock.ElapsedMilliseconds * 10000 >= nextTime; count++) {
                if (ended) {
                    var format = Guid.Empty; var position = new Position { Type = 20, Value = 0 };
                    Check(Method<SetPosition>(reader, 8)(reader, ref format, ref position));
                    ended = false; lastTime = 0; Loops++; clock.Restart(); ReadNext();
                }
                if (next != null) { if (Frame != null) Frame.Dispose(); Frame = next; next = null; changed = true; ReadNext(); }
            }
            return changed;
        }
        public void Pause() { clock.Stop(); }
        public void Play() { clock.Start(); }
        public void Dispose() {
            clock.Stop(); if (Frame != null) { Frame.Dispose(); Frame = null; } if (next != null) { next.Dispose(); next = null; }
            Release(ref reader); Release(ref byteStream); Release(ref stream);
            if (started) { MFShutdown(); started = false; }
        }
    }
}
