# Implementation Plan: Copilot-Everything (Obsidian Integration + TLS Proxy Layer)

**Branch**: `003-copilot-everything` | **Date**: 2026-05-13 | **Spec**: [`spec.md`](./spec.md)

## Technical Context

- **Language / runtime**: Node 22.13.1 (engine-strict). TypeScript for `bridges/obsidian-copilot-bridge/` (compiled to `dist/`). ESM `.mjs` for the four `scripts/*-tls-proxy.mjs` TLS-wrapping proxies and for `bridges/claude-cli-bridge/index.mjs`. Vendored TypeScript plugin fork at `repos/obsidian-copilot-mcp/`.
- **Module system**: ESM across the in-monorepo proxies and the outbound CLI bridge (single `.mjs` per surface). The bridge package and stdio adapter use TypeScript→compiled-CJS. The vendored fork is upstream-flavored.
- **Workspace orchestrator**: None. Each component builds and runs independently. PM2 retired 2026-05-08 (`ecosystem.config.js` removed; bridge ownership migrated to `obsidian-bridge-launcher`); `bridge-start.sh` remains for manual/dev invocation.
- **Test framework**: Per-package. `npm run lint:transport` exists in `bridges/obsidian-copilot-bridge`. The 21-check `scripts/full-functional-sweep.sh` and 11-check `scripts/zettelkasten-smoke-test.sh` cover the broader Obsidian + ZK surface.

## Architecture

Three active layers (backend-emulator retired 2026-04-11, deleted 2026-05-08; CDP path on `:8315` retired 2026-05-08). The five code surfaces this workspace owns:

1. **Canonical HTTPS bridge** (`bridges/obsidian-copilot-bridge/`, exposes `:8798`). Multi-operator daemon. RestApiBackend (Obsidian Local REST API plugin :27124) preferred; CLI subprocess fallback. HMAC replay-guard auth (`x-mcp-token`, `x-mcp-timestamp`, `x-mcp-nonce`, `x-mcp-body-sha256`). Spawned by the `obsidian-bridge-launcher` Obsidian plugin (lifecycle-tied). `src/server/httpTransport.ts` is the canonical HTTPS-required pattern — any new bridge in the monorepo MUST copy from it.
2. **Consolidated stdio adapter** (`bridges/obsidian-stdio-adapter/`). Single stdio MCP adapter tunneling Claude/Raycast stdio consumers to `:8798`. Two profiles via `OBSIDIAN_STDIO_PROFILE`: `claude` (default — 11 tools including the three dev-console tools) and `raycast` (adds `raycast_daily_open`). Replaces the deleted claude-adapter, obsidian-mcp-stdio, raycast-obsidian-stdio.
3. **Outbound `claude` CLI bridge** (`bridges/claude-cli-bridge/index.mjs`). Stdio MCP server — the INVERSE of `claude mcp serve`. Exposes the local `claude` CLI as MCP tools (`claude_run`, `claude_resume`, `claude_version`, `claude_diag`) so a parent MCP client can delegate sub-tasks to a fresh isolated `claude -p` subprocess. Recursion-isolated via `--strict-mcp-config` + empty `mcpServers` temp file. Auth via `CLAUDE_CODE_OAUTH_TOKEN` env var (keychain-ACL bypass). Heartbeat: `notifications/progress` every 20s when caller supplies `_meta.progressToken`. **No TCP listener** — exempt from HTTPS-only invariant.
4. **Four launchd-owned TLS proxies** (`scripts/{miyo,qdrant,lm-studio,ollama}-tls-proxy.mjs`). Single-`.mjs` canonical pattern: throws on cert-load failure, no plaintext fallback path. Wraps third-party loopback services that only expose plaintext HTTP.
5. **Vendored Obsidian Copilot plugin fork** (`repos/obsidian-copilot-mcp/` at SHA `df61538` of `logancyang/obsidian-copilot`, branch `codex/post-validated-mcp-baseline`). Manually re-synced; re-sync instructions live in `repos/obsidian-copilot-mcp/UPSTREAM.md`.

The monorepo-wide HTTPS-only invariant is enforced by `scripts/lint-transport-monorepo.sh --strict` in pre-commit and CI. `claude-cli-bridge` is exempt because it has no TCP listener (stdio transport only).

## Port Map (proxy / upstream pairs, all Copilot-Everything-owned)

| Proxy Port | Upstream Port | Service | Protocol | Owner | Manager |
|---|---|---|---|---|---|
| 8798 | — | Canonical Obsidian MCP Bridge | HTTPS | Copilot-Everything | `obsidian-bridge-launcher` plugin (Claude/) |
| 8743 | 8742 | Miyo Semantic Search (v4) | HTTPS proxy → HTTP upstream | Copilot-Everything | launchd `com.trevorrobey.miyo-tls-proxy` |
| 6433 | 6333 | Qdrant Vector DB (Miyo-bundled) | HTTPS proxy → HTTP upstream | Copilot-Everything | launchd `com.trevorrobey.qdrant-tls-proxy` |
| 1235 | 1234 | LM Studio (OpenAI-compatible) | HTTPS proxy → HTTP upstream | Copilot-Everything | launchd `com.trevorrobey.lm-studio-tls-proxy` |
| 11435 | 11434 | Ollama | HTTPS proxy → HTTP upstream | Copilot-Everything | launchd `com.trevorrobey.ollama-tls-proxy` (provider slot DISABLED in `trevor-robey-inc-agents/config/llm-providers.json`) |

`claude-cli-bridge` and `obsidian-stdio-adapter` have NO ports — stdio transport only.

## Data Model

- **mkcert key pair**: `~/.local/share/mkcert/localhost.pem` (cert) + `~/.local/share/mkcert/localhost-key.pem` (key). Valid for `localhost` and `127.0.0.1`. Expires 2028-07-07.
- **mkcert root CA**: `~/Library/Application Support/mkcert/rootCA.pem`. Installed in macOS System Keychain. Path passed to `NODE_EXTRA_CA_CERTS` in every Node process that consumes a monorepo HTTPS endpoint.
- **Auth config**: `CLAUDE_CODE_OAUTH_TOKEN` for `claude-cli-bridge` lives in `~/Library/Application Support/Claude/claude_desktop_config.json` under `mcpServers["claude-cli-bridge"].env`. Config file is chmod-600 + `chflags uchg`-locked. Token generated by `claude setup-token`.
- **Bridge config**: `bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json` — `transport.tls.certPath`, `keyPath`, vault defaults injected by the stdio adapter so Claude needn't specify them per-call.
- **Vendored fork pin**: SHA `df61538` of `logancyang/obsidian-copilot`, branch `codex/post-validated-mcp-baseline`. Documented in `repos/obsidian-copilot-mcp/UPSTREAM.md` (per FR-005).

## External Integrations

- **Miyo v4** (`/Applications/Miyo.app`, bundled Node server, code-signed). Accessed only via `:8743`. Working endpoints: `/v0/health`, `/v0/search`, `/v0/search/related`, `/v0/parse-doc`, `/v0/index/upsert`, `/v0/index/by_path`, `/v0/index/clear`. Three index endpoints deprecated in v4 (return 501): `/v0/index/files`, `/v0/index/stats`, `/v0/index/documents`.
- **Qdrant** (Miyo-bundled child process). Accessed only via `:6433`. Collection name: `miyo`. Used for fallback chunk retrieval by the in-process ZettelkastenService inside `obsidian-vault-zettelkasten` (Claude Hub-owned).
- **LM Studio** (`/Applications/LM Studio.app`). Accessed only via `:1235`. Default model `qwen2.5-coder-7b-instruct`; alt `mistral-nemo-12b`. Used as fallback LLM in `trevor-robey-inc-agents` and as inference provider for `obsidian-vault-zettelkasten`'s `ModelGateway`.
- **Ollama**. Accessed only via `:11435`. Provider slot currently DISABLED in `trevor-robey-inc-agents/config/llm-providers.json`.
- **Obsidian Local REST API plugin** (`:27124`). Preferred backend for the canonical bridge over the CLI fallback.
- **Local `claude` CLI** (system PATH). Spawned by `claude-cli-bridge` via `child_process.spawn()`. Subprocesses carry `--strict-mcp-config` + empty `mcpServers` (recursion guard).

## Constraints

- **HTTPS-only invariant** (Constitution Principle I). Every TCP listener owned by code in this monorepo MUST be HTTPS. No plaintext-fallback paths, no env-gated TLS disable, no `tls ? https : http` ternaries, no `if (!tls) return null;`. On cert-load failure: THROW. Refactor the config; never reintroduce `http.createServer` as a fallback.
- **`claude-cli-bridge` is exempt** — stdio transport, no TCP listener, no `http.createServer`/`https.createServer` call to lint. The linter does not flag it. `permission_mode=bypassPermissions` is blocked by Claude Desktop's auto-mode classifier; callers MUST use `acceptEdits` + a named `allowed_tools` allowlist.
- **`scripts/lint-transport-monorepo.sh --strict`** runs in pre-commit and CI. Forbidden shapes: `http.createServer(` in any source binding a TCP host:port (UDS / pipe exempt via `LEGITIMATE_NON_TCP` allowlist); `OPENCLAW_BRIDGE_TLS_DISABLE === "1"` or equivalents; `tlsDisable ? http : https` ternaries; `if (!tls) return null;` shapes.
- **Canonical HTTPS pattern**: `bridges/obsidian-copilot-bridge/src/server/httpTransport.ts`. Throws if `transport.tls` is unset, reads the mkcert pair, calls `https.createServer`, asserts `instanceof https.Server` post-construction. Copy from here for any new bridge.
- **Per-package guards**: `npm run lint:transport` in `bridges/obsidian-copilot-bridge` and `Claude/obsidian-openclaw-command-center`.
- **Restart all launchd proxy units on mkcert renewal.** Next renewal: 2028-07-07. `launchctl unload && launchctl load` each `com.trevorrobey.*-tls-proxy.plist`.
- **Vendored fork (`repos/obsidian-copilot-mcp/`) re-sync is manual.** Document with UPSTREAM.md; no automation (see Open Questions).
- **`direct_plugin_mcp` vs `exact_backend_emulator` distinction** (runtime modes for the installed Copilot plugin) MUST be preserved. They are not interchangeable.
- **Replay protection and signed MCP transport** for `:8798` MUST be preserved.

## Phase Status (reverse-engineered)

- **Four TLS proxies live**: Miyo (2026-05-07), Qdrant (2026-05-08, replaced the deleted `Claude/qdrant-tls-proxy/` subproject), LM Studio (2026-05-11), Ollama (2026-05-11). All four share the single-`.mjs` + launchd canonical pattern; all throw on cert failure.
- **`claude-cli-bridge` committed** as `9df72c0` on 2026-05-13. Heartbeat patch (MCP `notifications/progress` every 20s) present in `index.mjs` on disk; needs Claude Desktop restart to activate against running bridge processes.
- **PM2 ecosystem removed** 2026-05-08. `ecosystem.config.js` deleted; `bridge-start.sh` remains for manual/dev invocation only. Bridge ownership migrated to `obsidian-bridge-launcher` (Obsidian plugin lifecycle).
- **Backend emulator deleted** 2026-05-08 (retired 2026-04-11). Raycast extension's `src/api/backend-emulator/` client deleted alongside it.
- **CDP path on `:8315` retired** 2026-05-08. Replaced by `obsidian_dev_console_logs`, `obsidian_dev_console_errors`, `obsidian_dev_console_eval` (gated) exposed through the canonical `:8798` bridge.
- **Three consolidated stdio profiles**: `claude` (default), `raycast` (adds `raycast_daily_open`). Replaces three deleted predecessor adapters.
- **`pf` rules to restrict plaintext upstream ports** (`:8742`, `:6333`, `:1234`, `:11434`) to proxy UIDs only — listed as "next hardening step (not yet implemented)" in root `CLAUDE.md`.

## Open Questions / NEEDS CLARIFICATION

- **[NEEDS CLARIFICATION]** `pf` rules to restrict `:8742`, `:6333`, `:1234`, `:11434` inbound to proxy UIDs only — currently "next hardening step (not yet implemented)" per root `CLAUDE.md`. When is this scheduled? Without it, any local process can still bypass the HTTPS proxies and hit the plaintext upstreams directly.
- **[NEEDS CLARIFICATION]** Re-sync cadence for the vendored `repos/obsidian-copilot-mcp/` fork — opportunistic or scheduled? Documented as manual; no policy for when to advance the pin.
- **[NEEDS CLARIFICATION]** Spec 003 does not list `bridges/obsidian-stdio-adapter/` as a Key Entity, but it is documented in `Copilot-Everything/CLAUDE.md` as the consolidated stdio adapter (single component replacing three predecessors). Confirm whether the adapter should be promoted to a Key Entity in the spec.
- **[NEEDS CLARIFICATION]** Heartbeat patch in `claude-cli-bridge/index.mjs` is on disk but not yet activated in any running bridge process — Claude Desktop must be restarted to pick up the new code. Verify post-restart with a `claude_run` call >60s; until then, assume MCP `-32001` timeouts can still fire.

## Verification

1. All four proxy units healthy: `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem"` against `https://127.0.0.1:8743/v0/health`, `:6433/collections/miyo`, `:1235/v1/models` (LM Studio's OpenAI-compatible endpoint), `:11435/api/tags` — each returns 200.
2. HTTPS-only invariant: `bash scripts/lint-transport-monorepo.sh --strict` exits 0.
3. Per-package: `npm run lint:transport` in `Copilot-Everything/bridges/obsidian-copilot-bridge` exits 0.
4. Canonical pattern: `grep -n "instanceof https.Server" Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpTransport.ts` returns the post-construction assertion line.
5. `claude-cli-bridge` recursion guard: `grep -n "strict-mcp-config" Copilot-Everything/bridges/claude-cli-bridge/index.mjs` returns the spawn-flag line.
6. `claude-cli-bridge` heartbeat: `grep -n "notifications/progress" Copilot-Everything/bridges/claude-cli-bridge/index.mjs` returns the `server.notification` call.
7. Bridge health: `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz` returns 200 while Obsidian is open.
8. End-to-end (post Claude Desktop restart): a `claude_run` call with `timeout_seconds=1800` and a long-running prompt returns its result without an MCP `-32001` timeout.
