/**
 * Build the TUI plugin to `dist/tui.mjs`.
 *
 * The host loads local plugins as a single precompiled ESM file, so JSX must be
 * transformed at build time with OpenTUI's first-party Solid plugin. Runtime
 * dependencies are supplied by the OpenCode host and stay external.
 */
import solidTransformPlugin from "@opentui/solid/bun-plugin"
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

const result = await Bun.build({
  entrypoints: [path.join(srcDir, "tui.tsx")],
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

console.log("✓ Built dist/tui.mjs")
