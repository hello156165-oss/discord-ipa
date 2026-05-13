// Build script for Kettu external plugins.
//
// For each subdirectory in src/, we:
//   1. read its manifest.json
//   2. bundle its entry (index.tsx | index.ts | index.jsx | index.js)
//      with esbuild as a single self-contained IIFE
//   3. emit builds/<id>/{manifest.json,index.js}
//
// We also (re)generate plugins/repo.json so the file consumed by Kettu's
// "Add custom plugin repo" feature is always in sync with what we built.

import { build, context } from "esbuild";
import {
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "src");
const OUT = resolve(__dirname, "builds");

// ---------------------------------------------------------------------------
// Repo metadata. Edit these once and forget about it.
// ---------------------------------------------------------------------------
const REPO_META = {
  name: "hello156165 - private plugins",
  description: "Personal Kettu plugin repository.",
};

// ---------------------------------------------------------------------------
// esbuild plugin: rewrite imports of react / react-native / jsx-runtime so
// the bundled code references the modules Discord already has in memory
// (exposed by Kettu through the `bunny` global) instead of trying to ship
// its own copy of React.
//
// Why this matters: Discord's React tree and our plugin MUST share the same
// React instance, otherwise hooks (useState, useEffect, …) silently break
// with `Cannot read properties of null (reading 'useState')`. Same goes for
// react-native and react/jsx-runtime which is invoked by automatic JSX.
// ---------------------------------------------------------------------------
const BUNNY_GLOBALS = {
  react: `
    const _r = bunny.metro.common.React;
    export default _r;
    export const Children = _r.Children;
    export const Component = _r.Component;
    export const PureComponent = _r.PureComponent;
    export const Fragment = _r.Fragment;
    export const StrictMode = _r.StrictMode;
    export const Suspense = _r.Suspense;
    export const createContext = _r.createContext;
    export const createElement = _r.createElement;
    export const cloneElement = _r.cloneElement;
    export const createRef = _r.createRef;
    export const forwardRef = _r.forwardRef;
    export const isValidElement = _r.isValidElement;
    export const lazy = _r.lazy;
    export const memo = _r.memo;
    export const useCallback = _r.useCallback;
    export const useContext = _r.useContext;
    export const useDebugValue = _r.useDebugValue;
    export const useEffect = _r.useEffect;
    export const useImperativeHandle = _r.useImperativeHandle;
    export const useLayoutEffect = _r.useLayoutEffect;
    export const useMemo = _r.useMemo;
    export const useReducer = _r.useReducer;
    export const useRef = _r.useRef;
    export const useState = _r.useState;
    export const useId = _r.useId;
    export const useSyncExternalStore = _r.useSyncExternalStore;
    export const useTransition = _r.useTransition;
    export const startTransition = _r.startTransition;
    export const version = _r.version;
  `,
  "react-native": `
    const _rn = bunny.metro.common.ReactNative;
    export default _rn;
    // Re-export every property as a named export so consumers can do
    // \`import { View, Text } from "react-native"\`. Done in a side-effecting
    // loop at module evaluation time via a Proxy-like trick.
    export const AccessibilityInfo = _rn.AccessibilityInfo;
    export const ActivityIndicator = _rn.ActivityIndicator;
    export const Alert = _rn.Alert;
    export const Animated = _rn.Animated;
    export const AppRegistry = _rn.AppRegistry;
    export const AppState = _rn.AppState;
    export const Button = _rn.Button;
    export const Clipboard = _rn.Clipboard;
    export const DeviceEventEmitter = _rn.DeviceEventEmitter;
    export const Dimensions = _rn.Dimensions;
    export const Easing = _rn.Easing;
    export const FlatList = _rn.FlatList;
    export const Image = _rn.Image;
    export const ImageBackground = _rn.ImageBackground;
    export const Keyboard = _rn.Keyboard;
    export const KeyboardAvoidingView = _rn.KeyboardAvoidingView;
    export const LayoutAnimation = _rn.LayoutAnimation;
    export const Linking = _rn.Linking;
    export const Modal = _rn.Modal;
    export const NativeEventEmitter = _rn.NativeEventEmitter;
    export const NativeModules = _rn.NativeModules;
    export const PanResponder = _rn.PanResponder;
    export const Platform = _rn.Platform;
    export const Pressable = _rn.Pressable;
    export const RefreshControl = _rn.RefreshControl;
    export const ScrollView = _rn.ScrollView;
    export const SectionList = _rn.SectionList;
    export const Share = _rn.Share;
    export const StatusBar = _rn.StatusBar;
    export const StyleSheet = _rn.StyleSheet;
    export const Switch = _rn.Switch;
    export const Text = _rn.Text;
    export const TextInput = _rn.TextInput;
    export const TouchableHighlight = _rn.TouchableHighlight;
    export const TouchableOpacity = _rn.TouchableOpacity;
    export const TouchableWithoutFeedback = _rn.TouchableWithoutFeedback;
    export const View = _rn.View;
    export const VirtualizedList = _rn.VirtualizedList;
    export const findNodeHandle = _rn.findNodeHandle;
    export const requireNativeComponent = _rn.requireNativeComponent;
    export const UIManager = _rn.UIManager;
  `,
  "react/jsx-runtime": `
    const _j = bunny._jsx ?? bunny.metro.findByProps("jsx", "jsxs");
    export const jsx = _j.jsx;
    export const jsxs = _j.jsxs;
    export const Fragment = _j.Fragment;
  `,
  "react/jsx-dev-runtime": `
    const _j = bunny._jsx ?? bunny.metro.findByProps("jsxDEV", "jsx", "jsxs");
    export const jsxDEV = _j.jsxDEV ?? _j.jsx;
    export const Fragment = _j.Fragment;
  `,
};

function bunnyGlobalsPlugin() {
  return {
    name: "bunny-globals",
    setup(b) {
      const filter = new RegExp(
        `^(${Object.keys(BUNNY_GLOBALS)
          .map((k) => k.replace(/[/\\.]/g, "\\$&"))
          .join("|")})$`
      );
      b.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: "bunny-global",
      }));
      b.onLoad({ filter: /.*/, namespace: "bunny-global" }, (args) => ({
        contents: BUNNY_GLOBALS[args.path],
        loader: "js",
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Plugin discovery
// ---------------------------------------------------------------------------
function listPluginDirs() {
  if (!existsSync(SRC)) return [];
  return readdirSync(SRC).filter((name) => {
    const full = join(SRC, name);
    return (
      statSync(full).isDirectory() && existsSync(join(full, "manifest.json"))
    );
  });
}

function resolveEntry(pluginDir) {
  const candidates = ["index.tsx", "index.ts", "index.jsx", "index.js"];
  for (const cand of candidates) {
    const p = join(pluginDir, cand);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Could not find entry point for plugin at ${pluginDir} ` +
      `(looked for ${candidates.join(", ")})`
  );
}

function makeBuildOptions(pluginId, srcDir, outDir) {
  return {
    entryPoints: [resolveEntry(srcDir)],
    outfile: join(outDir, "index.js"),
    bundle: true,
    // The Kettu loader wraps our bundle in
    //   (bunny, definePlugin) => { <bundle>; return plugin?.default ?? plugin; }
    // It therefore expects a top-level `plugin` to exist when the bundle
    // finishes. esbuild's globalName + iife format does exactly that, but the
    // IIFE captures `bunny` and `definePlugin` from the outer scope, so we
    // pass them in explicitly to keep esbuild from declaring shadowing vars.
    format: "iife",
    globalName: "plugin",
    platform: "neutral",
    target: ["es2022"],
    jsx: "automatic",
    jsxImportSource: "react",
    minify: false,
    sourcemap: false,
    legalComments: "none",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    plugins: [bunnyGlobalsPlugin()],
    logLevel: "info",
    banner: {
      js: `// Kettu plugin bundle for ${pluginId}\n// Built ${new Date().toISOString()}\n`,
    },
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------
async function buildAll({ watch }) {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const repo = { $meta: REPO_META };
  const plugins = listPluginDirs();

  if (plugins.length === 0) {
    console.warn(`No plugins found in ${SRC}`);
  }

  for (const dirName of plugins) {
    const pluginSrc = join(SRC, dirName);
    const manifest = JSON.parse(
      readFileSync(join(pluginSrc, "manifest.json"), "utf8")
    );
    const outDir = join(OUT, manifest.id);
    mkdirSync(outDir, { recursive: true });

    console.log(`\n— Building ${manifest.id} v${manifest.version}`);

    const opts = makeBuildOptions(manifest.id, pluginSrc, outDir);

    if (watch) {
      const ctx = await context(opts);
      await ctx.watch();
      console.log(`  watching ${pluginSrc}`);
    } else {
      await build(opts);
    }

    writeFileSync(
      join(outDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );
    repo[manifest.id] = { version: manifest.version, alwaysFetch: true };
  }

  writeFileSync(join(OUT, "repo.json"), JSON.stringify(repo, null, 2));
  // Convenience copy at plugins/repo.json so it can be served as
  //   /plugins/repo.json   (top-level)
  // or
  //   /plugins/builds/repo.json
  // depending on where you host from.
  writeFileSync(
    resolve(__dirname, "repo.json"),
    JSON.stringify(repo, null, 2)
  );

  console.log(`\nDone. Output in ${OUT}`);
}

const watch = process.argv.includes("--watch");
buildAll({ watch }).catch((err) => {
  console.error(err);
  process.exit(1);
});
