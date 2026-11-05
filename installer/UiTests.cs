/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace KittencordSetup {
    sealed class TestBackdrop : BackdropForm {
        public int Renders;
        protected override void RenderBackdrop(Graphics graphics) {
            Renders++;
            graphics.Clear(Color.Navy);
            graphics.FillRectangle(Brushes.Orange, ClientSize.Width / 2, 0, ClientSize.Width / 2, ClientSize.Height);
        }
    }
    public static class UiTests {
        static void Check(bool value, string message) { if (!value) throw new Exception(message); }
        static IEnumerable<Control> Descendants(Control parent) { foreach (Control child in parent.Controls) { yield return child; foreach (var descendant in Descendants(child)) yield return descendant; } }
        static void RunUi(Func<SetupForm, Task> test) {
            Exception failure = null;
            using (var form = new SetupForm()) {
                form.Shown += async delegate { try { await test(form); } catch (Exception problem) { failure = problem; } finally { form.Close(); } };
                Application.Run(form);
            }
            if (failure != null) throw failure;
        }
        [STAThread]
        public static int Main() {
            try {
                Application.EnableVisualStyles();
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
                Program.DataRoot = Path.Combine(Path.GetTempPath(), "Kittencord-ui-empty-" + Guid.NewGuid().ToString("N"));
                using (var form = new TestBackdrop()) using (var image = new Bitmap(20, 20)) using (var graphics = Graphics.FromImage(image)) {
                    form.ClientSize = new Size(100, 100);
                    graphics.Clear(Color.Lime); graphics.SetClip(new Rectangle(0, 0, 10, 10));
                    form.PaintChildSurface(new Rectangle(70, 20, 20, 20), graphics);
                    Check(image.GetPixel(5, 5).ToArgb() == Color.Orange.ToArgb(), "Child background uses the wrong parent offset.");
                    Check(image.GetPixel(15, 15).ToArgb() == Color.Lime.ToArgb(), "Partial redraw escaped the graphics clip.");
                    form.PaintChildSurface(new Rectangle(70, 20, 20, 20), graphics);
                    Check(form.Renders == 1, "Child redraw repaints the parent recursively.");
                    form.ClientSize = new Size(200, 100);
                    form.PaintChildSurface(new Rectangle(70, 20, 20, 20), graphics);
                    Check(form.Renders == 2 && image.GetPixel(5, 5).ToArgb() == Color.Navy.ToArgb(), "Resized surface reused stale background pixels.");
                }
                Program.Metadata = new Dictionary<string, string> { { "version", "0.7.1" }, { "artwork", "project-original" } };
                using (var form = new CreditsForm(false)) {
                    form.Show(); Application.DoEvents(); form.SelectTab(1);
                    TextBox license = null; foreach (var control in Descendants(form)) if (control.AccessibleName == "Complete GPL license text") license = control as TextBox;
                    Check(license != null && license.ReadOnly && license.Multiline, "Full license is not accessible as read-only selectable text.");
                    Check(license.Text.Replace("\r\n", "\n") == System.Text.Encoding.UTF8.GetString(Program.Resource("LICENSE")).Replace("\r\n", "\n"), "License text was modified or truncated.");
                    form.SelectTab(0); var attribution = ""; foreach (var control in Descendants(form)) attribution += control.Text + "\n";
                    Check(attribution.Contains("TestCord") && attribution.Contains("Equicord") && attribution.Contains("Vencord") && attribution.Contains("Kittencord") && attribution.Contains("xtufa7"), "Contributor or maintainer attribution missing.");
                    var projectLinks = 0; foreach (var control in Descendants(form)) if (control is LinkLabel && control.AccessibleDescription != null && control.AccessibleDescription.StartsWith("https://github.com/")) projectLinks++;
                    Check(projectLinks == 3, "Upstream credit links missing.");
                    form.SelectTab(2); var art = ""; foreach (var control in Descendants(form)) art += control.Text;
                    Check(art.Contains("Cosmic Kitten branding") && !art.Contains("Artwork by @mekaiime"), "Default installer incorrectly attributes supplied artwork.");
                }
                using (var form = new CreditsForm(true)) {
                    form.SelectTab(2); var art = ""; foreach (var control in Descendants(form)) art += control.Text;
                    Check(art.Contains("Artwork by @mekaiime") && art.Contains("Permission to publish the artwork has not been verified"), "Local artwork credit or permission status missing.");
                }
                if (typeof(Program).Assembly.GetManifestResourceNames().Contains("video.mp4")) {
                    Program.Metadata["artwork"] = "mambo-user-supplied-video";
                    RunUi(async form => {
                        Check(form.Opacity < 1 && form.Opacity >= 0.9, "Video setup is not translucent or is unreadable.");
                        var playback = form.Controls.OfType<Button>().Single(button => button.AccessibleName == "Toggle background video");
                        if (playback.Text == "Play video") playback.PerformClick();
                        using (var before = new Bitmap(form.Width, form.Height)) using (var after = new Bitmap(form.Width, form.Height)) {
                            form.DrawToBitmap(before, new Rectangle(Point.Empty, form.Size));
                            await Task.Delay(500);
                            form.DrawToBitmap(after, new Rectangle(Point.Empty, form.Size));
                            var changed = false;
                            for (var y = 100; y < 450; y += 30) for (var x = 220; x < 450; x += 30) if (before.GetPixel(x, y) != after.GetPixel(x, y)) changed = true;
                            Check(changed, "Video frames do not reach the actual setup background.");
                        }
                        playback.PerformClick(); Check(playback.Text == "Play video", "The background video cannot be paused.");
                        Check(form.Controls.OfType<Button>().Any(button => button.Text == "Install / Repair" && button.Visible), "Video obscures the installation controls.");
                    });
                    using (var form = new CreditsForm(false)) { form.SelectTab(2); Check(Descendants(form).Any(control => control.Text == "Mambo video"), "Video attribution is missing."); }
                    Program.Metadata["artwork"] = "project-original";
                }
                using (var form = new SetupForm()) {
                    Console.WriteLine("Checking setup preview states.");
                    form.Show(); Application.DoEvents();
                    var ownerLink = false; foreach (var control in Descendants(form)) if (control.Text == Program.MaintainerName && control.AccessibleDescription == Program.MaintainerUrl) ownerLink = true;
                    Check(ownerLink, "Setup maintainer link missing.");
                    foreach (var state in new[] { "progress", "complete", "error" }) {
                        form.Preview(state); Application.DoEvents();
                        foreach (Control control in form.Controls) if (control.Visible) Check(control.Left >= 0 && control.Top >= 0 && control.Right <= form.ClientSize.Width && control.Bottom <= form.ClientSize.Height, "Visible setup control escapes the window.");
                        if (state == "error") foreach (Control control in form.Controls) if (control.Visible && control is Button) Check(!control.Text.Contains("All done"), "Failure state displays a success button.");
                    }
                }
                var fixture = Path.Combine(Path.GetTempPath(), "Kittencord-retry-ui-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(fixture);
                Program.DataRoot = Path.Combine(fixture, "data"); Program.CoreOverride = System.Text.Encoding.UTF8.GetBytes("kittencord ui test core"); Program.Metadata["sha256"] = InstallService.Hash(Program.CoreOverride);
                RunUi(async form => {
                    Console.WriteLine("Checking same-window retry.");
                    InstallationPicker picker = null; CheckBox restart = null; Button retry = null; Button back = null;
                    foreach (var control in Descendants(form)) {
                        if (control is InstallationPicker) picker = (InstallationPicker)control;
                        if (control is CheckBox) restart = (CheckBox)control;
                        if (control.AccessibleName == "Retry setup") retry = (Button)control;
                        if (control.Text == "Back to setup") back = (Button)control;
                    }
                    Check(picker != null && restart != null && retry != null && back != null, "Retry controls are missing.");
                    picker.AddPath(fixture); restart.Checked = false;
                    await form.Run(false); Check(retry.Visible && retry.Enabled && back.Visible, "Failure prevents retrying in the same window.");
                    await form.Run(false); Check(retry.Visible && !restart.Checked && picker.SelectedPath == fixture, "Repeated failure loses selected options.");
                    back.PerformClick(); Check(picker.Visible && picker.Enabled && restart.Enabled, "Back to setup does not restore editable controls.");
                    var resources = Path.Combine(fixture, "resources"); Directory.CreateDirectory(resources); File.WriteAllText(Path.Combine(fixture, "Discord.exe"), "Not executable.");
                    File.WriteAllText(Path.Combine(resources, "build_info.json"), "{\"version\":\"1.0.9265\"}"); File.WriteAllText(Path.Combine(resources, "app.asar"), "Original fixture archive.");
                    await form.Run(false); Check(!retry.Visible && form.AcceptButton != null && ((Control)form.AcceptButton).Text.Contains("All done"), "Corrected fixture cannot install in the same window.");
                });
                RunUi(async form => {
                    Console.WriteLine("Checking stale record repair without reinstalling.");
                    Descendants(form).OfType<InstallationPicker>().Single().AddPath(fixture);
                    var journal = Directory.GetFiles(Program.DataRoot, "installation-*.json").Single(file => !file.EndsWith(".transaction.json")); var prior = File.ReadAllText(journal);
                    var next = System.Text.Encoding.UTF8.GetBytes("Newer disposable UI core, never executed.");
                    var installed = InstallService.Install(fixture, Program.DataRoot, next, InstallService.Hash(next), "0.7.2", false, update => {}, null);
                    var loader = Path.Combine(fixture, "resources/app.asar/index.js"); var loaderHash = InstallService.FileHash(loader);
                    File.WriteAllText(journal, prior);
                    var verify = Descendants(form).OfType<Button>().Single(control => control.Text == "Check installation"); verify.PerformClick(); var deadline = DateTime.UtcNow.AddSeconds(10);
                    while (!verify.Enabled && DateTime.UtcNow < deadline) await Task.Delay(10);
                    Check(verify.Enabled && InstallService.Verify(fixture, Program.DataRoot).Version == installed.Version && !InstallService.Verify(fixture, Program.DataRoot).RecordNeedsRepair, "Check installation did not reconcile the verified newer record.");
                    Check(InstallService.FileHash(loader) == loaderHash, "Record repair changed the Discord loader.");
                });
                RunUi(async form => {
                    var picker = Descendants(form).OfType<InstallationPicker>().Single(); picker.AddPath(fixture);
                    Descendants(form).OfType<CheckBox>().Single().Checked = false;
                    var retry = Descendants(form).OfType<Button>().Single(control => control.AccessibleName == "Retry setup");
                    var loader = Path.Combine(fixture, "resources/app.asar/index.js"); var original = File.ReadAllText(loader); File.AppendAllText(loader, "Changed.");
                    var journal = Directory.GetFiles(Program.DataRoot, "installation-*.json").Single(file => !file.EndsWith(".transaction.json")); var record = File.ReadAllText(journal);
                    Descendants(form).OfType<Button>().Single(control => control.Text == "Check installation").PerformClick(); var checkDeadline = DateTime.UtcNow.AddSeconds(10);
                    while (!retry.Visible && DateTime.UtcNow < checkDeadline) await Task.Delay(10);
                    Check(retry.Visible, "Verification failure did not expose retry.");
                    var details = File.ReadAllLines(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "setup-diagnostics.jsonl")).Select(line => InstallService.Json.Deserialize<Dictionary<string, object>>(line)).Last(entry => Convert.ToString(entry["action"]) == "check-failed");
                    var observed = (Dictionary<string, object>)details["observed"];
                    Check(Convert.ToString(details["journalPath"]) == journal && Convert.ToString(observed["journalPath"]) == journal && Convert.ToString(observed["journalVersion"]) == "0.7.2", "Failure diagnostics did not identify the actual journal and version read.");
                    retry.PerformClick(); checkDeadline = DateTime.UtcNow.AddSeconds(10);
                    while (!retry.Visible && DateTime.UtcNow < checkDeadline) await Task.Delay(10);
                    Check(retry.Visible && File.ReadAllText(journal) == record && File.ReadAllText(loader).EndsWith("Changed."), "Retry after a failed read-only check altered the installation.");
                    Descendants(form).OfType<Button>().Single(control => control.Text == "Back to setup").PerformClick();
                    await form.Run(false); Check(retry.Visible, "Loader mismatch does not expose retry.");
                    File.WriteAllText(loader, original, new System.Text.UTF8Encoding(false));
                    retry.PerformClick(); var deadline = DateTime.UtcNow.AddSeconds(10);
                    while ((form.AcceptButton == null || ((Control)form.AcceptButton).Text != "All done. You can close me") && DateTime.UtcNow < deadline) await Task.Delay(10);
                    Check(!retry.Visible && form.AcceptButton != null && ((Control)form.AcceptButton).Text.Contains("All done"), "Actual retry button cannot repair after a corrected loader mismatch.");
                    Check(InstallService.Verify(fixture, Program.DataRoot).Version == "0.7.1", "Retry did not commit a verifiable installation.");
                });
                RunUi(async form => {
                    Descendants(form).OfType<InstallationPicker>().Single().AddPath(fixture);
                    Descendants(form).OfType<CheckBox>().Single().Checked = true;
                    var retry = Descendants(form).OfType<Button>().Single(control => control.AccessibleName == "Retry setup");
                    await form.Run(false); Check(retry.Visible && retry.Text == "Restart Discord", "Restart failure is confused with installation failure.");
                    var journal = Directory.GetFiles(Program.DataRoot, "installation-*.json").Single(file => !file.EndsWith(".transaction.json")); var record = File.ReadAllText(journal);
                    retry.PerformClick(); var deadline = DateTime.UtcNow.AddSeconds(10);
                    while (!retry.Visible && DateTime.UtcNow < deadline) await Task.Delay(10);
                    Check(retry.Visible && retry.Text == "Restart Discord" && File.ReadAllText(journal) == record, "Restart-only retry rewrote the installed loader or journal.");
                });
                Console.WriteLine("License fidelity, attribution, artwork scope and setup bounds passed."); return 0;
            } catch (Exception problem) { Console.Error.WriteLine(problem); return 1; }
        }
    }
}
