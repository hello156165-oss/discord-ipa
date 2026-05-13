/**
 * Type declarations for the `bunny` global (Kettu) exposed at runtime via
 * `window.bunny`, plus the Vendetta plugin loader contract used by Kettu's
 * settings UI.
 *
 * Reference:
 *   - Kettu/src/core/vendetta/plugins.ts (evalPlugin / fetchPlugin)
 *   - Kettu/src/lib/addons/plugins/api.ts (createBunnyPluginApi)
 */

import type * as React from "react";

declare global {
  // ---------------------------------------------------------------------------
  // Vendetta plugin shape (what the loader expects to receive)
  // ---------------------------------------------------------------------------

  interface VendettaAuthor {
    name: string;
    id?: `${bigint}`;
  }

  interface VendettaPluginManifest {
    readonly name: string;
    readonly description: string;
    readonly authors: VendettaAuthor[];
    readonly main: string;
    readonly hash: string;
    readonly vendetta?: { icon?: string };
  }

  interface VendettaPluginInstance<S = unknown> {
    onLoad?(): void;
    onUnload?(): void;
    settings?: React.ComponentType<unknown>;
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  type Storage<T extends object> = T;

  // ---------------------------------------------------------------------------
  // Logger
  // ---------------------------------------------------------------------------

  interface BunnyLogger {
    log(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  }

  // ---------------------------------------------------------------------------
  // Settings registration
  // ---------------------------------------------------------------------------

  interface RowConfig {
    key: string;
    title: () => string;
    onPress?: () => unknown;
    render?: () => Promise<{ default: React.ComponentType<any> }>;
    icon?: { uri: string } | number;
    IconComponent?: React.ReactNode;
    usePredicate?: () => boolean;
    useTrailing?: () => string | JSX.Element;
    rawTabsConfig?: Record<string, any>;
  }

  // ---------------------------------------------------------------------------
  // The `bunny` global
  // ---------------------------------------------------------------------------

  interface BunnyGlobal {
    api: {
      patcher: {
        before<T extends object, K extends keyof T>(
          name: K,
          parent: T,
          callback: (args: any[], self: T) => any[] | void
        ): () => void;
        after<T extends object, K extends keyof T>(
          name: K,
          parent: T,
          callback: (args: any[], result: any, self: T) => any
        ): () => void;
        instead<T extends object, K extends keyof T>(
          name: K,
          parent: T,
          callback: (args: any[], orig: (...a: any[]) => any, self: T) => any
        ): () => void;
      };
      commands: {
        registerCommand(cmd: any): () => void;
      };
      flux: {
        intercept(cb: (action: any) => void | boolean): () => void;
      };
      assets: {
        findAssetId(name: string): number | undefined;
      };
    };
    metro: {
      findByProps(...props: string[]): any;
      findByPropsLazy(...props: string[]): any;
      findByName(name: string, exp?: boolean): any;
      findByNameLazy(name: string, exp?: boolean): any;
      findByStoreName(name: string): any;
      findByStoreNameLazy(name: string): any;
      common: {
        React: typeof React;
        ReactNative: any;
        FluxDispatcher: any;
        FluxUtils: any;
        components: any;
        stores: {
          UserStore: any;
          [key: string]: any;
        };
        [key: string]: any;
      };
      [key: string]: any;
    };
    ui: {
      settings: {
        registerSection(section: {
          name: string;
          items: RowConfig[];
        }): () => void;
      };
      components: any;
      [key: string]: any;
    };
    plugin?: {
      manifest?: VendettaPluginManifest;
      logger?: BunnyLogger;
      createStorage?<T extends object = any>(): Storage<T>;
    };
    [key: string]: any;
  }

  const bunny: BunnyGlobal;

  // ---------------------------------------------------------------------------
  // Vendetta global injected as the first argument of the plugin function.
  // The exact shape is wider than this, but we only type what we actually use.
  // ---------------------------------------------------------------------------

  interface VendettaGlobal {
    plugin: {
      id: string;
      manifest: VendettaPluginManifest;
      storage: any;
    };
    logger?: {
      log(...a: unknown[]): void;
      info?(...a: unknown[]): void;
      warn?(...a: unknown[]): void;
      error(...a: unknown[]): void;
    };
    patcher?: BunnyGlobal["api"]["patcher"];
    metro?: BunnyGlobal["metro"];
    ui?: BunnyGlobal["ui"];
    [key: string]: any;
  }
}

export {};
