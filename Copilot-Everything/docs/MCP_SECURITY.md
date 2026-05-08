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

## Current MVP Limits

Current plugin MVP only executes HTTP transport MCP servers.

Configured but unsupported transports are surfaced in diagnostics with a clear message rather than silently falling back:
- `uds`
- `pipe`

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

Bootstrap should confirm the active MCP transport and preserve compatibility with it. The plugin is currently HTTP-first only because the local bridge examples and default settings point to `https://127.0.0.1:8798`, but non-HTTP compatibility remains future work.
