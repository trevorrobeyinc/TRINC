# MCP Security

## Trust Model

MCP is treated as a first-class tool provider, not as a backend shortcut and not as a Brevilabs extension point.

Current trust controls implemented in the fork:
- Global MCP enable toggle
- Per-server `enabled` toggle in server config
- Transport declaration per server
- Per-server timeout via `timeoutMs`
- Global allowlist
- Global denylist
- Confirmation policy:
  - `read_only_only`
  - `prompt_on_writes`
  - `allow_without_prompt`
- Redacted logging toggle via `mcp.redactLogs`

## Default Security Posture

Defaults from `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/constants.ts`:
- `mcp.enabled = false`
- `mcp.confirmationPolicy = "prompt_on_writes"`
- `mcp.redactLogs = true`
- `mcp.allowlist = []`
- `mcp.denylist = []`
- Default example server is disabled

## Current Limits (2026-11-24, bridges-uds)

The plugin executes **Unix-socket (`uds`) MCP servers only**: the three TRINC bridges, each on its own socket in `~/.local/state/trinc/run/` (directory 0700, sockets 0600, resolved from the home directory at run time). Each known server id is bound to one socket name and any other name is refused, so an edited or synced `data.json` cannot send one bridge's token to another bridge's socket:
- `local-obsidian-mcp` → `vault-bridge.sock`
- `command-center` → `command-center.sock`
- `viz-studio` → `viz-studio.sock`

Configured but unsupported transports are surfaced in diagnostics with a clear message and are never dialled, rather than silently falling back:
- `http` (an entry the settings migration could not convert; no server has a `requestUrl` or TCP path)
- `pipe`

Transport rules (`src/mcp/udsClient.ts`; desktop only, and on mobile the client reports that Unix-socket bridges are unavailable):
- Node's `http` module is loaded at call time through `globalThis.require`, never through a static `node:` import.
- Before any token is written, the client validates the exact path it sends (absolute, inside the run directory, the server's own socket name), checks every directory from home down (a real directory owned by the uid that group and others cannot write), requires a 0600 socket owned by the uid, and checks for a macOS ACL allow entry once per process. A missing directory or socket is refused as `ENOENT` without connecting.
- The connection is pinned with `createConnection` and never uses an `agent` option: Node turns an empty `socketPath` into plaintext TCP to `localhost:80`.
- The body bytes and the `X-MCP-Token` / `X-MCP-Nonce` / `X-MCP-Timestamp` / `X-MCP-Body-Sha256` headers are unchanged; health is `GET /healthz` over the socket.

Settings migration (on load, idempotent, saved with the normal settings save, never logging a token): a server whose id is one of the three known ids, or whose endpoint (any scheme, host `127.0.0.1`, `localhost` or `::1`) names port 8798, 8799 or 8800, becomes transport `uds`. The three known ids get socketPath `""` (resolved at run time); the token and every other field are kept. An entry whose id and port disagree is left unconverted and reported. Diagnostics lists every migrated entry. Record: [`../../ops/security/bridges-uds-2026-11-24.md`](../../ops/security/bridges-uds-2026-11-24.md).

## Mutating Tool Policy

Current behavior in `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/mcp/McpToolProvider.ts`:
- Read-only MCP tools can be registered when allowed by server config and allowlist/denylist checks.
- Mutating tools are suppressed unless the confirmation policy allows them.
- There is no silent escalation from read-only mode to mutating execution.

## Logging And Redaction

When `mcp.redactLogs` is enabled:
- Request bodies and response payloads are logged in redacted form
- Tool errors remain visible enough for debugging
- Authentication tokens are not intended to be printed back to the user-facing log path

## Server Policy Recommendations

Recommended before enabling any server broadly:
- Keep servers disabled by default until health checks pass
- Limit `enabledToolNames` per server to the minimum set required
- Use explicit allowlist patterns before adding broad discovery
- Keep write-capable tools behind `prompt_on_writes` until an in-plugin confirmation UX is added
- Prefer loopback/local endpoints over remotely exposed MCP endpoints

## Current Local Assumption

The plugin's MCP client reaches only the three local bridges, over their Unix sockets. The default settings carry `local-obsidian-mcp` as a `uds` server with socketPath `""`, which resolves at run time to `~/.local/state/trinc/run/vault-bridge.sock`. There is no HTTP compatibility path and no TCP fallback: the bridges stopped listening on loopback TCP on 2026-11-24, and a client that dialled the old ports would hand its token to whatever process holds them.
