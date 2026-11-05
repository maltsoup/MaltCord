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
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace KittencordSetup {
    public sealed class CreditsForm : BackdropForm {
        [DllImport("user32.dll")] static extern bool ReleaseCapture();
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr handle, int message, IntPtr first, IntPtr second);
        readonly Panel content = new Panel();
        readonly RoundedButton[] tabs = new RoundedButton[4];
        readonly bool suppliedArtwork;
        public CreditsForm(bool supplied) {
            suppliedArtwork = supplied;
            Text = "Kittencord · License & credits"; FormBorderStyle = FormBorderStyle.None; ClientSize = new Size(780, 620);
            StartPosition = FormStartPosition.CenterParent; BackColor = Color.FromArgb(20, 18, 27); ForeColor = Color.FromArgb(241, 235, 246);
            Font = new Font("Segoe UI", 10); AutoScaleMode = AutoScaleMode.None; DoubleBuffered = true;
            using (var outline = RoundedButton.Outline(ClientRectangle, 20)) Region = new Region(outline);
            Label("KITTENCORD  /  OPEN SOURCE", 32, 28, 650, 24, 9, Color.FromArgb(218, 165, 200), true, Controls);
            Label("License & credits", 32, 69, 710, 44, 25, ForeColor, true, Controls);
            Label("The people, artwork and license behind your build.", 34, 118, 700, 26, 11, Color.FromArgb(170, 160, 183), false, Controls);
            var close = Button("", 706, 22, 42, delegate { Close(); }, Controls); close.Quiet = true; close.Symbol = "close"; close.AccessibleName = "Close credits"; CancelButton = close;
            var titles = new[] { "Overview", "GPL license", "Artwork", "Tools" };
            for (var i = 0; i < tabs.Length; i++) { var index = i; tabs[i] = Button(titles[i], 32 + i * 155, 165, 143, delegate { SelectTab(index); }, Controls); }
            content.SetBounds(32, 228, 716, 318); content.BackColor = Color.FromArgb(28, 25, 36); Controls.Add(content);
            Label("v" + Program.Metadata["version"] + "  ·  Development build", 34, 574, 460, 24, 9, Color.FromArgb(156, 146, 170), false, Controls);
            Button("Back to setup", 565, 563, 183, delegate { Close(); }, Controls);
            SelectTab(0);
        }
        static Label Label(string text, int x, int y, int width, int height, float size, Color color, bool bold, Control.ControlCollection controls) {
            var label = new Label { Text = text, UseMnemonic = false, BackColor = Color.Transparent, ForeColor = color, Font = new Font("Segoe UI", size, bold ? FontStyle.Bold : FontStyle.Regular) }; label.SetBounds(x, y, width, height); label.MouseDown += MoveWindow; controls.Add(label); return label;
        }
        static RoundedButton Button(string text, int x, int y, int width, EventHandler action, Control.ControlCollection controls) {
            var button = new RoundedButton { Text = text, Font = new Font("Segoe UI", 10), BackColor = Color.FromArgb(41, 35, 51), ForeColor = Color.FromArgb(233, 224, 240), FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand };
            button.FlatAppearance.BorderSize = 0; button.SetBounds(x, y, width, 40); button.Click += action; controls.Add(button); return button;
        }
        public void SelectTab(int index) {
            if (index < 0 || index >= tabs.Length) throw new ArgumentOutOfRangeException("index");
            for (var i = 0; i < tabs.Length; i++) { tabs[i].Accent = i == index; tabs[i].BackColor = i == index ? Color.FromArgb(200, 181, 246) : Color.FromArgb(41, 35, 51); tabs[i].ForeColor = i == index ? Color.FromArgb(30, 22, 46) : ForeColor; tabs[i].Invalidate(); }
            while (content.Controls.Count > 0) content.Controls[0].Dispose();
            if (index == 1) {
                var text = new TextBox { ReadOnly = true, Multiline = true, BorderStyle = BorderStyle.None, BackColor = content.BackColor, ForeColor = Color.FromArgb(211, 204, 222), Font = new Font("Segoe UI", 10), WordWrap = true, ScrollBars = ScrollBars.Vertical, Text = System.Text.Encoding.UTF8.GetString(Program.Resource("LICENSE")).Replace("\r\n", "\n").Replace("\n", "\r\n"), AccessibleName = "Complete GPL license text", SelectionStart = 0, SelectionLength = 0 };
                text.SetBounds(20, 16, 676, 285); content.Controls.Add(text); return;
            }
            if (index == 2) {
                if (Program.Metadata["artwork"] == "mambo-user-supplied-video") {
                    Label("Mambo video", 24, 22, 665, 36, 19, ForeColor, true, content.Controls);
                    Label("Supplied by the project owner for this personal installer. Looped video only, without audio.", 24, 70, 665, 64, 11, Color.FromArgb(187, 177, 201), false, content.Controls);
                    Label("The original creator and redistribution permission have not been verified. This custom variant is for local use.", 24, 142, 665, 68, 11, Color.FromArgb(187, 177, 201), false, content.Controls);
                    Label("Cosmic Kawaii Cat Orbit Sticker supplied and selected for the installer.", 24, 222, 665, 48, 10, Color.FromArgb(187, 177, 201), false, content.Controls);
                    return;
                }
                Label(suppliedArtwork ? "Artwork by @mekaiime" : "Cosmic Kitten branding", 24, 22, 665, 36, 19, ForeColor, true, content.Controls);
                Label(suppliedArtwork ? "The original artist's work, softly layered behind setup." : "The installer uses the Cosmic Kawaii Cat Orbit Sticker selected for Kittencord.", 24, 70, 665, 44, 11, Color.FromArgb(187, 177, 201), false, content.Controls);
                Label(suppliedArtwork ? "This image was supplied for your local custom build. Attribution does not grant redistribution rights. Permission to publish the artwork has not been verified." : "The emblem was supplied for Kittencord branding. Contributor and source-license notices remain available in the other tabs.", 24, 132, 665, 78, 11, Color.FromArgb(187, 177, 201), false, content.Controls);
                Label("Brand emblem: Cosmic Kawaii Cat Orbit Sticker, supplied and selected by the project owner.", 24, 213, 665, 24, 10, Color.FromArgb(187, 177, 201), false, content.Controls);
                if (suppliedArtwork) Button("View original artwork ↗", 24, 242, 252, delegate { Process.Start(new ProcessStartInfo("https://x.com/mekaiime/status/1521144757543747584") { UseShellExecute = true }); }, content.Controls);
                return;
            }
            if (index == 3) {
                Label("Development tools", 24, 20, 665, 34, 19, ForeColor, true, content.Controls);
                ProjectLink("Monaco Editor", "https://github.com/microsoft/monaco-editor", "Studio editing and code diagnostics", 84);
                ProjectLink("TypeScript", "https://github.com/microsoft/TypeScript", "Type checks and Studio compilation", 128);
                ProjectLink(".NET Framework", "https://learn.microsoft.com/dotnet/framework/", "Native Windows setup and recovery interface", 172);
                Label("The GitHub mark is reused from the upstream source assets. The complete GPL and original third-party notices remain in the source distribution.", 24, 242, 665, 68, 10, Color.FromArgb(187, 177, 201), false, content.Controls);
                return;
            }
            var maintainer = Button(Program.MaintainerName, 14, 14, 150, delegate { Process.Start(new ProcessStartInfo(Program.MaintainerUrl) { UseShellExecute = true }); }, content.Controls); maintainer.Quiet = true; maintainer.Symbol = "github"; maintainer.AccessibleDescription = Program.MaintainerUrl;
            Label("GPL-3.0-or-later", 218, 24, 470, 30, 15, ForeColor, true, content.Controls);
            Label("Kittencord. Independent distribution, tools and recovery.", 24, 67, 665, 34, 11, Color.FromArgb(187, 177, 201), false, content.Controls);
            ProjectLink("TestCord", "https://github.com/TestcordDev/TestCord", "Fork foundation and plugin collection · af92dbaec", 117);
            ProjectLink("Equicord", "https://github.com/Equicord/Equicord", "Client integrations, plugins and tooling", 159);
            ProjectLink("Vencord", "https://github.com/Vendicated/Vencord", "Injection, patching and original plugin APIs", 201);
            Label("Source code, GPL license and contributor credits are included with the release.", 24, 256, 665, 48, 9, Color.FromArgb(164, 153, 179), false, content.Controls);
        }
        void ProjectLink(string name, string url, string contribution, int top) {
            var link = new LinkLabel { Text = name, LinkColor = Color.FromArgb(205, 191, 230), ActiveLinkColor = Color.White, LinkBehavior = LinkBehavior.HoverUnderline, BackColor = Color.Transparent, AccessibleDescription = url };
            link.SetBounds(24, top, 190, 30); link.LinkClicked += delegate { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }; content.Controls.Add(link);
            Label(contribution, 218, top, 470, 34, 10, Color.FromArgb(187, 177, 201), false, content.Controls);
        }
        static void MoveWindow(object sender, MouseEventArgs e) { var control = sender as Control; if (control != null && e.Button == MouseButtons.Left) { ReleaseCapture(); SendMessage(control.FindForm().Handle, 0xA1, new IntPtr(2), IntPtr.Zero); } }
        protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); MoveWindow(this, e); }
        protected override void RenderBackdrop(Graphics graphics) {
            using (var background = new LinearGradientBrush(ClientRectangle, Color.FromArgb(35, 25, 44), BackColor, 70)) graphics.FillRectangle(background, ClientRectangle);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var outline = RoundedButton.Outline(new Rectangle(0, 0, Width - 1, Height - 1), 20)) using (var border = new Pen(Color.FromArgb(77, 63, 92))) graphics.DrawPath(border, outline);
        }
    }
    public sealed class InstallationPicker : RoundedButton {
        readonly List<string> paths = new List<string>();
        readonly ContextMenuStrip menu = new ContextMenuStrip();
        public string SelectedPath { get; private set; }
        public event EventHandler SelectionChanged;
        public InstallationPicker() {
            SelectedPath = ""; AccessibleRole = AccessibleRole.ButtonDropDown; FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0; Cursor = Cursors.Hand;
            menu.BackColor = Color.FromArgb(38, 33, 47); menu.ForeColor = Color.FromArgb(242, 234, 244); menu.ShowImageMargin = false;
        }
        public void AddPath(string path) {
            if (!paths.Contains(path)) paths.Add(path);
            SelectedPath = path; AccessibleDescription = path; Invalidate();
            if (SelectionChanged != null) SelectionChanged(this, EventArgs.Empty);
        }
        static string DisplayName(string path) { return Path.GetFileName(Path.GetDirectoryName(path)) + "  ·  " + Path.GetFileName(path).Replace("app-", ""); }
        protected override void OnClick(EventArgs e) {
            base.OnClick(e); while (menu.Items.Count > 0) menu.Items[0].Dispose();
            menu.Font = Font; menu.MinimumSize = new Size(Width, 0);
            foreach (var directory in paths) {
                var selected = directory;
                var item = new ToolStripMenuItem(DisplayName(directory)) { Checked = directory == SelectedPath, ToolTipText = directory, Padding = new Padding(12, 8, 12, 8), ForeColor = menu.ForeColor, BackColor = menu.BackColor };
                item.Click += delegate { AddPath(selected); }; menu.Items.Add(item);
            }
            if (paths.Count == 0) menu.Items.Add(new ToolStripMenuItem("Use Choose folder to locate Discord") { Enabled = false });
            menu.Show(this, new Point(0, Height + 4));
        }
        protected override void OnPaint(PaintEventArgs e) {
            base.OnPaint(e);
            using (var bold = new Font(Font, FontStyle.Bold)) TextRenderer.DrawText(e.Graphics, SelectedPath.Length > 0 ? DisplayName(SelectedPath) : "No Discord installation selected", bold, new Rectangle(18, 13, Width - 65, 24), ForeColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.PreserveGraphicsClipping);
            TextRenderer.DrawText(e.Graphics, SelectedPath.Length > 0 ? SelectedPath : "Select a folder containing Discord.exe", Font, new Rectangle(18, 40, Width - 65, 21), Color.FromArgb(172, 160, 190), TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.PathEllipsis | TextFormatFlags.PreserveGraphicsClipping);
            DrawSymbol(e.Graphics, "chevron", new Rectangle(Width - 37, (Height - 18) / 2, 18, 18), ForeColor);
        }
        protected override void Dispose(bool disposing) { if (disposing) menu.Dispose(); base.Dispose(disposing); }
    }
    public sealed class SetupToggle : CheckBox {
        public SetupToggle() { SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.Opaque, true); Cursor = Cursors.Hand; }
        protected override void OnCheckedChanged(EventArgs e) { base.OnCheckedChanged(e); Invalidate(); }
        protected override void OnPaintBackground(PaintEventArgs e) { }
        protected override void OnPaint(PaintEventArgs e) {
            var g = e.Graphics; RoundedButton.PaintSurface(this, g); g.SmoothingMode = SmoothingMode.AntiAlias;
            TextRenderer.DrawText(g, Text, Font, new Rectangle(0, 2, Width - 65, 24), ForeColor, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.PreserveGraphicsClipping);
            using (var small = new Font(Font.FontFamily, 9)) TextRenderer.DrawText(g, "Closes the selected Discord installation.", small, new Rectangle(0, 27, Width - 65, 21), Color.FromArgb(163, 151, 181), TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.PreserveGraphicsClipping);
            using (var track = RoundedButton.Outline(new Rectangle(Width - 46, 10, 44, 24), 12)) using (var fill = new SolidBrush(Enabled && Checked ? Color.FromArgb(200, 181, 246) : Color.FromArgb(68, 57, 82))) g.FillPath(fill, track);
            using (var knob = new SolidBrush(Checked ? Color.FromArgb(35, 26, 49) : Color.FromArgb(224, 216, 236))) g.FillEllipse(knob, Width - (Checked ? 23 : 43), 13, 18, 18);
            if (Focused && ShowFocusCues) ControlPaint.DrawFocusRectangle(g, new Rectangle(0, 0, Width - 1, Height - 1), ForeColor, BackColor);
        }
    }
    public sealed class StageMeter : Control {
        public int Maximum = 7;
        int current;
        public int Value { get { return current; } set { current = value; Invalidate(); } }
        public StageMeter() { SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.Opaque, true); }
        protected override void OnPaint(PaintEventArgs e) {
            RoundedButton.PaintSurface(this, e.Graphics);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using (var track = RoundedButton.Outline(new Rectangle(0, 0, Width - 1, Height - 1), 3)) using (var brush = new SolidBrush(Color.FromArgb(54, 44, 65))) e.Graphics.FillPath(brush, track);
            if (Value <= 0) return;
            var width = Math.Max(7, (Width - 1) * Math.Min(Value, Maximum) / Math.Max(1, Maximum));
            using (var fill = RoundedButton.Outline(new Rectangle(0, 0, width, Height - 1), 3)) using (var brush = new LinearGradientBrush(ClientRectangle, Color.FromArgb(172, 146, 224), Color.FromArgb(238, 171, 210), 0f)) e.Graphics.FillPath(brush, fill);
        }
    }
}
