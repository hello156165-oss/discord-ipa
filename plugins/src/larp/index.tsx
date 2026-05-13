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
 * and then calls the resulting arrow with a freshly built `vendetta` object,
 * so `vendetta` is in scope here even though we never reference it directly.
 *
 * The build pipeline (plugins/build.mjs) ensures the final JS is a single
 * expression that yields the plugin instance via `module.exports.default`.
 *
 * We use `window.bunny` (which Kettu exposes globally) for the patcher,
 * metro lookups and the settings section registration: those APIs are richer
 * and identical to what built-in core plugins use. The only thing we pull
 * from `vendetta` is the per-plugin scoped storage, since `window.bunny.plugin`
 * is not populated for Vendetta-format plugins.
 */

declare const vendetta: {
  plugin: {
    storage: LarpStorage & Record<string, unknown>;
  };
  logger?: { log: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
};

// Cleanup handles assigned in `onLoad` and released in `onUnload`.
let unpatches: Array<() => void> = [];
let unregisterSettingsSection: (() => void) | null = null;

function SettingsHost(): JSX.Element {
  return <LarpSettings storage={vendetta.plugin.storage as LarpStorage} />;
}

const log = (...args: unknown[]) => {
  if (vendetta?.logger?.log) vendetta.logger.log(...args);
  else console.log("[Larp]", ...args);
};
const logError = (...args: unknown[]) => {
  if (vendetta?.logger?.error) vendetta.logger.error(...args);
  else console.error("[Larp]", ...args);
};

export default {
  /**
   * Called by Kettu after the plugin's JS has been evaluated and the storage
   * object has been hydrated. We:
   *   1. seed missing defaults on the storage proxy,
   *   2. install our patches (user, badges, creation date),
   *   3. register a dedicated section in the Discord settings menu.
   */
  onLoad() {
    const storage = vendetta.plugin.storage as LarpStorage;
    applyDefaults(storage);
    log("starting");

    try {
      unpatches.push(patchCurrentUser(storage));
      unpatches.push(patchBadges(storage));
      unpatches.push(patchCreationDate(storage));
    } catch (err) {
      logError("failed to install one of the patches", err);
    }

    try {
      unregisterSettingsSection = bunny.ui.settings.registerSection({
        name: "Larp",
        items: [
          {
            key: "LARP_TAB",
            title: () => "Larp",
            icon: bunny.api.assets.findAssetId("MaskIcon")
              ? undefined
              : undefined,
            render: () =>
              Promise.resolve({
                default: SettingsHost as React.ComponentType,
              }),
          },
        ],
      });
    } catch (err) {
      logError("failed to register settings section", err);
    }

    log("ready");
  },

  /**
   * Called by Kettu when the user disables the plugin or hot-reloads it.
   * Tear patches down FIRST so that any UI re-render that happens during
   * the section unregister sees the original Discord behavior again.
   */
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

  /**
   * Vendetta surfaces this as the plugin's "Settings" sheet, accessible
   * from the plugin's row in the Plugins list. Same component as the
   * dedicated tab we register in `onLoad`.
   */
  settings: SettingsHost,
};
