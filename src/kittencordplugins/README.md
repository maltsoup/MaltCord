# MaltCord plugins

Plugins written for KittenCord itself. Inherited plugins stay in their upstream folders:
`src/plugins` (Vencord), `src/equicordplugins` (Equicord) and `src/testcordplugins` (TestCord).

| Folder | Plugin | Platform |
|---|---|---|
| `kittyMediaLab` | Media Lab: crop, resize and convert images; trim and compress videos with local FFmpeg | Desktop and web |
| `kittyMiniDock.desktop` | Mini Dock: a compact voice window with live participants and voice controls | Desktop |
| `presencePal.desktop` | PresencePal: shows you as playing any game, detected like a real one, by maltsoup | Desktop |
| `maltAnnouncements` | MaltCord Announcements: a top bar bell with announcements from a JSON feed, by maltsoup | Desktop and web |
| `voiceAlts.desktop` | Voice Alts: right-click a voice channel to make your Multi-instance accounts join it, starting closed ones, with the same microphone, by maltsoup | Desktop |
| `streamingStatus` | Streaming Status: purple Streaming status only while you stream in a voice call, by maltsoup | Desktop and web |
| `staffVoiceAlert` | Staff Voice Alert: plays a sound when staff (by permission) join your voice channel, by maltsoup | Desktop and web |
| `maltBadges` | MaltCord Badges: custom profile badges with an owner-only badge editor, by maltsoup | Desktop and web |
| `kittyTimeCapsule` | Time Capsule: local message reminders with scheduling, snooze and a link back | Desktop and web |
| `kittyVoiceLog` | Voice Log: a recap of every call you join, with who was there, how long each person stayed and a timeline | Desktop and web |
| `kittyVoiceLab.web` | Voice Lab: browser microphone effects with live presets | Web only |

Plugins marked `kittencordOrigin: "original"` come from KittenCord and show under the KittenCord filter in Plugins.
Plugins written for MaltCord itself (`presencePal.desktop`, `staffVoiceAlert`, `streamingStatus`, `voiceAlts.desktop`, `maltAnnouncements`, `maltBadges`) set `maltcordOrigin: true` and
`authors: [Devs.Maltsoup]`, and show under their own MaltCord filter. Core MaltCord plugins that must always run (`kittycordCloud`, `nativeThemePreviews`)
stay in `src/plugins/_core`.
