import { getApi } from "../runtime";
import type { LarpStorage } from "../storage";

/**
 * Returns a wrapped user object that applies the configured overrides on top
 * of the original user. We DO NOT mutate the original — we proxy it so that
 * any consumer that reads `.username`/`.globalName`/`.discriminator` from the
 * current user sees the overridden value, while leaving the underlying store
 * untouched. This is critical because the store is mutated by FluxDispatcher
 * events and ANY mutation would persist back to the user object Discord sends
 * on the wire.
 */
function wrapUser(user: any, storage: LarpStorage): any {
  if (!user) return user;
  return new Proxy(user, {
    get(target, prop, receiver) {
      if (prop === "username" && storage.username) return storage.username;
      if (prop === "globalName" && storage.globalName) return storage.globalName;
      if (prop === "discriminator" && storage.discriminator) {
        return storage.discriminator;
      }
      // Some Discord code reads the legacy `tag` (username#discrim) as a
      // single string. Recompute it if either part is overridden.
      if (prop === "tag" && (storage.username || storage.discriminator)) {
        const u = storage.username || target.username;
        const d = storage.discriminator || target.discriminator;
        return `${u}#${d}`;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Hook the UserStore to make every read of the current user see our overrides.
 *
 * We intercept the two main entry points used by the React tree:
 *   - `UserStore.getCurrentUser()`
 *   - `UserStore.getUser(id)` when `id === currentUser.id`
 *
 * Returns an unpatch function.
 */
export function patchCurrentUser(storage: LarpStorage): () => void {
  const api = getApi();
  const UserStore = api.metro.findByStoreName?.("UserStore");
  if (!UserStore) {
    console.warn("[Larp] UserStore not found, skipping user patch");
    return () => {};
  }
  const after = api.patcher?.after;
  if (typeof after !== "function") {
    console.warn("[Larp] patcher.after not available, skipping user patch");
    return () => {};
  }

  const unpatchers: Array<() => void> = [];

  unpatchers.push(
    after("getCurrentUser", UserStore, (_args: unknown, result: any) => {
      if (!storage.enabled) return result;
      return wrapUser(result, storage);
    })
  );

  unpatchers.push(
    after("getUser", UserStore, ([id]: [string], result: any) => {
      if (!storage.enabled) return result;
      const current = UserStore.getCurrentUser?.();
      if (current && id === current.id) {
        return wrapUser(result, storage);
      }
      return result;
    })
  );

  return () => unpatchers.forEach((u) => u());
}
