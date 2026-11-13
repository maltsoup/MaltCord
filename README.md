<div align="center">

<img src=".github/assets/logo.png" width="160" alt="MaltCord logo">

# MaltCord

**A KittenCord fork with extra plugins.**

About 800 plugins, a Theme Library, Plugin Studio and badges,<br>inside the Discord you already use.

[![Release](https://img.shields.io/github/v/release/maltsoup/MaltCord?include_prereleases&style=for-the-badge&color=b996ff&label=release)](https://github.com/maltsoup/MaltCord/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/maltsoup/MaltCord/total?style=for-the-badge&color=ff8fd8)](https://github.com/maltsoup/MaltCord/releases)
[![Discord](https://img.shields.io/badge/Discord-Join_us-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/7bZ5qKdDR)
[![License](https://img.shields.io/github/license/maltsoup/MaltCord?style=for-the-badge&color=9fb4ff)](LICENSE)

[**Download for Windows**](https://github.com/maltsoup/MaltCord/releases/latest/download/MaltCordSetup.exe) &nbsp;•&nbsp;
[**Chrome / Edge**](https://github.com/maltsoup/MaltCord/releases/latest/download/MaltCord-Chrome-Edge.zip) &nbsp;•&nbsp;
[**Firefox**](https://github.com/maltsoup/MaltCord/releases/latest/download/MaltCord-Firefox.zip)

<img src=".github/assets/settings-plugins.jpg" width="720" alt="The KittenCord Plugins page inside Discord settings">

</div>

> **MaltCord is a fork of [KittenCord](https://github.com/xtufa7/KittenCord)**, which is itself built on TestCord, Equicord and Vencord. All credit for the original work goes to those projects and their authors. The downloads below are MaltCord releases built from this repository. This fork adds **PresencePal** (shows you as playing any game, detected like a real one, Windows desktop), **StaffVoiceAlert** (plays a sound when a moderator, admin or other staff member joins your voice channel) and **MaltCordBadges** (custom profile badges with an owner-only editor).

## ✨ Features

- 🧩 **About 800 plugins** from Vencord, Equicord, TestCord and KittenCord, each with its original authors
- 🔎 **Plugin manager** with search, filters, a list or card view and the health of every plugin
- 🎨 **Theme Library and Snippet Library** built into the Themes page
- 🛠️ **Plugin Studio**: write a TypeScript plugin, build it and run it without leaving Discord
- 🏅 **KittenCord badges**, while your Vencord, Equicord and TestCord badges keep showing
- 🛟 **Safe Start**: if a plugin stops Discord from starting, only that plugin is turned off and you are told why
- 🪟 **See-through windows** that you can still move from the top bar
- 🐾 **KittenCord's own settings section** that follows your Discord theme

### MaltCord plugins

| Plugin | What it does |
| --- | --- |
| **PresencePal** | Show your Discord status as playing any game. Runs a small stub named after the game so Discord detects it. Windows desktop only |
| **StaffVoiceAlert** | Plays a sound when a member with staff permissions joins your voice channel. Off by default |
| **MaltCordBadges** | Custom profile badges, with an editor only the MaltCord owner can open |

### KittenCord originals

| Plugin | What it does |
| --- | --- |
| **Voice Log** | A recap of every call you join: who was there, how long they stayed and when they came and went |
| **Media Lab** | Crop, resize and convert images locally. Trim and compress videos with FFmpeg |
| **Mini Dock** | A compact voice window with live participants, speaking indicators and controls |
| **Time Capsule** | Message reminders with scheduling, snooze and a link back to the conversation |

## 📥 Installing

### 🪟 Windows

1. Download [`MaltCordSetup.exe`](https://github.com/maltsoup/MaltCord/releases/latest/download/MaltCordSetup.exe).
2. Run it, choose your Discord installation and click **Install / Repair**.
3. Open Discord settings. KittenCord has its own section in the sidebar.

Setup includes MaltCord, so it needs no download while installing. It is not code-signed yet, so Windows SmartScreen may warn you. Choose **More info**, then **Run anyway**.

### 🌐 Browser

<details>
<summary><b>Chrome, Edge, Brave, Opera</b></summary>

1. Download [`MaltCord-Chrome-Edge.zip`](https://github.com/maltsoup/MaltCord/releases/latest/download/MaltCord-Chrome-Edge.zip) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked**, pick the unzipped folder and open [discord.com](https://discord.com/app).

</details>

<details>
<summary><b>Firefox</b></summary>

1. Download [`MaltCord-Firefox.zip`](https://github.com/maltsoup/MaltCord/releases/latest/download/MaltCord-Firefox.zip).
2. Open `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on**.
3. Pick the zip and open [discord.com](https://discord.com/app). Firefox removes temporary add-ons when it closes.

</details>

### 🗑️ Uninstalling

Run `MaltCordSetup.exe` again and choose **Restore**. Your KittenCord settings are kept in case you come back. In the browser, remove the extension.

## 🧑‍💻 Building from source

You need [Node.js](https://nodejs.org) 22 or newer and [pnpm](https://pnpm.io).

```sh
git clone https://github.com/maltsoup/MaltCord
cd MaltCord
pnpm install --frozen-lockfile
pnpm build        # desktop
pnpm inject       # install your build into Discord
pnpm buildWeb     # browser extensions, written to dist/
```

Want to help? Read [CONTRIBUTING.md](CONTRIBUTING.md).

## 💜 Community

Questions, ideas and bug reports are welcome in the [Discord server](https://discord.gg/7bZ5qKdDR) or in [GitHub issues](https://github.com/maltsoup/MaltCord/issues).

## 🙏 Credits

MaltCord is a fork of [KittenCord](https://github.com/xtufa7/KittenCord), which is built on [TestCord](https://github.com/TestcordDev/TestCord), [Equicord](https://github.com/Equicord/Equicord) and [Vencord](https://github.com/Vendicated/Vencord). Thank you to everyone who made them and their plugins.

## ⚖️ Disclaimer

Discord is a trademark of Discord Inc. and is mentioned only to describe what KittenCord works with. KittenCord is not affiliated with or endorsed by Discord Inc.

<details>
<summary>Using KittenCord violates Discord's terms of service</summary>

Client modifications are against Discord's Terms of Service.

However, Discord is pretty indifferent about them and there are no known cases of users getting banned for using client mods. So you should generally be fine if you don't use plugins that implement abusive behaviour.

Regardless, if your account is very important to you and it getting disabled would be a disaster for you, you should probably not use any client mods (not exclusive to KittenCord), just to be safe.

</details>

<div align="center">

MaltCord by [maltsoup](https://github.com/maltsoup), based on KittenCord by [xtufa7](https://github.com/xtufa7) · Licensed under [GPL-3.0-or-later](LICENSE)

</div>
