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
- Hidden when the session is idle, while tools run, and while a failed attempt is
  backing off before its scheduled retry.

https://github.com/user-attachments/assets/858af6d7-3b1a-48fa-8f86-ab5dcee55a63


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
| `session.execution.started`, `session.step.started`, `session.compaction.started` | **prefill** |
| `session.step.ended` (a following step's request is dispatched immediately, with no start event) | **prefill** |
| `session.text.started`, `session.reasoning.started`, `session.tool.input.started` | **decode** |
| `session.text.delta`, `session.reasoning.delta`, `session.tool.input.delta` (extend only — never open a phase) | **decode** |
| `session.tool.called` (tool execution begins), `session.retry.scheduled` (backoff — hidden until its scheduled time, then prefill), `session.step.failed`, `session.execution.{succeeded,failed,interrupted}`, `session.idle` | clear |

Deltas are batched by the host, so a late flush after a failure or tool call must
not re-open **generating**; only unbatched `*.started` events open the decode
phase. During a retry backoff the indicator is hidden, and it re-arms **prefill**
at the scheduled retry time so the next attempt's in-flight window is visible.

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
