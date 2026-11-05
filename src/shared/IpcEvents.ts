/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export const enum IpcEvents {
    KITTYCORD_PLUGIN_NETWORK = "KittycordPluginNetwork",
    KITTYCORD_GITHUB_PUBLIC = "KittycordGithubPublic",
    KITTYCORD_SECURITY_SCAN = "KittycordSecurityScan",
    KITTYCORD_UPDATES = "KittycordSignedUpdates",
    KITTYCORD_CLOUD = "KittencordCloud",
    KITTYCORD_DIAGNOSTICS = "KittencordDiagnostics",
    KITTYCORD_NATIVE_STUDIO = "KittencordNativeStudio",
    KITTYCORD_NATIVE_STUDIO_STARTUP = "KittencordNativeStudioStartup",
    KITTYCORD_STUDIO_OPEN = "KittycordStudioOpen",
    KITTYCORD_STUDIO_COMMAND = "KittycordStudioCommand",
    KITTYCORD_STUDIO_PROJECT = "KittycordStudioProject",
    INIT_FILE_WATCHERS = "VencordInitFileWatchers",
    QUICK_CSS_UPDATE = "VencordQuickCssUpdate",
    OPEN_QUICKCSS = "VencordOpenQuickCss",
    GET_QUICK_CSS = "VencordGetQuickCss",
    SET_QUICK_CSS = "VencordSetQuickCss",
    UPLOAD_THEME = "VencordUploadTheme",
    DELETE_THEME = "VencordDeleteTheme",
    GET_THEMES_LIST = "VencordGetThemesList",
    GET_THEME_DATA = "VencordGetThemeData",
    GET_THEME_SYSTEM_VALUES = "VencordGetThemeSystemValues",
    GET_SETTINGS_DIR = "VencordGetSettingsDir",
    GET_SETTINGS = "VencordGetSettings",
    KITTYCORD_RECOVERY_STATUS = "KittycordRecoveryStatus",
    KITTYCORD_RECOVERY_COMPLETE = "KittycordRecoveryComplete",
    KITTYCORD_RECOVERY_MODE = "KittycordRecoveryMode",
    KITTYCORD_RECOVERY_ALLOW = "KittycordRecoveryAllow",
    KITTYCORD_RECOVERY_RESTORE = "KittycordRecoveryRestore",
    KITTYCORD_RECOVERY_MARK = "KittycordRecoveryMark",
    KITTYCORD_WINDOW_DRAG = "KittycordWindowDrag",
    KITTYCORD_RECOVERY_BLAME = "KittycordRecoveryBlame",
    KITTYCORD_SANDBOX_OPEN = "KittycordSandboxOpen",
    KITTYCORD_SANDBOX_CLOSE = "KittycordSandboxClose",
    KITTYCORD_SANDBOX_PORT = "KittycordSandboxPort",
    KITTYCORD_SANDBOX_READY = "KittycordSandboxReady",
    SET_SETTINGS = "VencordSetSettings",
    GET_PRESETS = "VencordGetPresets",
    SET_PRESETS = "VencordSetPresets",
    THEME_UPDATE = "VencordThemeUpdate",
    OPEN_EXTERNAL = "VencordOpenExternal",
    GET_UPDATES = "VencordGetUpdates",
    GET_REPO = "VencordGetRepo",
    UPDATE = "VencordUpdate",
    FORCE_UPDATE = "VencordForceUpdate",
    BUILD = "VencordBuild",
    OPEN_MONACO_EDITOR = "VencordOpenMonacoEditor",
    GET_MONACO_THEME = "VencordGetMonacoTheme",

    GET_PLUGIN_IPC_METHOD_MAP = "VencordGetPluginIpcMethodMap",

    CSP_IS_DOMAIN_ALLOWED = "VencordCspIsDomainAllowed",
    CSP_REMOVE_OVERRIDE = "VencordCspRemoveOverride",
    CSP_REQUEST_ADD_OVERRIDE = "VencordCspRequestAddOverride",

    OPEN_THEMES_FOLDER = "VencordOpenThemesFolder",
    OPEN_SETTINGS_FOLDER = "VencordOpenSettingsFolder",
    GET_RENDERER_CSS = "VencordGetRendererCss",
    RENDERER_CSS_UPDATE = "VencordRendererCssUpdate",
    PRELOAD_GET_RENDERER_JS = "VencordPreloadGetRendererJs",

    SET_TRAY_UPDATE_STATE = "VencordSetTrayUpdateState",
    TRAY_REPAIR = "VencordTrayRepair",
    TRAY_CHECK_UPDATES = "VencordTrayCheckUpdates",
    TRAY_ABOUT = "VencordTrayAbout",
    SUPPORTS_WINDOWS_MATERIAL = "VencordSupportsWindowsMaterial",

    // Privacy & Security Command Center IPC Events
    PRIVACY_GET_DATA = "TestCordPrivacyGetData",
    PRIVACY_TOGGLE_SHIELD = "TestCordPrivacyToggleShield",
    PRIVACY_SET_DNS_PROVIDER = "TestCordPrivacySetDnsProvider",
    PRIVACY_SET_DNS_ENABLED = "TestCordPrivacySetDnsEnabled",
    PRIVACY_ADD_CUSTOM_DNS = "TestCordPrivacyAddCustomDns",
    PRIVACY_PING_LATENCIES = "TestCordPrivacyPingLatencies",
    PRIVACY_RUN_DIAGNOSTIC = "TestCordPrivacyRunDiagnostic",
    PRIVACY_STOP_DIAGNOSTIC = "TestCordPrivacyStopDiagnostic",
    PRIVACY_CLEAR_DNS_CACHE = "TestCordPrivacyClearDnsCache",
    PRIVACY_CLEAR_LOGS = "TestCordPrivacyClearLogs",
    PRIVACY_INCREMENT_COUNTER = "TestCordPrivacyIncrementCounter",
    PRIVACY_GET_HOST_RULES = "TestCordPrivacyGetHostRules",
    PRIVACY_SET_HOST_RULE = "TestCordPrivacySetHostRule",
    PRIVACY_CLEAR_HOST_RULE = "TestCordPrivacyClearHostRule",
    PRIVACY_ACK_ALERTS = "TestCordPrivacyAckAlerts",
    PRIVACY_SECURITY_ALERT = "TestCordPrivacySecurityAlert",
    PRIVACY_SET_MAX_LOGS = "TestCordPrivacySetMaxLogs",
    PRIVACY_CLEAR_ALLOWED_LOGS = "TestCordPrivacyClearAllowedLogs",
    PRIVACY_POST_SCIENCE_EVENTS = "TestCordPrivacyPostScienceEvents",
}
