/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import "./fixDiscordBadgePadding.css";

import { _getBadges, BadgePosition, BadgeRarity, BadgeUserArgs, ProfileBadge } from "@api/Badges";
import { cloudBadges, useCloudBadges } from "@api/KittycordCloud";
import ErrorBoundary from "@components/ErrorBoundary";
import { CopyIcon, LinkIcon } from "@components/Icons";
import { openContributorModal } from "@components/settings/tabs";
import { nativeDirectoryBadge } from "@shared/kittycord/badgeDirectory";
import { Devs } from "@utils/constants";
import { copyWithToast } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { shouldShowContributorBadge, shouldShowEquicordContributorBadge, shouldShowTestcordAdminBadge, shouldShowTestcordContributorBadge } from "@utils/misc";
import { isTestcordArtist, isTestcordDeveloper, isTestcordOwner } from "@utils/testcordAdmins";
import { ZWSP } from "@utils/text";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu, showToast, UserProfileStore, UserStore } from "@webpack/common";
import testcordArtistIconBase64 from "file://../../../../browser/TestcordArtist.png?base64";

import Plugins, { PluginMeta } from "~plugins";

import { cloudProfileBadgeItems, CloudProfileDetails } from "./CloudProfileBadges";
import { KittenNameCrown } from "./KittenProfileBadge";
import { EquicordTranslatorModal, TestCordDonorModal, VencordDonorModal } from "./modals";

// TestCord badges stay visible in MaltCord (owner, 2026-11-04). MaltCord only shows them; unlike TestCord it
// does not write a marker into the user's own Discord pronouns.
const TESTCORD_CONTRIBUTOR_BADGE = "https://raw.githubusercontent.com/TestcordDev/TestCord/main/browser/icon.png";
const TESTCORD_ADMIN_BADGE = "https://raw.githubusercontent.com/TestcordDev/tbadges/main/admnew.png";
const TESTCORD_OWNER_BADGE = "https://raw.githubusercontent.com/TestcordDev/tbadges/refs/heads/main/ownnew.png";
const TESTCORD_DEV_BADGE = "https://raw.githubusercontent.com/TestcordDev/tbadges/refs/heads/main/devnew.png";
const TESTCORD_ARTIST_BADGE = `data:image/png;base64,${testcordArtistIconBase64}`;
const TBADGES_JSON_URL = "https://raw.githubusercontent.com/TestcordDev/tbadges/main/badges.json";
const TBADGES_REPO_URL = "https://raw.githubusercontent.com/TestcordDev/tbadges/main";
const HEART_BADGE_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 16 16\"><path fill=\"#db61a2\" fill-rule=\"evenodd\" d=\"M4.25 2.5c-1.336 0-2.75 1.164-2.75 3 0 2.15 1.58 4.144 3.365 5.682A20.565 20.565 0 008 13.393a20.561 20.561 0 003.135-2.211C12.92 9.644 14.5 7.65 14.5 5.5c0-1.836-1.414-3-2.75-3-1.373 0-2.609.986-3.029 2.456a.75.75 0 01-1.442 0C6.859 3.486 5.623 2.5 4.25 2.5z\"/></svg>")}`;
const testcordBadgeStyle = { style: { borderRadius: "50%", transform: "scale(0.9)" } };
const testcordBadge = (id: string, description: string, iconSrc: string, shouldShow: (userId: string) => boolean, onClick?: ProfileBadge["onClick"]): ProfileBadge => ({
    id, description, iconSrc, position: BadgePosition.START, props: testcordBadgeStyle, shouldShow: ({ userId }) => shouldShow(userId), ...(onClick ? { onClick } : {}),
});
const TestcordBadges: ProfileBadge[] = [
    testcordBadge("testcord_contributor", "Testcord Contributor", TESTCORD_CONTRIBUTOR_BADGE, shouldShowTestcordContributorBadge, (_, { userId }) => openContributorModal(UserStore.getUser(userId))),
    testcordBadge("testcord_user", "Testcord User", HEART_BADGE_ICON, userId => !!UserProfileStore.getUserProfile(userId)?.pronouns?.includes(ZWSP)),
    testcordBadge("testcord_admin", "Testcord Admin", TESTCORD_ADMIN_BADGE, shouldShowTestcordAdminBadge),
    testcordBadge("testcord_owner", "Testcord Owner", TESTCORD_OWNER_BADGE, isTestcordOwner),
    testcordBadge("testcord_developer", "Testcord Dev", TESTCORD_DEV_BADGE, isTestcordDeveloper),
    testcordBadge("testcord_artist", "Testcord Artist", TESTCORD_ARTIST_BADGE, isTestcordArtist),
];
let TestcordCustomBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>> | Record<string, Record<"tooltip" | "badge", string>>>;

const CONTRIBUTOR_BADGE = "https://cdn.discordapp.com/emojis/1092089799109775453.png?size=64";
const EQUICORD_CONTRIBUTOR_BADGE = "https://Equicord.org/assets/favicon.png";
const USERPLUGIN_CONTRIBUTOR_BADGE = "https://Equicord.org/assets/icons/misc/userplugin.png";

const ContributorBadge: ProfileBadge = {
    id: "vencord_contributor_badge",
    description: "Vencord Contributor",
    infoLabel: "Vencord",
    rarity: BadgeRarity.MYTHIC,
    iconSrc: CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowContributorBadge(userId),
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId))
};

const EquicordContributorBadge: ProfileBadge = {
    id: "equicord_contributor_badge",
    description: "Equicord Contributor",
    infoLabel: "Equicord",
    rarity: BadgeRarity.MYTHIC,
    iconSrc: EQUICORD_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => shouldShowEquicordContributorBadge(userId),
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId)),
    props: {
        style: {
            borderRadius: "50%",
            transform: "scale(0.9)"
        }
    },
};

const UserPluginContributorBadge: ProfileBadge = {
    id: "user_plugin_contributor_badge",
    description: "User Plugin Contributor",
    iconSrc: USERPLUGIN_CONTRIBUTOR_BADGE,
    position: BadgePosition.START,
    shouldShow: ({ userId }) => {
        if (!IS_DEV) return false;
        const allPlugins = Object.values(Plugins);
        return allPlugins.some(p => {
            const pluginMeta = PluginMeta[p.name];
            return pluginMeta?.userPlugin && p.authors.some(a => a && a.id.toString() === userId);
        });
    },
    onClick: (_, { userId }) => openContributorModal(UserStore.getUser(userId)),
    props: {
        style: {
            borderRadius: "50%",
            transform: "scale(0.9)"
        }
    },
};

let DonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;
let EquicordDonorBadges = {} as Record<string, Array<Record<"tooltip" | "badge", string>>>;

async function loadAllBadges(noCache = false) {
    const init = {} as RequestInit;
    if (noCache) init.cache = "no-cache";

    const urls = [
        { key: "vencord", url: "https://badges.vencord.dev/badges.json" },
        { key: "equicord", url: "https://badge.equicord.org/badges.json" },
        { key: "testcord", url: TBADGES_JSON_URL }
    ];

    const results = await Promise.allSettled(
        urls.map(({ url }) => fetch(url, init).then(r => r.ok ? r.json() : {}))
    );

    const logger = new Logger("BadgeAPI#loadAllBadges");

    // Process results
    results.forEach((result, index) => {
        const { key } = urls[index];
        if (result.status === "fulfilled") {
            if (key === "vencord") {
                DonorBadges = result.value;
            } else if (key === "equicord") {
                EquicordDonorBadges = result.value;
            } else if (key === "testcord") {
                TestcordCustomBadges = result.value;

            }
        } else {
            logger.error(`Failed to fetch ${key} badges:`, result.reason);
        }
    });
}

let intervalId: ReturnType<typeof setInterval>;

interface BadgeDirectoryEntry {
    badge_id: string;
    name?: string;
    description?: string;
    simple_icon_url?: string;
    owned?: boolean;
    is_earnable?: boolean;
    tiers?: unknown[];
}

interface BadgeDirectoryStore {
    getBadges(userId?: string): BadgeDirectoryEntry[];
    getBadgeById(badgeId: string, userId?: string): BadgeDirectoryEntry | undefined;
}

function getClientBadgesForDirectory(userId: string): BadgeDirectoryEntry[] {
    return _getBadges({ userId, guildId: "" })
        .flatMap(badge => { const entry = nativeDirectoryBadge(badge, userId); return entry ? [entry] : []; });
}

export function BadgeContextMenu({ badge }: { badge: Omit<ProfileBadge, "id"> & BadgeUserArgs; }) {
    return (
        <Menu.Menu
            navId="vc-badge-context"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Badge Options"
        >
            {badge.description && (
                <Menu.MenuItem
                    id="vc-badge-copy-name"
                    label="Copy Badge Name"
                    action={() => copyWithToast(badge.description!)}
                    leadingAccessory={{ type: "icon", icon: CopyIcon }}
                />
            )}
            {badge.iconSrc && (
                <Menu.MenuItem
                    id="vc-badge-copy-link"
                    label="Copy Badge Image Link"
                    action={() => copyWithToast(badge.link ?? badge.iconSrc!)}
                    leadingAccessory={{ type: "icon", icon: LinkIcon }}
                />
            )}
        </Menu.Menu>
    );
}

export default definePlugin({
    name: "BadgeAPI",
    description: "API to add badges to users",
    authors: [Devs.Megu, Devs.Ven, Devs.TheSun],
    required: true,
    dependencies: ["ProfileSectionsAPI"],
    renderProfileSection: { render:CloudProfileDetails,priority:-20 },
    renderNicknameIcon: KittenNameCrown,
    renderMessageDecoration({ message }) {
        return <KittenNameCrown userId={message.author.id} />;
    },
    renderMemberListDecorator({ user }) {
        return user ? <KittenNameCrown userId={user.id} /> : null;
    },
    patches: [
        {
            find: "#{intl::PROFILE_USER_BADGES}",
            replacement: [
                {
                    match: /(\i)\.map\((?=.{0,400}?\.iconSrc)/,
                    replace: "$self.useBadgeRow(arguments[0],$1).map("
                },
                {
                    match: /alt:" ","aria-hidden":!0,src:.{0,50}(\i).iconSrc/,
                    replace: "...$1.props,$&"
                },
                // Path with 2026-04-badge-discovery OFF
                {
                    match: /(?<=forceOpen:.{0,40}?ariaHidden:!0,)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}):"
                },
                // Path with 2026-04-badge-discovery ON
                {
                    match: /(?<=fallbackIconSrc:.{0,50}?)children:(?=.{0,50}?(\i)\.id)/,
                    replace: "children:$1.component?$self.renderBadgeComponent({...$1}):"
                },
                // handle onClick and onContextMenu
                {
                    match: /href:(\i)\.link/,
                    replace: "...$self.getBadgeMouseEventHandlers($1),$&"
                },
                {
                    match: /legacyBadgeId:(\i),userId:(\i),.{0,100}?=\i,\i=\(0,\i\.\i\)\(\1\)/,
                    replace: "$&??$self.getDirectoryBadgeId($1,$2)"
                }
            ]
        },
        {
            find: '"BadgeDirectoryStore"',
            replacement: {
                match: /getBadgeById\((\i),(\i)\)\{/,
                replace: "$&const customBadge=$self.getDirectoryBadge($1);if(customBadge)return customBadge;"
            }
        },
        {
            find: "getLegacyUsername(){",
            replacement: {
                match: /getBadges\(\)\{(.{0,100}?)return\[/,
                replace: "getBadges(){$1return[...$self.getBadges(this),"
            }
        },
        {
            // The badge directory modal (the "browse all badges" menu behind the profile badge overflow) reads
            // straight from Discord's server-side badge catalog, which never contains client side badges
            find: '"badge-directory-owned"',
            replacement: [
                {
                    match: /(\i)\.(\i)\.getBadges\((\i)\)/g,
                    replace: "$self.getDirectoryBadges($3,$1.$2)"
                },
                {
                    match: /(\i)\.(\i)\.getBadgeById\((\i)(\.badge_id)?,(\i)\)/g,
                    replace: "$self.getDirectoryBadgeById($3$4,$5,$1.$2)"
                }
            ]
        }
    ],

    // for access from the console or other plugins
    get DonorBadges() {
        return DonorBadges;
    },

    get EquicordDonorBadges() {
        return EquicordDonorBadges;
    },

    toolboxActions: {
        async "Refetch Badges"() {
            await loadAllBadges(true);
            showToast({ text: "Successfully refetched badges!", variant: "success" });
        }
    },

    userProfileBadges: [ContributorBadge, EquicordContributorBadge, ...TestcordBadges, UserPluginContributorBadge, {
        id: "kittencord_cloud_profile",
        position: BadgePosition.START,
        shouldShow: () => cloudBadges.enabled,
        getBadges: ({ userId }) => {
            void cloudBadges.load(userId);
            return cloudProfileBadgeItems(userId, cloudBadges.peek(userId));
        }
    }],

    start() {
        setTimeout(() => {
            loadAllBadges();
        }, 100);
        clearInterval(intervalId);
        intervalId = setInterval(loadAllBadges, 1000 * 60 * 30); // 30 minutes
    },

    async stop() {
        cloudBadges.clear();
        clearInterval(intervalId);
    },

    getBadges(profile: { userId: string; guildId: string; }) {
        if (!profile) return [];

        try {
            return _getBadges(profile);
        } catch (e) {
            new Logger("BadgeAPI#getBadges").error(e);
            return [];
        }
    },

    useBadgeRow(props: { userId?:string;user?:{ id:string; }; guildId?:string; }, badges: (ProfileBadge & Partial<BadgeUserArgs>)[]) {
        const userId=props.userId??props.user?.id??badges.find(badge=>badge.userId)?.userId??"";
        const guildId=props.guildId??badges.find(badge=>badge.guildId)?.guildId??"";
        const assigned=useCloudBadges(userId);
        return [...cloudProfileBadgeItems(userId,assigned).map(badge=>({ ...badge,userId,guildId })),...badges.filter(badge=>!badge.id.startsWith("kittencord_cloud_"))];
    },

    getDirectoryBadge(badgeId: string) {
        const match = /^vc-(\d{17,20})-(.+)$/.exec(badgeId);
        if (!match) return;
        // Derive from the current registry/cache so revoked or hidden cloud badges disappear.
        const badge = this.getBadges({ userId: match[1], guildId: "" }).find(badge => badge.id === match[2]);
        return badge && nativeDirectoryBadge(badge, match[1]);
    },

    getDirectoryBadgeId(badgeId: string, userId?: string) {
        if (!userId) return;
        const badge = this.getBadges({ userId, guildId: "" }).find(badge => badge.id === badgeId);
        return badge && nativeDirectoryBadge(badge, userId)?.badge_id;
    },

    getDirectoryBadges(userId: string, store: BadgeDirectoryStore) {
        void cloudBadges.load(userId);
        return [...new Map([...store.getBadges(userId), ...getClientBadgesForDirectory(userId)].map(badge=>[badge.badge_id,badge])).values()];
    },

    getDirectoryBadgeById(badgeId: string, userId: string, store: BadgeDirectoryStore) {
        return this.getDirectoryBadges(userId, store).find(badge => badge.badge_id === badgeId) ?? store.getBadgeById(badgeId, userId);
    },

    renderBadgeComponent: ErrorBoundary.wrap((badge: ProfileBadge & BadgeUserArgs) => {
        const Component = badge.component;
        return Component ? <Component {...badge} /> : null;
    }, { noop: true }),

    getBadgeMouseEventHandlers(badge: ProfileBadge & BadgeUserArgs) {
        const handlers = {} as Record<string, (e: React.MouseEvent) => void>;

        if (!badge) return handlers; // sanity check

        const { onClick, onContextMenu } = badge;

        if (onClick) handlers.onClick = e => onClick(e, badge);
        if (onContextMenu) handlers.onContextMenu = e => onContextMenu(e, badge);

        return handlers;
    },

    getDonorBadges(userId: string) {
        return DonorBadges[userId]?.map((badge, idx) => ({
            id: `vencord_donor_badge_${idx}`,
            infoLabel: "Vencord",
            rarity: BadgeRarity.MYTHIC,
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    transform: "scale(0.9)"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return VencordDonorModal();
            },
        } satisfies ProfileBadge));
    },

    getEquicordDonorBadges(userId: string) {
        return EquicordDonorBadges[userId]?.map((badge, idx) => ({
            id: `equicord_donor_badge_${idx}`,
            infoLabel: "Equicord",
            rarity: BadgeRarity.MYTHIC,
            iconSrc: badge.badge,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: {
                style: {
                    borderRadius: "50%",
                    transform: "scale(0.9)"
                }
            },
            onContextMenu(event, badge) {
                ContextMenuApi.openContextMenu(event, () => <BadgeContextMenu badge={badge} />);
            },
            onClick() {
                return badge.tooltip === "Equicord Translator" ? EquicordTranslatorModal() : TestCordDonorModal();
            },
        } satisfies ProfileBadge));
    },

    // Alias for backward compatibility
    /** Custom TestCord badges from the TestCord badge list, shown as they are in TestCord. */
    getTestCordCustomBadges(userId: string): ProfileBadge[] {
        const userBadges = TestcordCustomBadges[userId];
        if (!userBadges || typeof userBadges !== "object") return [];
        return Object.values(userBadges).filter(badge => typeof badge?.badge === "string").map(badge => ({
            id: `external_badge_${badge.badge}`,
            iconSrc: badge.badge.startsWith("https://") ? badge.badge : `${TBADGES_REPO_URL}/${badge.badge}`,
            description: badge.tooltip,
            position: BadgePosition.START,
            props: testcordBadgeStyle,
        }));
    },

    getTestCordDonorBadges: function (userId: string) {
        return this.getEquicordDonorBadges(userId);
    }
});
