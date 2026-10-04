# opencode-status-indicator

A TUI plugin for **OpenCode v2** that shows, inline in the prompt footer, whether
the active request is still **prefilling** or already **decoding** — Claude-Code
style:

```
↑ processing 1.2s
↓ generating 340ms
```

- **↑ processing** — the request was dispatched but the provider has not started
  emitting tokens yet.
- **↓ generating** — the provider is streaming tokens back.
- Hidden when the session is idle or running tools.

## Install

Add the package name to the `plugins` array in `~/.config/opencode/cli.json`:

```json
{
  "plugins": [
    "opencode-status-indicator"
  ]
}
```

OpenCode resolves and loads the plugin's `tui` entrypoint itself — there is
nothing to install manually. Restart OpenCode after editing the config.

> You can also add it from the TUI via the command palette (`plugins.list`).

## How it works

It listens to the v2 session event stream and tracks a phase per `sessionID`:

| Signal | Phase |
| --- | --- |
| `session.execution.started`, `session.step.started` | **prefill** |
| `session.step.streamed`, `session.text.started`, `session.reasoning.started`, `session.*.delta` | **decode** |
| `session.tool.called` (tool execution begins), `session.step.ended` / `session.step.failed` / `session.execution.{succeeded,failed,interrupted}` / `session.idle` | clear |

Elapsed time is derived from each event's `created` timestamp (host clock), not
wall time, so batching does not skew it. The UI is registered as an `append` to
the `prompt.footer.status` slot.

## Build

```bash
bun install
bun run build     # emits dist/tui.mjs
```

Requires [Bun](https://bun.sh) for the build. It uses OpenTUI's first-party Solid
transform (`@opentui/solid/bun-plugin`, a wrapper over `babel-preset-solid` with
`generate: "universal"`, `moduleName: "@opentui/solid"`). Runtime dependencies
(`@opentui/solid`, `solid-js`, `@opencode/plugin/tui`) are supplied by the
OpenCode host and are marked external.
