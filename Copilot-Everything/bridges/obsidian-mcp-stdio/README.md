# obsidian-mcp-stdio

Lean stdio MCP server that wraps the Obsidian CLI directly. **Replaces** the
claude-adapter + obsidian-copilot-bridge pair for the Claude Code / Claude
Desktop flows.

## Why this exists

The original chain was:

```
Claude Code/Desktop
   │ stdio (MCP)
   ▼
claude-adapter   (translates MCP ↔ signed HTTPS)
   │ HTTPS
   ▼
obsidian-copilot-bridge  (auth, queue, idempotency, observability)
   │ child_process
   ▼
obsidian CLI → Obsidian
```

The bridge + adapter pair earned its keep when multiple clients shared one
HTTPS surface. Once Raycast had its own MCP server (`bridges/raycast-obsidian-mcp/`)
and Claude Desktop / Code became the only remaining bridge consumers, the
HTTPS hop was overhead. This wrapper collapses the chain to:

```
Claude Code/Desktop
   │ stdio (MCP)
   ▼
obsidian-mcp-stdio (this)
   │ child_process
   ▼
obsidian CLI → Obsidian
```

No auth (single trusted client over a private pipe). No idempotency ledger
(MCP retries are agent-controlled). No queue (each Obsidian CLI call already
serializes through the app's IPC).

## Tools

| Name | Description |
|---|---|
| `obsidian_health` | Probe the CLI binary and vault registration |
| `obsidian_open_vault` | Open a vault, optionally focus a note |
| `obsidian_create_note` | Create (and optionally open) a note |
| `obsidian_append_note` | Append content to an existing note |
| `obsidian_read_note` | Read full note content |
| `obsidian_search_notes` | Vault-wide search by query |
| `obsidian_execute_command` | Run any Obsidian command by id |

## Configuration

Environment variables (all optional):

| Var | Default |
|---|---|
| `OBSIDIAN_VAULT` | `My Digital Garden` |
| `OBSIDIAN_VAULT_ROOT` | `/Volumes/ExtraCurricular/My Digital Garden` |
| `OBSIDIAN_BIN` | `/Applications/Obsidian.app/Contents/MacOS/obsidian` |
| `OBSIDIAN_CLI_TIMEOUT` | `20000` (ms) |

## Register in Claude Code

```bash
claude mcp add --scope user obsidian \
  /Users/trevorrobey/bin/node \
  /Users/trevorrobey/Code/THE\ Copilot\ in\ Obsidian\ Everything/bridges/obsidian-mcp-stdio/index.mjs
```

## Register in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "/Users/trevorrobey/bin/node",
      "args": [
        "/Users/trevorrobey/Code/THE Copilot in Obsidian Everything/bridges/obsidian-mcp-stdio/index.mjs"
      ]
    }
  }
}
```

## Path safety

All `path` inputs are resolved against `vaultRoot` and rejected if they
escape the vault (parent traversal, absolute paths). Input never goes through
a shell — `child_process.execFile` with arg arrays only.
