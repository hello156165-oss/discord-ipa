// Build script for Kettu external plugins — DEAD SIMPLE version.
//
// For each subdirectory in src/, we expect:
//   - manifest.json
//   - index.js  (plain JS that is ALREADY an expression — typically an IIFE
//                that returns the plugin object, see src/larp/index.js).
//
// What this script does:
//   1. reads manifest.json + index.js
//   2. wraps index.js in a global try/catch with diagnostic toasts +
//      a `Larp diagnostic` alert dialog if anything throws (so we never
//      get a silent failure that flips the Kettu toggle back to OFF)
//   3. computes a SHA256 hash of the wrapped output and writes it into
//      the manifest so Kettu invalidates its cache when the bundle
//      changes
//   4. writes builds/<dir>/{manifest.json,index.js} + a top-level
//      plugins/repo.json index
//
// NO esbuild. NO TypeScript. NO React/RN imports. The plugin source is
// expected to be plain JS that grabs everything off the `vendetta`
// arrow parameter Kettu provides. This avoids every class of bug we
// hit when esbuild's __toESM helper tried to mutate Kettu's lazy
// React proxy (which forwards SETs to the real, frozen Discord module).

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

function listPluginDirs() {
  if (!existsSync(SRC)) return [];
  return readdirSync(SRC).filter((name) => {
    const full = join(SRC, name);
    return (
      statSync(full).isDirectory() &&
      existsSync(join(full, "manifest.json")) &&
      existsSync(join(full, "index.js"))
    );
  });
}

/**
 * Wrap the raw plugin expression with a global try/catch + diagnostic
 * dialog. The plugin source MUST itself evaluate to an expression
 * (typically an IIFE that returns the plugin object).
 *
 * The wrapper:
 *   - declares __larpShow (toast helper) + __larpAlert (modal helper)
 *   - fires "[Larp] bundle entered" the instant we start executing
 *   - records `globalThis.__LARP_BUNDLE_ENTERED__` so it can be inspected
 *     via Kettu's /eval command after the fact
 *   - if the plugin expression throws, pops a Discord confirmation alert
 *     with the message + stack and falls back to a stub plugin so the
 *     toggle does not silently revert to OFF.
 *
 * Result: a single JS expression suitable for `vendetta => { return EXPR }`.
 */
function wrapAsExpression(rawJs, pluginId) {
  // Strip a leading `"use strict";` (the wrapper has its own).
  const stripped = rawJs.replace(/^\s*["']use strict["'];?\s*/, "");

  // CRITICAL: first character must be `(` so that Kettu's
  // `vendetta=>{return ${js}}` wrapping doesn't trigger Automatic
  // Semicolon Insertion after `return`. The build-info comment is
  // intentionally placed INSIDE the IIFE.
  return [
    `(function(){`,
    `  /* Larp plugin bundle for ${pluginId}.`,
    `     Built ${new Date().toISOString()}. */`,
    `  "use strict";`,
    `  function __larpAssetId(name){`,
    `    try {`,
    `      var g = vendetta && vendetta.ui && vendetta.ui.assets && vendetta.ui.assets.getAssetIDByName;`,
    `      if (g) return g(name || "Check");`,
    `    } catch (__) {}`,
    `    return undefined;`,
    `  }`,
    `  function __larpShow(msg){`,
    `    try {`,
    `      var f = vendetta && vendetta.ui && vendetta.ui.toasts && vendetta.ui.toasts.showToast;`,
    `      if (f) f(msg, __larpAssetId("Check"));`,
    `      else if (typeof console !== "undefined") console.log(msg);`,
    `    } catch (__) {}`,
    `  }`,
    `  function __larpAlert(title, content){`,
    `    try {`,
    `      var a = vendetta && vendetta.ui && vendetta.ui.alerts && vendetta.ui.alerts.showConfirmationAlert;`,
    `      if (a) a({ title: title, content: content, confirmText: "OK" });`,
    `    } catch (__) {}`,
    `  }`,
    `  try { (globalThis||{}).__LARP_BUNDLE_ENTERED__ = Date.now(); } catch (__) {}`,
    `  __larpShow("[Larp] bundle entered");`,
    `  try {`,
    `    var __larpPlugin = (${stripped});`,
    `    if (!__larpPlugin || typeof __larpPlugin !== "object") {`,
    `      throw new Error("Larp source did not evaluate to a plugin object (got " + typeof __larpPlugin + ")");`,
    `    }`,
    `    return __larpPlugin;`,
    `  } catch (err) {`,
    `    try { (globalThis||{}).__LARP_BUNDLE_ERROR__ = err; } catch (__) {}`,
    `    var msg = "[Larp BUNDLE THREW] " + ((err && err.message) || String(err));`,
    `    __larpShow(msg);`,
    `    __larpAlert("Larp diagnostic", msg + "\\n\\nStack:\\n" + ((err && err.stack) || "(no stack)"));`,
    `    if (typeof console !== "undefined") console.error("[Larp] bundle threw:", err);`,
    `    return {`,
    `      onLoad: function(){ __larpShow("[Larp] onLoad noop — bundle had thrown"); },`,
    `      onUnload: function(){},`,
    `      settings: undefined`,
    `    };`,
    `  }`,
    `})()`,
  ].join("\n");
}

async function buildAll() {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const repo = { $meta: REPO_META };
  const pluginDirs = listPluginDirs();

  if (pluginDirs.length === 0) {
    console.warn(`No plugins found in ${SRC}`);
  }

  for (const dirName of pluginDirs) {
    const pluginSrc = join(SRC, dirName);
    const manifest = JSON.parse(
      readFileSync(join(pluginSrc, "manifest.json"), "utf8")
    );
    const rawJs = readFileSync(join(pluginSrc, "index.js"), "utf8");

    const slug = dirName;
    const outDir = join(OUT, slug);
    mkdirSync(outDir, { recursive: true });

    console.log(`\n— Building ${manifest.name} (${slug})`);

    const wrapped = wrapAsExpression(rawJs, slug);
    writeFileSync(join(outDir, "index.js"), wrapped);

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
      `  → builds/${slug}/index.js (${(wrapped.length / 1024).toFixed(
        1
      )} kB, hash ${hash})`
    );
  }

  writeFileSync(join(OUT, "repo.json"), JSON.stringify(repo, null, 2));
  writeFileSync(
    resolve(__dirname, "repo.json"),
    JSON.stringify(repo, null, 2)
  );

  console.log(`\nDone. Output in ${OUT}`);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
