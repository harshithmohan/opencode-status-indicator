/**
 * Build the plugin to `dist/index.mjs` (TUI) and `dist/server.mjs` (service),
 * plus a local-dev-only `dist/tui.mjs` shim (see the note before it is written).
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
  entrypoints: [path.join(srcDir, "index.tsx"), path.join(srcDir, "server.ts")],
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

// Local-dev shim. `Host.resolve({ directory })` bypasses package `exports` and
// probes literal paths: `<dir>/server` then `<dir>/index` for the server slot,
// but only `<dir>/tui` (no fallback) for the TUI slot. Without this file a local
// checkout wired as `"file://<abs>/dist"` loads server-side but never renders the
// footer. It is excluded from the published tarball via package.json `files`.
await Bun.write(path.join(outDir, "tui.mjs"), 'export { default } from "./index.mjs"\n')

console.log("✓ Built dist/index.mjs, dist/server.mjs, dist/tui.mjs")
