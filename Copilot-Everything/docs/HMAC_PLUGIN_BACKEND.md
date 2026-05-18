# HMAC Plugin Backend — End-to-End Authentication for All Obsidian Workflows

> **STATUS — RETIRED 2026-05-09.** This document describes the `InprocPluginBackend`
> + `claude-mcp-inproc` plugin + `aduri.ts` parity tools, all of which were removed
> in the bridge consolidation. The replacement is the **Obsidian Local REST API
> plugin** (https://obsidian.md/plugins?id=obsidian-local-rest-api), which provides
> end-to-end auth via API key over HTTPS to port 27124 — same security goal,
> standard transport. The bridge daemon now defaults to a single backend tier:
> `RestApiBackend` only. CLI subprocess remains in code as an explicit
> `OBSIDIAN_TRANSPORT=cli` opt-in for headless scenarios.
>
> This file is preserved as historical record. See `~/.claude/plans/warm-strolling-walrus.md`
> for the consolidation plan.

Last updated: 2026-05-06 (Advanced URI parity surface added). Retired 2026-05-09.

## Problem

The bridge at `https://127.0.0.1:8798` is HMAC-authenticated and replay-protected
on its public surface. But until 2026-05-06 it dispatched note operations via the
**Obsidian CLI binary** (`/Applications/Obsidian.app/Contents/MacOS/obsidian`),
which is itself un-authenticated — any local process that finds the binary can
mutate the vault. Once you give one consumer access to the vault through the
bridge, the CLI hop turned into a privilege-escalation surface for any other
local code.

## Fix

A new `InprocPluginBackend` was added to the bridge. It forwards every operation
to the `claude-mcp-inproc` Obsidian community plugin over an HMAC-authenticated
Unix domain socket at `/tmp/claude-mcp-inproc.sock`. The plugin runs inside
Obsidian's renderer and uses `app.vault` and `app.commands` directly — no CLI
hop, no un-authed step.

The chain is now end-to-end HMAC:

```
consumer → bridge HTTPS (HMAC #1) → InprocPluginBackend → UDS (HMAC #2) → plugin → app.vault
```

If the plugin is offline (Obsidian quit, plugin disabled, socket missing,
`/healthz` failing), the bridge falls back to the CLI backend automatically.
This is controlled by `BackendSelector.preferPlugin`, set true by default in
[`bridges/obsidian-copilot-bridge/src/index.ts`](../bridges/obsidian-copilot-bridge/src/index.ts).

## Coverage

The plugin backend is registered in the canonical bridge. **Every consumer of
the bridge picks up the new auth chain transparently — no client code changes
required.**

| Consumer | Connection | Status |
|---|---|---|
| **Claude Desktop** | claude-adapter stdio → bridge HTTPS | Auto-routes through plugin backend |
| **Claude Code** | claude-adapter stdio → bridge HTTPS | Auto-routes through plugin backend |
| **Raycast Obsidian extension** (Transcribe & Save, etc.) | `MCPClient` → bridge HTTPS | Auto-routes through plugin backend |
| **TrevNodus** (`push-to-obsidian`) | bridge HTTPS | Auto-routes through plugin backend |
| **OpenClaw Command Center** | bridge HTTPS | Auto-routes through plugin backend |
| **trevor-robey-inc agents** (`scripts/publish-to-vault.js` and similar) | bridge HTTPS | Auto-routes through plugin backend |
| **Backend emulator** (`:8789`) | does not use bridge | N/A |
| **Miyo** (`:8742`) | does not write vault | N/A |

The `obsidian_health` tool now reports both backends and the routing reasons
per operation. Sample response:

```json
{
  "backends": {
    "cli":    { "capabilities": { "available": true,  "supportedOps": [...] } },
    "plugin": { "capabilities": { "available": true,  "supportedOps": [...] } }
  },
  "routing": {
    "operationMap": { "create_note": "plugin", "read_note": "plugin", ... },
    "reasons":      { "create_note": "plugin_preferred_hmac_uds", ... }
  }
}
```

## Files

### Bridge
- [`src/types.ts`](../bridges/obsidian-copilot-bridge/src/types.ts) — `BackendId = "cli" | "plugin"`
- [`src/backends/inprocPluginBackend.ts`](../bridges/obsidian-copilot-bridge/src/backends/inprocPluginBackend.ts) — UDS+HMAC client implementing `Backend`
- [`src/backends/backendSelector.ts`](../bridges/obsidian-copilot-bridge/src/backends/backendSelector.ts) — adds `preferPlugin` option
- [`src/index.ts`](../bridges/obsidian-copilot-bridge/src/index.ts) — registers both backends
- [`src/server/tools/obsidianHealth.ts`](../bridges/obsidian-copilot-bridge/src/server/tools/obsidianHealth.ts) — reports plugin backend
- [`src/tests/inprocPluginBackend.spec.ts`](../bridges/obsidian-copilot-bridge/src/tests/inprocPluginBackend.spec.ts) — 11 unit tests
- [`src/tests/backendSelector.spec.ts`](../bridges/obsidian-copilot-bridge/src/tests/backendSelector.spec.ts) — adds two plugin-routing tests

### Plugin (in vault)
- `<vault>/.obsidian/plugins/claude-mcp-inproc/manifest.json`
- `<vault>/.obsidian/plugins/claude-mcp-inproc/main.js` — UDS server, HMAC verify, all 6 obsidian_* dispatchers

### Plugin config (auto-generated)
- `~/.claude/config/obsidian-mcp-inproc.local.json` — 32-byte base64 token, mode 0600. Plugin auto-generates on first load.

## Advanced URI surface coverage

Obsidian's Advanced URI plugin (`obsidian-advanced-uri` v1.46.1) exposes an
`obsidian://advanced-uri?...` URL handler that any local process can fire to
read/mutate the vault — same un-authed surface class as the CLI hole that was
already closed. Rather than fork Advanced URI (third-party plugin, breaks on
update), we mirror its capabilities through the existing HMAC plugin chain
using `claude-mcp-inproc` dispatchers + bridge tools that share the same
HTTPS + UDS auth path as everything else.

### Per-handler coverage

| Advanced URI handler | Coverage status | Bridge tool |
|---|---|---|
| handleOpen | NEW (positioned + tab/replace) | `obsidian_aduri_open` |
| handleOpenBlock | NEW (rolled into `aduri_open`'s `block` param) | `obsidian_aduri_open` |
| handleWrite | NEW (modes: overwrite/append/prepend/new) | `obsidian_aduri_write` |
| handleFrontmatterKey (read) | NEW | `obsidian_aduri_frontmatter_get` |
| handleFrontmatterKey (write) | NEW | `obsidian_aduri_frontmatter_set` |
| handleDoesFileExist | NEW | `obsidian_aduri_file_exists` |
| handleWorkspace | NEW (load + save) | `obsidian_aduri_workspace` |
| handleSearchAndReplace | NEW (literal + regex) | `obsidian_aduri_search_replace` |
| handleCommand | already covered | `obsidian_execute_command` |
| handleSearch | already covered | `obsidian_search_notes` |
| handleEval | **intentionally NOT exposed** | RCE-class — exposing it would let any bridge token holder run arbitrary JS in the renderer. Use specific tools instead. |
| handleBookmarks, handleCanvas, handleCopyFileURI, handleOpenSettings | not exposed | niche surfaces; add on demand |
| handlePluginManagement, handleUpdatePlugins | not exposed | admin/destructive; add on demand with explicit policy |

### Routing trick

To avoid expanding the canonical `Operation` enum (which would force config-schema
churn for `timeouts`, `slowThresholdMs`, `OPERATION_TO_TOOL`, CLI backend
supportedOps, etc.), AURI bridge tools route through the existing
`execute_command` operation and inject `input.__pluginTool` to override the
plugin-side tool name. `InprocPluginBackend.execute()` honors the override
and strips it from the payload before forwarding. The plugin's dispatch
switch sees `tool="obsidian_aduri_*"` and routes to the matching
`dispatchAduri*` method.

This means AURI calls show up in metrics as `op=execute_command` (not as
`aduri_open` etc.) — acceptable trade-off for a surgical change.

### End-to-end verified (2026-05-06)

All 7 new tools passed through bridge HTTPS → InprocPluginBackend → UDS →
plugin → `app.vault` / `app.workspace` / `app.fileManager` with
`backendUsed === "plugin"`:

```
✓ create test note
✓ aduri_file_exists (true)
✓ aduri_file_exists (false)
✓ aduri_frontmatter_get (whole)
✓ aduri_frontmatter_get (key)
✓ aduri_frontmatter_set
✓ aduri_frontmatter_get (after set)  ← verified the write took
✓ aduri_search_replace               ← 2 replacements applied
✓ aduri_write (append)
✓ aduri_open
✓ read back final content            ← all mutations persisted
```

### Race fix shipped during E2E

`processFrontMatter` writes to disk synchronously but `metadataCache` only
refreshes on the next file-watcher event. A `frontmatter_get` immediately
after `frontmatter_set` returned stale data. Fix: `dispatchAduriFrontmatterGet`
now parses the YAML block from the file content directly via `app.vault.read`
+ a small inline parser (handles scalars, quoted strings, inline + block
arrays). Cache-based reads were eliminated for this code path.

## HMAC scheme (UDS hop)

The plugin enforces the same HMAC scheme as the bridge's public surface:

```
X-MCP-Token        ← matches authToken from local.json
X-MCP-Timestamp    ← unix-ms; rejected if outside 60s window
X-MCP-Nonce        ← UUIDv4; rejected if seen before; TTL 120s
X-MCP-Body-Sha256  ← hex sha256 of request body
```

## Verifying the chain

```
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
     https://127.0.0.1:8798/healthz
ls -la /tmp/claude-mcp-inproc.sock
ls -la ~/.claude/config/obsidian-mcp-inproc.local.json
```

Then call `obsidian_health` through the bridge and check
`data.routing.reasons.read_note === "plugin_preferred_hmac_uds"`.

## Failure modes and fallback

| Symptom | Diagnosis | Auto-recovery |
|---|---|---|
| `routing.reasons.read_note === "cli_fallback"` | Plugin offline (Obsidian quit, plugin disabled, socket missing, healthz 5xx) | CLI backend takes over automatically |
| `routing.reasons.read_note === "no_backend_available"` | Both plugin and CLI unavailable | Operations fail with `NO_CAPABLE_BACKEND` until either recovers |
| Plugin `dispatchCreateNote` fails with "Folder already exists" | Vault index out of sync with disk (FIXED 2026-05-06) | Plugin now ignores idempotent `createFolder` errors |

## Disabling

To keep CLI as the primary backend (legacy behavior, useful for diagnosing the
plugin path), construct the selector with `{ preferPlugin: false }` in
[`src/index.ts`](../bridges/obsidian-copilot-bridge/src/index.ts).
