# Copilot in Obsidian Everything

This workspace is the operational control center for a local AI-enabled Obsidian stack. It is already working and in a hardening phase.

## Architecture

Four layers work together:

| Component | Location | Port | Role |
|---|---|---|---|
| Obsidian plugin fork | `repos/obsidian-copilot-mcp` | — | Plugin runtime with `direct_plugin_mcp` and `exact_backend_emulator` modes |
| Shared MCP bridge | `bridges/obsidian-copilot-bridge` | 8798 | CLI-backed note/command operations with replay protection (HTTPS/TLS) |
| Backend emulator | `backend/copilot-backend-emulator` | 8789 | Exact self-host orchestration layer (`/v1/self-host/*`, `/v0/*`) |
| Miyo | external | 8742 | Semantic search only (`/v0/search`, `/v0/search/related`). Index endpoints deprecated in v4. |
| Qdrant | external | 6333 | Local vector DB (collection `miyo`). Fallback chunk retrieval for ZK service. |

## Key Paths

- Workspace root: `/Users/trevorrobey/THE Copilot in Obsidian Everything`
- Target vault: `/Volumes/ExtraCurricular/My Digital Garden`
- Official plugin dir: `<vault>/.obsidian/plugins/copilot`

## Runtime Modes (preserve these)

- `direct_plugin_mcp` — Plugin owns the turn, talks to MCP servers directly
- `exact_backend_emulator` — Plugin delegates to backend emulator for full orchestration

These are not interchangeable.

Current nuance:

- the intended official-plugin target runtime is still direct MCP plus native Miyo
- the installed plugin exact-emulator lane is also working again as an alternate path
- the installed `copilot` plugin is currently configured in `self_host` + `exact_backend_emulator` + `production_official` for active validation
- exact `copilot-plus` turns now forward the decrypted `plusLicenseKey`
- empty final model text in exact mode now surfaces as a real error instead of a blank bubble
- both lanes (direct MCP and exact-emulator) now read and write freely — no confirmation modals, no disclaimers
- default `confirmationPolicy` is `allow_without_prompt`; `read_only_only` is still available as an opt-in safety valve
- write-intent augmentation injects `create_note`/`append_note` when the planner misses obvious write requests
- deferred writes: the emulator streams the LLM summary first, then writes that polished text as the note content
- the disclaimer only fires when write tools are genuinely unavailable (MCP disabled, no server configured)

## Service Health Checks

```bash
curl http://127.0.0.1:8789/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl http://127.0.0.1:8742/health
curl http://127.0.0.1:6333/collections/miyo
```

- Backend emulator (8789) — HTTP
- MCP bridge (8798) — HTTPS (TLS via mkcert cert at `~/.local/share/mkcert/localhost.pem`)
- Miyo (8742) — HTTP (third-party app, cannot modify)
- Qdrant (6333) — HTTP

## Obsidian CLI

Official Obsidian CLI (ships with Obsidian 1.12.7+) at `/Applications/Obsidian.app/Contents/MacOS/obsidian`. Default vault: "My Digital Garden".

```bash
obsidian read file=<note-name>                    # Read note
obsidian create name=<note-name> content="text"   # Create note
obsidian open file=<note-name>                    # Open in Obsidian
obsidian search query=<query> format=json         # Search vault
obsidian daily                                    # Open daily note
obsidian daily:read                               # Read daily note
obsidian delete file=<note-name>                  # Delete note
obsidian move file=<note-name> to=<dest>          # Move/rename
obsidian append file=<note-name> content="text"   # Append to note
obsidian vault info=name                          # Vault info
obsidian version                                  # CLI version
```

Claude accesses the vault through the bridge adapter (see Claude Integration section below).

## Build & Dev Commands

```bash
# Plugin
cd repos/obsidian-copilot-mcp && npm run dev    # Dev build
cd repos/obsidian-copilot-mcp && npm run build  # Production build

# Backend emulator
cd backend/copilot-backend-emulator && npm run dev   # Dev
cd backend/copilot-backend-emulator && npm run build # Build

# MCP bridge
cd bridges/obsidian-copilot-bridge && npm run build

# Services via PM2
pm2 start ecosystem.config.js
pm2 status
```

## Zettelkasten Backend

Five vault-grounded knowledge commands plus vault health, exposed at `POST /v1/self-host/zettelkasten/*`:

| Endpoint | Command |
|---|---|
| `/serendipity` | Surface unexpected connections, temporal resurfacing, random catalysts |
| `/cross-domain` | Identify structural isomorphisms across knowledge domains |
| `/echo-chamber` | Challenge assumptions with vault-grounded counterarguments |
| `/semantic-linker` | Classify typed relationships with Dataview syntax output |
| `/orphan-rescue` | Single-note or batch vault-wide orphan detection + rescue |
| `/health` | Connectivity metrics: orphan ratio, avg links, staleness |
| `/pipeline` | Chain up to 5 commands sequentially |

Data strategy (hybrid):
- **Vault filesystem** (`VaultFileSystem`) — file listing, content reading, wikilink extraction (60s TTL cache)
- **Miyo search** (`/v0/search`, `/v0/search/related`) — semantic similarity only
- **Qdrant** (`QdrantScrollClient`, port 6333) — fallback chunk retrieval
- **LM Studio** (via `ModelGateway`) — LLM analysis

Also available as MCP tools via agent-turn: `zettelkasten_serendipity`, `zettelkasten_cross_domain`, `zettelkasten_echo_chamber`, `zettelkasten_semantic_linker`, `zettelkasten_orphan_rescue`, `zettelkasten_vault_health`.

PM2 cron: daily orphan scan (2 AM), weekly health digest (Sun 9 AM), weekly serendipity (Wed 9 AM). Reports written to `Zettelkasten/Reports/` in vault.

Key files: `backend/.../src/services/ZettelkastenService.ts`, `VaultFileSystem.ts`, `QdrantScrollClient.ts`, `routes/zettelkasten.ts`. Docs: `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md`.

## Miyo v4 Notes

Miyo v4 deprecated three index endpoints (all return 501):
- `GET /v0/index/files`
- `GET /v0/index/stats`
- `GET /v0/index/documents`

Miyo now manages indexing internally via FolderManager with local SQLite (`index_manifest.db`) and Qdrant. The emulator's ZettelkastenService was migrated to bypass these endpoints entirely using direct filesystem access and Qdrant fallback.

Working Miyo endpoints: `/v0/health`, `/v0/search`, `/v0/search/related`, `/v0/parse-doc`, `/v0/index/upsert`, `/v0/index/by_path`, `/v0/index/clear`.

## Scripts

All in `scripts/`. Key ones:

- `bridge-start.sh` / `bridge-health-check.sh` — MCP bridge
- `backend-start.sh` / `backend-smoke-test.sh` — Backend emulator
- `full-functional-sweep.sh` — 21-check validation suite
- `zettelkasten-smoke-test.sh` — 11-check ZK validation suite
- `zettelkasten-scheduler.sh` — Scheduled ZK report generation
- `plugin-reload.sh` — Reload plugin in Obsidian
- `dev-build.sh` / `dev-deploy.sh` — Plugin dev workflow
- `lib.sh` — Shared constants and utilities (WORKSPACE_ROOT, PRODUCTION_VAULT, etc.)

## MCP Bridge Contract

The bridge at `8798` exposes over **HTTPS** (TLS):
- `POST /mcp/tool` — Authenticated tool execution (replay-protected)
- `GET /healthz` — Health check
- `GET /metrics` — Metrics

Auth via `x-mcp-token` header. Replay protection via `x-mcp-timestamp`, `x-mcp-nonce`, `x-mcp-body-sha256`.

### TLS Configuration

TLS is configured in `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` under `transport.tls`:
- `certPath`: `/Users/trevorrobey/.local/share/mkcert/localhost.pem`
- `keyPath`: `/Users/trevorrobey/.local/share/mkcert/localhost-key.pem`
- Cert generated by mkcert, valid for localhost and 127.0.0.1, expires 2028-07-07
- CA root: `/Users/trevorrobey/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain)
- `NODE_EXTRA_CA_CERTS` must be set in the process environment so Node.js trusts the mkcert CA (configured in `ecosystem.config.js` for PM2 and in launch scripts)

## Claude Integration (bridge adapter)

Claude Desktop and Claude Code connect to the workspace via a thin stdio MCP adapter at
`bridges/obsidian-copilot-bridge/claude-adapter/`. It speaks standard
MCP JSON-RPC on stdin/stdout and forwards every tool call to the real bridge at
`https://127.0.0.1:8798` with full auth and replay protection.

The adapter reads bridge config from
`bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`
and auto-injects vault defaults so Claude does not need to specify them on every call.

Exposed tools: `obsidian_open_vault`, `obsidian_create_note`, `obsidian_append_note`,
`obsidian_read_note`, `obsidian_search_notes`, `obsidian_execute_command`,
`obsidian_health`, `miyo_search_context`.

The adapter is a transport shim only — it has no independent logic.
The bridge must be running (`pm2 start` or `scripts/bridge-start.sh`) before tool calls succeed.

**What is NOT exposed as MCP:**
- Backend emulator (8789) — companion orchestration service, not an MCP server
- Miyo (8742) — companion retrieval service, accessed through the bridge's `miyo_search_context` tool

## Multi-Operator Context

This workspace's MCP bridge at port **8798** is the canonical Obsidian vault access point for all operators in the biomedical research stack:

| Operator | How it connects | Purpose |
|----------|----------------|---------|
| Claude Desktop | claude-adapter stdio → HTTPS :8798 | Vault CRUD, command execution |
| OpenClaw Command Center | HTTPS :8798 (or direct Vault API when in-plugin) | Vault operations for workflow notes |

The bridge **must be running** before other operators can access the vault. Start via `pm2 start ecosystem.config.js`. Callers must have `NODE_EXTRA_CA_CERTS` set to the mkcert root CA for TLS verification.

**Note on Zettelkasten implementations**: This workspace's `ZettelkastenService` (in the backend emulator) is LLM-driven and operates on vault content. It is complementary to — not a duplicate of — the algorithmic Medical Zettelkasten MCP at `/Users/trevorrobey/Claude/Medical-Zettelkasten-MCP/`, which analyzes research text for structural patterns without an LLM.

Related workspaces:
- `/Users/trevorrobey/Claude/` — Zettelkasten MCP, Command Center plugin
- `/Users/trevorrobey/OpenClaw-Research-Agents/` — Research pipeline, HTTPS gateway on :18789

## Source of Truth (read order)

1. `docs/COPILOT_WORKSPACE_CLAUDE_HANDOFF_2026-03-24.md`
2. `docs/OBSIDIAN_CLI_STACK_HANDOFF.md`
3. `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
4. `docs/SELF_HOST_CONTRACT.md`
5. `docs/BACKEND_EMULATOR_ARCHITECTURE.md`
6. `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`
7. `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md`
8. `docs/OFFICIAL_MIYO_CONTRACT.md`

## Rules

- Preserve the `direct_plugin_mcp` vs `exact_backend_emulator` distinction
- Preserve bridge-backed CLI as the production note/command lane
- Preserve replay protection and signed MCP transport
- Docs and validation artifacts are part of the contract
- Do not silently merge the official plugin, Raycast, and backend-emulator runtimes
