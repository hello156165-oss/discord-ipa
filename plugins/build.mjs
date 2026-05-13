// Build script for Kettu external plugins (Vendetta format).
//
// Why Vendetta and not the newer Bunny "spec 3" format?
// ----------------------------------------------------
// Kettu's settings UI ("Add a plugin" button) talks to `VdPluginManager`, which
// fetches `<url>/manifest.json` + `<url>/<main>` and `eval`s the JS through the
// wrapper `vendetta => { return <JS> }`. The Bunny manifest/repo format exists
// in the code but is NOT exposed in the UI yet. So shipping plugins as
// "Vendetta plugins" is the path of least resistance for now.
//
// For each subdirectory in src/, this script:
//   1. reads its manifest.json
//   2. bundles its entry (index.tsx | ts | jsx | js) with esbuild in CJS mode
//   3. wraps the CJS output in an expression that, when `eval`d by Kettu,
//      yields the plugin instance via `module.exports.default`
//   4. emits builds/<name>/{manifest.json,index.js} where <name> matches the
//      slug used in the install URL (we use the source directory name, which
//      is human-readable and stable)
//   5. computes a SHA256 hash of the bundle and writes it back into the
//      manifest, so Kettu cache-busts whenever the bundle changes
//
// A top-level plugins/repo.json index is still produced for convenience.

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
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "src");
const OUT = resolve(__dirname, "builds");

const REPO_META = {
  name: "hello156165 - private plugins",
  description: "Personal Kettu plugin repository.",
};

// ---------------------------------------------------------------------------
// esbuild plugin: rewrite imports of react / react-native / jsx-runtime so
// the bundle uses Discord's existing React/RN instance instead of shipping
// its own copy (which would break hooks because of two React instances).
//
// IMPORTANT: we resolve through the `vendetta` arrow parameter rather than
// the `bunny` global. Kettu wraps plugin JS as
//   `vendetta => { return ${plugin.js} }`
// and `vendetta.metro.common.React/ReactNative` is set BEFORE plugin code
// runs (it is part of `window.vendetta` populated by `initVendettaObject`).
// `window.bunny`, on the other hand, is only assigned AFTER initPlugins
// has finished firing off plugin starts — so on app launch it can be
// undefined when our module is evaluated, which used to make every
// previously-enabled plugin fail with `Cannot read properties of undefined`.
// ---------------------------------------------------------------------------
const BUNNY_GLOBALS = {
  // The React / ReactNative we get from Kettu are lazy Proxies that wrap
  // the real Discord modules. Any SET on those proxies (including
  // assigning `default`/`__esModule`) is reflected onto the real module,
  // which can throw if Discord's module is sealed/frozen — and in any
  // case is a side-effect we don't want.
  //
  // The safest pattern is to build a thin namespace wrapper that:
  //   - exposes the proxied module as `.default`
  //   - sets `.__esModule` so esbuild's __toESM helper short-circuits
  //   - uses property getters so any named import (`import { useState }`)
  //     forwards to the real module on access
  react: `
    var _r = vendetta && vendetta.metro && vendetta.metro.common
      && vendetta.metro.common.React;
    if (!_r && typeof bunny !== "undefined")
      _r = bunny.metro && bunny.metro.common && bunny.metro.common.React;
    if (!_r && typeof window !== "undefined")
      _r = window.React;
    if (!_r) {
      throw new Error("[Larp] React unavailable");
    }
    module.exports = _r;
  `,
  "react-native": `
    var _rn = vendetta && vendetta.metro && vendetta.metro.common
      && vendetta.metro.common.ReactNative;
    if (!_rn && typeof bunny !== "undefined")
      _rn = bunny.metro && bunny.metro.common && bunny.metro.common.ReactNative;
    if (!_rn && typeof window !== "undefined")
      _rn = window.ReactNative;
    if (!_rn) {
      throw new Error("[Larp] ReactNative unavailable");
    }
    module.exports = _rn;
  `,
  "react/jsx-runtime": `
    var _j;
    try {
      _j = vendetta && vendetta.metro && vendetta.metro.findByProps
        && vendetta.metro.findByProps("jsx", "jsxs");
    } catch (e) {}
    if (!_j && typeof bunny !== "undefined") {
      try { _j = bunny.metro && bunny.metro.findByProps("jsx", "jsxs"); } catch(e){}
    }
    if (!_j) _j = { jsx: undefined, jsxs: undefined, Fragment: undefined };
    module.exports = {
      jsx: _j.jsx,
      jsxs: _j.jsxs,
      Fragment: _j.Fragment,
      __esModule: true,
    };
  `,
  "react/jsx-dev-runtime": `
    var _j;
    try {
      _j = vendetta && vendetta.metro && vendetta.metro.findByProps
        && vendetta.metro.findByProps("jsxDEV", "jsx", "jsxs");
    } catch (e) {}
    if (!_j && typeof bunny !== "undefined") {
      try { _j = bunny.metro && bunny.metro.findByProps("jsxDEV", "jsx", "jsxs"); } catch(e){}
    }
    if (!_j) _j = { jsxDEV: undefined, jsx: undefined, Fragment: undefined };
    module.exports = {
      jsxDEV: _j.jsxDEV || _j.jsx,
      Fragment: _j.Fragment,
      __esModule: true,
    };
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
// Helpers
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

function makeBuildOptions(pluginId, srcDir) {
  return {
    entryPoints: [resolveEntry(srcDir)],
    bundle: true,
    write: false, // we wrap and write the output ourselves
    format: "cjs",
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
  };
}

/**
 * Wrap the raw CJS output of esbuild into a single JavaScript expression that
 * Kettu's plugin loader can evaluate directly.
 *
 * Kettu wraps `plugin.js` in `vendetta => { return ${plugin.js} }`, so we MUST
 * produce an expression here — not a statement. We do that with an IIFE that
 * provides `module` and `exports` locals, runs the CJS body, then returns
 * `module.exports.default ?? module.exports`.
 */
function wrapAsExpression(cjsCode, pluginId) {
  // Strip the leading `"use strict";` directive — it's harmless but useless
  // here, and keeping it would put a *statement* before our expression on
  // some platforms (we want a clean expression).
  const stripped = cjsCode.replace(/^\s*["']use strict["'];?\s*/, "");

  // CRITICAL: the very first character of our output must be `(` so that when
  // Kettu wraps us as `vendetta => { return ${plugin.js} }`, the parser
  // recognises the body as an expression and DOES NOT perform automatic
  // semicolon insertion after `return`. A leading comment OR a leading
  // newline between `return` and the IIFE would turn this into
  // `return;\n(IIFE);` — i.e. the arrow returns `undefined` and the IIFE
  // runs but its result is discarded. We learned this the hard way.
  //
  // We move the build-info comment INSIDE the IIFE so the public file still
  // contains attribution, but it cannot disrupt parsing.
  // We wrap the ENTIRE bundle body in a try/catch. If the bundle throws
  // (e.g. accessing the React lazy proxy fails, or any module-init code
  // explodes), we:
  //   1. fire an "early breadcrumb" toast so the user sees that the bundle
  //      at least started executing
  //   2. fire a "BUNDLE THREW" toast carrying the error message
  //   3. expose the error on `globalThis.__LARP_BUNDLE_ERROR__` so it can
  //      be inspected from the Kettu eval console
  //   4. swallow the error and return a stub plugin object so Kettu sets
  //      `plugin.enabled = true` (the toggle stays ON) and the user can
  //      still see the diagnostic toast. The plugin obviously won't do
  //      anything useful, but at least we get visibility instead of a
  //      silent toggle-revert.
  return (
    `(function(){` +
    `\n  /* Larp plugin bundle for ${pluginId} (Vendetta format).` +
    `\n     Built ${new Date().toISOString()}.` +
    `\n     Loaded by Kettu via VdPluginManager.evalPlugin. */` +
    `\n  "use strict";` +
    `\n  var module = { exports: {} };` +
    `\n  var exports = module.exports;` +
    `\n  function __larpShow(msg){` +
    `\n    try {` +
    `\n      var f = (typeof vendetta !== "undefined" && vendetta && vendetta.ui && vendetta.ui.toasts && vendetta.ui.toasts.showToast)` +
    `\n           || (typeof bunny !== "undefined" && bunny && bunny.ui && bunny.ui.toasts && bunny.ui.toasts.showToast);` +
    `\n      if (f) f(msg);` +
    `\n      else if (typeof console !== "undefined") console.log(msg);` +
    `\n    } catch(__){}` +
    `\n  }` +
    `\n  try { (globalThis||{}).__LARP_BUNDLE_ENTERED__ = Date.now(); } catch(__){}` +
    `\n  __larpShow("[Larp] bundle entered");` +
    `\n  try {` +
    `\n${stripped}` +
    `\n  } catch (__larpBundleError) {` +
    `\n    try { (globalThis||{}).__LARP_BUNDLE_ERROR__ = __larpBundleError; } catch(__){}` +
    `\n    var __msg = "[Larp BUNDLE THREW] " + ((__larpBundleError && __larpBundleError.message) || String(__larpBundleError));` +
    `\n    __larpShow(__msg);` +
    `\n    if (typeof console !== "undefined") console.error("[Larp] bundle threw:", __larpBundleError);` +
    `\n    module.exports = { default: {` +
    `\n      onLoad: function(){ __larpShow("[Larp] onLoad noop — bundle had thrown"); },` +
    `\n      onUnload: function(){},` +
    `\n      settings: undefined` +
    `\n    }};` +
    `\n  }` +
    `\n  return module.exports.default != null ? module.exports.default : module.exports;` +
    `\n})()`
  );
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------
async function buildAll({ watch }) {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const repo = { $meta: REPO_META };
  const pluginDirs = listPluginDirs();

  if (pluginDirs.length === 0) {
    console.warn(`No plugins found in ${SRC}`);
  }

  for (const dirName of pluginDirs) {
    const pluginSrc = join(SRC, dirName);
    const manifestRaw = readFileSync(join(pluginSrc, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw);

    // Use the source directory name as the URL slug. Stable, predictable.
    const slug = dirName;
    const outDir = join(OUT, slug);
    mkdirSync(outDir, { recursive: true });

    console.log(`\n— Building ${manifest.name} (${slug})`);

    const opts = makeBuildOptions(slug, pluginSrc);

    let bundleText;
    if (watch) {
      const ctx = await context({
        ...opts,
        write: false,
      });
      const result = await ctx.rebuild();
      bundleText = result.outputFiles[0].text;
      await ctx.watch();
      console.log(`  watching ${pluginSrc}`);
    } else {
      const result = await build(opts);
      bundleText = result.outputFiles[0].text;
    }

    const wrapped = wrapAsExpression(bundleText, slug);
    writeFileSync(join(outDir, "index.js"), wrapped);

    // Hash drives Kettu's "is the cached copy still current?" check. Compute
    // it AFTER wrapping so any change to the wrapper also invalidates caches.
    const hash = createHash("sha256")
      .update(wrapped)
      .digest("hex")
      .slice(0, 16);

    const finalManifest = { ...manifest, hash };
    writeFileSync(
      join(outDir, "manifest.json"),
      JSON.stringify(finalManifest, null, 2)
    );

    repo[slug] = {
      name: manifest.name,
      description: manifest.description,
      hash,
    };

    console.log(
      `  → builds/${slug}/index.js (${(wrapped.length / 1024).toFixed(1)} kB, hash ${hash})`
    );
  }

  writeFileSync(join(OUT, "repo.json"), JSON.stringify(repo, null, 2));
  // Top-level convenience copy so `<repo>/dist/plugins/repo.json` works.
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
