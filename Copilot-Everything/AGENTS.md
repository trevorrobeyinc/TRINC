# Copilot in Obsidian Everything — opencode instructions

> **opencode mirror (created 2026-08-09).** This is the opencode counterpart to the `CLAUDE.md`
> next to it: same rules, worded for opencode. Claude surfaces read `CLAUDE.md`; opencode reads
> this file. If both twins are in your context, treat them as ONE description of the same stack
> and let this file's wording govern opencode behavior. When you change a rule, update both.

This workspace is the operational control center for a local AI-enabled Obsidian stack. It is already working and in a hardening phase.

## Architecture

Three active layers (backend-emulator retired 2026-04-11, deleted from monorepo 2026-05-08):

| Component | Location | Port | Role |
|---|---|---|---|
| Obsidian plugin fork | `repos/obsidian-copilot-mcp-v4` | — | Plugin runtime with `direct_plugin_mcp` mode |
| Shared MCP bridge | `bridges/obsidian-copilot-bridge` | 8798 | Canonical multi-operator daemon. **REST-only since 2026-05-09**: RestApiBackend (Local REST API plugin :27124) is the sole backend — the CLI subprocess backend was removed together with InprocPluginBackend + the Advanced URI parity tools (`src/backends/backendSelector.ts` requires restApi; there is no fallback). `/mcp/tool`'s optional `backendHint` accepts only the literal `"restApi"` — a stale `"cli"` hint is rejected HTTP 400 `invalid_literal`. HTTPS/TLS with HMAC replay-guard. |
| Consolidated stdio adapter | `bridges/obsidian-stdio-adapter` | — | Single stdio MCP adapter that tunnels Claude/Raycast stdio consumers to :8798. Two profiles via `OBSIDIAN_STDIO_PROFILE`: `claude` (default) and `raycast` (adds `raycast_daily_open`). An opencode session could consume this same adapter if registered in opencode's MCP config. |
| Miyo (via TLS proxy) | `scripts/miyo-tls-proxy.mjs` → external Miyo app | 8743 → 8742 | Semantic search via in-monorepo HTTPS proxy at :8743 forwarding to plaintext :8742. Index endpoints deprecated in v4. |
| Qdrant (via TLS proxy) | `scripts/qdrant-tls-proxy.mjs` → Miyo-bundled Qdrant | 6433 → 6333 | Local vector DB (collection `miyo`) via in-monorepo HTTPS proxy at :6433 forwarding to plaintext :6333. Fallback chunk retrieval for ZK service. |
| SearXNG (via TLS proxy) | `scripts/searxng-tls-proxy.mjs` → external SearXNG (launchd) | 8891 → 8890 | Local private metasearch via in-monorepo HTTPS proxy at :8891 forwarding to plaintext :8890 (JSON API for the `searxng-search` MCP connector — opencode has this connector registered). |

> The retired backend emulator on :8789 (`/v1/self-host/*`, `/v0/*` exact-self-host orchestration) and its `exact_backend_emulator` plugin runtime mode are gone. ZettelkastenService now runs in-process inside the `vault-zettelkasten` Obsidian plugin (Claude/obsidian-vault-zettelkasten/). The Raycast extension's `src/api/backend-emulator/` client was deleted with the emulator.

## Key Paths

- Workspace root: `/Users/myhome/TRINC/Copilot-Everything/`
- Target vault: `/Users/myhome/My Digital Garden`
- Official plugin dir: `<vault>/.obsidian/plugins/copilot`

## Runtime Modes (preserve these)

- `direct_plugin_mcp` — Plugin owns the turn, talks to MCP servers directly
- `exact_backend_emulator` — Plugin delegates to backend emulator for full orchestration

These are not interchangeable.

> **Correction (2026-07-16, verified against the fork source `repos/obsidian-copilot-mcp`):**
> `direct_plugin_mcp`, `exact_backend_emulator`, and `production_official` are **conceptual labels
> only** — none exists as a literal runtime toggle in the current fork. The real live settings are
> `enableSelfHostMode`, `backendMode` (e.g. `hosted`), `defaultChainType` (e.g. `copilot_plus`), and
> `enableAutonomousAgent`. The plugin's actual MCP capability is: agent mode (`enableAutonomousAgent`,
> Copilot-Plus-gated) → a hard-coded tool catalog (`src/mcp/catalog.ts`) → authenticated HTTP
> `POST /mcp/tool` to a configured bridge (:8798 vault tools + `research` SSE; :8799 OpenClaw
> research-workflow tools). Treat the mode names above as historical intent, not code.

> **2026-08-20 update (twin of the CLAUDE.md sections of the same date):** the :8799 Command
> Center bridge now serves **30 tools** and the fork catalog **39 entries** — seven `zk_*`
> Zettelkasten tools, `video_pipeline_{run,status}`, and the ten-tool OpenClaw engine suite
> (`obsidian_openclaw_{cancel, history, artifacts, engine_health, research_task,
> research_tasks_list, research_output, delivery_evidence, citation_integrity, feed_stats}`);
> `run_workflow` returns the workflow_id. Agent-mode ACP sessions (opencode/claude/codex
> backends) additionally receive `command-center` + `viz-studio` as per-session stdio MCP
> servers via `src/agentMode/acp/acpMcpServers.ts` + the shipped `openclaw-stdio-proxy.mjs` —
> the ACP lane sees the bridge's full tools/list (no enabledToolNames gating; that gates only
> the Quick-Chat McpToolProvider lane), and the servers are deliberately NEVER added to
> opencode's global config (shared with the stripped delegation worker). Real-compute engine
> calls fail closed to `operator_gate_not_armed` unless the one-shot YubiKey token is freshly
> armed. The vault-root `AGENTS.md` in "My Digital Garden" is the agent-facing role file for
> these sessions. Never exposed: dataset missions, interaction logs, release/token scripts,
> feed rebuilds, delivery-evidence rebuild mode.

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
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8743/v0/health   # Miyo via TLS proxy
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:6433/collections/miyo   # Qdrant via TLS proxy
# Backend emulator (:8789) was retired 2026-04-11; ZettelkastenService runs in-process inside the vault-zettelkasten plugin.
```

- MCP bridge (8798) — HTTPS (TLS via mkcert cert at `~/.local/share/mkcert/localhost.pem`)
- Miyo (8742) — HTTP (third-party upstream; reach via HTTPS proxy on :8743)
- Qdrant (6333) — HTTP (third-party upstream; reach via HTTPS proxy on :6433)

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

Claude (and opencode, when wired) access the vault through the bridge adapter (see Integration section below).

## Build & Dev Commands

```bash
# Plugin
cd repos/obsidian-copilot-mcp-v4 && npm run dev    # Dev build
cd repos/obsidian-copilot-mcp-v4 && npm run build  # Production build

# MCP bridge
cd bridges/obsidian-copilot-bridge && npm run build
# (manual / dev start)
bash scripts/bridge-start.sh

# Note: backend-emulator dev/build commands removed 2026-05-08; module deleted.
# Note: PM2 ecosystem.config.js removed 2026-05-08; bridge ownership migrated to
# the obsidian-bridge-launcher Obsidian plugin (auto-spawn on Obsidian startup).
```

## Zettelkasten Backend

Five vault-grounded knowledge commands plus vault health (HISTORICAL SHAPE — the `POST /v1/self-host/zettelkasten/*` route namespace belonged to the :8789 emulator, retired 2026-04-11 / deleted 2026-05-08; no HTTP surface exists today. The same commands live on in-process inside the `vault-zettelkasten` Obsidian plugin — `Claude/obsidian-vault-zettelkasten/` — as palette commands `run-serendipity`, `run-cross-domain`, `run-echo-chamber`, `run-semantic-linker`, `run-orphan-rescue`, `run-vault-health`, `run-full-pipeline`; verified against `src/main.ts` 2026-07-31):

| Command | Purpose |
|---|---|
| serendipity | Surface unexpected connections, temporal resurfacing, random catalysts |
| cross-domain | Identify structural isomorphisms across knowledge domains |
| echo-chamber | Challenge assumptions with vault-grounded counterarguments |
| semantic-linker | Classify typed relationships with Dataview syntax output |
| orphan-rescue | Single-note or batch vault-wide orphan detection + rescue |
| health | Connectivity metrics: orphan ratio, avg links, staleness |
| pipeline | Chain up to 5 commands sequentially |

Data strategy (hybrid):
- **Vault filesystem** (`VaultFileSystem`) — file listing, content reading, wikilink extraction (60s TTL cache)
- **Miyo search** (`/v0/search`, `/v0/search/related`) — semantic similarity only
- **Qdrant** (`QdrantScrollClient`, port 6333) — fallback chunk retrieval
- **Hosted `copilot-plus-flash`** (via `ModelGateway`, https://models.brevilabs.com/v1) — LLM analysis. Local runtimes removed: LM Studio 2026-07-16, Ollama 2026-07-23.

The historical `zettelkasten_*` MCP tool names exist in no live source as of 2026-07-31 — the stdio adapter exposes only the `obsidian_*`/`miyo_search_context`/dev-console set. Not to be confused with the algorithmic Medical Zettelkasten MCP's differently-named tools (e.g. `generate_serendipity`).

Scheduling: the three former PM2 cron jobs (daily orphan scan 2 AM, weekly health digest Sun 9 AM, weekly serendipity Wed 9 AM) run in the plugin's in-process `Scheduler` (`src/services/scheduler.ts`, 15-min tick), which fires only while Obsidian is open. Reports land in `Zettelkasten/Reports/` in the vault. Two known behavior drifts from the PM2 era: the weekly serendipity job now only emits an `analysis:complete` event and writes NO report, and no `Health Report *.md` has ever been observed despite `enableHealthDigest` defaulting on.

Key files (historical `backend/` paths deleted 2026-05-08; live equivalents under `Claude/obsidian-vault-zettelkasten/src/`): `ZettelkastenService.ts` → `services/zettelkasten-service.ts`, `VaultFileSystem.ts` → `adapters/vault-fs.ts`, `QdrantScrollClient.ts` → `adapters/qdrant-client.ts`, `routes/zettelkasten.ts` → no equivalent (palette commands + `services/scheduler.ts`). Docs: `docs/ZETTELKASTEN_BACKEND_ARCHITECTURE.md` (2026-03 emulator-era snapshot).

## Miyo v4 Notes

Miyo v4 deprecated three index endpoints (all return 501): `GET /v0/index/files`, `GET /v0/index/stats`, `GET /v0/index/documents`. Miyo now manages indexing internally via FolderManager with local SQLite (`index_manifest.db`) and Qdrant.

Working Miyo endpoints: `/v0/health`, `/v0/search`, `/v0/search/related`, `/v0/parse-doc`, `/v0/index/upsert`, `/v0/index/by_path`, `/v0/index/clear`.

## Scripts

All in `scripts/`. Key ones:

- `bridge-start.sh` — MCP bridge manual/dev start. Health: canonical bridge `healthz` curl plus the Local REST API `:27124` auth probe.
- The retired tombstone scripts were removed in the 2026-10 reorg — see `../ops/reorg/2026-10-cleanup-manifest.md`.
- `plugin-reload.sh` — Reload plugin in Obsidian
- `dev-build.sh` / `dev-deploy.sh` — Plugin dev workflow: stages the fork build into `deploy/obsidian/plugins/copilot` and symlinks it into the dev vault under the fork's REAL plugin id `copilot` (since `9c7ce09a` the fork manifest deliberately matches upstream id+version so auto-update cannot wipe it)
- `lib.sh` — Shared constants and utilities (WORKSPACE_ROOT, PRODUCTION_VAULT, etc.)
- `install-tls-proxies.sh` — Stage the three `*-tls-proxy.mjs` (Miyo/Qdrant/SearXNG) to `~/.local/share/trevclaw-tls-proxies/` and repoint + reload their launchd units. Staging is **retained** (post 2026-07-26 move to internal disk) so launchd never depends on where the repo lives. Re-run after editing any proxy script.

## MCP Bridge Contract

The bridge at `8798` exposes over **HTTPS** (TLS):
- `POST /mcp/tool` — Authenticated tool execution (replay-protected)
- `GET /healthz` — Health check
- `GET /metrics` — Metrics

Auth via `x-mcp-token` header. Replay protection via `x-mcp-timestamp`, `x-mcp-nonce`, `x-mcp-body-sha256`.

### TLS Configuration

TLS is configured in `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` under `transport.tls`:
- `certPath`: `/Users/myhome/.local/share/mkcert/localhost.pem`
- `keyPath`: `/Users/myhome/.local/share/mkcert/localhost-key.pem`
- Cert generated by mkcert, valid for localhost and 127.0.0.1, expires 2028-07-07
- CA root: `/Users/myhome/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain)
- `NODE_EXTRA_CA_CERTS` must be set in the process environment so Node.js trusts the mkcert CA

## Claude / Raycast / opencode Integration (bridge adapter)

Claude Desktop, Claude Code, and Raycast (via stdio profile) connect to the workspace
via the consolidated stdio MCP adapter at `bridges/obsidian-stdio-adapter/`. It speaks
standard MCP JSON-RPC on stdin/stdout and forwards every tool call to the canonical
bridge at `https://127.0.0.1:8798` with full auth and replay protection. opencode can
consume the same adapter if registered in its MCP config (`~/.config/opencode/opencode.json`);
as of 2026-08-09 it is not.

The adapter reads bridge config from
`bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`
and auto-injects vault defaults so callers do not need to specify them on every call.

Profiles (set via `OBSIDIAN_STDIO_PROFILE`): `claude` (default — exposes the seven
canonical `obsidian_*` tools) and `raycast` (adds `raycast_daily_open`, mapped locally
to `obsidian_execute_command id="daily-notes"`).

Exposed tools: `obsidian_open_vault`, `obsidian_create_note`, `obsidian_append_note`,
`obsidian_read_note`, `obsidian_search_notes`, `obsidian_execute_command`,
`obsidian_health`, `miyo_search_context`,
`obsidian_dev_console_logs`, `obsidian_dev_console_errors`,
`obsidian_dev_console_eval` (gated; see Dev console section below).

### Dev console tools (renderer-side, no CDP)

The bridge exposes three tools for inspecting Obsidian's renderer state without
Chrome DevTools Protocol — replacing the retired `obsidian-devtools` chrome-devtools-mcp
path on plain-HTTP `:8315`:

| Tool | Capability | Always available? |
|------|------------|--------------------|
| `obsidian_dev_console_logs` | Recent `console.{log,info,warn,error,debug}` ring buffer | yes (read-only) |
| `obsidian_dev_console_errors` | Recent `window.error` + `unhandledrejection` ring buffer | yes (read-only) |
| `obsidian_dev_console_eval` | Run caller-supplied JS in renderer scope, return JSON-safe result | gated (default OFF) |

**Wire**: bridge child process ↔ launcher plugin via fd-3 line-delimited JSON-RPC.
The launcher (`Claude/obsidian-bridge-launcher/`) spawns the bridge with
`stdio: ["ignore","pipe","pipe","pipe"]` and `BRIDGE_IPC_FD=3`; the bridge's
`src/server/launcherIpc.ts` opens fd 3 as a `net.Socket` and the launcher's
`src/launcherIpcServer.ts` services requests in renderer scope. Console capture
hooks `window.console.*` + `window.error` + `unhandledrejection` at plugin onload;
ring buffer sizes are settable in the plugin's settings tab.

**Eval gate**: `obsidian_dev_console_eval` is OFF by default. To enable, open
the `Obsidian Bridge Launcher` plugin settings tab → Dev console section →
toggle "Enable dev console eval tool". The bridge tool will return
`LAUNCHER_IPC_UNAVAILABLE` if the bridge was started outside the launcher, and
returns a structured error if the gate is off.

The adapter is a transport shim only — it has no independent logic.
The bridge must be running (`scripts/bridge-start.sh`) before tool calls succeed.

**What is NOT exposed as MCP:**
- Backend emulator (8789) — retired 2026-04-11, deleted 2026-05-08; nothing listens on :8789
- Miyo (8742) — companion retrieval service, accessed through the bridge's `miyo_search_context` tool

> **Outbound `claude` CLI bridge — ⚠️ RETIRED 2026-05-31** (archived to `Claude/.archive/claude-cli-bridge/`). Superseded by the native Claude Desktop Code tab; see the root `AGENTS.md` deletion log. Do not reintroduce.

## Multi-Operator Context

This workspace's MCP bridge at port **8798** is the canonical Obsidian vault access point for all operators in the biomedical research stack:

| Operator | How it connects | Purpose |
|----------|----------------|---------|
| Claude Desktop | obsidian-stdio-adapter stdio → HTTPS :8798 | Vault CRUD, command execution |
| OpenClaw Command Center | HTTPS :8798 (or direct Vault API when in-plugin) | Vault operations for workflow notes |
| opencode | (not wired as of 2026-08-09; would consume the stdio adapter) | Delegated vault work |

The bridge **must be running** before other operators can access the vault. Start via the `obsidian-bridge-launcher` Obsidian plugin (auto-spawns on Obsidian startup), or for manual / dev work: `bash scripts/bridge-start.sh`. Callers must have `NODE_EXTRA_CA_CERTS` set to the mkcert root CA for TLS verification.

**Note on Zettelkasten implementations**: This workspace's `ZettelkastenService` (LLM-driven, vault-grounded) now runs in-process inside the `vault-zettelkasten` Obsidian plugin under `Claude/obsidian-vault-zettelkasten/`. It is complementary to — not a duplicate of — the algorithmic Medical Zettelkasten MCP at `Claude/Medical-Zettelkasten-MCP/`, which analyzes research text for structural patterns without an LLM.

Related workspaces:
- `/Users/myhome/TRINC/Claude/` — Zettelkasten MCP, Command Center plugin
- The former sibling workspace `/Users/trevorrobey/OpenClaw-Research-Agents/` is **GONE** (corrected 2026-07-31) — folded into this monorepo at `Trevor Robey Intelligence Network Citations/` (the 2026-05-19 flat merge). There is no persistent gateway; the engine runs on demand via `node scripts/run-workflow.js`.

## Source of Truth (read order)

1. `repos/obsidian-copilot-mcp-v4/UPSTREAM.md` (the fork's identity and sync rules)
2. `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
3. `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`
4. `docs/OFFICIAL_MIYO_CONTRACT.md`
5. `docs/MCP_SECURITY.md`

(The March-era handoffs and emulator / self-host / ZK-backend docs were removed in the 2026-10 reorg — see `../ops/reorg/2026-10-cleanup-manifest.md`.)

## Rules

- Preserve the `direct_plugin_mcp` vs `exact_backend_emulator` distinction
- Preserve the REST-backed bridge as the production note/command lane (`:8798` → `RestApiBackend` → Obsidian Local REST API `:27124`; the CLI subprocess backend was removed 2026-05-09)
- Preserve replay protection and signed MCP transport
- Docs and validation artifacts are part of the contract
- Do not silently merge the official plugin, Raycast, and backend-emulator runtimes
