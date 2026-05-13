import * as React from "react";

import { patchBadges } from "./patches/badges";
import { patchCreationDate } from "./patches/createdAt";
import { patchCurrentUser } from "./patches/user";
import LarpSettings from "./settings";
import { applyDefaults, type LarpStorage } from "./storage";

/**
 * Vendetta plugin entry.
 *
 * Kettu evaluates this file with the wrapper
 *   `vendetta => { return <THIS FILE> }`
 * and then calls the resulting arrow with a freshly built `vendetta` object.
 * `vendetta.plugin.storage` is a per-plugin MMKV-backed proxy.
 *
 * We use `window.bunny` (globally available) for the patcher, metro lookups
 * and the settings section registration. The only thing we pull from
 * `vendetta` is the scoped storage, since `window.bunny.plugin` is not
 * populated for plugins loaded through the Vendetta loader.
 */

declare const vendetta: {
  plugin: {
    storage: LarpStorage & Record<string, unknown>;
  };
  logger?: { log: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
};

const log = (...args: unknown[]) => {
  try {
    if (vendetta?.logger?.log) vendetta.logger.log(...args);
    else console.log("[Larp]", ...args);
  } catch {
    /* swallow */
  }
};
const logError = (...args: unknown[]) => {
  try {
    if (vendetta?.logger?.error) vendetta.logger.error(...args);
    else console.error("[Larp]", ...args);
  } catch {
    /* swallow */
  }
};

// Cleanup handles assigned in `onLoad` and released in `onUnload`.
let unpatches: Array<() => void> = [];
let unregisterSettingsSection: (() => void) | null = null;

/**
 * Always-defined component shown as the plugin's settings sheet AND the
 * Discord-settings tab. Built with createElement so we don't depend on a
 * JSX runtime resolving correctly in Kettu's eval context.
 */
function SettingsHost(): JSX.Element {
  const storage =
    (vendetta?.plugin?.storage as LarpStorage | undefined) ??
    (Object.create(null) as LarpStorage);
  return React.createElement(LarpSettings, { storage });
}

export default {
  onLoad() {
    try {
      const storage = vendetta?.plugin?.storage as LarpStorage | undefined;
      if (storage) applyDefaults(storage);
      log("starting");

      try {
        if (storage) unpatches.push(patchCurrentUser(storage));
      } catch (err) {
        logError("patchCurrentUser failed", err);
      }
      try {
        if (storage) unpatches.push(patchBadges(storage));
      } catch (err) {
        logError("patchBadges failed", err);
      }
      try {
        if (storage) unpatches.push(patchCreationDate(storage));
      } catch (err) {
        logError("patchCreationDate failed", err);
      }

      // Register a dedicated section in the Discord settings menu.
      try {
        const reg = (bunny as any)?.ui?.settings?.registerSection;
        if (typeof reg === "function") {
          unregisterSettingsSection = reg({
            name: "Larp",
            items: [
              {
                key: "LARP_TAB",
                title: () => "Larp",
                render: () =>
                  Promise.resolve({
                    default: SettingsHost as React.ComponentType,
                  }),
              },
            ],
          });
        } else {
          logError(
            "bunny.ui.settings.registerSection not available, skipping tab registration"
          );
        }
      } catch (err) {
        logError("failed to register settings section", err);
      }

      log("ready");
    } catch (err) {
      logError("onLoad threw at top level", err);
    }
  },

  onUnload() {
    log("stopping");
    for (const u of unpatches) {
      try {
        u();
      } catch (err) {
        logError("unpatch threw", err);
      }
    }
    unpatches = [];

    if (unregisterSettingsSection) {
      try {
        unregisterSettingsSection();
      } catch (err) {
        logError("unregisterSection threw", err);
      }
      unregisterSettingsSection = null;
    }
  },

  settings: SettingsHost,
};
