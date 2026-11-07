/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const kittycordChangelog = [{
    id: "0.9.1", date: "2026-11-07", title: "KittenCord 0.9.1", changes: [
        "Works with Discord's new update. Discord changed how its code is packaged, which left Discord stuck on \"Starting\" with KittenCord installed. Includes Vencord's and Equicord's fixes for this update.",
        "Setup reinstalls KittenCord when Discord restored its own files after an update or repair, instead of refusing."
    ], limitations: "Windows desktop only. Setup is not code-signed yet, so Windows SmartScreen may warn about it."
}, {
    id: "0.9.0", date: "2026-11-05", title: "KittenCord 0.9.0", changes: [
        "First release. Setup is small (2.7 MB): it downloads KittenCord from the GitHub release, checks its SHA-256 and restarts Discord. Run it again to repair or choose Restore to remove KittenCord.",
        "Plugins page: about 800 plugins from Vencord, Equicord, TestCord and KittenCord, with search, filters, a list or card view, counts and per-plugin health. Plugin Studio is a tab on the same page.",
        "Themes page adds a Theme Library and a Snippet Library.",
        "KittenCord plugins: Media Lab, Mini Dock, Time Capsule and the new Voice Log, a recap of every call you join.",
        "Badges: choose and order your KittenCord badges. Vencord, Equicord and TestCord badges keep showing.",
        "Safe Start: after two failed starts in a row, only the plugin that caused it stays off for one launch, and KittenCord tells you which one.",
        "Transparent windows can be moved from Discord's top bar, and the window buttons are back.",
        "A redesigned setup window."
    ], limitations: "Windows desktop only. Setup is not code-signed yet, so Windows SmartScreen may warn about it."
}, {
    id: "0.9.0-beta-1", date: "2026-11-03", title: "Kittencord 0.9.0 Beta 1", changes: [
        "Cloud source editing adds file creation, renaming, deletion, entry selection and source comparisons. Native packages keep their existing build and runtime.",
        "Media Lab adds a draggable image crop frame, real video thumbnails and trim handles. Precise controls are available under Advanced.",
        "New badge artwork passes the client metadata checks while existing cloud assignments keep their place in the native badge row.",
        "Safe Start no longer disables saved plugins after incomplete launches. Old global pause flags are cleared while plugin settings and startup history are preserved.",
        "Time Capsule adds local message reminders. Desktop MiniDock adds a native voice window using Discord's existing popout and voice APIs.",
        "Cloud source uploads support multiple files and project folders. Native Market installation opens a source review before compilation and registration.",
        "The public website and Cloud dashboard use separate, consistent designs. Client startup readiness is reported independently of optional Cloud connectivity.",
        "Authors can verify a GitHub connection through Discord. Verified repository imports pin a commit and preserve source files and attribution."
    ], limitations: "0.9.0 upgrade in progress. Not a published stable release. GitHub verification needs the account holder to approve Discord Connections. Remote owner publishing and direct Discord qualification of the new desktop window and voice controls remain pending. Existing signed-update requirements remain in effect."
}, {
    id: "0.8.1-beta-2", date: "2026-11-01", title: "Kittencord 0.8.1 Beta 2", changes: [
        "Saved plugin choices stay intact during recovery. Account setup changes are saved before restarting.",
        "Community badges share the profile badge row, with clearer tooltips and saved appearance choices.",
        "Studio keeps working drafts and adds source templates, theme-aware Monaco and simpler navigation.",
        "Notifications work locally without connecting an account. Profiles have separate saved plugin, theme and settings controls.",
        "Health, filters and dropdown placement are clearer. The website separates built-in plugins, published plugins and visual packages."
    ], limitations: "Local beta; automatic distribution is disabled. Discord host integration still needs live qualification. Custom badges are KittenCord cosmetics. Native Cave outgoing audio and recording detection are unavailable."
}, {
    id: "0.8.0-beta-1", date: "2026-10-30", title: "Kittencord 0.8.0 Beta 1", changes: [
        "New cosmic kitten branding, a dark pink and violet website, and the original installer artwork with the new emblem.",
        "Developer tools have a cleaner workspace and shortcuts to a working toolbar example and its source.",
        "Profile badges have refreshed artwork. The name decoration is a single developer crown with no surrounding stars.",
        "Fixed a missing author entry that could crash the installed plugin list. Original author and source attribution are preserved.",
        "Settings use anchored filters, compact navigation tiles and clearer plugin cards. Health keeps internal modules behind a separate switch.",
        "Plugin Studio has a wider source editor and a resizable file pane. Open editor launches the packaged Monaco workspace.",
        "Profiles can save, apply and restore this account’s plugin and local theme selections. Applying a setup reloads Discord.",
        "Market includes editable theme and CSS snippet examples by xtufa7. Cloud cards display uploaded preview images.",
        "Community badges use verified cloud assignments. OPAL remains owner-controlled; local badge previews do not grant official Discord badges."
    ], limitations: "Custom badges appear in compatible Kittencord clients and do not grant Discord entitlements. Badge ordering is saved on this device. Automatic updates remain disabled until a signed release is published. Private webhook delivery requires the owner to configure a destination."
}, {
    id: "0.7.10-development", date: "2026-10-29", title: "Kittencord 0.7.10", changes: [
        "Plugin Studio now has one Install & run action, a source-first editor, file tabs and collapsible project details and diagnostics.",
        "Removed No-Code Builder, AI Forge and Developer Dashboard from settings, shortcuts and feature navigation.",
        "Sharper cards, compact controls and subtle page and card motion replace oversized rounded panels and placeholder plugin icons.",
        "Earlier builds used a local owner appearance. KittenCord 0.8 replaces its assignments with verified cloud badges.",
        "Windows setup blends the supplied artwork across its full background and uses simpler labels. Upstream contribution promotions were removed from Home; source credits remain."
    ], limitations: "Profile appearances are visible in clients running this Kittencord version. They do not change Discord account entitlements. The badge collection includes inherited styles and additional entries exposed by the loaded Discord catalog."
}, {
    id: "0.7.9-development", date: "2026-10-29", title: "Kittencord 0.7.9", changes: [
        "Native Plugin Studio compiles definePlugin projects with the inherited esbuild toolchain and registers them in the real PluginManager registry.",
        "Native JS, TS, JSX, TSX, relative files and managed CSS reuse existing React, Webpack, Settings and API module bindings.",
        "Async startup and cleanup results, real error stacks, dynamic Local cards and canonical plugin settings are reflected in Studio.",
        "Source patches and early hooks persist for loading before initPluginManager on client reload; already applied patches are never advertised as instant hot reload.",
        "Existing worker projects remain editable and can migrate through a native lifecycle adapter with an original-source backup."
    ], limitations: "Native projects are trusted client source. Unsupported renderer aliases and native.ts helpers need source-build integration. esbuild checks syntax and bundling, not full TypeScript semantic types. Browser native source installation still requires a packaged extension build."
}, {
    id: "0.7.8-development", date: "2026-10-29", title: "Kittencord 0.7.8", changes: [
        "Desktop Local plugins can read loaded Discord data, add buttons to the chat, channel header and user area, and own removable stylesheets.",
        "Studio supports declared HTTPS origins, bounded resource downloads and SHA-256 pinned worker scripts, with editable permissions and preserved Local source projects.",
        "Plugin cards show publisher identity, GitHub links and source attribution. Installation uses a clear Install to Local action.",
        "Navigation can group multiple pages under one sidebar entry. AI Forge, Performance and Changelog no longer repeat inside their default groups.",
        "Earlier owner badge experiments are superseded by the cloud badge registry in 0.8."
    ], limitations: "Desktop preview uses simulated channel data. Browser external-code restrictions remain. Downloaded scripts run in the plugin worker; Node processes, unrestricted DOM and credential access are not part of this API. Community badges are client-side Kittencord cosmetics."
}, {
    id: "0.7.7-development", date: "2026-10-28", title: "Kittencord 0.7.7 development", changes: [
        "Studio imports editable projects, verified packages and JavaScript or TypeScript drafts, and functional JavaScript projects can be added directly to Local after review.",
        "Project format errors name the unsupported fields. Source reviews show affected lines while installation and runtime checks remain enforced.",
        "Customize navigation sits below the community card, with a compact control. Tool headings are flat and Studio offers a visual icon picker.",
        "Windows setup tolerates a process ending while its executable path is being inspected."
    ], limitations: "Development build. External runtime supports its declared utility or color API. Discord source plugins still require a source build. TypeScript package compilation uses Monaco. Public publishing and updates still require service and signing configuration."
}, {
    id: "0.7.6-development", date: "2026-10-28", title: "Kittencord 0.7.6 development", changes: [
        "Settings use shared violet design tokens, rounded SVG containers, compact notices and consistent controls with reduced motion support.",
        "Functional plugins and the visual KittenCord Market have separate libraries, filters, detail tabs and reviewed installation flows.",
        "Plugin Studio adds six creation steps, Local drafts, README upload/preview/GitHub import, public GitHub avatars and preserved edition attribution.",
        "The public publishing service derives OWNER versus USER identity from authenticated numeric Discord IDs and controls official edition content on the backend."
    ], limitations: "Development build. Settings renderer tests simulate Discord host APIs; live Discord qualification remains separate. GitHub metadata does not verify ownership. Unsupported visual pack formats, public OAuth deployment and configured public updates remain unavailable."
}, {
    id: "0.7.5-development", date: "2026-10-28", title: "Kittencord 0.7.5 development", changes: [
        "Local plugins gain source editing and separate forks, reviewed source diffs, permission changes, snapshots, runtime restart and security reports.",
        "KittenCord Security Engine adds desktop AST source analysis and configurable periodic scans. Source remains preserved when policy blocks admission.",
        "A same-origin owner dashboard service implements Discord OAuth, server-side numeric-ID authorization, immutable signed releases, moderation and aggregate diagnostics.",
        "Signed Windows installer channels support release notes, notifications, verified staging and a native confirmation before installation and restart. Channel URL and pinned keys must be configured."
    ], limitations: "Development build. Real Discord OAuth and public updates are unconfigured until an application, HTTPS service/release URLs and signing keys are supplied. Backend provider tests use local fixtures; current Discord UI qualification remains separate."
}, {
    id: "0.7.4-development", date: "2026-10-28", title: "Kittencord 0.7.4 development", changes: [
        "A standalone website source lives in website, with real plugin search, editable tool projects, a local Link Lens demo and attributed artwork.",
        "Five direct sidebar shortcuts restore Marketplace, Local Plugins, Performance, AI Forge and Changelog without removing the grouped tools.",
        "The configured creator account gets KITTENCORD DEV and KITTYCORD STAR badges, plus a star beside supported nickname surfaces in this distribution."
    ], limitations: "Development distribution. Public repository/release URLs are not assumed. Live Discord badge integration and full release acceptance still require qualification."
}, {
    id: "0.7.3-development", date: "2026-10-28", title: "Kittencord 0.7.3 development", changes: [
        "Maintainer xtufa7 and linked upstream/tool credits are visible in Kittencord and Windows setup.",
        "The build banner has an RGB cat. Local user badges use a pink cat, with a gold owner badge bound to the configured account ID and reduced-motion-aware hover effects.",
        "Setup has a two-line Discord path picker, consistent action icons, a restart switch and fewer labels. Badges no longer add a hidden marker to account pronouns."
    ], limitations: "Client-side cosmetic badges are visible in this distribution, not official Discord verification. Whole-client performance, live AI generation and full release acceptance remain open."
}, {
    id: "0.7.2-development", date: "2026-10-28", title: "Kittencord 0.7.2 development", changes: [
        "Settings use compact Plugins, Studio, Diagnostics, Appearance and System groups with keyboard-accessible tabs. All existing tools remain available.",
        "Startup recovery moves into one action card below the home card. Build and sidebar-customization details are collapsible.",
        "Windows setup uses a styled Discord selector, consistent action buttons, real progress stages and a tabbed license and artwork dialog."
    ], limitations: "Unsigned development candidate. Browser remote-code restrictions and existing platform/API limitations still apply. Full Phase 7/8 production acceptance remains open."
}, {
    id: "0.7.1-development", date: "2026-10-27", title: "Kittencord 0.7.1 development", changes: [
        "Link Lens, JSON Workbench and Timestamp Studio add editable functional Marketplace projects with Local settings and actions.",
        "Plugin Manager includes imported runtime packages under its Local filter alongside source plugins, with readable results and expandable diagnostics.",
        "Windows setup displays completed verification, backup, injection and recovery-record stages, then a clear completion screen."
    ], limitations: "Unsigned development candidate. Utility packages support bounded local tools, not arbitrary Discord or native APIs. Browser extensions require reviewed packaged code. Full production acceptance remains open."
}, {
    id: "0.7.0-development", date: "2026-10-27", title: "Kittencord 0.7.0 development", changes: [
        "Kittycord is now Kittencord. Existing preference namespaces, plugin APIs and upstream contributor credits are retained.",
        "An offline Windows installer verifies the bundled core, preserves the previous loader and supports repair, recovery and restoration.",
        "Independent Kittencord desktop and browser artifact names are available alongside compatibility aliases."
    ], limitations: "Unsigned development candidate. Artwork supplied by the user is included only in the local custom installer; redistribution permission is unverified. Live AI, full portable update qualification and platform/performance gates remain open."
}, {
    id: "0.6.0-development", date: "2026-10-27", title: "Kittycord 0.6.0 development", changes: [
        "Native Plugin Studio now uses packaged Monaco and a dedicated isolated preview with actions, settings, startup tests, reload and worker cleanup.",
        "No-Code Builder adds restricted functional workflows, interactive preview and exports to Studio and Local packages.",
        "Windows portable loader tools support a user-supplied Discord runtime, separate data, signed release verification, backups and startup-confirmed rollback."
    ], limitations: "Development milestone, not full release acceptance. Live local AI requires an installed model; portable host/platform, full performance and production signing/distribution gates are tracked in the current report."
}, {
    id: "0.5.0-development", date: "2026-10-27", title: "Kittycord 0.5.0 development", changes: [
        "Functional Local utilities now support settings, button actions and worker timers, with a Focus Sessions project and runtime rollback tests.",
        "Kitty Doctor unifies the inherited TestCord diagnostics, profiler and module finder with local package recovery in one tool.",
        "Marketplace includes Local plugins, current build/changelog and the packaged KittyVoiceLab browser microphone effect integration, with TestCord DSP credits.",
        "The separate packaged AI assistant supports Gemini/OpenAI model discovery, session-only API keys, explicit prompt consent and local feature navigation."
    ], limitations: "Phase 7 functional milestone. Phase 8 is not complete. Live AI keys/models, audible Discord calls and broad native UI qualification remain unverified. No stalking or unattended account automation was added."
}, {
    id: "0.4.0-development", date: "2026-10-27", title: "Kittycord 0.4.0 development", changes: [
        "Packaged Plugin Studio reuses Monaco with JavaScript/TypeScript diagnostics, API completions, project import/export and validated package output.",
        "No-Code Builder exports strict declarative color packages and editable Studio projects with color assertions.",
        "AI Forge prepares explicit request previews; OpenAI-compatible and Ollama CLI adapters require approval of the exact request before sending.",
        "Smart Discovery searches a curated subset of real packaged and signed-catalog metadata without uploading the request."
    ], limitations: "Initial Phase 7 milestone. General Discord plugin APIs, native Studio windows, real AI-provider qualification and remaining Phase 4/5/6 gates are open."
}, {
    id: "0.3.0-development", date: "2026-10-27", title: "Kittycord 0.3.0 development", changes: [
        "Kitty Marketplace: an offline, signed development catalog with two real example packages, search, release history and permission review.",
        "Catalog packages open the normal Plugin Manager review. Installation remains disabled by default and browser external installation stays unavailable.",
        "Trusted catalog blocklists protect package startup, installation and backup restoration, with Doctor findings and explicit quarantine.",
        "Package compatibility reports show platform restrictions, dependencies and capability conflicts without claiming universal adapters."
    ], limitations: "Initial Phase 6 implementation. Development catalog signer only; no public marketplace or verified publishers. Live Discord UI and remaining Phase 4/5 qualification gates are open."
}, {
    id: "0.2.2-development", date: "2026-10-27", title: "Kittycord 0.2.2 development", changes: [
        "Browser builds exclude four additional plugins requiring remote libraries or arbitrary source execution, with visible availability reasons.",
        "Browser support tools no longer offer executable chat snippets or LiveFix evaluation. Desktop behavior is preserved.",
        "Browser qualification records navigation progress and visible editor failures instead of treating package acceptance as runtime success."
    ], limitations: "Phase 5 remains in qualification. Actual Discord startup, browser restart persistence, Helium editing and Edge need verified results."
}, {
    id: "0.2.1-development", date: "2026-10-26", title: "Kittycord 0.2.1 development", changes: [
        "Compact tools with unified icons, grouped controls and expandable technical details.",
        "Legacy default build banners migrate to live Kittycord version and channel tokens.",
        "Corrected modal titles and prefilled profile override values."
    ], limitations: "Development build. Browser restart and compatibility results are recorded in the local milestone report."
}, {
    id: "0.2.0-development", date: "2026-10-26", title: "Kittycord 0.2.0 development", changes: [
        "Kitty Plugin Workshop: edit metadata and isolated JavaScript, then validate and export a reviewable package without executing it.",
        "Kitty Doctor: recheck stored artifact hashes, detect dependency and capability conflicts, and inspect runtime recovery findings.",
        "Bundled offline changelog and direct Add your own plugin entry in Kitty Plugin Manager.",
        "Native Discord button styling, explicit upstream diagnostics attribution and Kittycord version/icon aliases in the optional PanelLayout banner."
    ], limitations: "Starter tools and development browser builds. General plugin APIs, full Plugin Studio, Marketplace, AI Forge and complete performance/platform qualification remain open."
}, {
    id: "0.1.0-development", date: "2026-10-26", title: "Kittycord 0.1.0 development", changes: [
        "Independent Kittycord identity, settings namespaces and desktop/browser development artifacts.",
        "Restricted external JavaScript and color packages with integrity review, dependency checks and stateful hot replacement on compatible desktop hosts.",
        "Safe Start, interrupted-operation recovery and rollback after a failed plugin replacement.",
        "Local performance reports, sampling controls and reviewed account-profile preferences.",
        "Packaged browser QuickCSS editor, explicit external-code restrictions and browser-compatible plugin exclusions."
    ], limitations: "Development build. Full Plugin Studio, Marketplace, AI Forge, general runtime APIs, signed installed updates and full performance/platform qualification remain incomplete."
}] as const;
