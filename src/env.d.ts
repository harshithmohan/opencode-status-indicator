/**
 * Ambient declarations for the runtime modules the OpenCode host supplies to
 * plugins (`@opencode/plugin/tui`). They are not published to npm, so we declare
 * the small surface this plugin uses for editor/typecheck support. Types are not
 * enforced at runtime — the host's Bun loader strips them.
 */

declare module "@opencode/plugin/tui" {
  export interface PluginDefinition {
    readonly id: string
    readonly setup: (
      context: import("@opencode/plugin/tui/context").Context,
    ) => Promise<(() => void) | void> | (() => void) | void
  }

  export const Plugin: {
    define(plugin: PluginDefinition): PluginDefinition
  }

  export function usePlugin(): any
  export const PluginContextProvider: any
}

declare module "@opencode/plugin/tui/context" {
  export interface SlotInput {
    readonly sessionID?: string
    readonly mode?: "normal" | "shell"
  }

  export interface SlotClaim {
    readonly render: (input: SlotInput) => any
    readonly prepend?: string
    readonly append?: string
    readonly before?: string
    readonly after?: string
    readonly replace?: string
  }

  export interface Context {
    readonly theme: any
    readonly data: {
      on(type: string, handler: (event: any) => void): () => void
      session: {
        get(sessionID: string): any
        status(sessionID: string): "idle" | "running"
      }
    }
    readonly ui: {
      slot(claim: SlotClaim): () => void
      toast: { show(options: any): void }
    }
  }
}
