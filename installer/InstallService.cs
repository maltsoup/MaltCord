/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace KittencordSetup {
    public sealed class InstallProgress {
        public readonly string Stage;
        public readonly string Message;
        public readonly bool Completed;
        public InstallProgress(string stage, string message, bool completed) { Stage = stage; Message = message; Completed = completed; }
    }
    public sealed class Transaction {
        public int Schema = 1;
        public string Phase = "prepared";
        public string Target;
        public string Stage;
        public string Backup;
        public string OriginalHash;
        public string LoaderHash;
        public string PriorLoaderHash;
        public bool OriginalMoved;
        public string Operation = "install";
        public string Retired;
        public string RestoreLoader;
        public string RestoreLoaderHash;
    }
    public sealed class Installation {
        public int Schema = 1;
        public string Product = "Kittencord";
        public string Version;
        public string Target;
        public string OriginalHash;
        public string LoaderHash;
        public string Core;
        public string CoreHash;
        public string RestoreLoader;
        public string RestoreLoaderHash;
        public bool OriginalMoved;
        public string InstalledAt;
        [ScriptIgnore] public bool RecordNeedsRepair;
    }

    public sealed class InstallDiagnosis {
        public string Code;
        public string Message;
        public InstallDiagnosis(string code, string message) { Code = code; Message = message; }
    }

    public static class InstallService {
        public static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 131072 };
        public static string Hash(byte[] bytes) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
        public static string FileHash(string path) { using (var stream = File.OpenRead(path)) using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant(); }
        public static string Full(string path) { return Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar); }
        public static bool Same(string a, string b) { return String.Equals(Full(a), Full(b), StringComparison.OrdinalIgnoreCase); }
        public static InstallDiagnosis Diagnose(Exception problem) {
            var message = problem.Message;
            if (problem is UnauthorizedAccessException) return new InstallDiagnosis("ACCESS_DENIED", "Setup cannot access the selected files. Close other setup windows and check this account's folder permissions, then try again.");
            if ((problem.HResult & 65535) == 112 || (problem.HResult & 65535) == 39) return new InstallDiagnosis("DISK_FULL", "There is not enough disk space. Free space on the Discord and MaltCord drives, then try again.");
            if (message.Contains("Another Kittencord installer")) return new InstallDiagnosis("SETUP_BUSY", "Another setup is active. Close the other installer, then try again.");
            if (message.Contains("Discord is running") || message.Contains("Discord is still running") || message.Contains("Close this Discord instance") || message.Contains("Windows could not close")) return new InstallDiagnosis("DISCORD_RUNNING", "Discord is still running. Enable Restart Discord after setup, or quit Discord from its tray icon, then try again.");
            if (message.Contains("original Discord") || message.Contains("original archive") || message.Contains("restore point") || message.Contains("loader backup")) return new InstallDiagnosis("RESTORE_BASELINE_CHANGED", "The original Discord files or recovery copy are missing or changed. Reinstall Discord into a clean app folder, then select it here. Existing files and settings were preserved.");
            if (message.Contains("core") && (message.Contains("missing") || message.Contains("changed") || message.Contains("modified"))) return new InstallDiagnosis("CORE_CHANGED", "The MaltCord core is missing or changed. Choose Back to setup, then Install / Repair. An altered retained core is preserved for inspection.");
            if (message.Contains("Discord replaced MaltCord")) return new InstallDiagnosis("DISCORD_RESET", problem.Message);
            if (message.Contains("loader does not match") || message.Contains("active Discord loader changed")) return new InstallDiagnosis("LOADER_CHANGED", "The loader could not be matched to MaltCord's verified files. Known stale records are repaired automatically. These files need inspection; nothing was overwritten. Details are saved beside setup.");
            if (message.Contains("No Kittencord installation journal")) return new InstallDiagnosis("NOT_INSTALLED", "No MaltCord installation is recorded for this Discord folder. Choose Back to setup, then Install / Repair.");
            if (message.Contains("Select the Discord") || problem is DirectoryNotFoundException) return new InstallDiagnosis("DISCORD_PATH", "Select the current Discord app-VERSION folder containing Discord.exe. Discord may have moved to a newer app folder after an update.");
            return new InstallDiagnosis("SETUP_FAILED", message + "\n\nDetails are saved beside setup. Your selected folder and settings are kept.");
        }
        static void NoLinks(string path) {
            for (var current = Full(path); !String.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
                if ((Directory.Exists(current) || File.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new IOException("Symbolic links and junctions are not supported for installation paths.");
        }
        static string Child(string root, string child) {
            var value = Full(Path.Combine(root, child));
            if (!value.StartsWith(Full(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Installation path escaped its selected directory.");
            NoLinks(value); return value;
        }
        static void Save(string path, object value) {
            var pending = Path.Combine(Path.GetDirectoryName(path), ".pending-" + Guid.NewGuid().ToString("N"));
            using (var stream = new FileStream(pending, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { var bytes = Encoding.UTF8.GetBytes(Json.Serialize(value)); stream.Write(bytes, 0, bytes.Length); stream.Flush(true); }
            if (File.Exists(path)) File.Replace(pending, path, path + ".previous-" + Guid.NewGuid().ToString("N")); else File.Move(pending, path);
        }
        static string TreeHash(string directory) {
            var rows = new List<string>();
            foreach (var item in Directory.GetFileSystemEntries(directory).OrderBy(value => value, StringComparer.Ordinal)) {
                NoLinks(item); var name = Path.GetFileName(item);
                rows.Add(name + ":" + (Directory.Exists(item) ? TreeHash(item) : FileHash(item)));
            }
            return Hash(Encoding.UTF8.GetBytes(String.Join("\n", rows)));
        }
        static string ValidateTarget(string directory) {
            var target = Full(directory); NoLinks(target);
            if (!File.Exists(Path.Combine(target, "Discord.exe")) || !File.Exists(Path.Combine(target, "resources", "build_info.json"))) throw new IOException("Select the Discord app-VERSION directory containing Discord.exe and resources.");
            if (Directory.Exists(Path.Combine(target, "resources", "app")) || File.Exists(Path.Combine(target, "resources", "app"))) throw new IOException("This Discord installation uses an alternative app loader. It was preserved; this layout requires manual review.");
            var info = new FileInfo(Path.Combine(target, "resources", "build_info.json"));
            if (info.Length > 4096) throw new IOException("Discord build metadata exceeds its limit.");
            var build = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(info.FullName));
            object version; Version parsed;
            if (!build.TryGetValue("version", out version) || !Version.TryParse(Convert.ToString(version), out parsed)) throw new IOException("Discord build metadata is invalid.");
            return Child(target, "resources");
        }
        static List<Process> TargetProcesses(string target) {
            var result = new List<Process>();
            foreach (var process in Process.GetProcessesByName("Discord")) {
                try { if (Same(Path.GetDirectoryName(process.MainModule.FileName), target)) result.Add(process); else process.Dispose(); }
                catch (InvalidOperationException) { process.Dispose(); }
                catch (System.ComponentModel.Win32Exception) { process.Dispose(); }
                catch (NullReferenceException) { process.Dispose(); }
            }
            return result;
        }
        public static void CloseDiscord(string target, bool close) {
            var processes = TargetProcesses(target);
            if (processes.Count == 0) return;
            if (processes.Count > 0 && !close) { foreach (var process in processes) process.Dispose(); throw new IOException("Close this Discord instance first, or choose Close Discord and restart."); }
            foreach (var process in processes) { try { process.CloseMainWindow(); } catch (InvalidOperationException) {} catch (System.ComponentModel.Win32Exception error) { process.Refresh(); if (!process.HasExited) throw new IOException("Windows could not close this Discord instance. Close it from the tray, then choose Try again.", error); } }
            foreach (var process in processes) process.Dispose();
            var started = DateTime.UtcNow; DateTime? emptySince = null;
            while (DateTime.UtcNow - started < TimeSpan.FromSeconds(10)) {
                var remaining = TargetProcesses(target);
                if (remaining.Count == 0) {
                    if (!emptySince.HasValue) emptySince = DateTime.UtcNow;
                    if (DateTime.UtcNow - emptySince.Value >= TimeSpan.FromMilliseconds(400)) return;
                } else {
                    emptySince = null;
                    foreach (var process in remaining) {
                        try {
                            if (DateTime.UtcNow - started >= TimeSpan.FromSeconds(2) && !process.HasExited) {
                                if (!Same(Path.GetDirectoryName(process.MainModule.FileName), target)) throw new IOException("Discord process identity changed.");
                                process.Kill();
                            }
                        } catch (InvalidOperationException) {} catch (NullReferenceException) {} catch (System.ComponentModel.Win32Exception error) { process.Refresh(); if (!process.HasExited) throw new IOException("Windows could not close this Discord instance. Close it from the tray, then choose Try again.", error); } finally { process.Dispose(); }
                    }
                }
                Thread.Sleep(100);
            }
            throw new IOException("Discord is still running. No loader was activated. Close the selected Discord instance, then choose Try again.");
        }
        public static string[] Discover() {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData); var found = new List<string>();
            foreach (var channel in new[] { "Discord", "DiscordPTB", "DiscordCanary" }) {
                var root = Path.Combine(local, channel); if (!Directory.Exists(root)) continue;
                foreach (var directory in Directory.GetDirectories(root, "app-*")) if (File.Exists(Path.Combine(directory, "Discord.exe"))) found.Add(directory);
            }
            return found.OrderByDescending(value => { Version version; return Version.TryParse(Path.GetFileName(value).Substring(4), out version) ? version : new Version(); }).ToArray();
        }
        internal static string StatePath(string root, string target) { return Child(root, "installation-" + Hash(Encoding.UTF8.GetBytes(Full(target).ToLowerInvariant())).Substring(0, 24) + ".json"); }
        internal static string RecordPath(string root, string target, string loaderHash) { return Child(Child(root, "Records"), Hash(Encoding.UTF8.GetBytes(Full(target).ToLowerInvariant() + "\n" + loaderHash)) + ".json"); }
        static Installation ReadState(string path, string target, string resources, string root) {
            if (new FileInfo(path).Length > 131072) throw new IOException("Installation journal exceeds its limit.");
            var state = Json.Deserialize<Installation>(File.ReadAllText(path));
            if (state == null || state.Schema != 1 || state.Product != "Kittencord" || !Same(state.Target, target) || String.IsNullOrEmpty(state.OriginalHash) || String.IsNullOrEmpty(state.LoaderHash)) throw new IOException("Installation journal does not match this Discord instance.");
            if (!String.IsNullOrEmpty(state.RestoreLoader)) { Child(resources, Path.GetFileName(state.RestoreLoader)); if (!Same(Path.GetDirectoryName(state.RestoreLoader), resources) || !Path.GetFileName(state.RestoreLoader).StartsWith("kittencord-backup-", StringComparison.Ordinal)) throw new IOException("Invalid loader backup location."); }
            if (!Full(state.Core).StartsWith(Child(root, "Versions") + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Invalid retained core location.");
            NoLinks(state.Core);
            return state;
        }
        public static string Loader(string core, string digest) {
            return "const path=require('path'),fs=require('original-fs'),crypto=require('crypto');\n" +
                "const core=" + Json.Serialize(core) + ";const expected=" + Json.Serialize(digest) + ";\n" +
                "let verified=false,readError;function trace(stage,reason){try{fs.writeFileSync(path.join(path.dirname(core),'..','bootstrap-last.json'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,executable:process.execPath,resources:process.resourcesPath,core,verified,stage,reason}));}catch{}}\n" +
                "try{verified=fs.existsSync(core)&&crypto.createHash('sha256').update(fs.readFileSync(core)).digest('hex')===expected;}catch(error){readError=error.code||'READ_FAILED';console.error('[Kittencord] Unable to verify the core.');}\n" +
                "if(verified){process.env.DISABLE_UPDATER_AUTO_PATCHING='1';trace('loading-core');try{require(path.join(core,'patcher.js'));trace('core-loaded');}catch(error){trace('core-failed',error.code||'CORE_STARTUP_FAILED');throw error;}}\n" +
                "else{trace('original-discord',readError||'MISSING_OR_CHANGED');console.error('[Kittencord] Core missing or changed. Loading original Discord.');const {app}=require('electron');const original=path.join(__dirname,'../_app.asar');const pkg=require(path.join(original,'package.json'));require.main.filename=path.join(original,pkg.main);app.setAppPath(original);require(require.main.filename);}\n";
        }
        static bool MatchesRetainedLoader(string active, string root) {
            string core, digest, version;
            return MatchesRetainedLoader(active, root, out core, out digest, out version);
        }
        static bool MatchesRetainedLoader(string active, string root, out string core, out string digest, out string version) {
            core = digest = version = null;
            if (!Directory.Exists(active) || Directory.GetFileSystemEntries(active).Length != 2
                || !File.Exists(Child(active, "index.js")) || new FileInfo(Child(active, "index.js")).Length > 65536
                || !File.Exists(Child(active, "package.json")) || FileHash(Child(active, "package.json")) != Hash(Encoding.UTF8.GetBytes("{\"name\":\"kittencord-discord-loader\",\"main\":\"index.js\"}"))) return false;
            var source = File.ReadAllText(Child(active, "index.js"));
            if (source.Length > 65536) return false;
            var lines = source.Split('\n');
            if (lines.Length < 2 || !lines[1].StartsWith("const core=", StringComparison.Ordinal) || !lines[1].EndsWith(";", StringComparison.Ordinal)) return false;
            var split = lines[1].IndexOf(";const expected=", StringComparison.Ordinal);
            if (split < 11) return false;
            try { core = Json.Deserialize<string>(lines[1].Substring(11, split - 11)); digest = Json.Deserialize<string>(lines[1].Substring(split + 16, lines[1].Length - split - 17)); }
            catch (ArgumentException) { return false; } catch (InvalidOperationException) { return false; }
            if (String.IsNullOrEmpty(core) || String.IsNullOrEmpty(digest) || digest.Length != 64 || digest.Any(c => !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f'))) return false;
            if (!Path.IsPathRooted(core) || !Same(Path.GetDirectoryName(core), Child(root, "Versions"))) return false;
            NoLinks(core);
            var name = Path.GetFileName(core); var separator = name.IndexOf('-'); Version parsedVersion;
            if (separator < 1 || !Version.TryParse(name.Substring(0, separator), out parsedVersion) || name != parsedVersion.ToString() + "-" + digest.Substring(0, 16) + ".asar") return false;
            version = parsedVersion.ToString();
            return File.Exists(core) && FileHash(core) == digest && source == Loader(core, digest);
        }
        /// <summary>
        /// True when Discord's own app.asar archive is back in place and MaltCord's loader and the moved original are gone:
        /// Discord updated or repaired itself. Nothing is overwritten by installing again, because the archive is only moved aside.
        /// </summary>
        public static bool DiscordReset(string resources) {
            var active = Child(resources, "app.asar"); var original = Child(resources, "_app.asar");
            return File.Exists(active) && !Directory.Exists(active) && !File.Exists(original) && !Directory.Exists(original);
        }
        public static Installation Verify(string directory, string dataRoot) {
            var target = Full(directory); var resources = ValidateTarget(target); var root = Full(dataRoot); NoLinks(root);
            var stateFile = StatePath(root, target);
            if (!File.Exists(stateFile)) throw new IOException("No Kittencord installation journal exists for the selected Discord folder.");
            if (DiscordReset(resources)) throw new IOException("Discord replaced MaltCord with its own files, usually after a Discord update or repair. Your settings are kept. Choose Install / Repair to install MaltCord again.");
            var state = ReadState(stateFile, target, resources, root);
            var active = Child(resources, "app.asar");
            var actualLoaderHash = Directory.Exists(active) ? TreeHash(active) : "missing";
            if (actualLoaderHash != state.LoaderHash) {
                var conflictingRecord = false;
                var candidates = new List<string> { RecordPath(root, target, actualLoaderHash) };
                candidates.AddRange(Directory.GetFiles(root, Path.GetFileName(stateFile) + ".previous-*"));
                foreach (var path in candidates) {
                    if (!File.Exists(path)) continue;
                    try {
                        NoLinks(path);
                        var candidate = ReadState(path, target, resources, root);
                        if (candidate.LoaderHash != actualLoaderHash) continue;
                        if (candidate.OriginalHash != state.OriginalHash || candidate.OriginalMoved != state.OriginalMoved
                            || candidate.RestoreLoaderHash != state.RestoreLoaderHash || (String.IsNullOrEmpty(candidate.RestoreLoader) ? !String.IsNullOrEmpty(state.RestoreLoader) : String.IsNullOrEmpty(state.RestoreLoader) || !Same(candidate.RestoreLoader, state.RestoreLoader))) { conflictingRecord = true; continue; }
                        VerifyFiles(resources, candidate);
                        candidate.RecordNeedsRepair = true;
                        return candidate;
                    } catch (IOException) {} catch (ArgumentException) {} catch (UnauthorizedAccessException) {}
                }
                string retainedCore, retainedDigest, retainedVersion;
                if (!conflictingRecord && MatchesRetainedLoader(active, root, out retainedCore, out retainedDigest, out retainedVersion)) {
                    var retained = new Installation { Version = retainedVersion, Target = target, OriginalHash = state.OriginalHash, LoaderHash = actualLoaderHash, Core = retainedCore, CoreHash = retainedDigest, OriginalMoved = state.OriginalMoved, RestoreLoader = state.RestoreLoader, RestoreLoaderHash = state.RestoreLoaderHash, InstalledAt = state.InstalledAt, RecordNeedsRepair = true };
                    VerifyFiles(resources, retained);
                    return retained;
                }
                var failure = new IOException("The Discord loader does not match a verified installation record. Files were preserved.\n\nSelected: " + target + "\nRecorded: " + state.LoaderHash + "\nCurrent: " + actualLoaderHash + "\n\nAn unrecognized loader will not be overwritten.");
                failure.Data["journalPath"] = stateFile; failure.Data["journalVersion"] = state.Version; failure.Data["recordedLoaderHash"] = state.LoaderHash; failure.Data["actualLoaderHash"] = actualLoaderHash;
                throw failure;
            }
            VerifyFiles(resources, state);
            return state;
        }
        static void VerifyFiles(string resources, Installation state) {
            if (!Directory.Exists(Child(resources, "app.asar")) || TreeHash(Child(resources, "app.asar")) != state.LoaderHash) throw new IOException("The active Discord loader changed during verification. Try again.");
            VerifyBaseline(resources, state);
            if (!File.Exists(state.Core) || FileHash(state.Core) != state.CoreHash) throw new IOException("The installed Kittencord core is missing or changed. Use Install / Repair to restore the bundled core after inspecting the retained file.");
        }
        static void VerifyBaseline(string resources, Installation state) {
            var original = Child(resources, "_app.asar");
            if (!File.Exists(original) || FileHash(original) != state.OriginalHash) throw new IOException("The original Discord archive does not match its journal. Files were preserved.");
            if (!String.IsNullOrEmpty(state.RestoreLoader) && (!Directory.Exists(state.RestoreLoader) || TreeHash(state.RestoreLoader) != state.RestoreLoaderHash)) throw new IOException("The previous loader backup is missing or changed. Files were preserved.");
        }
        static void RetainRecord(string root, Installation state) {
            var records = Child(root, "Records"); Directory.CreateDirectory(records);
            var file = RecordPath(root, state.Target, state.LoaderHash);
            if (!File.Exists(file)) Save(file, state);
        }
        public static Installation RepairRecord(string directory, string dataRoot) {
            var target = Full(directory); var root = Full(dataRoot); var state = Verify(target, root);
            RetainRecord(root, state);
            if (state.RecordNeedsRepair) Save(StatePath(root, target), state);
            state.RecordNeedsRepair = false;
            return state;
        }
        public static void Recover(string directory, string dataRoot, bool close, Action<InstallProgress> progress) {
            var target = Full(directory); var resources = ValidateTarget(target); var root = Full(dataRoot);
            var stateFile = StatePath(root, target); var journal = stateFile + ".transaction.json";
            if (!File.Exists(journal)) return;
            if (new FileInfo(journal).Length > 131072) throw new IOException("Recovery journal exceeds its limit.");
            var item = Json.Deserialize<Transaction>(File.ReadAllText(journal));
            if (item == null || item.Schema != 1 || !Same(item.Target, target)) throw new IOException("Recovery journal does not match this Discord instance.");
            if (item.Phase != "prepared") return;
            var active = Child(resources, "app.asar"); var original = Child(resources, "_app.asar");
            if (item.Operation == "remove") {
                if (!Same(Path.GetDirectoryName(item.Retired), resources) || !Path.GetFileName(item.Retired).StartsWith("kittencord-removed-", StringComparison.Ordinal)) throw new IOException("Invalid removal recovery path.");
                Child(resources, Path.GetFileName(item.Retired));
                var restored = item.OriginalMoved ? File.Exists(active) && FileHash(active) == item.OriginalHash && !File.Exists(original) : Directory.Exists(active) && TreeHash(active) == item.RestoreLoaderHash && File.Exists(original) && FileHash(original) == item.OriginalHash;
                if (restored) { if (File.Exists(stateFile)) File.Move(stateFile, Child(root, "removed-" + Guid.NewGuid().ToString("N") + ".json")); item.Phase = "removed"; Save(journal, item); return; }
                if (!File.Exists(original) || FileHash(original) != item.OriginalHash || File.Exists(active)) throw new IOException("Removal recovery files changed. Manual inspection is required.");
                if (Directory.Exists(active)) { if (TreeHash(active) != item.LoaderHash || Directory.Exists(item.Retired)) throw new IOException("Removal recovery loader changed."); }
                else {
                    if (!Directory.Exists(item.Retired) || TreeHash(item.Retired) != item.LoaderHash) throw new IOException("Retained loader is missing or changed.");
                    CloseDiscord(target, close); Directory.Move(item.Retired, active);
                }
                item.Phase = "reverted"; Save(journal, item); progress(new InstallProgress("recovery", "Interrupted removal recovered. Kittencord loader restored.", true)); return;
            }
            if (item.Operation != "install") throw new IOException("Unknown recovery operation.");
            if (!Same(Path.GetDirectoryName(item.Backup), resources) || !Path.GetFileName(item.Backup).StartsWith("kittencord-backup-", StringComparison.Ordinal)) throw new IOException("Invalid recovery backup path.");
            Child(resources, Path.GetFileName(item.Backup));
            if (File.Exists(stateFile)) {
                var state = ReadState(stateFile, target, resources, root);
                if (state.LoaderHash == item.LoaderHash && Directory.Exists(active) && TreeHash(active) == item.LoaderHash && File.Exists(original) && FileHash(original) == item.OriginalHash) {
                    item.Phase = "installed"; Save(journal, item); return;
                }
            }
            if (item.OriginalMoved && File.Exists(active) && FileHash(active) == item.OriginalHash && !File.Exists(original)) { item.Phase = "reverted"; Save(journal, item); return; }
            if (!item.OriginalMoved && Directory.Exists(active) && TreeHash(active) == item.PriorLoaderHash && !Directory.Exists(item.Backup)) { item.Phase = "reverted"; Save(journal, item); return; }
            if (!File.Exists(original) || FileHash(original) != item.OriginalHash || (Directory.Exists(active) && TreeHash(active) != item.LoaderHash) || File.Exists(active)) throw new IOException("Interrupted installation files changed. Manual inspection is required; files were preserved.");
            if (!item.OriginalMoved && (!Directory.Exists(item.Backup) || TreeHash(item.Backup) != item.PriorLoaderHash)) throw new IOException("Interrupted installation backup is missing or changed.");
            CloseDiscord(target, close);
            if (Directory.Exists(active)) Directory.Move(active, Child(resources, "kittencord-interrupted-" + Guid.NewGuid().ToString("N")));
            if (item.OriginalMoved) File.Move(original, active); else Directory.Move(item.Backup, active);
            item.Phase = "reverted"; Save(journal, item); progress(new InstallProgress("recovery", "Interrupted installation recovered. Previous loader restored.", true));
        }
        public static Installation Install(string directory, string dataRoot, byte[] coreBytes, string digest, string version, bool close, Action<InstallProgress> progress, string failAt) {
            progress(new InstallProgress("verify", "Checking core integrity and Discord installation...", false));
            if (Hash(coreBytes) != digest) throw new IOException("The Kittencord core failed its integrity check. Nothing was changed.");
            Version parsedVersion; if (!Version.TryParse(version, out parsedVersion) || parsedVersion.ToString() != version) throw new IOException("Invalid bundled core version.");
            var target = Full(directory); var resources = ValidateTarget(target); var root = Full(dataRoot); NoLinks(root); Directory.CreateDirectory(root);
            var stateFile = StatePath(root, target); var active = Child(resources, "app.asar"); var original = Child(resources, "_app.asar");
            var versions = Child(root, "Versions"); var core = Child(versions, version + "-" + digest.Substring(0, 16) + ".asar");
            Recover(target, root, close, progress);
            var existing = File.Exists(stateFile) ? ReadState(stateFile, target, resources, root) : null;
            if (existing != null && DiscordReset(resources)) {
                // Discord put its own app.asar back (an update or repair) and MaltCord's files are gone, so there is
                // nothing of ours to protect. Keep the old record for reference and install as on a clean Discord.
                File.Move(stateFile, stateFile + ".previous-" + Guid.NewGuid().ToString("N"));
                existing = null;
                progress(new InstallProgress("verify", "Discord restored its own files. Installing MaltCord again...", false));
            }
            if (existing != null && (!Directory.Exists(active) || TreeHash(active) != existing.LoaderHash)) {
                try { existing = Verify(target, root); }
                catch (IOException) {
                    if (!Directory.Exists(active) || Directory.GetFileSystemEntries(active).Length != 2
                        || !File.Exists(Child(active, "index.js")) || new FileInfo(Child(active, "index.js")).Length > 65536
                        || !File.Exists(Child(active, "package.json")) || FileHash(Child(active, "package.json")) != Hash(Encoding.UTF8.GetBytes("{\"name\":\"kittencord-discord-loader\",\"main\":\"index.js\"}"))) throw;
                    if (FileHash(Child(active, "index.js")) != Hash(Encoding.UTF8.GetBytes(Loader(core, digest))) && !MatchesRetainedLoader(active, root)) throw;
                    VerifyBaseline(resources, existing);
                }
            }
            if (!File.Exists(original) && !File.Exists(active)) throw new IOException("Original Discord app.asar is unavailable. No installation files were changed.");
            if (File.Exists(original) && File.Exists(active)) throw new IOException("Ambiguous Discord archives. Inspect this installation before continuing.");
            if (Directory.Exists(active) && !File.Exists(original)) throw new IOException("An injected loader has no original Discord archive. Repair Discord first.");
            if (File.Exists(original) && !Directory.Exists(active)) throw new IOException("The prior loader is missing. Recover the interrupted installation before continuing.");
            progress(new InstallProgress("verify", "Core integrity and Discord layout checked.", true));
            progress(new InstallProgress("close", "Waiting for the selected Discord installation to close...", false));
            CloseDiscord(target, close); progress(new InstallProgress("close", "Selected Discord installation is closed.", true));
            progress(new InstallProgress("core", "Writing and verifying the Kittencord core...", false));
            Directory.CreateDirectory(versions);
            if (File.Exists(core)) { if (FileHash(core) != digest) throw new IOException("The retained core was modified. It was preserved for inspection."); }
            else { var pending = Child(versions, "pending-" + Guid.NewGuid().ToString("N") + ".asar"); using (var stream = new FileStream(pending, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(coreBytes, 0, coreBytes.Length); stream.Flush(true); } if (FileHash(pending) != digest) throw new IOException("Core copy failed verification."); File.Move(pending, core); }
            progress(new InstallProgress("core", "Versioned core copied and SHA-256 checked.", true));
            progress(new InstallProgress("backup", "Preparing loader and preserving the previous version...", false));
            var id = Guid.NewGuid().ToString("N"); var stage = Child(resources, "kittencord-stage-" + id); var backup = Child(resources, "kittencord-backup-" + id);
            Directory.CreateDirectory(stage); File.WriteAllText(Path.Combine(stage, "package.json"), "{\"name\":\"kittencord-discord-loader\",\"main\":\"index.js\"}", new UTF8Encoding(false)); File.WriteAllText(Path.Combine(stage, "index.js"), Loader(core, digest), new UTF8Encoding(false));
            var hash = FileHash(File.Exists(original) ? original : active); if (existing != null && hash != existing.OriginalHash) throw new IOException("The original Discord archive changed. No loader was activated.");
            var expectedLoader = TreeHash(stage);
            var priorLoader = Directory.Exists(active) ? TreeHash(active) : null;
            var journal = StatePath(root, target) + ".transaction.json";
            var transaction = new Transaction { Target = target, Stage = stage, Backup = backup, OriginalHash = hash, LoaderHash = expectedLoader, PriorLoaderHash = priorLoader, OriginalMoved = !File.Exists(original) };
            Save(journal, transaction);
            var movedOriginal = false; var movedLoader = false; var activated = false; var committed = false;
            try {
                if (!File.Exists(original)) { File.Move(active, original); movedOriginal = true; } else if (Directory.Exists(active)) { Directory.Move(active, backup); movedLoader = true; }
                progress(new InstallProgress("backup", "Previous loader preserved. Recovery journal written.", true));
                if (failAt == "interrupted") return null;
                if (failAt == "before-activation") throw new IOException("Deliberate installer transaction failure.");
                progress(new InstallProgress("activate", "Activating app.asar loader and checking installed files...", false));
                Directory.Move(stage, active); activated = true;
                if (FileHash(original) != hash || TreeHash(active) != expectedLoader) throw new IOException("Activated files failed verification.");
                progress(new InstallProgress("activate", "Kittencord loader activated. Original Discord archive verified.", true));
                progress(new InstallProgress("commit", "Recording installation and recovery metadata...", false));
                var state = new Installation { Version = version, Target = target, OriginalHash = hash, LoaderHash = expectedLoader, Core = core, CoreHash = digest, OriginalMoved = existing != null ? existing.OriginalMoved : movedOriginal, RestoreLoader = existing != null ? existing.RestoreLoader : movedLoader ? backup : null, RestoreLoaderHash = existing != null ? existing.RestoreLoaderHash : priorLoader, InstalledAt = DateTime.UtcNow.ToString("o") };
                if (failAt == "before-commit") throw new IOException("Deliberate installer commit failure.");
                RetainRecord(root, state); Save(stateFile, state); committed = true; transaction.Phase = "installed"; Save(journal, transaction); progress(new InstallProgress("commit", "Installation recorded. Previous loader remains recoverable.", true)); return state;
            } catch {
                if (!committed) { if (activated) Directory.Move(active, Child(resources, "kittencord-failed-" + id)); if (movedLoader) Directory.Move(backup, active); if (movedOriginal) File.Move(original, active); transaction.Phase = "reverted"; Save(journal, transaction); }
                throw;
            }
        }
        public static void Uninstall(string directory, string dataRoot, bool close, Action<InstallProgress> progress) { Uninstall(directory, dataRoot, close, progress, null); }
        public static void Uninstall(string directory, string dataRoot, bool close, Action<InstallProgress> progress, string failAt) {
            progress(new InstallProgress("verify", "Checking installed files and the previous loader backup...", false));
            var target = Full(directory); var resources = ValidateTarget(target); var root = Full(dataRoot); var stateFile = StatePath(root, target); if (!File.Exists(stateFile)) throw new IOException("No Kittencord installation journal exists for this Discord instance.");
            Recover(target, root, close, progress);
            var state = ReadState(stateFile, target, resources, root); var active = Child(resources, "app.asar"); var original = Child(resources, "_app.asar");
            if (!Directory.Exists(active) || TreeHash(active) != state.LoaderHash) state = Verify(target, root);
            if (!Directory.Exists(active) || TreeHash(active) != state.LoaderHash || !File.Exists(original) || FileHash(original) != state.OriginalHash) throw new IOException("Discord files changed after installation. They were preserved; automatic removal was refused.");
            if (!String.IsNullOrEmpty(state.RestoreLoader) && (!Directory.Exists(state.RestoreLoader) || TreeHash(state.RestoreLoader) != state.RestoreLoaderHash)) throw new IOException("The previous loader backup is missing or changed. No files were changed.");
            progress(new InstallProgress("verify", "Installed files and recovery copy checked.", true));
            progress(new InstallProgress("close", "Waiting for the selected Discord installation to close...", false));
            CloseDiscord(target, close); progress(new InstallProgress("close", "Selected Discord installation is closed.", true));
            progress(new InstallProgress("restore", "Restoring the previous Discord loader...", false));
            var retired = Child(resources, "kittencord-removed-" + Guid.NewGuid().ToString("N"));
            var journal = stateFile + ".transaction.json";
            var transaction = new Transaction { Target = target, Operation = "remove", Retired = retired, OriginalHash = state.OriginalHash, LoaderHash = state.LoaderHash, OriginalMoved = state.OriginalMoved, RestoreLoader = state.RestoreLoader, RestoreLoaderHash = state.RestoreLoaderHash };
            Save(journal, transaction); Directory.Move(active, retired);
            if (failAt == "interrupted-before-restore") return;
            try { if (!String.IsNullOrEmpty(state.RestoreLoader)) Directory.Move(state.RestoreLoader, active); else if (state.OriginalMoved) File.Move(original, active); else throw new IOException("A prior loader cannot be restored automatically."); }
            catch { Directory.Move(retired, active); throw; }
            if (failAt == "interrupted-after-restore") return;
            progress(new InstallProgress("restore", "Previous Discord loader restored.", true));
            progress(new InstallProgress("commit", "Recording restoration. Keeping Kittencord settings and backups...", false));
            File.Move(stateFile, Child(root, "removed-" + Guid.NewGuid().ToString("N") + ".json")); transaction.Phase = "removed"; Save(journal, transaction); progress(new InstallProgress("commit", "Restoration recorded. Settings and backups were kept.", true));
        }
    }
}
