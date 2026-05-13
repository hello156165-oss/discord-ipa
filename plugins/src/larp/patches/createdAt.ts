import type { LarpStorage } from "../storage";

/**
 * Discord computes a user's account creation date from the user ID (a Twitter
 * snowflake). The conversion is implemented by a small module typically
 * exposed via props like `extractTimestamp` and `getCreationDate`. We patch
 * those so that, for the current user, we return a Date object built from
 * the override stored in plugin settings.
 *
 * Because asset / module names sometimes drift between Discord versions, we
 * defensively try several known shapes. Any module we cannot find is silently
 * skipped (the plugin still works for everything else it can patch).
 */
export function patchCreationDate(storage: LarpStorage): () => void {
  const unpatchers: Array<() => void> = [];
  const UserStore = bunny.metro.findByStoreName("UserStore");

  const getOverride = (): Date | null => {
    if (!storage.enabled) return null;
    if (!storage.creationDate) return null;
    const d = new Date(storage.creationDate);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  };

  // 1) The "snowflake -> Date" utility. Most commonly the module exposes both
  //    `extractTimestamp(id) -> number` and a `getCreationDate(id) -> Date`.
  const snowflakeUtil =
    bunny.metro.findByProps("extractTimestamp", "getCreationDate") ??
    bunny.metro.findByProps("extractTimestamp") ??
    bunny.metro.findByProps("getCreationDate");

  if (snowflakeUtil) {
    const currentId = () => UserStore?.getCurrentUser?.()?.id as string | undefined;

    if (typeof snowflakeUtil.getCreationDate === "function") {
      unpatchers.push(
        bunny.api.patcher.after(
          "getCreationDate",
          snowflakeUtil,
          ([id]: [string], result: Date) => {
            const override = getOverride();
            if (override && id && id === currentId()) return override;
            return result;
          }
        )
      );
    }

    if (typeof snowflakeUtil.extractTimestamp === "function") {
      unpatchers.push(
        bunny.api.patcher.after(
          "extractTimestamp",
          snowflakeUtil,
          ([id]: [string], result: number) => {
            const override = getOverride();
            if (override && id && id === currentId()) return override.getTime();
            return result;
          }
        )
      );
    }
  } else {
    bunny.plugin.logger.warn(
      "[Larp] snowflake utility module not found, account creation date override may not apply everywhere"
    );
  }

  return () => unpatchers.forEach((u) => u());
}
