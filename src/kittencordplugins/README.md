# KittenCord plugins

Plugins written for KittenCord itself. Inherited plugins stay in their upstream folders:
`src/plugins` (Vencord), `src/equicordplugins` (Equicord) and `src/testcordplugins` (TestCord).

| Folder | Plugin | Platform |
|---|---|---|
| `kittyMediaLab` | Media Lab: crop, resize and convert images; trim and compress videos with local FFmpeg | Desktop and web |
| `kittyMiniDock.desktop` | Mini Dock: a compact voice window with live participants and voice controls | Desktop |
| `kittyTimeCapsule` | Time Capsule: local message reminders with scheduling, snooze and a link back | Desktop and web |
| `kittyVoiceLog` | Voice Log: a recap of every call you join, with who was there, how long each person stayed and a timeline | Desktop and web |
| `kittyVoiceLab.web` | Voice Lab: browser microphone effects with live presets | Web only |

Each plugin sets `authors: [Devs.Kittencord]`. Plugins marked `kittencordOrigin: "original"` show under the
KittenCord filter in Plugins. Core KittenCord plugins that must always run (`kittycordCloud`, `nativeThemePreviews`)
stay in `src/plugins/_core`.
