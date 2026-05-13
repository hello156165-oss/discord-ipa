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
// ---------------------------------------------------------------------------
const BUNNY_GLOBALS = {
  react: `
    const _r = bunny.metro.common.React;
    module.exports = _r;
    module.exports.default = _r;
    module.exports.__esModule = true;
  `,
  "react-native": `
    const _rn = bunny.metro.common.ReactNative;
    module.exports = _rn;
    module.exports.default = _rn;
    module.exports.__esModule = true;
  `,
  "react/jsx-runtime": `
    const _j = (typeof bunny !== "undefined" && bunny._jsx)
      || bunny.metro.findByProps("jsx", "jsxs");
    module.exports = {
      jsx: _j.jsx,
      jsxs: _j.jsxs,
      Fragment: _j.Fragment,
      __esModule: true,
    };
  `,
  "react/jsx-dev-runtime": `
    const _j = (typeof bunny !== "undefined" && bunny._jsx)
      || bunny.metro.findByProps("jsxDEV", "jsx", "jsxs");
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

  return [
    `/* Larp plugin bundle for ${pluginId} (Vendetta format).`,
    `   Built ${new Date().toISOString()}.`,
    `   Loaded by Kettu via VdPluginManager.evalPlugin. */`,
    `(function(){`,
    `  "use strict";`,
    `  var module = { exports: {} };`,
    `  var exports = module.exports;`,
    stripped,
    `  return module.exports.default != null ? module.exports.default : module.exports;`,
    `})()`,
  ].join("\n");
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
