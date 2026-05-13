import * as React from "react";

import { patchBadges } from "./patches/badges";
import { patchCreationDate } from "./patches/createdAt";
import { patchCurrentUser } from "./patches/user";
import { getApi } from "./runtime";
import LarpSettings from "./settings";
import { applyDefaults, type LarpStorage } from "./storage";

/**
 * Vendetta plugin entry — diagnostic build.
 *
 * Kettu evaluates this file with the wrapper
 *   `vendetta => { return <THIS FILE> }`
 * and then calls the resulting arrow with a freshly built `vendetta` object.
 *
 * This build is intentionally loud: it raises a toast at every stage of
 * loading so we can verify, from the user-facing UI, that the plugin is
 * really being evaluated and that `onLoad` runs to completion.
 */

const LARP_VERSION = "v8-asset+alert";

declare const vendetta: {
  plugin?: {
    id?: string;
    storage?: LarpStorage & Record<string, unknown>;
  };
  api?: {
    toasts?: { showToast: (msg: string, asset?: number) => void };
    assets?: { getAssetIDByName?: (name: string) => number | undefined };
  };
  logger?: { log: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
};

const trace: string[] = [];
function breadcrumb(msg: string) {
  trace.push(`${Date.now()} ${msg}`);
  try {
    (globalThis as any).__LARP_TRACE__ = trace;
  } catch {
    // ignored
  }
}

/**
 * Best-effort toast. Pulls the showToast function from the runtime helper,
 * which prefers `vendetta` (always defined inside Kettu's plugin wrapper)
 * over the `bunny` global (which is racey on app launch). Never throws.
 */
function toast(msg: string, kind: "info" | "warn" | "error" = "info") {
  try {
    const api = getApi();
    const assetName =
      kind === "error"
        ? "CircleXIcon-primary"
        : kind === "warn"
          ? "WarningIcon"
          : "CheckmarkSmallIcon";

    const getAssetId = api.assets?.getAssetIDByName ?? api.assets?.findAssetId;
    const assetId =
      typeof getAssetId === "function" ? getAssetId(assetName) : undefined;

    const show = api.toasts?.showToast;
    if (show) {
      show(`[Larp ${LARP_VERSION}] ${msg}`, assetId ?? undefined);
      breadcrumb(`toast OK: ${msg}`);
    } else {
      console.log(`[Larp ${LARP_VERSION}] toast unavailable: ${msg}`);
      breadcrumb(`toast UNAVAILABLE: ${msg}`);
    }
  } catch (err) {
    breadcrumb(`toast THREW: ${String(err)}`);
    // never throw from diagnostic code
  }
}

const log = (...args: unknown[]) => {
  try {
    if (vendetta?.logger?.log) vendetta.logger.log(...args);
    else console.log("[Larp]", ...args);
  } catch {
    // swallow
  }
};
const logError = (...args: unknown[]) => {
  try {
    if (vendetta?.logger?.error) vendetta.logger.error(...args);
    else console.error("[Larp]", ...args);
  } catch {
    // swallow
  }
};

// ---------------------------------------------------------------------------
// Module-level diagnostic flag. Set BEFORE we register anything else so even
// if the rest of the module explodes we still know it was reached.
// ---------------------------------------------------------------------------
type LarpDiag = {
  version: string;
  moduleLoadedAt: number;
  onLoadStartedAt?: number;
  onLoadFinishedAt?: number;
  onLoadError?: string;
  settingsRendered: number;
  hasSettingsExport: boolean;
};

const diag: LarpDiag = {
  version: LARP_VERSION,
  moduleLoadedAt: Date.now(),
  settingsRendered: 0,
  hasSettingsExport: false,
};

try {
  (globalThis as any).__LARP__ = diag;
  breadcrumb("module init: __LARP__ exposed");
} catch {
  // ignored
}

// Cleanup handles assigned in `onLoad` and released in `onUnload`.
let unpatches: Array<() => void> = [];
let unregisterSettingsSection: (() => void) | null = null;

/**
 * Always-defined component shown as the plugin's settings sheet AND the
 * Discord-settings tab. Built with createElement so we don't depend on a
 * JSX runtime resolving correctly in Kettu's eval context.
 */
function SettingsHost(): JSX.Element {
  diag.settingsRendered += 1;
  const storage =
    (vendetta?.plugin?.storage as LarpStorage | undefined) ??
    (Object.create(null) as LarpStorage);
  return React.createElement(LarpSettings, {
    storage,
    diagVersion: LARP_VERSION,
  } as any);
}

const pluginDefault = {
  onLoad() {
    // Wrap EVERYTHING so even diag/log/toast crashing cannot bubble up
    // and trigger Kettu's startPlugin catch (which would set the toggle
    // back to OFF).
    try {
      try { diag.onLoadStartedAt = Date.now(); } catch (_) {}
      toast("module evaluated, onLoad running");
      log("starting", LARP_VERSION);

      const storage = vendetta?.plugin?.storage as LarpStorage | undefined;
      if (storage) applyDefaults(storage);

      try {
        if (storage) unpatches.push(patchCurrentUser(storage));
      } catch (err) {
        logError("patchCurrentUser failed", err);
        toast(`patchCurrentUser failed: ${String(err)}`, "warn");
      }
      try {
        if (storage) unpatches.push(patchBadges(storage));
      } catch (err) {
        logError("patchBadges failed", err);
        toast(`patchBadges failed: ${String(err)}`, "warn");
      }
      try {
        if (storage) unpatches.push(patchCreationDate(storage));
      } catch (err) {
        logError("patchCreationDate failed", err);
        toast(`patchCreationDate failed: ${String(err)}`, "warn");
      }

      // Try to register a dedicated section in the Discord settings menu.
      try {
        const reg = getApi().settings?.registerSection;
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
        toast(`registerSection failed: ${String(err)}`, "warn");
      }

      diag.onLoadFinishedAt = Date.now();
      diag.hasSettingsExport = true;
      log("ready");
      toast("onLoad finished — tap Configure now");
    } catch (err) {
      diag.onLoadError = String(err);
      logError("onLoad threw at top level", err);
      toast(`onLoad threw: ${String(err)}`, "error");
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

// Diagnostic: confirm we built a valid default export object before returning.
try {
  diag.hasSettingsExport = typeof pluginDefault.settings === "function";
} catch {
  // ignored
}

// Toast immediately upon module evaluation. If this never appears in-app,
// the bundle isn't being fetched / evaluated.
toast(`module loaded, settings type=${typeof pluginDefault.settings}`);

export default pluginDefault;
