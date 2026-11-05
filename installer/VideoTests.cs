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
using System.Threading;

namespace KittencordSetup {
    public static class VideoTests {
        static long Fingerprint(Bitmap bitmap) {
            long result = 17;
            for (var y = 0; y < bitmap.Height; y += Math.Max(1, bitmap.Height / 20)) for (var x = 0; x < bitmap.Width; x += Math.Max(1, bitmap.Width / 20)) result = unchecked(result * 31 + bitmap.GetPixel(x, y).ToArgb());
            return result;
        }
        [STAThread]
        public static int Main(string[] args) {
            try {
                using (var video = new VideoBackdrop(File.ReadAllBytes(args[0]))) {
                    if (video.Frame == null || video.Width < 1 || video.Height < 1) throw new Exception("Video did not decode.");
                    var first = Fingerprint(video.Frame); var changed = false; var clock = Stopwatch.StartNew();
                    video.Frame.Save(Path.Combine(args[1], "video-first.png"), ImageFormat.Png);
                    while (clock.ElapsedMilliseconds < 25000 && (video.Loops < 1 || !changed)) {
                        if (video.Advance() && first != Fingerprint(video.Frame)) changed = true;
                        Thread.Sleep(10);
                    }
                    video.Frame.Save(Path.Combine(args[1], "video-playing.png"), ImageFormat.Png);
                    if (!changed || video.Loops < 1 || video.DecodedFrames < 3) throw new Exception("Video did not animate and loop.");
                    Console.WriteLine("Decoded {0}x{1}, {2} frames, {3} loop(s). Video-only source reader; no audio renderer or temporary media file.", video.Width, video.Height, video.DecodedFrames, video.Loops);
                }
                return 0;
            } catch (Exception problem) { Console.Error.WriteLine(problem); return 1; }
        }
    }
}
