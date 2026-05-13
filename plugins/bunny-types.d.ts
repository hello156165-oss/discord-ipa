/**
 * Type declarations for the `bunny` and `definePlugin` globals injected
 * by the Kettu plugin loader at runtime.
 *
 * Reference: Kettu/src/lib/addons/plugins/api.ts (createBunnyPluginApi)
 */

import type * as React from "react";

declare global {
  // ---------------------------------------------------------------------------
  // Plugin entrypoint helpers
  // ---------------------------------------------------------------------------

  interface PluginInstance {
    start?(): void;
    stop?(): void;
    SettingsComponent?: React.ComponentType<any>;
  }

  /**
   * Injected by Kettu's plugin instantiator wrapper.
   * Decorates the plugin with its manifest and returns the same object.
   */
  const definePlugin: <T extends PluginInstance>(p: T) => T & {
    manifest: BunnyManifest;
  };

  // ---------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------

  interface BunnyAuthor {
    name: string;
    id?: `${bigint}`;
  }

  interface BunnyManifest {
    readonly id: string;
    readonly version: string;
    readonly type: "plugin";
    readonly spec: 3;
    readonly main: string;
    readonly display: {
      readonly name: string;
      readonly description?: string;
      readonly authors?: BunnyAuthor[];
    };
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
    plugin: {
      manifest: BunnyManifest;
      logger: BunnyLogger;
      createStorage<T extends object = any>(): Storage<T>;
    };
    [key: string]: any;
  }

  const bunny: BunnyGlobal;
}

export {};
