# AGENTS.md

`opencode-status-indicator` — an OpenCode **v2 TUI plugin**: a prompt-footer indicator showing whether the active request is prefilling (↑ processing) or decoding (↓ generating). Single package, no monorepo.

## Commands

```bash
bun install
bun run build       # emits dist/index.mjs
bun run typecheck   # tsc --noEmit
```

No test suite and no linter — verify by building and typechecking. The build requires Bun.

## Build / toolchain constraints (easy to get wrong)

- **Bun-only build.** `build.ts` uses `Bun.build` + OpenTUI's first-party Solid Babel transform (`@opentui/solid/bun-plugin`). The OpenCode host is Bun-hosted; do **not** swap this for esbuild/tsc/rollup — the JSX transform must match the host runtime.
- `@opencode/plugin/tui` and `@opencode/plugin/tui/context` are **host-private** (not on npm); `src/env.d.ts` hand-declares the surface used. Never add them to package.json.
- `@opentui/*` and `solid-js` **are** real npm packages (kept as dev + optional peer deps), but must stay `external` in `build.ts` so the plugin shares the host's runtime instance — bundling a second `solid-js` breaks reactivity across the host boundary. The external list is exact: `@opencode/plugin/tui`, `@opencode/plugin/tui/context`, `@opentui/core`, `@opentui/solid`, `@opentui/solid/jsx-runtime`, `solid-js`, `solid-js/web`. They must resolve in **both** processes: `hasTuiSurface()` only guards `setup`, whereas these imports evaluate at module scope in the service too, so a service-side resolution failure fails before the guard can run.
- **`dist/` is gitignored but published** (via package.json `files`). Don't commit it; `prepublishOnly` rebuilds it.
- **One source, one output.** `src/index.tsx` builds to `dist/index.mjs`; `package.json` `exports` maps both `.` and `./tui` to that same file and declares **no `types`** entry (no `.d.ts` is emitted).
- **Two loaders, two entrypoints — one file.** In `packages/core/src/plugin/module.ts` the server does `let p = l.server` — the only module it imports — and reads `entrypoints.tui` purely to publish `features: { tui: true }`. The TUI client filters on that flag and then resolves its *own* entrypoint: `packages/tui/src/plugin/context.tsx` calls `Host.resolve(target).tui`, i.e. `pkg/tui`, and imports the result. So both export keys are load-bearing: `exports["."]` is what the service executes, `exports["./tui"]` is what the TUI process imports to render the footer. Both point at `./dist/index.mjs` and `setup` dispatches on the context it receives. If the server slot is empty the plugin dies with `PluginModule.LoadError: Plugin entrypoint not found`. `Host.resolve()` (`packages/plugin/src/host.ts`) tries `pkg/server` then `pkg` for the server slot, and only `pkg/tui` for the TUI slot; `./server` is unnecessary because the resolver falls through to `pkg` on `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- The v2 loader accepts a default export of `{ id, setup }` **or** `{ id, effect }`. A boolean `tui` field would trip the v1-era shape check (`'has invalid tui export'`) and abort the whole load — don't add one.
- `tsc` never validates against the real host API — `src/env.d.ts` is a hand-written approximation and `tsconfig.json` keeps JSX only for the build-time transform. "Typecheck passes" ≠ "matches the host"; verify new host-API usage against the real host.
- CI installs with `bun install --frozen-lockfile`, and `bun.lock` is committed — changing dependencies without regenerating the lockfile fails the release workflow.

## Runtime facts that drive the code

- Default export is `Plugin.define({ id, setup })`; `id` is `opencode-status-indicator` (hyphen — the `opencode.` prefix is reserved for builtins).
- **`setup` is invoked twice, with different contexts.** Two different loaders import this package: the service takes the server entrypoint (`exports["."]`) and the TUI process takes `exports["./tui"]`. Only the TUI context carries `data.on`/`ui.slot`; the service context is built from `app`/`location`/`options`/`session`/`tool`/… only (`packages/plugin/src/promise/adapter.ts`). `setup` therefore guards with `hasTuiSurface()` and returns early for the service context — without that guard the load dies with `TypeError: undefined is not an object (evaluating 'context.data.on')` and the plugin never registers, even though resolution succeeded.
- State machine lives in `src/index.tsx`, keyed per `sessionID`. It subscribes to v2 session events and registers an `append` on the `prompt.footer.status` slot.
- **Route every event handler through `MINIMAL_EVENT`.** Events arrive in two shapes (payload nested under `data` or at top level); `MINIMAL_EVENT` reads `event?.data?.sessionID ?? event?.sessionID`. A handler reading `event.sessionID` directly silently no-ops on nested-shape events.
- **`enter()` must not re-stamp `since` on same-phase repeats** — otherwise the elapsed timer resets on every token delta. Don't "simplify" the same-phase guard away.
- **Tool execution happens *inside* a step**, so `session.step.ended` fires only after tools finish. Hiding during tools requires the explicit `session.tool.called` handler — do not remove it.
- Elapsed time uses each event's `created` field (host epoch ms), not wall-clock deltas across events.

## Local dev wiring

Two registries can list this plugin, and either one works:
- `~/.config/opencode/opencode.json` → `plugins` — the **server (core)** registry. The service loads each entry and publishes `features.tui` when `./tui` resolves; the TUI then loads `pkg/tui` for it.
- `~/.config/opencode/cli.json` → `plugins` — the **TUI-side** registry ("ordered plugin enablement directives and external package declarations"). `packages/tui/src/plugin/context.tsx` resolves and installs these itself, with no server involvement.
- **Local checkout** → point at the **directory** containing the build: `"file:///abs/path/to/dist"`. Exports are bypassed here — `Host.resolve({ directory })` builds literal paths — so the server entry is `<dir>/server`, then `<dir>/index` (run through `Bun.resolveSync`, so the extensionless `index` finds `index.mjs`). The TUI needs `<dir>/tui`, which this layout does not have, so it reports `status: "unsupported"` and the footer never appears. Prefer the package name. Rebuild and restart OpenCode to pick up changes.
- **A file path is rejected.** `packages/core/src/config/plugin/source.ts` logs `configured plugin path must be a directory` and drops any absolute target that is a file, so the build directory is the only usable local target.
- **Installed** → the package name `"opencode-status-indicator"`.
- Do **not** use a subpath specifier (`opencode-status-indicator/tui`); v2 treats each string as a package name or a local path.

`opencode.json` is the documented home for `plugins` and the only one with project scope; `cli.json` is global-only. Note `cli.json` is read from `<global.config>/cli.json`, i.e. `$OPENCODE_CONFIG_DIR` when that env var is set.

## Release / publish

- Publishing is **release-triggered and staged**, not direct: `.github/workflows/publish.yml` runs on `release: published`, stages via `npm stage publish` over **OIDC trusted publishing** (no token), then a maintainer approves with 2FA (`npm stage approve <id>`, or npmjs.com → package → Staged Packages).
- **Bump `version` before each release** — staged versions share npm's uniqueness index. Prereleases need an explicit `--tag`.
- `--dry-run` does **not** exercise OIDC; only a real release validates the trust connection.
- The npm Trusted Publisher entry must name repo `harshithmohan/opencode-status-indicator` and file exactly `publish.yml`.

## Git

- `origin` = `harshithmohan/opencode-status-indicator`.
- Commit and push **only when explicitly asked**.
