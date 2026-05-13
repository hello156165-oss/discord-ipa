/**
 * Official Discord badges that can be displayed locally on the user's profile.
 *
 * For each badge we provide:
 *  - id        : the badge identifier Discord uses in the `useBadges` hook result
 *  - label     : human-readable name shown in the settings UI and as the badge tooltip
 *  - assetName : the name of the asset registered with the Discord image registry.
 *                Will be resolved with `bunny.api.assets.findAssetId(assetName)`.
 *                If the asset is not found we fall back to `cdnUrl`.
 *  - cdnUrl    : public Discord CDN URL of the badge icon (used as a fallback).
 *
 * Sources for the asset names: Discord client image registry, cross-referenced
 * with public mod projects (Vencord, Equicord, Enmity, Bunny). Asset names may
 * change across Discord versions — keep both the asset name and the CDN URL.
 */

export interface BadgeDefinition {
  id: string;
  label: string;
  assetName: string;
  cdnUrl: string;
}

const BASE = "https://cdn.discordapp.com/badge-icons";

export const ALL_BADGES: BadgeDefinition[] = [
  {
    id: "staff",
    label: "Discord Staff",
    assetName: "StaffBadge",
    cdnUrl: `${BASE}/5e74e9b61934fc1f67c65515d1f7e60d.png`,
  },
  {
    id: "partner",
    label: "Discord Partner",
    assetName: "DiscordPartnerBadge",
    cdnUrl: `${BASE}/3f9748e53446a137a052f3454e2de41e.png`,
  },
  {
    id: "moderator",
    label: "Certified Moderator",
    assetName: "DiscordCertifiedModeratorBadge",
    cdnUrl: `${BASE}/fee1624003e2fee35cb398e125dc479b.png`,
  },
  {
    id: "hypesquad_events",
    label: "HypeSquad Events",
    assetName: "HypeSquadEventsBadge",
    cdnUrl: `${BASE}/bf01d1073931f921909045f3a39fd264.png`,
  },
  {
    id: "hypesquad_bravery",
    label: "HypeSquad Bravery",
    assetName: "HypeSquadBraveryBadge",
    cdnUrl: `${BASE}/8a88d63823d8a71cd5e390baa45efa02.png`,
  },
  {
    id: "hypesquad_brilliance",
    label: "HypeSquad Brilliance",
    assetName: "HypeSquadBrillianceBadge",
    cdnUrl: `${BASE}/011940fd013da3f7fb926e4a1cd2e618.png`,
  },
  {
    id: "hypesquad_balance",
    label: "HypeSquad Balance",
    assetName: "HypeSquadBalanceBadge",
    cdnUrl: `${BASE}/3aa41de486fa12454c3761e8e223442e.png`,
  },
  {
    id: "bug_hunter_1",
    label: "Bug Hunter (Level 1)",
    assetName: "BugHunterLevel1Badge",
    cdnUrl: `${BASE}/2717692c7dca7289b35297368a940dd0.png`,
  },
  {
    id: "bug_hunter_2",
    label: "Bug Hunter (Level 2)",
    assetName: "BugHunterLevel2Badge",
    cdnUrl: `${BASE}/848f79194d4be5ff5f81505cbd0ce1e6.png`,
  },
  {
    id: "active_developer",
    label: "Active Developer",
    assetName: "ActiveDeveloperBadge",
    cdnUrl: `${BASE}/6bdc42827a38498929a4920da12695d9.png`,
  },
  {
    id: "verified_developer",
    label: "Early Verified Bot Developer",
    assetName: "VerifiedDeveloperBadge",
    cdnUrl: `${BASE}/6df5892e0f35b051f8b61eace34f4967.png`,
  },
  {
    id: "early_supporter",
    label: "Early Supporter",
    assetName: "EarlySupporterBadge",
    cdnUrl: `${BASE}/7060786766c9c840eb3019e725d2b358.png`,
  },
  {
    id: "premium",
    label: "Discord Nitro",
    assetName: "NitroSubscriberBadge",
    cdnUrl: `${BASE}/2ba85e8026a8614b640c2837bcdfe21b.png`,
  },
  {
    id: "premium_tenure_3_month",
    label: "Nitro · 3 months",
    assetName: "NitroBronzeBadge",
    cdnUrl: `${BASE}/6de6d34650760ba5551a79732e98ed60.png`,
  },
  {
    id: "premium_tenure_6_month",
    label: "Nitro · 6 months",
    assetName: "NitroSilverBadge",
    cdnUrl: `${BASE}/6de6d34650760ba5551a79732e98ed60.png`,
  },
  {
    id: "premium_tenure_12_month",
    label: "Nitro · 1 year",
    assetName: "NitroGoldBadge",
    cdnUrl: `${BASE}/d92998916f4ce6f74de7da0a37b8d740.png`,
  },
  {
    id: "premium_tenure_24_month",
    label: "Nitro · 2 years",
    assetName: "NitroPlatinumBadge",
    cdnUrl: `${BASE}/9d4f73ca6df09bc63a39ea84d5fd0ff5.png`,
  },
  {
    id: "premium_tenure_36_month",
    label: "Nitro · 3 years",
    assetName: "NitroDiamondBadge",
    cdnUrl: `${BASE}/65d6d6df9d56b8c3f4b3b1f3e4f3a0c8.png`,
  },
  {
    id: "bot_commands",
    label: "Supports Commands",
    assetName: "BotCommandsBadge",
    cdnUrl: `${BASE}/6f9e37f9029ff57aef81db857890005e.png`,
  },
  {
    id: "automod",
    label: "Uses AutoMod",
    assetName: "AutoModBadge",
    cdnUrl: `${BASE}/f2459b691ac7453ed6039bbcfaccbfcd.png`,
  },
  {
    id: "legacy_username",
    label: "Originally known as username",
    assetName: "LegacyUsernameBadge",
    cdnUrl: `${BASE}/6de6d34650760ba5551a79732e98ed60.png`,
  },
  {
    id: "quest",
    label: "Completed a Quest",
    assetName: "QuestBadge",
    cdnUrl: `${BASE}/7d9ae358c8c5e118768335dbe68b4fb8.png`,
  },
];

export const BADGES_BY_ID: Record<string, BadgeDefinition> =
  Object.fromEntries(ALL_BADGES.map((b) => [b.id, b]));
