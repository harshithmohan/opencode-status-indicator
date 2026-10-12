/**
 * Service-side entrypoint (`exports["."]` in package.json).
 *
 * The host loads this file in the server (core) process. It must stay free of
 * TUI-only imports: the server process does not provide the OpenTUI/Solid
 * runtime modules (`@opentui/solid`, `solid-js`) or the host-private
 * `@opencode/plugin/tui`, so importing them here fails the whole load with
 * `ResolveMessage: Cannot find package '@opentui/solid'`.
 *
 * There is nothing for this plugin to do server-side; declaring the id is
 * enough for the host to register the plugin and publish `features: { tui: true }`
 * (which it derives from the package's `./tui` export).
 */
export default {
  id: "opencode-status-indicator",
  setup() {},
}
