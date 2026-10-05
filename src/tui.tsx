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
 * The indicator is hidden entirely when the session is idle, while tools run,
 * and while a failed attempt is backing off before its scheduled retry.
 */

import { Plugin } from "@opencode/plugin/tui"
import type { Context } from "@opencode/plugin/tui/context"
import { createSignal, Show } from "solid-js"

/** Up arrow = sending the prompt up to the model (prefill). Down = tokens streaming back. */
const ARROW = { prefill: "\u2191", decode: "\u2193" } as const
const LABEL = { prefill: "processing", decode: "generating" } as const

type Stage = keyof typeof ARROW
/**
 * `retry` is internal-only: the previous attempt failed and the host is sleeping
 * until `since` (the scheduled retry time) before dispatching the next attempt.
 * It renders as hidden while waiting, then as prefill.
 */
type LiveStage = Stage | "retry"

interface Live {
  readonly stage: LiveStage
  readonly since: number
}

/** Compact duration: `340ms`, `1.2s`, `12.3s`. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`
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

    const enter = (sessionID: string | undefined, stage: LiveStage, at: number) => {
      if (!sessionID) return
      setLive((prev) => {
        const current = prev[sessionID]
        // Re-stamp only on an actual phase change; repeated events in the same
        // phase must not reset the elapsed timer. Retries always re-stamp, since
        // each one carries a new scheduled time.
        if (current && current.stage === stage && stage !== "retry") return prev
        // First token after a backoff: promote the scheduled retry into prefill
        // WITHOUT re-stamping, so the timer keeps counting from the retry's
        // dispatch time rather than resetting at the first token.
        if (current && current.stage === "retry" && stage === "prefill")
          return { ...prev, [sessionID]: { stage: "prefill", since: current.since } }
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
    // DECODE opener: the first part of a step arrived.
    const onDecode = (event: any) => {
      const { sessionID, created } = MINIMAL_EVENT(event)
      enter(sessionID, "decode", created)
    }
    // DECODE extender: batched deltas (and the post-stream marker) must never
    // OPEN a phase — a flush landing after a failure/tool-call must not revive
    // "generating" during backoff or tool execution.
    const onDecodeExtend = (event: any) => {
      const { sessionID, created } = MINIMAL_EVENT(event)
      if (!sessionID || !live()[sessionID]) return
      enter(sessionID, "decode", created)
    }
    // Terminal: step/session finished, session went idle, or a tool started
    // executing → hide the indicator.
    const onDone = (event: any) => {
      const { sessionID } = MINIMAL_EVENT(event)
      exit(sessionID)
    }
    // A failed attempt is sleeping until `at`. Stay hidden for the backoff, then
    // re-arm prefill at the scheduled time so the next attempt's in-flight window
    // (which emits no dispatch event) is visible again.
    const onRetry = (event: any) => {
      const { sessionID, created } = MINIMAL_EVENT(event)
      const at =
        typeof event?.data?.at === "number"
          ? event.data.at
          : typeof event?.at === "number"
            ? event.at
            : created
      enter(sessionID, "retry", at)
    }

    const unsubscribe = [
      context.data.on("session.execution.started", onPrefill),
      context.data.on("session.step.started", onPrefill),
      context.data.on("session.compaction.started", onPrefill),
      // A step ending means the provider's answer is complete. When another step
      // follows (tool continuation) its request is dispatched immediately and
      // emits no start event, so re-arm prefill here; a real turn end is cleared
      // by the execution terminal / idle event.
      context.data.on("session.step.ended", onPrefill),
      context.data.on("session.text.started", onDecode),
      context.data.on("session.reasoning.started", onDecode),
      context.data.on("session.tool.input.started", onDecode),
      context.data.on("session.text.delta", onDecodeExtend),
      context.data.on("session.reasoning.delta", onDecodeExtend),
      context.data.on("session.tool.input.delta", onDecodeExtend),
      // Tool execution runs *inside* the step (step.ended only fires after the
      // tool joins), so we must hide explicitly when execution begins.
      context.data.on("session.tool.called", onDone),
      context.data.on("session.retry.scheduled", onRetry),
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
          // Backoff window: no request is in flight yet.
          if (entry.stage === "retry" && now() < entry.since) return undefined
          const stage: Stage = entry.stage === "retry" ? "prefill" : entry.stage
          return { stage, elapsed: Math.max(0, now() - entry.since) }
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
