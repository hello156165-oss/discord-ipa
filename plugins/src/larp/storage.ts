/**
 * Plugin persisted storage shape.
 *
 * Created at runtime with `bunny.plugin.createStorage<LarpStorage>()`,
 * which returns an observable proxy that auto-persists to disk.
 */

export interface LarpStorage {
  /** Master toggle, allows quickly disabling everything without losing settings. */
  enabled: boolean;

  /** Override the username Discord shows for the current user. Empty = no override. */
  username: string;

  /** Override the global / display name. Empty = no override. */
  globalName: string;

  /** Override the discriminator (4 digits like "0001"). Empty = no override. */
  discriminator: string;

  /** Enabled badge IDs, mapped to `true`. */
  badges: Record<string, boolean>;

  /** ISO-8601 string (e.g. "2015-01-01T00:00:00.000Z"). Empty = no override. */
  creationDate: string;
}

export const DEFAULTS: LarpStorage = {
  enabled: true,
  username: "",
  globalName: "",
  discriminator: "",
  badges: {},
  creationDate: "",
};

/**
 * Ensure all DEFAULT keys exist on the storage proxy. We do this lazily on
 * plugin start because the proxy returned by createStorage is empty on first
 * run and assignments are what trigger persistence.
 */
export function applyDefaults(storage: LarpStorage): void {
  for (const key of Object.keys(DEFAULTS) as (keyof LarpStorage)[]) {
    if (storage[key] === undefined) {
      // @ts-expect-error -- index-by-key write
      storage[key] = DEFAULTS[key];
    }
  }
  if (typeof storage.badges !== "object" || storage.badges === null) {
    storage.badges = {};
  }
}
