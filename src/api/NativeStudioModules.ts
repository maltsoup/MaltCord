/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as module33 from "@api/AudioPlayer";
import * as module24 from "@api/Badges";
import * as module21 from "@api/ChatButtons";
import * as module19 from "@api/Commands";
import * as module20 from "@api/ContextMenu";
import * as module15 from "@api/DataStore";
import * as module22 from "@api/HeaderBar";
import * as module35 from "@api/KittycordLegacyStudio";
import * as voiceModule from "@api/KittycordVoice";
import * as module30 from "@api/MemberListDecorators";
import * as module26 from "@api/MessageAccessories";
import * as module27 from "@api/MessageDecorations";
import * as module25 from "@api/MessageEvents";
import * as module28 from "@api/MessagePopover";
import * as module29 from "@api/NicknameIcons";
import * as module18 from "@api/Notices";
import * as module17 from "@api/Notifications";
import * as module34 from "@api/PluginHealth";
import * as module14 from "@api/PluginManager";
import * as module31 from "@api/ProfileCollections";
import * as module32 from "@api/ProfileSections";
import * as module13 from "@api/Settings";
import * as module16 from "@api/Styles";
import * as module23 from "@api/UserArea";
import * as module36 from "@components/Button";
import * as module42 from "@components/Card";
import * as module43 from "@components/ErrorBoundary";
import * as module37 from "@components/Heading";
import * as module39 from "@components/Icons";
import * as module40 from "@components/Link";
import * as module38 from "@components/Paragraph";
import * as module41 from "@components/Switch";
import * as module1 from "@utils/constants";
import * as module4 from "@utils/css";
import * as module8 from "@utils/discord";
import * as module7 from "@utils/lazy";
import * as module2 from "@utils/Logger";
import * as module3 from "@utils/misc";
import * as module9 from "@utils/modal";
import * as module6 from "@utils/react";
import * as module5 from "@utils/text";
import * as module0 from "@utils/types";
import * as module10 from "@webpack";
import * as module11 from "@webpack/common";
import * as module12 from "@webpack/patcher";

export const nativeStudioModules: Record<string, object> = {
    "@api/KittycordVoice": voiceModule,
    "@utils/types": module0,
    "@utils/constants": module1,
    "@utils/Logger": module2,
    "@utils/misc": module3,
    "@utils/css": module4,
    "@utils/text": module5,
    "@utils/react": module6,
    "@utils/lazy": module7,
    "@utils/discord": module8,
    "@utils/modal": module9,
    "@webpack": module10,
    "@webpack/common": module11,
    "@webpack/patcher": module12,
    "@api/Settings": module13,
    "@api/PluginManager": module14,
    "@api/DataStore": module15,
    "@api/Styles": module16,
    "@api/Notifications": module17,
    "@api/Notices": module18,
    "@api/Commands": module19,
    "@api/ContextMenu": module20,
    "@api/ChatButtons": module21,
    "@api/HeaderBar": module22,
    "@api/UserArea": module23,
    "@api/Badges": module24,
    "@api/MessageEvents": module25,
    "@api/MessageAccessories": module26,
    "@api/MessageDecorations": module27,
    "@api/MessagePopover": module28,
    "@api/NicknameIcons": module29,
    "@api/MemberListDecorators": module30,
    "@api/ProfileCollections": module31,
    "@api/ProfileSections": module32,
    "@api/AudioPlayer": module33,
    "@api/PluginHealth": module34,
    "@api/KittycordLegacyStudio": module35,
    "@components/Button": module36,
    "@components/Heading": module37,
    "@components/Paragraph": module38,
    "@components/Icons": module39,
    "@components/Link": module40,
    "@components/Switch": module41,
    "@components/Card": module42,
    "@components/ErrorBoundary": module43,
};
