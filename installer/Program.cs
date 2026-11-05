/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace KittencordSetup {
    public static class Program {
        public const string MaintainerName = "xtufa7";
        public const string MaintainerUrl = "https://github.com/xtufa7";
        public static Dictionary<string, string> Metadata;
        public static string DataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Kittencord");
        /// <summary>Set by tests; skips download and embedded resources.</summary>
        public static byte[] CoreOverride;
        /// <summary>A local core file from --core (plain or gzip-compressed ASAR), for offline installs.</summary>
        public static string CorePath;
        const long MaxCoreBytes = 512L * 1024 * 1024;

        static byte[] Inflate(byte[] bytes) {
            if (bytes.Length < 2 || bytes[0] != 0x1f || bytes[1] != 0x8b) return bytes;
            using (var input = new GZipStream(new MemoryStream(bytes), CompressionMode.Decompress)) using (var output = new MemoryStream()) {
                var buffer = new byte[81920]; int read;
                while ((read = input.Read(buffer, 0, buffer.Length)) > 0) { output.Write(buffer, 0, read); if (output.Length > MaxCoreBytes) throw new IOException("The Kittencord core is larger than expected. Nothing was changed."); }
                return output.ToArray();
            }
        }

        /// <summary>
        /// Release setups do not carry the core: it is downloaded from the KittenCord GitHub release the setup belongs to
        /// and must match the SHA-256 compiled into this setup before anything is installed.
        /// </summary>
        public static byte[] CoreBytes(Action<InstallProgress> progress) {
            byte[] bytes;
            if (CoreOverride != null) bytes = CoreOverride;
            else if (CorePath != null) bytes = Inflate(File.ReadAllBytes(CorePath));
            else {
                using (var embedded = Assembly.GetExecutingAssembly().GetManifestResourceStream("core.asar")) {
                    if (embedded != null) { using (var memory = new MemoryStream()) { embedded.CopyTo(memory); bytes = memory.ToArray(); } }
                    else bytes = Inflate(Download(progress));
                }
            }
            if (InstallService.Hash(bytes) != Metadata["sha256"]) throw new IOException("The downloaded Kittencord core does not match this setup. Nothing was changed. Download setup again from the official GitHub release.");
            return bytes;
        }

        static byte[] Download(Action<InstallProgress> progress) {
            string url;
            if (!Metadata.TryGetValue("coreUrl", out url) || String.IsNullOrEmpty(url) || !url.StartsWith("https://github.com/", StringComparison.Ordinal)) throw new IOException("This setup has no download address for the Kittencord core.");
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            progress(new InstallProgress("verify", "Downloading Kittencord " + Metadata["version"] + " from GitHub...", false));
            try {
                var request = (HttpWebRequest)WebRequest.Create(url);
                request.UserAgent = "KittencordSetup/" + Metadata["version"]; request.AllowAutoRedirect = true; request.Timeout = 30000; request.ReadWriteTimeout = 60000;
                using (var response = (HttpWebResponse)request.GetResponse()) using (var body = response.GetResponseStream()) using (var memory = new MemoryStream()) {
                    var total = response.ContentLength; var buffer = new byte[81920]; int read, lastPercent = -5;
                    while ((read = body.Read(buffer, 0, buffer.Length)) > 0) {
                        memory.Write(buffer, 0, read);
                        if (memory.Length > MaxCoreBytes) throw new IOException("The download is larger than expected. Nothing was changed.");
                        if (total > 0) { var percent = (int)(memory.Length * 100 / total); if (percent >= lastPercent + 5) { lastPercent = percent; progress(new InstallProgress("verify", "Downloading Kittencord... " + percent + "%", false)); } }
                    }
                    return memory.ToArray();
                }
            } catch (WebException problem) {
                throw new IOException("Kittencord could not be downloaded from GitHub (" + problem.Message + "). Check your connection and try again. Nothing was changed.", problem);
            }
        }

        public static byte[] Resource(string name) {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) {
                if (stream == null) throw new IOException("Missing installer resource: " + name);
                using (var memory = new MemoryStream()) { stream.CopyTo(memory); return memory.ToArray(); }
            }
        }
        public static void Restart(string target) {
            var previous = Environment.GetEnvironmentVariable("ELECTRON_RUN_AS_NODE");
            try {
                Environment.SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", null);
                Process.Start(new ProcessStartInfo(Path.Combine(target, "Discord.exe")) { WorkingDirectory = target, UseShellExecute = true });
            } finally { Environment.SetEnvironmentVariable("ELECTRON_RUN_AS_NODE", previous); }
        }
        internal static string RecordEvent(string action, string target, Exception problem) {
            try {
                string revision; Metadata.TryGetValue("setupRevision", out revision);
                string journalPath = null, journalSha256 = null;
                if (!String.IsNullOrEmpty(target)) { journalPath = InstallService.StatePath(DataRoot, target); if (File.Exists(journalPath)) journalSha256 = InstallService.FileHash(journalPath); }
                var observed = new Dictionary<string, string>();
                if (problem != null) foreach (var key in new[] { "journalPath", "journalVersion", "recordedLoaderHash", "actualLoaderHash" }) if (problem.Data.Contains(key)) observed[key] = Convert.ToString(problem.Data[key]);
                var entry = new { utc = DateTime.UtcNow.ToString("o"), pid = Process.GetCurrentProcess().Id, action, executable = Assembly.GetExecutingAssembly().Location, setupRevision = revision, dataRoot = DataRoot, target, journalPath, journalSha256, error = problem == null ? null : problem.Message, diagnosis = problem == null ? null : InstallService.Diagnose(problem), observed };
                var file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "setup-diagnostics.jsonl");
                File.AppendAllText(file, InstallService.Json.Serialize(entry) + Environment.NewLine);
                return file;
            } catch (IOException) { return null; } catch (UnauthorizedAccessException) { return null; } catch (ArgumentException) { return null; }
        }
        [STAThread]
        public static int Main(string[] args) {
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            string report = null;
            try {
                Metadata = InstallService.Json.Deserialize<Dictionary<string, string>>(System.Text.Encoding.UTF8.GetString(Resource("metadata.json")));
                if ((args.Length == 2 || args.Length == 4 && args[2] == "--preview-state") && args[0] == "--preview") {
                    if (args.Length == 4 && args[3].StartsWith("credits")) { using (var form = new CreditsForm(Metadata["artwork"] == "mekaiime-user-supplied")) { form.SelectTab(args[3] == "credits-license" ? 1 : args[3] == "credits-artwork" ? 2 : args[3] == "credits-tools" ? 3 : 0); Capture(form, args[1]); } }
                    else using (var form = new SetupForm()) { if (args.Length == 4) form.Preview(args[3]); Capture(form, args[1]); }
                    return 0;
                }
                if (args.Length == 0) { Application.Run(new SetupForm()); return 0; }
                string action = null, target = null; bool close = false, restart = false;
                for (var i = 0; i < args.Length; i++) {
                    if (args[i] == "--install" || args[i] == "--repair" || args[i] == "--uninstall" || args[i] == "--recover" || args[i] == "--verify" || args[i] == "--repair-record") { if (action != null) throw new IOException("Choose one installer action."); action = args[i]; }
                    else if (args[i] == "--discord" && i + 1 < args.Length) target = args[++i];
                    else if (args[i] == "--report" && i + 1 < args.Length) report = args[++i];
                    else if (args[i] == "--close-discord") close = true;
                    else if (args[i] == "--restart") restart = true;
                    else if (args[i] == "--core" && i + 1 < args.Length) CorePath = Path.GetFullPath(args[++i]);
                    else throw new IOException("Unknown or incomplete installer argument.");
                }
                if (target == null || action == null) throw new IOException("An explicit action and --discord app-directory are required.");
                if (action == "--verify" && (close || restart)) throw new IOException("Verification does not close or restart Discord.");
                if (action == "--repair-record" && (close || restart)) throw new IOException("Record repair does not close or restart Discord.");
                if (report != null && File.Exists(report)) throw new IOException("Report already exists. Choose a new report file.");
                using (var mutex = new Mutex(false, "Local\\KittencordSetup")) {
                    if (!mutex.WaitOne(0)) throw new IOException("Another Kittencord installer is active.");
                    try {
                        Installation inspected = null;
                        if (action == "--verify") inspected = InstallService.Verify(target, DataRoot);
                        else if (action == "--repair-record") inspected = InstallService.RepairRecord(target, DataRoot);
                        else if (action == "--uninstall") InstallService.Uninstall(target, DataRoot, close, message => {});
                        else if (action == "--recover") InstallService.Recover(target, DataRoot, close, message => {});
                        else InstallService.Install(target, DataRoot, CoreBytes(message => {}), Metadata["sha256"], Metadata["version"], close, message => {}, null);
                        if (restart) Restart(target);
                        if (report != null) File.WriteAllText(report, InstallService.Json.Serialize(new { success = true, action, version = Metadata["version"], coreSha256 = Metadata["sha256"], target = InstallService.Full(target), restarted = restart, signed = false, installedVersion = inspected == null ? null : inspected.Version, recordNeedsRepair = inspected != null && inspected.RecordNeedsRepair }));
                    } finally { mutex.ReleaseMutex(); }
                }
                return 0;
            } catch (Exception problem) {
                if (report != null && !File.Exists(report)) File.WriteAllText(report, InstallService.Json.Serialize(new { success = false, error = problem.Message, diagnosis = InstallService.Diagnose(problem) }));
                else MessageBox.Show(problem.Message, "Kittencord setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
        static void Capture(Form form, string path) { form.Show(); var clock = Stopwatch.StartNew(); while (clock.ElapsedMilliseconds < 700) { Application.DoEvents(); Thread.Sleep(10); } using (var bitmap = new Bitmap(form.Width, form.Height)) { form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size)); bitmap.Save(path, ImageFormat.Png); } }
    }

    public abstract class BackdropForm : Form {
        Bitmap backdrop;
        protected abstract void RenderBackdrop(Graphics graphics);
        void EnsureBackdrop() {
            if (backdrop != null) return;
            backdrop = new Bitmap(ClientSize.Width, ClientSize.Height, PixelFormat.Format32bppPArgb);
            using (var graphics = Graphics.FromImage(backdrop)) RenderBackdrop(graphics);
        }
        protected override void OnPaintBackground(PaintEventArgs e) { EnsureBackdrop(); e.Graphics.DrawImageUnscaled(backdrop, Point.Empty); }
        protected void RefreshBackdrop() { if (backdrop != null) { backdrop.Dispose(); backdrop = null; } Invalidate(true); }
        public void PaintChildSurface(Rectangle bounds, Graphics graphics) {
            EnsureBackdrop();
            graphics.DrawImage(backdrop, new Rectangle(Point.Empty, bounds.Size), bounds, GraphicsUnit.Pixel);
        }
        protected override void OnClientSizeChanged(EventArgs e) {
            if (backdrop != null) { backdrop.Dispose(); backdrop = null; }
            base.OnClientSizeChanged(e);
        }
        protected override void Dispose(bool disposing) { if (disposing && backdrop != null) backdrop.Dispose(); base.Dispose(disposing); }
    }

    public sealed class SetupForm : BackdropForm {
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr first, IntPtr second);
        [DllImport("user32.dll")] static extern bool SystemParametersInfo(uint action, uint parameter, [MarshalAs(UnmanagedType.Bool)] out bool value, uint flags);
        readonly InstallationPicker target = new InstallationPicker();
        readonly CheckBox restart = new SetupToggle();
        readonly Label status = new Label();
        readonly Button install;
        readonly Button restore;
        readonly Button browse;
        readonly Button verify;
        readonly Image artwork;
        readonly Image brandLogo;
        VideoBackdrop video;
        readonly System.Windows.Forms.Timer videoTimer = new System.Windows.Forms.Timer { Interval = 33 };
        readonly Button playback;
        readonly Label title;
        readonly Label subtitle;
        readonly Label[] steps = new Label[7];
        readonly List<Control> setupControls = new List<Control>();
        readonly StageMeter meter = new StageMeter();
        readonly Button done;
        readonly Button retry;
        readonly Button back;
        readonly Label failure;
        string[] stageIds;
        int completedStages;
        bool busy;
        bool lastRemove;
        bool retryRestart;
        bool retryVerify;
        public SetupForm() {
            Text = "Kittencord Setup"; Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); FormBorderStyle = FormBorderStyle.None; ClientSize = new Size(1040, 680); MinimumSize = Size; MaximumSize = Size;
            MaximizeBox = false; StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(23, 18, 31); ForeColor = Color.FromArgb(242, 234, 244);
            Font = new Font("Segoe UI", 10); AutoScaleMode = AutoScaleMode.None; DoubleBuffered = true;
            if (Program.Metadata["artwork"] == "mambo-user-supplied-video") {
                Opacity = 0.94;
                try { video = new VideoBackdrop(Program.Resource("video.mp4")); video.Pause(); }
                catch (Exception problem) { if (!(problem is COMException || problem is IOException || problem is DllNotFoundException || problem is EntryPointNotFoundException)) throw; Program.RecordEvent("video-unavailable", null, problem); }
                videoTimer.Tick += delegate {
                    if (WindowState == FormWindowState.Minimized || !Visible) { if (video != null) video.Pause(); return; }
                    if (video != null) video.Play();
                    try { if (video != null && video.Advance()) RefreshBackdrop(); }
                    catch (Exception problem) { if (!(problem is COMException || problem is IOException)) throw; SetVideoPlayback(false); playback.Enabled = false; Program.RecordEvent("video-stopped", null, problem); }
                };
                Shown += delegate { bool animations; if (video != null) SetVideoPlayback(!SystemParametersInfo(0x1042, 0, out animations, 0) || animations); };
            }
            if (Program.Metadata["artwork"] == "mekaiime-user-supplied") { using (var memory = new MemoryStream(Program.Resource("artwork.png"))) using (var image = Image.FromStream(memory)) artwork = new Bitmap(image); }
            using (var memory = new MemoryStream(Program.Resource("brand-logo.png"))) using (var image = Image.FromStream(memory)) brandLogo = new Bitmap(image);
            using (var outline = RoundedButton.Outline(new Rectangle(0, 0, Width, Height), 12)) Region = new Region(outline);
            AddLabel("Kittencord", 44, 27, 220, 38, 21, true);
            string beta; if (!Program.Metadata.TryGetValue("betaSequence", out beta)) beta = "1";
            var version = AddLabel("BETA " + beta + "  /  " + Program.Metadata["version"], 46, 72, 320, 24, 9, false); version.ForeColor = Color.FromArgb(189, 176, 205);
            AddLabel("Your Discord.\nYour way.", 44, 463, 386, 108, 26, true);
            title = AddLabel("Install Kittencord", 498, 155, 466, 44, 26, true);
            subtitle = AddLabel("Choose your Discord installation.", 500, 207, 464, 28, 11, false); subtitle.ForeColor = Color.FromArgb(202, 192, 215);
            setupControls.Add(AddLabel("Discord installation", 500, 252, 464, 25, 10, true));
            target.SetBounds(500, 286, 464, 74); target.AccessibleName = "Discord installation"; target.Font = Font; target.BackColor = Color.FromArgb(38, 33, 47); target.ForeColor = ForeColor;
            var discovered = InstallService.Discover(); foreach (var directory in discovered) target.AddPath(directory); if (discovered.Length > 0) target.AddPath(discovered[0]); Controls.Add(target);
            browse = AddButton("Choose folder", 786, 368, 178, false, delegate { using (var dialog = new FolderBrowserDialog { Description = "Select the app-VERSION folder containing Discord.exe", ShowNewFolderButton = false }) if (dialog.ShowDialog(this) == DialogResult.OK) target.AddPath(dialog.SelectedPath); });
            ((RoundedButton)browse).Quiet = true; ((RoundedButton)browse).Symbol = "folder"; browse.Height = 32;
            verify = AddButton("Check installation", 500, 368, 240, false, async delegate { await CheckInstallation(); }); ((RoundedButton)verify).Quiet = true; ((RoundedButton)verify).Symbol = "check"; verify.Height = 32; verify.Enabled = target.SelectedPath.Length > 0;
            target.SelectionChanged += delegate { install.Enabled = restore.Enabled = verify.Enabled = target.SelectedPath.Length > 0; };
            restart.Text = "Restart Discord after setup"; restart.Checked = true; restart.BackColor = Color.Transparent; restart.SetBounds(500, 411, 464, 50); Controls.Add(restart);
            install = AddButton("Install / Repair", 500, 479, 464, true, async delegate { await Run(false); }); install.Height = 48; ((RoundedButton)install).Symbol = "arrow"; install.Enabled = target.SelectedPath.Length > 0;
            restore = AddButton("Restore previous installation", 500, 537, 464, false, async delegate { if (MessageBox.Show(this, "Restore the loader used before Kittencord? Kittencord settings and backups will be kept.", "Restore", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK) await Run(true); }); restore.Height = 38; ((RoundedButton)restore).Quiet = true; ((RoundedButton)restore).Symbol = "restore";
            restore.Enabled = target.SelectedPath.Length > 0;
            setupControls.AddRange(new Control[] { target, browse, verify, restart, install, restore });
            status.SetBounds(500, 595, 464, 25); status.BackColor = Color.Transparent; status.ForeColor = Color.FromArgb(163, 151, 181); status.Font = new Font("Segoe UI", 9); status.Text = "Your settings and a recovery copy are kept."; Controls.Add(status);
            for (var i = 0; i < steps.Length; i++) { steps[i] = AddLabel("", 500, 250 + i * 31, 464, 26, 10, false); steps[i].Visible = false; }
            meter.SetBounds(500, 487, 464, 8); meter.Maximum = 7; meter.Visible = false; Controls.Add(meter);
            done = AddButton("All done. You can close me", 500, 561, 464, true, delegate { Close(); }); done.Height = 48; ((RoundedButton)done).Symbol = "check"; done.Visible = false;
            failure = AddLabel("", 500, 255, 464, 205, 11, false); failure.ForeColor = Color.FromArgb(246, 189, 204); failure.Visible = false; failure.AccessibleName = "Setup error";
            retry = AddButton("Try again", 500, 479, 464, true, async delegate { if (retryVerify) await CheckInstallation(); else await Run(lastRemove, retryRestart); }); retry.Height = 48; ((RoundedButton)retry).Symbol = "restore"; retry.Visible = false; retry.AccessibleName = "Retry setup";
            back = AddButton("Back to setup", 500, 537, 464, false, delegate { ResetSetup(); }); back.Height = 38; ((RoundedButton)back).Quiet = true; back.Visible = false;
            var credits = AddButton(Program.MaintainerName, 36, 601, 130, false, delegate { Process.Start(new ProcessStartInfo(Program.MaintainerUrl) { UseShellExecute = true }); }); ((RoundedButton)credits).Quiet = true; ((RoundedButton)credits).Symbol = "github"; credits.AccessibleDescription = Program.MaintainerUrl;
            if (video != null) { playback = AddButton("Play video", 278, 601, 152, false, delegate { SetVideoPlayback(!videoTimer.Enabled); }); ((RoundedButton)playback).Quiet = true; playback.Height = 34; playback.Font = new Font("Segoe UI", 9); playback.AccessibleName = "Toggle background video"; }
            var footer = AddLabel("Kittencord " + Program.Metadata["version"] + " Beta " + beta, 44, 644, 386, 22, 9, false); footer.ForeColor = Color.FromArgb(212, 202, 222);
            var license = new LinkLabel { Text = "Credits & license", UseMnemonic = false, BackColor = Color.Transparent, LinkBehavior = LinkBehavior.HoverUnderline, LinkColor = Color.FromArgb(205, 191, 230) }; license.SetBounds(500, 644, 464, 28); license.LinkClicked += delegate { ShowCredits(); }; Controls.Add(license);
            var close = AddButton("", 968, 23, 40, false, delegate { Close(); }); ((RoundedButton)close).Quiet = true; ((RoundedButton)close).Symbol = "close"; close.AccessibleName = "Close installer"; close.TabIndex = 20; CancelButton = close; AcceptButton = install;
            Shown += async delegate {
                ActiveControl = install;
                if (target.SelectedPath.Length > 0 && File.Exists(InstallService.StatePath(Program.DataRoot, target.SelectedPath))) await CheckInstallation();
            };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) { e.Cancel = true; status.Text = "Wait for installation or restoration to finish before closing."; } };
        }
        Label AddLabel(string text, int x, int y, int width, int height, float size, bool bold) {
            var label = new Label { Text = text, UseMnemonic = false, BackColor = Color.Transparent, Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular) }; label.SetBounds(x, y, width, height); label.MouseDown += DragWindow; Controls.Add(label); return label;
        }
        Button AddButton(string text, int x, int y, int width, bool primary, EventHandler handler) {
            var button = new RoundedButton { Text = text, Accent = primary, Font = new Font("Segoe UI", 11, primary ? FontStyle.Bold : FontStyle.Regular), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand, BackColor = primary ? Color.FromArgb(200, 181, 246) : Color.FromArgb(39, 33, 48), ForeColor = primary ? Color.FromArgb(30, 22, 46) : ForeColor };
            button.FlatAppearance.BorderSize = 0; button.SetBounds(x, y, width, 42); button.Click += handler; Controls.Add(button); return button;
        }
        void ShowCredits() {
            using (var dialog = new CreditsForm(artwork != null)) dialog.ShowDialog(this);
        }
        void SetVideoPlayback(bool playing) { videoTimer.Enabled = playing; if (playing) video.Play(); else video.Pause(); playback.Text = playing ? "Pause video" : "Play video"; }
        void DragWindow(object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(Handle, 0xA1, new IntPtr(2), IntPtr.Zero); } }
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); DragWindow(this, e); }
        void BeginStages(bool remove, bool shouldRestart) {
            AcceptButton = null; ActiveControl = null;
            retryVerify = false;
            done.Visible = retry.Visible = back.Visible = failure.Visible = false;
            title.Font = new Font("Segoe UI", 26, FontStyle.Bold);
            foreach (var control in setupControls) control.Visible = false;
            title.Text = remove ? "Restoring Discord" : "Installing Kittencord";
            subtitle.Text = "Keep this window open until setup finishes.";
            stageIds = remove ? new[] { "verify", "close", "restore", "commit" } : new[] { "verify", "close", "core", "backup", "activate", "commit" };
            var labels = remove ? new[] { "Verify installation & recovery copy", "Close selected Discord", "Restore previous loader", "Save restoration record" } : new[] { "Verify core & Discord installation", "Close selected Discord", "Copy versioned Kittencord core", "Preserve previous loader", "Inject & verify app.asar loader", "Save recovery record" };
            if (shouldRestart) { var ids = new List<string>(stageIds); ids.Add("restart"); stageIds = ids.ToArray(); var names = new List<string>(labels); names.Add("Request Discord restart"); labels = names.ToArray(); }
            for (var i = 0; i < steps.Length; i++) { steps[i].Visible = i < labels.Length; steps[i].Text = i < labels.Length ? "○  " + labels[i] : ""; steps[i].ForeColor = Color.FromArgb(164, 147, 173); }
            completedStages = 0; meter.Maximum = stageIds.Length; meter.Value = 0; meter.Visible = true;
            status.SetBounds(500, 510, 464, 44); status.Text = "Preparing setup...";
        }
        void Progress(InstallProgress update) {
            status.Text = update.Message;
            var index = Array.IndexOf(stageIds, update.Stage);
            if (index < 0) return;
            var label = steps[index]; var text = label.Text.Length > 3 ? label.Text.Substring(3) : label.Text;
            label.Text = (update.Completed ? "✓  " : "›  ") + text;
            label.ForeColor = update.Completed ? Color.FromArgb(153, 221, 183) : Color.FromArgb(242, 234, 244);
            if (update.Completed) { completedStages++; meter.Value = Math.Min(completedStages, meter.Maximum); }
        }
        void Complete(bool remove, bool restarted) {
            retry.Visible = back.Visible = failure.Visible = false;
            done.Text = "All done. You can close me"; ((RoundedButton)done).Symbol = "check";
            title.Text = remove ? "✓ Previous loader restored" : "✓ You're all set!";
            title.Font = new Font("Segoe UI", remove ? 19 : 23, FontStyle.Bold);
            subtitle.Text = "All done. You can close this window now.";
            status.Text = remove ? "Kittencord settings and backups were kept." : restarted ? "Discord restart requested. Find Kittencord in Settings." : "Open Discord when you're ready. Find Kittencord in Settings.";
            done.Visible = true; AcceptButton = done;
        }
        void Failed(string message, bool operationCompleted) {
            foreach (var step in steps) step.Visible = false;
            meter.Visible = done.Visible = false;
            retryRestart = operationCompleted;
            title.Font = new Font("Segoe UI", 23, FontStyle.Bold);
            title.Text = operationCompleted ? "Discord didn't restart" : "Setup needs attention";
            subtitle.Text = operationCompleted ? (lastRemove ? "Restoration finished. Retry only restarts Discord." : "Kittencord is installed. Retry only restarts Discord.") : "Fix the issue, then try again or change your options.";
            failure.Text = message; failure.Visible = true;
            retry.Text = operationCompleted ? "Restart Discord" : "Try again"; retry.Visible = back.Visible = true;
            status.SetBounds(500, 595, 464, 25); status.Text = "Your selected folder and options are kept.";
            AcceptButton = retry; ActiveControl = retry;
        }
        void ResetSetup() {
            retryVerify = false;
            foreach (var step in steps) step.Visible = false;
            meter.Visible = done.Visible = retry.Visible = back.Visible = failure.Visible = false;
            foreach (var control in setupControls) control.Visible = true;
            title.Font = new Font("Segoe UI", 26, FontStyle.Bold); title.Text = "Install Kittencord"; subtitle.Text = "Choose your Discord installation.";
            status.SetBounds(500, 595, 464, 25); status.Text = "Your settings and a recovery copy are kept.";
            AcceptButton = install; ActiveControl = install;
        }
        async Task CheckInstallation() {
            if (busy) return;
            var directory = target.SelectedPath;
            Program.RecordEvent("check-started", directory, null);
            ResetSetup();
            busy = true; install.Enabled = restore.Enabled = browse.Enabled = verify.Enabled = target.Enabled = restart.Enabled = false;
            try {
                var state = await Task.Run(() => {
                    using (var mutex = new Mutex(false, "Local\\KittencordSetup")) {
                        if (!mutex.WaitOne(0)) throw new IOException("Another Kittencord installer is active. Wait for it to finish, then try again.");
                        try { return InstallService.RepairRecord(directory, Program.DataRoot); }
                        finally { mutex.ReleaseMutex(); }
                    }
                });
                subtitle.Text = "Installed v" + state.Version + ". Integrity and recovery copy checked.";
                Program.RecordEvent("check-completed", directory, null);
            } catch (Exception problem) {
                lastRemove = false;
                foreach (var control in setupControls) control.Visible = false;
                var diagnosis = InstallService.Diagnose(problem);
                Failed(diagnosis.Message, false);
                if (Program.RecordEvent("check-failed", directory, problem) != null) status.Text = "Details saved beside setup in setup-diagnostics.jsonl";
                retryVerify = diagnosis.Code != "CORE_CHANGED";
                if (!retryVerify) retry.Text = "Install / Repair";
            } finally { busy = false; browse.Enabled = target.Enabled = restart.Enabled = true; install.Enabled = restore.Enabled = verify.Enabled = target.SelectedPath.Length > 0; }
        }
        public void Preview(string state) {
            if (state != "progress" && state != "complete" && state != "error") throw new IOException("Unknown preview state.");
            BeginStages(false, true);
            for (var i = 0; i < (state == "complete" ? stageIds.Length : 3); i++) Progress(new InstallProgress(stageIds[i], "Preview of setup stages. No installation was performed.", true));
            if (state == "complete") Complete(false, true);
            else if (state == "progress") Progress(new InstallProgress("backup", "Preserving the previous app.asar loader...", false));
            else Failed("Preview: Discord is still running. Close the selected Discord instance and try again. No successful installation was confirmed.", false);
            subtitle.Text = "UI preview only · No installation performed";
        }
        internal async Task Run(bool remove, bool restartOnly = false) {
            if (busy) return;
            var directory = target.SelectedPath; var shouldRestart = restart.Checked;
            var action = restartOnly ? "restart" : remove ? "restore" : "install";
            Program.RecordEvent(action + "-started", directory, null);
            lastRemove = remove;
            busy = true; install.Enabled = restore.Enabled = browse.Enabled = verify.Enabled = target.Enabled = restart.Enabled = false;
            BeginStages(remove, shouldRestart);
            var operationCompleted = restartOnly;
            try {
                await Task.Run(delegate {
                    using (var mutex = new Mutex(false, "Local\\KittencordSetup")) {
                        if (!mutex.WaitOne(0)) throw new IOException("Another Kittencord installer is active.");
                        try {
                            Action<InstallProgress> progress = update => BeginInvoke(new Action(delegate { Progress(update); }));
                            if (!restartOnly) {
                                if (remove) InstallService.Uninstall(directory, Program.DataRoot, shouldRestart, progress);
                                else InstallService.Install(directory, Program.DataRoot, Program.CoreBytes(progress), Program.Metadata["sha256"], Program.Metadata["version"], shouldRestart, progress, null);
                                operationCompleted = true;
                            }
                            if (shouldRestart) { progress(new InstallProgress("restart", "Requesting Discord restart...", false)); Program.Restart(directory); progress(new InstallProgress("restart", "Discord process started. Its interface may still be loading.", true)); }
                        } finally { mutex.ReleaseMutex(); }
                    }
                });
                Complete(remove, shouldRestart);
                Program.RecordEvent(action + "-completed", directory, null);
            } catch (Exception problem) { Failed(InstallService.Diagnose(problem).Message, operationCompleted); if (Program.RecordEvent(action + "-failed", directory, problem) != null) status.Text = "Details saved beside setup in setup-diagnostics.jsonl"; }
            finally { busy = false; browse.Enabled = target.Enabled = restart.Enabled = true; install.Enabled = restore.Enabled = verify.Enabled = target.SelectedPath.Length > 0; }
        }
        protected override void RenderBackdrop(Graphics g) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var background = new SolidBrush(BackColor)) g.FillRectangle(background, ClientRectangle);
            var backgroundImage = video != null && video.Frame != null ? video.Frame : artwork;
            if (backgroundImage != null) {
                var artworkState = g.Save(); g.SetClip(ClientRectangle);
                var scale = Math.Max((float)Width / backgroundImage.Width, (float)Height / backgroundImage.Height) * 1.025f; var width = (int)(backgroundImage.Width * scale); var height = (int)(backgroundImage.Height * scale);
                using (var attributes = new ImageAttributes()) {
                    var matrix = new ColorMatrix { Matrix33 = video == null ? 0.29f : 0.85f }; attributes.SetColorMatrix(matrix);
                    g.DrawImage(backgroundImage, new Rectangle((Width - width) / 2, (Height - height) / 2, width, height), 0, 0, backgroundImage.Width, backgroundImage.Height, GraphicsUnit.Pixel, attributes);
                }
                using (var fade = new LinearGradientBrush(ClientRectangle, Color.FromArgb(20, BackColor), Color.FromArgb(video == null ? 118 : 140, BackColor), 0f)) g.FillRectangle(fade, ClientRectangle);
                using (var fade = new LinearGradientBrush(ClientRectangle, Color.FromArgb(0, BackColor), Color.FromArgb(video == null ? 175 : 110, BackColor), 90f)) g.FillRectangle(fade, ClientRectangle);
                g.Restore(artworkState);
            }
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.DrawImage(brandLogo, video == null ? new Rectangle(50, 105, 380, 380) : new Rectangle(46, 112, 150, 150));
            using (var outline = RoundedButton.Outline(new Rectangle(0, 0, Width - 1, Height - 1), 12)) using (var border = new Pen(Color.FromArgb(92, 110, 78, 120))) g.DrawPath(border, outline);
        }
        protected override void Dispose(bool disposing) { if (disposing) { videoTimer.Dispose(); if (video != null) video.Dispose(); if (artwork != null) artwork.Dispose(); brandLogo.Dispose(); } base.Dispose(disposing); }
    }
    public class RoundedButton : Button {
        public bool Accent;
        public bool Quiet;
        public string Symbol;
        bool hovered;
        bool pressed;
        static Image githubMark;
        public RoundedButton() { SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.Opaque, true); }
        public static GraphicsPath Outline(Rectangle rect, int radius) {
            var path = new GraphicsPath(); var size = radius * 2;
            path.AddArc(rect.X, rect.Y, size, size, 180, 90); path.AddArc(rect.Right - size, rect.Y, size, size, 270, 90); path.AddArc(rect.Right - size, rect.Bottom - size, size, size, 0, 90); path.AddArc(rect.X, rect.Bottom - size, size, size, 90, 90); path.CloseFigure(); return path;
        }
        protected override void OnMouseEnter(EventArgs e) { hovered = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hovered = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { pressed = e.Button == MouseButtons.Left; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Space) { pressed = true; Invalidate(); } base.OnKeyDown(e); }
        protected override void OnKeyUp(KeyEventArgs e) { pressed = false; Invalidate(); base.OnKeyUp(e); }
        protected override void OnPaintBackground(PaintEventArgs e) { }
        public static void PaintSurface(Control control, Graphics graphics) {
            var form = control.Parent as BackdropForm;
            if (form != null) form.PaintChildSurface(control.Bounds, graphics);
            else graphics.Clear(control.Parent == null ? control.BackColor : control.Parent.BackColor);
        }
        protected override void OnPaint(PaintEventArgs e) {
            var g = e.Graphics; PaintSurface(this, g); g.SmoothingMode = SmoothingMode.AntiAlias;
            using (var path = Outline(new Rectangle(1, 1, Width - 3, Height - 3), Math.Min(6, (Height - 3) / 2))) using (var fill = new SolidBrush(!Enabled ? Color.FromArgb(49, 42, 59) : pressed ? ControlPaint.Dark(BackColor, 0.08f) : hovered ? ControlPaint.Light(BackColor, 0.08f) : BackColor)) {
                if (!Quiet || hovered || pressed) g.FillPath(fill, path);
                if (!Quiet && !Accent) using (var border = new Pen(Color.FromArgb(73, 62, 86))) g.DrawPath(border, path);
                if (Focused && ShowFocusCues) using (var pen = new Pen(Color.FromArgb(220, 205, 253), 2)) g.DrawPath(pen, path);
            }
            var color = Enabled ? ForeColor : Color.FromArgb(155, 140, 165);
            var textWidth = Text.Length == 0 ? 0 : TextRenderer.MeasureText(Text, Font).Width;
            var iconWidth = Symbol == null ? 0 : 26;
            var left = Math.Max(12, (Width - textWidth - iconWidth) / 2);
            if (Symbol != null) DrawSymbol(g, Symbol, new Rectangle(Text.Length == 0 ? (Width - 18) / 2 : left, (Height - 18) / 2, 18, 18), color);
            TextRenderer.DrawText(g, Text, Font, new Rectangle(left + iconWidth, pressed ? 1 : 0, Math.Max(0, Width - left - iconWidth - 8), Height - 1), color, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.PreserveGraphicsClipping);
        }
        public static void DrawSymbol(Graphics g, string symbol, Rectangle rect, Color color) {
            if (symbol == "github") {
                if (githubMark == null) using (var memory = new MemoryStream(Program.Resource("github.png"))) using (var image = Image.FromStream(memory)) githubMark = new Bitmap(image);
                g.DrawImage(githubMark, rect); return;
            }
            var state = g.Save(); g.TranslateTransform(rect.X, rect.Y); g.ScaleTransform(rect.Width / 18f, rect.Height / 18f);
            using (var pen = new Pen(color, 1.6f)) {
                pen.StartCap = pen.EndCap = LineCap.Round; pen.LineJoin = LineJoin.Round;
                if (symbol == "close") { g.DrawLine(pen, 5, 5, 13, 13); g.DrawLine(pen, 13, 5, 5, 13); }
                else if (symbol == "folder") g.DrawPolygon(pen, new[] { new Point(2, 4), new Point(7, 4), new Point(9, 6), new Point(16, 6), new Point(16, 15), new Point(2, 15) });
                else if (symbol == "restore") { g.DrawArc(pen, 3, 3, 12, 12, 220, 290); g.DrawLines(pen, new[] { new Point(2, 3), new Point(2, 8), new Point(7, 8) }); }
                else if (symbol == "check") g.DrawLines(pen, new[] { new Point(3, 9), new Point(7, 13), new Point(15, 5) });
                else if (symbol == "chevron") g.DrawLines(pen, new[] { new Point(4, 7), new Point(9, 12), new Point(14, 7) });
                else { g.DrawLine(pen, 2, 9, 15, 9); g.DrawLines(pen, new[] { new Point(10, 4), new Point(15, 9), new Point(10, 14) }); }
            }
            g.Restore(state);
        }
    }
}
