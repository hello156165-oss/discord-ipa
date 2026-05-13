import { ALL_BADGES, BADGES_BY_ID, type BadgeDefinition } from "../badges";
import type { LarpStorage } from "../storage";

/**
 * Build the badge object Discord's `useBadges` hook expects to be present in
 * its result array.
 *
 * Discord's internal `Badge` shape varies slightly between versions, but the
 * fields below are consistent:
 *   - id          : unique identifier (string)
 *   - description : tooltip text (uses Discord's locale system normally)
 *   - icon        : asset name in the registry; we leave it empty and inject
 *                   `source` ourselves so we work even for badges Kettu can't
 *                   resolve through findAssetId.
 *   - source      : { uri: string } image source override
 */
function makeBadgePayload(badge: BadgeDefinition) {
  const assetId = bunny.api.assets.findAssetId(badge.assetName);
  return {
    id: `larp-${badge.id}`,
    description: badge.label,
    icon: badge.assetName,
    source: assetId != null ? assetId : { uri: badge.cdnUrl },
  };
}

/**
 * Patch the `useBadges` hook so that, when called for the current user, we
 * prepend the badges enabled in the Larp settings to the badge list.
 *
 * The `useBadges` module is exposed by Discord under a default export and is
 * typically named "useBadges" in the React DevTools tree, hence
 * `findByNameLazy`.
 */
export function patchBadges(storage: LarpStorage): () => void {
  const useBadgesModule = bunny.metro.findByNameLazy("useBadges", false);
  if (!useBadgesModule) {
    bunny.plugin.logger.warn(
      "[Larp] useBadges module not found, skipping badge patch"
    );
    return () => {};
  }

  const UserStore = bunny.metro.findByStoreName("UserStore");

  return bunny.api.patcher.after(
    "default",
    useBadgesModule,
    ([userArg]: [{ userId?: string } | undefined], result: any[]) => {
      if (!storage.enabled) return result;
      if (!Array.isArray(result)) return result;

      const userId = userArg?.userId;
      const currentUserId = UserStore?.getCurrentUser?.()?.id;
      if (!userId || userId !== currentUserId) return result;

      const toPrepend = ALL_BADGES.filter((b) => storage.badges[b.id]).map(
        makeBadgePayload
      );
      if (toPrepend.length === 0) return result;

      // Avoid duplicates if the patch fires twice for the same render.
      const existingIds = new Set(result.map((b: any) => b?.id));
      for (let i = toPrepend.length - 1; i >= 0; i--) {
        if (!existingIds.has(toPrepend[i].id)) {
          result.unshift(toPrepend[i]);
        }
      }
      return result;
    }
  );
}

// Re-export for the settings page so it doesn't need to import badges twice.
export { ALL_BADGES, BADGES_BY_ID };
