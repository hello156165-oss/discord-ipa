/**
 * Runtime helpers that abstract over the two APIs Kettu exposes:
 *  - `vendetta` (arrow parameter, ALWAYS defined by the time plugin code
 *    runs, because Kettu wraps us in `vendetta => { return ${js} }` and
 *    populates `window.vendetta` synchronously inside `initVendettaObject`)
 *  - `bunny` (the global, populated by `window.bunny = lib` AFTER
 *    `initPlugins`/`VdPluginManager.initPlugins` have already fired plugin
 *    starts — so it can be `undefined` when our module is evaluated)
 *
 * Always prefer `vendetta`. Fall back to `bunny` (which is fine for ad-hoc
 * tests once the app is fully loaded) and finally to `window.*`.
 */

declare const vendetta: any;
declare const bunny: any;

export interface LarpApi {
  metro: {
    findByStoreName?: (name: string) => any;
    findByName?: (name: string, defaultExp?: boolean) => any;
    findByNameLazy?: (name: string, defaultExp?: boolean) => any;
    findByProps?: (...props: string[]) => any;
    findByPropsLazy?: (...props: string[]) => any;
    common: {
      React: any;
      ReactNative: any;
      components?: any;
    };
  };
  patcher?: {
    after?: (name: string, target: any, cb: any) => () => void;
    before?: (name: string, target: any, cb: any) => () => void;
    instead?: (name: string, target: any, cb: any) => () => void;
  };
  assets?: {
    findAssetId?: (name: string) => number | null;
    getAssetIDByName?: (name: string) => number | undefined;
  };
  toasts?: {
    showToast?: (msg: string, asset?: number) => void;
  };
  settings?: {
    registerSection?: (section: unknown) => () => void;
  };
}

let cached: LarpApi | null = null;

function safeGet<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

/**
 * Resolve the most reliable API surface available right now. Never throws.
 * The returned object always has the documented shape (with undefined
 * leaves where the underlying API is missing) so callers can write
 * `getApi().patcher?.after?.(...)` without further guards.
 */
export function getApi(): LarpApi {
  if (cached) return cached;

  // Prefer vendetta (guaranteed by Kettu's wrapper).
  const v = safeGet(() => vendetta);
  const b = safeGet(() => (typeof bunny !== "undefined" ? bunny : undefined));
  const w =
    safeGet(() => (typeof window !== "undefined" ? (window as any) : undefined)) ??
    safeGet(() => (typeof globalThis !== "undefined" ? (globalThis as any) : undefined));

  const vMetro = safeGet(() => v?.metro);
  const bMetro = safeGet(() => b?.metro);

  const vCommon = safeGet(() => vMetro?.common);
  const bCommon = safeGet(() => bMetro?.common);

  const api: LarpApi = {
    metro: {
      findByStoreName:
        safeGet(() => vMetro?.findByStoreName?.bind(vMetro)) ??
        safeGet(() => bMetro?.findByStoreName?.bind(bMetro)),
      findByName:
        safeGet(() => vMetro?.findByName?.bind(vMetro)) ??
        safeGet(() => bMetro?.findByName?.bind(bMetro)),
      findByNameLazy:
        safeGet(() => bMetro?.findByNameLazy?.bind(bMetro)) ??
        safeGet(() => vMetro?.findByName?.bind(vMetro)),
      findByProps:
        safeGet(() => vMetro?.findByProps?.bind(vMetro)) ??
        safeGet(() => bMetro?.findByProps?.bind(bMetro)),
      findByPropsLazy:
        safeGet(() => bMetro?.findByPropsLazy?.bind(bMetro)) ??
        safeGet(() => vMetro?.findByProps?.bind(vMetro)),
      common: {
        React:
          safeGet(() => vCommon?.React) ??
          safeGet(() => bCommon?.React) ??
          safeGet(() => w?.React),
        ReactNative:
          safeGet(() => vCommon?.ReactNative) ??
          safeGet(() => bCommon?.ReactNative) ??
          safeGet(() => w?.ReactNative),
        components: safeGet(() => bCommon?.components),
      },
    },
    patcher: {
      after:
        safeGet(() => v?.patcher?.after) ??
        safeGet(() => b?.api?.patcher?.after),
      before:
        safeGet(() => v?.patcher?.before) ??
        safeGet(() => b?.api?.patcher?.before),
      instead:
        safeGet(() => v?.patcher?.instead) ??
        safeGet(() => b?.api?.patcher?.instead),
    },
    assets: {
      // window.vendetta exposes the asset lookup at `ui.assets`, NOT
      // `api.assets`. Same path used by every existing Vendetta plugin.
      findAssetId:
        safeGet(() => v?.ui?.assets?.getAssetIDByName) ??
        safeGet(() => b?.api?.assets?.findAssetId) ??
        safeGet(() => b?.api?.assets?.getAssetIDByName),
      getAssetIDByName:
        safeGet(() => v?.ui?.assets?.getAssetIDByName) ??
        safeGet(() => b?.api?.assets?.getAssetIDByName) ??
        safeGet(() => b?.api?.assets?.findAssetId),
    },
    toasts: {
      // showToast is at `vendetta.ui.toasts.showToast`, same for bunny.
      showToast:
        safeGet(() => v?.ui?.toasts?.showToast) ??
        safeGet(() => b?.ui?.toasts?.showToast) ??
        safeGet(() => b?.api?.toasts?.showToast),
    },
    settings: {
      registerSection:
        safeGet(() => b?.ui?.settings?.registerSection) ??
        safeGet(() => v?.ui?.settings?.registerSection),
    },
  };

  cached = api;
  return api;
}
