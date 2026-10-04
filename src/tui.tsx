/**
 * opencode-status-indicator
 *
 * A v2 TUI plugin for OpenCode. It renders, in the prompt footer, whether the
 * active request is still in the PREFILL stage (the request has been dispatched
 * but the provider has not started emitting tokens yet) or has moved into
 * DECODE (the provider is streaming tokens back).
 *
 * Claude-Code-style:
 *
 *     ↑ prefill 1.2s
 *     ↓ decoding 340ms
 *
 * The indicator is hidden entirely when the session is idle or running tools.
 */

import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { createSignal, Show } from "solid-js"

/** Up arrow = sending the prompt up to the model (prefill). Down = tokens streaming back. */
const ARROW = { prefill: "\u2191", decode: "\u2193" } as const
const LABEL = { prefill: "processing", decode: "generating" } as const

type Stage = keyof typeof ARROW

interface Live {
  readonly stage: Stage
  readonly since: number
}

/** Compact duration: `340ms`, `1.2s`, `12.3s`. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const MINIMAL_EVENT = (event: { data?: { sessionID?: string }; sessionID?: string; created?: number }) => ({
  sessionID: event?.data?.sessionID ?? event?.sessionID,
  created: typeof event?.created === "number" ? event.created : Date.now(),
})

export default Plugin.define({
  id: "opencode-status-indicator",
  setup(context: Context) {
    // Per-session phase state, keyed by sessionID. Replaced immutably so the
    // signal drives reactivity.
    const [live, setLive] = createSignal<Record<string, Live>>({})
    const [now, setNow] = createSignal(Date.now())

    const timer = setInterval(() => setNow(Date.now()), 100)

    const enter = (sessionID: string | undefined, stage: Stage, at: number) => {
      if (!sessionID) return
      setLive((prev) => {
        const current = prev[sessionID]
        // Re-stamp only on an actual phase change; repeated events in the same
        // phase must not reset the elapsed timer.
        if (current && current.stage === stage) return prev
        return { ...prev, [sessionID]: { stage, since: at } }
      })
    }

    const exit = (sessionID: string | undefined) => {
      if (!sessionID) return
      setLive((prev) => {
        if (!(sessionID in prev)) return prev
        const next = { ...prev }
        delete next[sessionID]
        return next
      })
    }

    // PREFILL: request dispatched, before any provider output.
    const onPrefill = (event: any) => {
      const { sessionID, created } = MINIMAL_EVENT(event)
      enter(sessionID, "prefill", created)
    }
    // DECODE: first provider output (stream boundary or first part).
    const onDecode = (event: any) => {
      const { sessionID, created } = MINIMAL_EVENT(event)
      enter(sessionID, "decode", created)
    }
    // Terminal: step/session finished, session went idle, or a tool started
    // executing → hide the indicator.
    const onDone = (event: any) => {
      const { sessionID } = MINIMAL_EVENT(event)
      exit(sessionID)
    }

    const unsubscribe = [
      context.data.on("session.execution.started", onPrefill),
      context.data.on("session.step.started", onPrefill),
      context.data.on("session.step.streamed", onDecode),
      context.data.on("session.text.started", onDecode),
      context.data.on("session.reasoning.started", onDecode),
      context.data.on("session.text.delta", onDecode),
      context.data.on("session.reasoning.delta", onDecode),
      context.data.on("session.tool.input.started", onDecode),
      context.data.on("session.tool.input.delta", onDecode),
      // Tool execution runs *inside* the step (step.ended only fires after the
      // tool joins), so we must hide explicitly when execution begins.
      context.data.on("session.tool.called", onDone),
      context.data.on("session.step.ended", onDone),
      context.data.on("session.step.failed", onDone),
      context.data.on("session.execution.succeeded", onDone),
      context.data.on("session.execution.failed", onDone),
      context.data.on("session.execution.interrupted", onDone),
      context.data.on("session.idle", onDone),
    ]

    const unbind = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => {
        const state = () => {
          const id = input.sessionID
          if (!id) return undefined
          const entry = live()[id]
          if (!entry) return undefined
          return { stage: entry.stage, elapsed: now() - entry.since }
        }

        return (
          <Show when={state()}>
            {(s: () => { stage: Stage; elapsed: number }) => (
              <box flexDirection="row" flexShrink={0} gap={1}>
                <text
                  fg={
                    s().stage === "prefill"
                      ? context.theme.text.feedback.warning.default
                      : context.theme.text.feedback.success.default
                  }
                >
                  {ARROW[s().stage]}
                </text>
                <text fg={context.theme.text.subdued}>{LABEL[s().stage]}</text>
                <text fg={context.theme.text.subdued}>{formatDuration(s().elapsed)}</text>
              </box>
            )}
          </Show>
        )
      },
    })

    return () => {
      clearInterval(timer)
      unbind()
      for (const off of unsubscribe) off()
    }
  },
})
