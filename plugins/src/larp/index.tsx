import * as React from "react";

import { patchBadges } from "./patches/badges";
import { patchCreationDate } from "./patches/createdAt";
import { patchCurrentUser } from "./patches/user";
import LarpSettings from "./settings";
import { applyDefaults, type LarpStorage } from "./storage";

// Storage is created at module evaluation time because Kettu's loader expects
// a synchronously-defined plugin. The proxy returned here will be lazily
// hydrated by Kettu before `start()` is called.
const storage = bunny.plugin.createStorage<LarpStorage>();

// Cleanup handles assigned in `start` and released in `stop`.
let unpatches: Array<() => void> = [];
let unregisterSettingsSection: (() => void) | null = null;

function SettingsHost(): JSX.Element {
  return <LarpSettings storage={storage} />;
}

export default definePlugin({
  /**
   * Called by Kettu when the user enables the plugin. We:
   *   1. seed missing defaults on the storage proxy,
   *   2. install our patches (user, badges, creation date),
   *   3. register a dedicated section in the Discord settings menu.
   */
  start() {
    applyDefaults(storage);

    bunny.plugin.logger.info("[Larp] starting");

    unpatches.push(patchCurrentUser(storage));
    unpatches.push(patchBadges(storage));
    unpatches.push(patchCreationDate(storage));

    unregisterSettingsSection = bunny.ui.settings.registerSection({
      name: "Larp",
      items: [
        {
          key: "LARP_TAB",
          title: () => "Larp",
          icon: bunny.api.assets.findAssetId("MaskIcon")
            ? { uri: "" } // placeholder; real source picked by Kettu via key
            : undefined,
          render: () =>
            Promise.resolve({ default: SettingsHost as React.ComponentType }),
        },
      ],
    });

    bunny.plugin.logger.info("[Larp] ready");
  },

  /**
   * Called by Kettu when the user disables the plugin or hot-reloads it.
   * We tear down patches FIRST so that any UI re-render that happens during
   * the section unregister sees the original Discord behavior again.
   */
  stop() {
    bunny.plugin.logger.info("[Larp] stopping");
    for (const u of unpatches) {
      try {
        u();
      } catch (err) {
        bunny.plugin.logger.error("[Larp] unpatch threw", err);
      }
    }
    unpatches = [];

    if (unregisterSettingsSection) {
      try {
        unregisterSettingsSection();
      } catch (err) {
        bunny.plugin.logger.error("[Larp] unregisterSection threw", err);
      }
      unregisterSettingsSection = null;
    }
  },

  /**
   * Surfaced as the plugin's settings sheet (accessible from the plugin
   * list in Kettu) — same component as the dedicated tab.
   */
  SettingsComponent: SettingsHost,
});
