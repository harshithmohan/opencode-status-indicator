# AGENTS.md

`opencode-status-indicator` — an OpenCode **v2 TUI plugin**: a prompt-footer indicator showing whether the active request is prefilling (↑ processing) or decoding (↓ generating). Single package, no monorepo.

## Commands

```bash
bun install
bun run build       # emits dist/tui.mjs
bun run typecheck   # tsc --noEmit
```

No test suite and no linter — verify by building and typechecking. The build requires Bun.

## Build / toolchain constraints (easy to get wrong)

- **Bun-only build.** `build.ts` uses `Bun.build` + OpenTUI's first-party Solid Babel transform (`@opentui/solid/bun-plugin`). The OpenCode host is Bun-hosted; do **not** swap this for esbuild/tsc/rollup — the JSX transform must match the host runtime.
- `@opencode/plugin/tui` and `@opencode/plugin/tui/context` are **host-private** (not on npm); `src/env.d.ts` hand-declares the surface used. Never add them to package.json.
- `@opentui/*` and `solid-js` **are** real npm packages (kept as dev + optional peer deps), but must stay `external` in `build.ts` so the plugin shares the host's runtime instance — bundling a second `solid-js` breaks reactivity across the host boundary. The external list is exact: `@opencode/plugin/tui`, `@opencode/plugin/tui/context`, `@opentui/core`, `@opentui/solid`, `@opentui/solid/jsx-runtime`, `solid-js`, `solid-js/web`.
- **`dist/` is gitignored but published** (via package.json `files`). Don't commit it; `prepublishOnly` rebuilds it.
- `package.json` `exports["./tui"]` must point at `./dist/tui.mjs` with **no `types`** entry (no `.d.ts` is emitted).
- `tsc` never validates against the real host API — `src/env.d.ts` is a hand-written approximation and `tsconfig.json` keeps JSX only for the build-time transform. "Typecheck passes" ≠ "matches the host"; verify new host-API usage against the real host.
- CI installs with `bun install --frozen-lockfile`, and `bun.lock` is committed — changing dependencies without regenerating the lockfile fails the release workflow.

## Runtime facts that drive the code

- Default export is `Plugin.define({ id, setup })`; `id` is `opencode-status-indicator` (hyphen — the `opencode.` prefix is reserved for builtins).
- State machine lives in `src/tui.tsx`, keyed per `sessionID`. It subscribes to v2 session events and registers an `append` on the `prompt.footer.status` slot.
- **Route every event handler through `MINIMAL_EVENT`.** Events arrive in two shapes (payload nested under `data` or at top level); `MINIMAL_EVENT` reads `event?.data?.sessionID ?? event?.sessionID`. A handler reading `event.sessionID` directly silently no-ops on nested-shape events.
- **`enter()` must not re-stamp `since` on same-phase repeats** — otherwise the elapsed timer resets on every token delta. Don't "simplify" the same-phase guard away.
- **Tool execution happens *inside* a step**, so `session.step.ended` fires only after tools finish. Hiding during tools requires the explicit `session.tool.called` handler — do not remove it.
- Elapsed time uses each event's `created` field (host epoch ms), not wall-clock deltas across events.

## Local dev wiring

Edit `~/.config/opencode/cli.json` `plugins`:
- **Local checkout** → point at the **directory** containing the build: `"file:///abs/path/to/dist"` (verified working — the loader resolves `dist/tui` → `dist/tui.mjs`). Pointing at the `.mjs` **file** fails on OpenCode 2.0.22 (the loader appends `/tui`). Rebuild and restart OpenCode to pick up changes.
- **Installed** → the package name `"opencode-status-indicator"`.

## Release / publish

- Publishing is **release-triggered and staged**, not direct: `.github/workflows/publish.yml` runs on `release: published`, stages via `npm stage publish` over **OIDC trusted publishing** (no token), then a maintainer approves with 2FA (`npm stage approve <id>`, or npmjs.com → package → Staged Packages).
- **Bump `version` before each release** — staged versions share npm's uniqueness index. Prereleases need an explicit `--tag`.
- `--dry-run` does **not** exercise OIDC; only a real release validates the trust connection.
- The npm Trusted Publisher entry must name repo `harshithmohan/opencode-status-indicator` and file exactly `publish.yml`.

## Git

- `origin` = `harshithmohan/opencode-status-indicator`.
- Commit and push **only when explicitly asked**.
