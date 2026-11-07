/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace KittencordSetup {
    public static class SelfTests {
        static readonly byte[] Core = Encoding.UTF8.GetBytes("Test core bytes, never executed.");
        static readonly string Digest = InstallService.Hash(Core);
        static readonly List<string> Passed = new List<string>();
        static string root;
        static void Check(bool value, string message) { if (!value) throw new Exception(message); }
        static void Refuses(Action action) { try { action(); } catch (IOException) { return; } throw new Exception("Expected a controlled refusal."); }
        static string Fixture(string name, bool injected) {
            var app = Path.Combine(root, name); var resources = Path.Combine(app, "resources"); Directory.CreateDirectory(resources);
            File.WriteAllText(Path.Combine(app, "Discord.exe"), "Disposable test fixture, not an executable.");
            File.WriteAllText(Path.Combine(resources, "build_info.json"), "{\"version\":\"1.0.9265\"}");
            File.WriteAllText(Path.Combine(resources, injected ? "_app.asar" : "app.asar"), "Original Discord test archive.");
            if (injected) { Directory.CreateDirectory(Path.Combine(resources, "app.asar")); File.WriteAllText(Path.Combine(resources, "app.asar", "index.js"), "require('previous TestCord loader');"); }
            return app;
        }
        static string Data(string app) { return Path.Combine(app, "installer-data"); }
        static Installation Install(string app, string fail) { return InstallService.Install(app, Data(app), Core, Digest, "0.7.0", false, message => {}, fail); }
        static string StateFile(string app) { return Array.Find(Directory.GetFiles(Data(app), "installation-*.json"), file => !file.EndsWith(".transaction.json")); }
        static string StaleRecordFixture(string name, out string stale, out Installation current) {
            var app = Fixture(name, true); Install(app, null); stale = File.ReadAllText(StateFile(app));
            var next = Encoding.UTF8.GetBytes("Next test core bytes, never executed.");
            current = InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.7.1", false, message => {}, null);
            File.WriteAllText(StateFile(app), stale, new UTF8Encoding(false));
            return app;
        }
        static string MissingReleaseFixture(string name, out Installation current) {
            string stale; var app = StaleRecordFixture(name, out stale, out current);
            File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash)); File.Delete(current.Core);
            return app;
        }
        static void Test(string name, Action action) { action(); Passed.Add(name); Console.WriteLine("PASS " + name); }
        public static int Main(string[] args) {
            try {
                if (args.Length > 0 && args[0] == "--host") {
                    if (args.Length == 2) { Thread.Sleep(500); Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName, "--host") { UseShellExecute = false, CreateNoWindow = true }); }
                    Thread.Sleep(60000); return 0;
                }
                if (args.Length != 1) throw new Exception("Choose a new test report file.");
                root = Path.Combine(Path.GetTempPath(), "Kittencord-installer-tests-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
                Test("Vanilla install and exact restore", delegate { var app = Fixture("vanilla", false); var state = Install(app, null); Check(state.OriginalMoved && state.RestoreLoader == null, "Incorrect baseline."); InstallService.Uninstall(app, Data(app), false, message => {}); Check(File.ReadAllText(Path.Combine(app, "resources/app.asar")) == "Original Discord test archive.", "Original archive not restored."); });
                Test("Existing TestCord loader and settings preserved", delegate { var app = Fixture("testcord", true); File.WriteAllText(Path.Combine(app, "untouched-settings.json"), "User data."); var state = Install(app, null); Check(File.ReadAllText(Path.Combine(state.RestoreLoader, "index.js")) == "require('previous TestCord loader');", "Backup changed."); InstallService.Uninstall(app, Data(app), false, message => {}); Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');" && File.ReadAllText(Path.Combine(app, "untouched-settings.json")) == "User data.", "User files changed."); });
                Test("Repair retains first restore point", delegate { var app = Fixture("repair", true); var first = Install(app, null); var next = Install(app, null); Check(next.RestoreLoader == first.RestoreLoader, "Repair replaced baseline."); InstallService.Uninstall(app, Data(app), false, message => {}); Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');", "Repair lost baseline."); });
                Test("Tampered bundled core rejected before changes", delegate { var app = Fixture("tampered", false); Refuses(delegate { InstallService.Install(app, Data(app), new byte[] { 1 }, Digest, "0.7.0", false, message => {}, null); }); Check(!Directory.Exists(Data(app)) && File.Exists(Path.Combine(app, "resources/app.asar")), "Tampered core changed target."); });
                foreach (var injected in new[] { false, true }) foreach (var failure in new[] { "before-activation", "before-commit" }) {
                    var fixtureInjected = injected; var fail = failure;
                    Test("Transaction rollback " + injected + " " + failure, delegate { var app = Fixture("failure-" + fixtureInjected + fail, fixtureInjected); Refuses(delegate { Install(app, fail); }); Check(fixtureInjected ? File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');" : File.Exists(Path.Combine(app, "resources/app.asar")), "Failure did not restore previous loader."); Install(app, null); });
                }
                foreach (var injected in new[] { false, true }) { var fixtureInjected = injected;
                    Test("Interrupted swap recovered " + injected, delegate { var app = Fixture("interrupt-" + fixtureInjected, fixtureInjected); Check(Install(app, "interrupted") == null, "Interruption hook did not stop."); Check(!Directory.Exists(Path.Combine(app, "resources/app.asar")) && !File.Exists(Path.Combine(app, "resources/app.asar")), "Fixture did not interrupt the swap."); InstallService.Recover(app, Data(app), false, message => {}); Check(fixtureInjected ? Directory.Exists(Path.Combine(app, "resources/app.asar")) : File.Exists(Path.Combine(app, "resources/app.asar")), "Interrupted loader not restored."); Install(app, null); });
                }
                Test("Discord restoring its own app.asar is reinstalled, not refused", delegate {
                    var app = Fixture("discord-reset", false); Install(app, null);
                    var resources = Path.Combine(app, "resources");
                    // What a Discord update or repair leaves behind: its original archive back as app.asar, our loader gone.
                    Directory.Delete(Path.Combine(resources, "app.asar"), true); File.Move(Path.Combine(resources, "_app.asar"), Path.Combine(resources, "app.asar"));
                    try { InstallService.Verify(app, Data(app)); throw new Exception("Verify accepted a reset Discord."); }
                    catch (IOException problem) { Check(InstallService.Diagnose(problem).Code == "DISCORD_RESET", "Reset Discord was not explained: " + problem.Message); }
                    var reinstalled = Install(app, null);
                    Check(Directory.Exists(Path.Combine(resources, "app.asar")) && File.Exists(Path.Combine(resources, "_app.asar")), "Reinstall did not put the loader back.");
                    Check(InstallService.Verify(app, Data(app)).LoaderHash == reinstalled.LoaderHash, "Reinstalled loader does not verify.");
                    Check(Directory.GetFiles(Data(app), "installation-*.json.previous-*").Length >= 1, "The old record was not kept.");
                });
                Test("Modified active loader blocks repair and removal", delegate { var app = Fixture("changed", true); Install(app, null); var path = Path.Combine(app, "resources/app.asar/index.js"); File.AppendAllText(path, "User modification."); Refuses(delegate { Install(app, null); }); Refuses(delegate { InstallService.Uninstall(app, Data(app), false, message => {}); }); Check(File.ReadAllText(path).EndsWith("User modification."), "Modified file overwritten."); });
                Test("Modified previous backup blocks removal", delegate { var app = Fixture("backup", true); var state = Install(app, null); File.AppendAllText(Path.Combine(state.RestoreLoader, "index.js"), "Changed."); Refuses(delegate { InstallService.Uninstall(app, Data(app), false, message => {}); }); Check(Directory.Exists(Path.Combine(app, "resources/app.asar")), "Active loader lost."); });
                Test("Modified original archive blocks removal", delegate { var app = Fixture("original", true); Install(app, null); File.AppendAllText(Path.Combine(app, "resources/_app.asar"), "Changed."); Refuses(delegate { InstallService.Uninstall(app, Data(app), false, message => {}); }); });
                Test("Invalid version and missing host rejected", delegate { var app = Fixture("invalid", false); Refuses(delegate { InstallService.Install(app, Data(app), Core, Digest, "../../escape", false, message => {}, null); }); Refuses(delegate { InstallService.Install(root, Data(app), Core, Digest, "0.7.0", false, message => {}, null); }); });
                foreach (var injected in new[] { false, true }) foreach (var failure in new[] { "interrupted-before-restore", "interrupted-after-restore" }) {
                    var fixtureInjected = injected; var fail = failure;
                    Test("Interrupted removal recovered " + injected + " " + failure, delegate { var app = Fixture("remove-" + fixtureInjected + fail, fixtureInjected); Install(app, null); InstallService.Uninstall(app, Data(app), false, message => {}, fail); InstallService.Recover(app, Data(app), false, message => {}); if (fail == "interrupted-before-restore") InstallService.Uninstall(app, Data(app), false, message => {}); Check(fixtureInjected ? File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');" : File.Exists(Path.Combine(app, "resources/app.asar")), "Interrupted removal lost original loader."); Install(app, null); });
                }
                Test("Alternative Electron app loader preserved", delegate { var app = Fixture("alternative", false); Directory.CreateDirectory(Path.Combine(app, "resources/app")); Refuses(delegate { Install(app, null); }); Check(File.Exists(Path.Combine(app, "resources/app.asar")), "Alternative layout changed."); });
                Test("Install progress confirms only completed operations", delegate {
                    var app = Fixture("progress", true); var completed = new List<string>();
                    InstallService.Install(app, Data(app), Core, Digest, "0.7.0", false, update => { if (update.Completed) completed.Add(update.Stage); }, null);
                    Check(String.Join(",", completed) == "verify,close,core,backup,activate,commit", "Incorrect progress order.");
                });
                Test("Failed commit never reports completed installation", delegate {
                    var app = Fixture("progress-failure", true); var completed = new List<string>();
                    Refuses(delegate { InstallService.Install(app, Data(app), Core, Digest, "0.7.0", false, update => { if (update.Completed) completed.Add(update.Stage); }, "before-commit"); });
                    Check(!completed.Contains("commit"), "Failed installation reported success.");
                    Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');", "Failure did not restore prior loader.");
                });
                Test("Restore progress confirms recorded restoration", delegate {
                    var app = Fixture("progress-restore", true); Install(app, null); var completed = new List<string>();
                    InstallService.Uninstall(app, Data(app), false, update => { if (update.Completed) completed.Add(update.Stage); });
                    Check(String.Join(",", completed) == "verify,close,restore,commit", "Incorrect restoration progress order.");
                });
                Test("Read-only verification checks complete retained installation", delegate {
                    var app = Fixture("verify", true); var state = Install(app, null);
                    var before = new List<string>(); foreach (var file in Directory.GetFiles(app, "*", SearchOption.AllDirectories)) before.Add(file + ":" + InstallService.FileHash(file));
                    Check(InstallService.Verify(app, Data(app)).LoaderHash == state.LoaderHash, "Verified wrong installation.");
                    var after = new List<string>(); foreach (var file in Directory.GetFiles(app, "*", SearchOption.AllDirectories)) after.Add(file + ":" + InstallService.FileHash(file));
                    Check(String.Join("\n", before) == String.Join("\n", after), "Verification mutated installation files.");
                });
                Test("Verification refuses modified loader without changing it", delegate {
                    var app = Fixture("verify-loader", true); Install(app, null); var file = Path.Combine(app, "resources/app.asar/index.js"); File.AppendAllText(file, "Changed.");
                    Refuses(delegate { InstallService.Verify(app, Data(app)); }); Check(File.ReadAllText(file).EndsWith("Changed."), "Verification changed loader.");
                });
                Test("Verification refuses tampered retained core", delegate {
                    var app = Fixture("verify-core", true); var state = Install(app, null); File.AppendAllText(state.Core, "Changed."); Refuses(delegate { InstallService.Verify(app, Data(app)); });
                });
                Test("Verification refuses missing installation journal", delegate {
                    var app = Fixture("verify-missing", false); Refuses(delegate { InstallService.Verify(app, Data(app)); }); Check(!Directory.Exists(Data(app)), "Verification created data files.");
                });
                Test("Stale journal resolves a verified retained release and repair survives repeated checks", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("stale-record", out stale, out current);
                    var loaderBefore = File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js"));
                    var verified = InstallService.Verify(app, Data(app));
                    Check(verified.RecordNeedsRepair && verified.Version == "0.7.1" && File.ReadAllText(StateFile(app)) == stale, "Read-only verification changed or misidentified the stale record.");
                    var next = Encoding.UTF8.GetBytes("Next test core bytes, never executed.");
                    Check(InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.7.1", false, message => {}, null).RestoreLoader == current.RestoreLoader, "Repair install lost the original restore point.");
                    File.WriteAllText(StateFile(app), stale, new UTF8Encoding(false));
                    for (var i = 0; i < 3; i++) { Check(!InstallService.RepairRecord(app, Data(app)).RecordNeedsRepair, "Record repair is not repeatable."); Check(!InstallService.Verify(app, Data(app)).RecordNeedsRepair, "Reopened verification still sees an old journal."); }
                    Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == loaderBefore && InstallService.Verify(app, Data(app)).RestoreLoader == current.RestoreLoader, "Metadata repair changed the loader or restore point.");
                    Check(!File.ReadAllText(StateFile(app)).Contains("RecordNeedsRepair"), "Transient verification result leaked into persisted state.");
                });
                Test("Legacy verified history migrates to a retained receipt without losing restoration", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("legacy-record", out stale, out current);
                    var receipt = InstallService.RecordPath(Data(app), app, current.LoaderHash);
                    File.Copy(receipt, StateFile(app) + ".previous-legacy"); File.Delete(receipt);
                    Check(InstallService.Verify(app, Data(app)).RecordNeedsRepair, "Legacy history was not recognized.");
                    InstallService.RepairRecord(app, Data(app)); Check(File.Exists(receipt), "Legacy receipt was not retained.");
                    File.WriteAllText(StateFile(app), stale, new UTF8Encoding(false)); InstallService.Uninstall(app, Data(app), false, message => {});
                    Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');", "Stale record restoration lost the original loader.");
                });
                Test("A receipt with a different original baseline cannot reconcile a stale journal", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("wrong-baseline", out stale, out current);
                    current.OriginalHash = new string('0', 64); File.WriteAllText(InstallService.RecordPath(Data(app), app, current.LoaderHash), InstallService.Json.Serialize(current));
                    Refuses(delegate { InstallService.RepairRecord(app, Data(app)); }); Check(File.ReadAllText(StateFile(app)) == stale, "Unrelated baseline replaced the journal.");
                });
                Test("Stale record reconciliation rejects modified retained core bytes", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("stale-core", out stale, out current); File.AppendAllText(current.Core, "Changed.");
                    Refuses(delegate { InstallService.RepairRecord(app, Data(app)); }); Check(File.ReadAllText(StateFile(app)) == stale && File.ReadAllText(current.Core).EndsWith("Changed."), "Modified core was adopted or overwritten.");
                });
                Test("Stale record reconciliation rejects a modified original restore loader", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("stale-backup", out stale, out current); var backup = Path.Combine(current.RestoreLoader, "index.js"); File.AppendAllText(backup, "Changed.");
                    Refuses(delegate { InstallService.RepairRecord(app, Data(app)); }); Check(File.ReadAllText(StateFile(app)) == stale && File.ReadAllText(backup).EndsWith("Changed."), "Modified restore point was adopted or overwritten.");
                });
                Test("Shared core receipts remain bound to each Discord installation", delegate {
                    var shared = Path.Combine(root, "shared-data"); var first = Fixture("shared-first", true); var second = Fixture("shared-second", true);
                    var next = Encoding.UTF8.GetBytes("Shared upgraded core, never executed.");
                    foreach (var app in new[] { first, second }) {
                        InstallService.Install(app, shared, Core, Digest, "0.7.0", false, update => {}, null);
                        var journal = Array.Find(Directory.GetFiles(shared, "installation-*.json"), file => !file.EndsWith(".transaction.json") && InstallService.Json.Deserialize<Installation>(File.ReadAllText(file)).Target == app);
                        var old = File.ReadAllText(journal);
                        InstallService.Install(app, shared, next, InstallService.Hash(next), "0.7.1", false, update => {}, null);
                        File.WriteAllText(journal, old);
                    }
                    foreach (var app in new[] { first, second }) Check(InstallService.RepairRecord(app, shared).Version == "0.7.1" && !InstallService.Verify(app, shared).RecordNeedsRepair, "Another Discord installation's receipt hid this installation's current record.");
                });
                Test("Exact bundled loader repair restores a missing release and stale journal", delegate {
                    Installation current; var app = MissingReleaseFixture("missing-release", out current); var next = Encoding.UTF8.GetBytes("Next test core bytes, never executed.");
                    Refuses(delegate { InstallService.Verify(app, Data(app)); });
                    var repaired = InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.7.1", false, update => {}, null);
                    Check(repaired.RestoreLoader == current.RestoreLoader && InstallService.Verify(app, Data(app)).Version == "0.7.1" && InstallService.FileHash(current.Core) == InstallService.Hash(next), "Exact bundled loader repair did not restore a coherent installation.");
                    InstallService.Uninstall(app, Data(app), false, update => {}); Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');", "Bundled loader repair lost the first restore point.");
                });
                Test("Exact retained loader with a missing receipt upgrades to a different release", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("retained-release", out stale, out current);
                    File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash));
                    var next = Encoding.UTF8.GetBytes("Third test core, never executed.");
                    var repaired = InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.9.0", false, update => {}, null);
                    Check(repaired.RestoreLoader == current.RestoreLoader && InstallService.Verify(app, Data(app)).Version == "0.9.0", "Retained loader upgrade lost its original restore point.");
                    Check(InstallService.FileHash(current.Core) == current.CoreHash, "Retained core changed during upgrade.");
                });
                Test("Retained loader adoption refuses modified source", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("retained-source", out stale, out current);
                    File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash)); File.AppendAllText(Path.Combine(app, "resources/app.asar/index.js"), "Changed.");
                    Refuses(delegate { InstallService.Install(app, Data(app), Core, Digest, "0.9.0", false, update => {}, null); });
                    Check(File.ReadAllText(StateFile(app)) == stale, "Unknown source changed its installation record.");
                });
                Test("Missing receipt self-heals from exact retained loader without changing Discord files", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("self-heal-record", out stale, out current);
                    File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash));
                    var loaderBeforeHealing = File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js"));
                    Check(InstallService.Verify(app, Data(app)).RecordNeedsRepair && File.ReadAllText(StateFile(app)) == stale, "Inspection wrote state or failed to recognize exact loader.");
                    var repaired = InstallService.RepairRecord(app, Data(app));
                    Check(repaired.Version == current.Version && !InstallService.RepairRecord(app, Data(app)).RecordNeedsRepair, "Record repair is not repeatable.");
                    Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == loaderBeforeHealing && InstallService.FileHash(current.Core) == current.CoreHash, "Metadata repair changed active files.");
                    InstallService.Uninstall(app, Data(app), false, update => {});
                    Check(File.ReadAllText(Path.Combine(app, "resources/app.asar/index.js")) == "require('previous TestCord loader');", "Self-healing lost original restore point.");
                });
                Test("Self-healing refuses extra files and changed package metadata", delegate {
                    foreach (var extra in new[] { false, true }) {
                        string stale; Installation current; var app = StaleRecordFixture("self-heal-extra-" + extra, out stale, out current);
                        File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash));
                        File.WriteAllText(Path.Combine(app, "resources/app.asar", extra ? "extra.js" : "package.json"), "Unrecognized source.");
                        Refuses(delegate { InstallService.RepairRecord(app, Data(app)); });
                        Check(File.ReadAllText(StateFile(app)) == stale, "Unknown active files changed the record.");
                    }
                });
                Test("Self-healing cannot trust a core outside retained Versions", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("self-heal-path", out stale, out current);
                    File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash));
                    var outside = Path.Combine(app, Path.GetFileName(current.Core)); File.Copy(current.Core, outside);
                    File.WriteAllText(Path.Combine(app, "resources/app.asar/index.js"), InstallService.Loader(outside, current.CoreHash), new UTF8Encoding(false));
                    Refuses(delegate { InstallService.RepairRecord(app, Data(app)); });
                    Check(File.ReadAllText(StateFile(app)) == stale, "An external core was adopted.");
                });
                Test("Diagnostics distinguish access, busy host, unknown loader and missing core", delegate {
                    Check(InstallService.Diagnose(new UnauthorizedAccessException("Denied")).Code == "ACCESS_DENIED", "Access failure was misclassified.");
                    Check(InstallService.Diagnose(new IOException("Close this Discord instance first, or choose Close Discord and restart.")).Code == "DISCORD_RUNNING", "Running Discord was misclassified.");
                    Check(InstallService.Diagnose(new IOException("The Discord loader does not match a verified installation record.")).Code == "LOADER_CHANGED", "Unknown loader was misclassified.");
                    Check(InstallService.Diagnose(new IOException("The installed Kittencord core is missing or changed.")).Code == "CORE_CHANGED", "Missing core was misclassified.");
                });
                Test("Retained loader adoption refuses modified core bytes", delegate {
                    string stale; Installation current; var app = StaleRecordFixture("retained-core", out stale, out current);
                    File.Delete(InstallService.RecordPath(Data(app), app, current.LoaderHash)); File.AppendAllText(current.Core, "Changed.");
                    Refuses(delegate { InstallService.Install(app, Data(app), Core, Digest, "0.9.0", false, update => {}, null); });
                    Check(File.ReadAllText(StateFile(app)) == stale, "Modified core changed its installation record.");
                });
                Test("Bundled loader repair refuses extra active files", delegate {
                    Installation current; var app = MissingReleaseFixture("missing-extra", out current); var file = Path.Combine(app, "resources/app.asar/extra.js"); File.WriteAllText(file, "Unknown source.");
                    var next = Encoding.UTF8.GetBytes("Next test core bytes, never executed."); Refuses(delegate { InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.7.1", false, update => {}, null); });
                    Check(!File.Exists(current.Core) && File.ReadAllText(file) == "Unknown source.", "Unknown active files were overwritten or accepted.");
                });
                Test("Bundled loader repair refuses a changed original archive", delegate {
                    Installation current; var app = MissingReleaseFixture("missing-original", out current); File.AppendAllText(Path.Combine(app, "resources/_app.asar"), "Changed.");
                    var next = Encoding.UTF8.GetBytes("Next test core bytes, never executed."); Refuses(delegate { InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.7.1", false, update => {}, null); }); Check(!File.Exists(current.Core), "Changed original baseline allowed a core write.");
                });
                Test("Bundled loader repair refuses a changed restore point", delegate {
                    Installation current; var app = MissingReleaseFixture("missing-restore", out current); File.AppendAllText(Path.Combine(current.RestoreLoader, "index.js"), "Changed.");
                    var next = Encoding.UTF8.GetBytes("Next test core bytes, never executed."); Refuses(delegate { InstallService.Install(app, Data(app), next, InstallService.Hash(next), "0.7.1", false, update => {}, null); }); Check(!File.Exists(current.Core), "Changed restore point allowed a core write.");
                });
                Test("Close waits for selected host and child while preserving other installations", delegate {
                    var app = Path.Combine(root, "host-process"); var other = Path.Combine(root, "unrelated-host"); Directory.CreateDirectory(app); Directory.CreateDirectory(other);
                    var binary = Process.GetCurrentProcess().MainModule.FileName; File.Copy(binary, Path.Combine(app, "Discord.exe")); File.Copy(binary, Path.Combine(other, "Discord.exe"));
                    using (var selected = Process.Start(new ProcessStartInfo(Path.Combine(app, "Discord.exe"), "--host child") { UseShellExecute = false, CreateNoWindow = true }))
                    using (var unrelated = Process.Start(new ProcessStartInfo(Path.Combine(other, "Discord.exe"), "--host") { UseShellExecute = false, CreateNoWindow = true })) {
                        try { Refuses(delegate { InstallService.CloseDiscord(app, false); }); InstallService.CloseDiscord(app, true); Check(selected.HasExited, "Selected host did not exit."); Check(!unrelated.HasExited, "Another installation was closed."); InstallService.CloseDiscord(app, false); }
                        finally { InstallService.CloseDiscord(app, true); if (!unrelated.HasExited) { unrelated.Kill(); unrelated.WaitForExit(5000); } }
                    }
                });
                var loader = InstallService.Loader(Path.Combine(root, "test-core.asar"), Digest); File.WriteAllText(Path.Combine(root, "loader.js"), loader, new UTF8Encoding(false));
                using (var stream = new FileStream(args[0], FileMode.CreateNew)) using (var writer = new StreamWriter(stream)) writer.Write(InstallService.Json.Serialize(new { passed = Passed.Count, checks = Passed, fixtures = root, loader = Path.Combine(root, "loader.js") }));
                return 0;
            } catch (Exception problem) { Console.Error.WriteLine(problem); return 1; }
        }
    }
}
