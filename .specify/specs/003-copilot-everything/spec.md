# Feature Specification: Copilot-Everything (Obsidian Integration + TLS Proxy Layer)

> ⚠️ **`claude-cli-bridge` retired 2026-05-31 (historical doc).** User Story 4 and the
> FR-008/FR-009/FR-010 + SC-005 references to `claude-cli-bridge` below describe a component that has
> since been retired and archived to `Claude/.archive/claude-cli-bridge/` — superseded by the native
> Claude Desktop Code tab. Preserved verbatim as a point-in-time design record; no longer the live
> system. See the root `CLAUDE.md` deletion log.

**Feature Branch**: `003-copilot-everything`
**Created**: 2026-05-13
**Status**: Draft (reverse-engineered)

**Input**: Existing `Copilot-Everything/` workspace inside the monorepo, with deep-dive context in `Copilot-Everything/CLAUDE.md`.

## User Scenarios & Testing

### User Story 1 — HTTPS-Wrapped Third-Party Loopback Services (Priority: P1)

Third-party loopback services (Miyo, Qdrant, LM Studio, Ollama) only expose plaintext HTTP. To preserve the HTTPS-only invariant (Constitution Principle I) for monorepo consumers, Copilot-Everything ships four TLS-wrapping proxies — each a single `.mjs` file at `Copilot-Everything/scripts/`, owned by a dedicated launchd unit, throwing on cert-load failure with NO plaintext fallback path. All monorepo clients point at the HTTPS proxy ports; the plaintext upstream ports keep listening but are no longer routed to from monorepo code.

**Why P1**: Without these proxies, monorepo code would need plaintext-loopback carve-outs that violate Principle I. The proxies are the bridge between the invariant and reality.

**Independent Test**: Given Miyo is running on `:8742` (plaintext) and the `com.trevorrobey.miyo-tls-proxy` launchd unit is loaded, when a monorepo client calls `curl --cacert <mkcert root CA> https://127.0.0.1:8743/v0/health`, then it returns 200.

**Acceptance Scenarios**:
1. **Given** the mkcert pair is present at `~/.local/share/mkcert/localhost.pem`, **When** any TLS proxy starts, **Then** it loads the pair and binds HTTPS on its proxy port.
2. **Given** the mkcert pair is missing or unreadable, **When** any TLS proxy starts, **Then** it throws and refuses to listen (no plaintext fallback).
3. **Given** monorepo clients only reference the HTTPS proxy ports, **When** `scripts/lint-transport-monorepo.sh --strict` runs, **Then** it exits 0 and finds no `http.createServer` violations.

### User Story 2 — Vendored Obsidian Copilot Plugin Fork (Priority: P2)

The `Copilot-Everything/repos/obsidian-copilot-mcp/` directory is a **vendored fork** (not a submodule) of `logancyang/obsidian-copilot` at SHA `df61538` on branch `codex/post-validated-mcp-baseline`. The fork is the operator's customized MCP-bridge-aware Copilot plugin. Re-sync instructions live in `Copilot-Everything/repos/obsidian-copilot-mcp/UPSTREAM.md`.

**Why P2**: Vendoring lets the operator carry custom MCP integration without submodule fragility. The cost: manual re-sync when upstream advances.

### User Story 3 — Bridges Package (Priority: P2)

`Copilot-Everything/bridges/obsidian-copilot-bridge/` contains the canonical HTTPS bridge implementation pattern (`src/server/httpTransport.ts`) — the file other bridges in the monorepo MUST copy from. It throws if `transport.tls` is unset, reads the mkcert pair, calls `https.createServer`, and asserts `instanceof https.Server` post-construction.

### User Story 4 — Outbound MCP Delegation via claude-cli-bridge (Priority: P2)

> ⚠️ **RETIRED 2026-05-31 (historical spec).** This user story and its FR-008/FR-009/FR-010 + SC-005
> below describe the `claude-cli-bridge`, which was retired and archived to
> `Claude/.archive/claude-cli-bridge/` — superseded by the native Claude Desktop Code tab. The text is
> preserved unchanged as a point-in-time design record; it no longer describes the live system. See the
> root `CLAUDE.md` deletion log.

Claude Desktop chat (or any other parent MCP client) needs to delegate an entire sub-task to a fresh, isolated `claude -p` subprocess and get the answer back. `Copilot-Everything/bridges/claude-cli-bridge/index.mjs` is a stdio MCP server that wraps the local `claude` CLI for OUTBOUND delegation — the inverse of `claude mcp serve` (which is the INBOUND direction that exposes Claude Code's tools to the parent). Tools: `claude_run` (one-shot prompt + returns `session_id` for chaining), `claude_resume` (continue by `session_id`; optional `fork_session: true`), `claude_version`, `claude_diag`. Recursion-isolated: every spawn carries `--strict-mcp-config` + a temp MCP config containing only `{"mcpServers": {}}`, so the subprocess sees zero `mcp__*` tools and cannot loop back into the bridge. Auth flows through `process.env.CLAUDE_CODE_OAUTH_TOKEN` populated by Claude Desktop's `mcpServers["claude-cli-bridge"].env` block (keychain-ACL bypass — macOS Keychain ACLs are bundle-identifier-specific and Claude Desktop's helper has a different bundle ID than whatever process did the original `claude auth login`). Long subprocess waits emit MCP `notifications/progress` events every 20s when the caller supplies a `_meta.progressToken`, so the parent client's per-request timeout (Claude Desktop default ~60s) does not fire mid-call.

**Why P2**: Infrastructure for chained agent work. Not blocking the revenue path, but unlocks "Claude Desktop kicks off a long sub-task in an isolated CLI" workflows that the parent-client model alone cannot serve. Equivalent priority to the other architectural bridges in stories 2 and 3.

**Independent Test**: Given `claude-cli-bridge` is registered in `~/Library/Application Support/Claude/claude_desktop_config.json` with `CLAUDE_CODE_OAUTH_TOKEN` set in its env block, when Claude Desktop calls `claude_run` with a prompt and `timeout_seconds=1800`, then the bridge spawns `claude -p`, the subprocess runs to completion (potentially >60s), and the bridge returns the response text + `session_id` without an MCP `-32001` timeout.

### User Story 5 — Consolidated Stdio Adapter (obsidian-stdio-adapter) (Priority: P2)

Claude Desktop, Claude Code, and Raycast all need stdio MCP transport to reach the canonical HTTPS bridge on `:8798`. Previously this was three separate adapter packages — `claude-adapter/`, `obsidian-mcp-stdio/`, `raycast-obsidian-stdio/` — that each had to be maintained independently and could drift. `Copilot-Everything/bridges/obsidian-stdio-adapter/` is the **single consolidated stdio adapter** that replaces all three. It speaks standard MCP JSON-RPC on stdin/stdout and forwards every tool call to `https://127.0.0.1:8798` with full HMAC auth (`x-mcp-token`, `x-mcp-timestamp`, `x-mcp-nonce`, `x-mcp-body-sha256`) and replay protection. Two profiles via `OBSIDIAN_STDIO_PROFILE`: `claude` (default — exposes the canonical `obsidian_*` tools plus `miyo_search_context` and the three `obsidian_dev_console_*` tools) and `raycast` (adds `raycast_daily_open`, locally mapped to `obsidian_execute_command id="daily-notes"`). The adapter is a **transport shim only** — it has no independent logic.

**Why P2**: Infrastructure consolidation that reduces drift surface from three packages to one. Not blocking the revenue path, but the consolidation directly serves Constitution Principle V (archive hygiene / no parallel surfaces). Equivalent priority to the other architectural bridges in stories 2-4.

**Independent Test**: Given the canonical bridge is running on `:8798` and the bridge config at `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` is readable, when a stdio MCP client launches the adapter with `OBSIDIAN_STDIO_PROFILE=claude` and invokes `obsidian_health`, then the adapter forwards the call to `:8798`, returns the 200 response payload to the client, and exits cleanly on stdin close.

### Edge Cases

- mkcert root CA expires (next: 2028-07-07) → regenerate via `mkcert -install && mkcert localhost 127.0.0.1`; restart all launchd proxy units.
- A monorepo file regresses to `http.createServer` → `lint-transport-monorepo.sh --strict` catches it in CI; pre-commit blocks the commit.
- An operator tries to introduce a new plaintext-loopback carve-out → REJECTED. Only the listed MCP browser-automation tools (Playwright `--isolated`, Claude in Chrome) are allowed plaintext loopback (per `CLAUDE.md` "Out of scope").

## Requirements

### Functional Requirements

- **FR-001**: Four TLS proxies MUST exist as single `.mjs` files at `Copilot-Everything/scripts/`:
  - `miyo-tls-proxy.mjs` → wraps `:8742` → exposes `:8743`
  - `qdrant-tls-proxy.mjs` → wraps `:6333` → exposes `:6433`
  - `lm-studio-tls-proxy.mjs` → wraps `:1234` → exposes `:1235`
  - `ollama-tls-proxy.mjs` → wraps `:11434` → exposes `:11435` (slot DISABLED in `trevor-robey-inc-agents/config/llm-providers.json`)
- **FR-002**: Each proxy MUST be owned by a dedicated launchd unit (`com.trevorrobey.<service>-tls-proxy`) with `RunAtLoad` + `KeepAlive`.
- **FR-003**: Each proxy MUST throw on cert-load failure and refuse to listen. NO plaintext fallback path.
- **FR-004**: `scripts/lint-transport-monorepo.sh --strict` MUST exit 0 in pre-commit and CI. Forbidden shapes:
  - `http.createServer(` in any source binding a TCP host:port (UDS / pipe transports exempt via the `LEGITIMATE_NON_TCP` allowlist)
  - `OPENCLAW_BRIDGE_TLS_DISABLE === "1"` or equivalent
  - `tlsDisable ? http : https` ternaries; `if (!tls) return null;` shapes
- **FR-005**: Vendored fork `Copilot-Everything/repos/obsidian-copilot-mcp/` MUST be documented via `UPSTREAM.md` (upstream URL, pinned SHA, branch, re-sync command).
- **FR-006**: The canonical HTTPS-required pattern at `bridges/obsidian-copilot-bridge/src/server/httpTransport.ts` MUST be the reference any new bridge copies from.
- **FR-007**: Per-package guards: `npm run lint:transport` MUST exist in `bridges/obsidian-copilot-bridge` and (cross-workspace) `Claude/obsidian-openclaw-command-center`.
- **FR-008**: `claude-cli-bridge` MUST run as a stdio MCP server with no TCP listener and is therefore exempt from the HTTPS-only invariant (`scripts/lint-transport-monorepo.sh --strict` skips it; the bridge has no `http.createServer`/`https.createServer` call to lint).
- **FR-009**: `claude-cli-bridge` long-running tool calls (`claude_run`, `claude_resume`) MUST emit MCP `notifications/progress` events at intervals ≤30s when the caller supplies `_meta.progressToken`, so the parent client's per-request timeout resets and does not fire mid-call.
- **FR-010**: `claude-cli-bridge` MUST spawn every subprocess with `--strict-mcp-config` plus a temp MCP config containing only `{"mcpServers": {}}` so the spawned subprocess sees zero `mcp__*` tools and cannot recurse back into the bridge. Caller-supplied `mcp_config` is honored but the `claude-cli-bridge` entry is auto-stripped before forwarding. `permission_mode=bypassPermissions` is blocked by Claude Desktop's auto-mode classifier; bridge callers MUST use `acceptEdits` + a named `allowed_tools` allowlist.
- **FR-011**: `obsidian-stdio-adapter` MUST be the SINGLE stdio adapter package in this workspace. The three predecessor packages (`claude-adapter/`, `obsidian-mcp-stdio/`, `raycast-obsidian-stdio/`) MUST remain deleted; re-introducing any of them would re-open the drift surface this consolidation closed. The adapter is a transport shim with NO independent logic — every tool call MUST forward to `:8798` with full HMAC auth and replay protection. Two profiles via `OBSIDIAN_STDIO_PROFILE`: `claude` (default) and `raycast`.
- **FR-012**: Every outbound TCP connection initiated by monorepo code MUST use HTTPS. `http.request()`, `http.get()`, `fetch("http://...")`, `axios.get("http://...")`, `got("http://...")`, `new URL("http://...")`, and analogous shapes are forbidden. Direct references to the wrapped plaintext upstream ports (`:8742`, `:6333`, `:1234`, `:11434`) are forbidden in monorepo source — clients MUST route through the HTTPS proxies (`:8743`, `:6433`, `:1235`, `:11435`). Time-limited carve-outs are permitted only with a concrete resolution deadline; mark the line with `// lint-transport: outbound-carve-out` (or `# lint-transport: outbound-carve-out`) and document the registry entry. Vendor-code violations resolve via route-through-proxy at the deployment/config layer, NOT fork-and-patch. The four TLS proxies (`Copilot-Everything/scripts/{miyo,qdrant,lm-studio,ollama}-tls-proxy.mjs`) are themselves the canonical "wrap" pattern and are exempt from outbound/port scans. Enforced by `scripts/lint-transport-monorepo.sh --strict`. Tracks Constitution Principle I v2.0.0.

### Key Entities

- **TLS Proxy** (4): mjs file at `Copilot-Everything/scripts/`, launchd unit, mkcert pair.
- **Vendored Fork**: `repos/obsidian-copilot-mcp/` at SHA `df61538` of logancyang/obsidian-copilot; branch `codex/post-validated-mcp-baseline`.
- **Bridge package**: `bridges/obsidian-copilot-bridge/` — canonical pattern source.
- **Outbound MCP delegation bridge**: `bridges/claude-cli-bridge/index.mjs` — stdio MCP server wrapping the local `claude` CLI; recursion-isolated; auth via `CLAUDE_CODE_OAUTH_TOKEN` env var.
- **Consolidated stdio adapter**: `bridges/obsidian-stdio-adapter/` — single stdio adapter tunneling Claude Desktop / Claude Code / Raycast to the canonical bridge on `:8798`. Replaces three deleted predecessors. Two profiles (`claude` default, `raycast`).
- **Transport linter**: `scripts/lint-transport-monorepo.sh` — monorepo-wide pre-commit / CI gate.

## Success Criteria

- **SC-001**: All four launchd proxy units are loaded and report HTTPS 200 on health checks.
- **SC-002**: `scripts/lint-transport-monorepo.sh --strict` exits 0 against every commit on main.
- **SC-003**: `bridges/obsidian-copilot-bridge` `npm run lint:transport` exits 0.
- **SC-004**: mkcert root CA chain valid through 2028-07-07.
- **SC-005**: A `claude_run` call with `timeout_seconds=1800` against `claude-cli-bridge` returns its result without an MCP `-32001` timeout when the spawned subprocess runs longer than 60 seconds (verifies the heartbeat-progress-notification path is live in the parent client).

## Assumptions

- mkcert root CA installed in macOS System Keychain.
- Launchd units load at boot; `KeepAlive` restarts on crash.
- Operator manually re-syncs the vendored fork when needed (no automation).
- `pf` rules restricting plaintext upstream ports to proxy UIDs are listed as the next hardening step but NOT yet implemented.
- **Claude Desktop has been restarted since the `claude-cli-bridge` heartbeat patch was deployed** (the heartbeat `setInterval` + `notifications/progress` plumbing at `Copilot-Everything/bridges/claude-cli-bridge/index.mjs` landed with commit `9df72c0` lineage). The patch is present on disk but does NOT activate against a running Claude Desktop until restart, because the Claude Desktop process spawned the bridge subprocess at launch and holds the OLD code in memory. Until restart, FR-009 (≤30s progress notifications) and SC-005 (`claude_run` with `timeout_seconds=1800` not hitting MCP `-32001`) cannot be evaluated — long calls will still time out on Claude Desktop's default ~60s MCP per-request clock.

## Open Questions / NEEDS CLARIFICATION

- **[NEEDS CLARIFICATION]** `pf` rules to restrict `:8742`, `:6333`, `:1234`, `:11434` inbound to proxy UIDs only — listed as "next hardening step (not yet implemented)" in `CLAUDE.md`. When is this scheduled?
- **[NEEDS CLARIFICATION]** Re-sync cadence for the vendored obsidian-copilot fork — opportunistic vs. scheduled?
