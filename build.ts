/**
 * Build the plugin to `dist/index.mjs`.
 *
 * The host loads plugins as a single precompiled ESM file, so JSX must be
 * transformed at build time with OpenTUI's first-party Solid plugin. Runtime
 * dependencies are supplied by the OpenCode host and stay external.
 */
import solidTransformPlugin from "@opentui/solid/bun-plugin"
import { rmSync } from "node:fs"
import path from "node:path"

const root = import.meta.dir
const srcDir = path.join(root, "src")
const outDir = path.join(root, "dist")

const external = [
  "@opencode/plugin/tui",
  "@opencode/plugin/tui/context",
  "@opentui/core",
  "@opentui/solid",
  "@opentui/solid/jsx-runtime",
  "solid-js",
  "solid-js/web",
]

// Clear stale output first: `package.json` `files` publishes all of `dist`, so an
// artefact left over from an earlier layout would ship.
rmSync(outDir, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [path.join(srcDir, "index.tsx")],
  outdir: outDir,
  root: srcDir,
  format: "esm",
  naming: { entry: "[name].mjs" },
  target: "node",
  external,
  plugins: [solidTransformPlugin],
  minify: false,
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log("✓ Built dist/index.mjs")
