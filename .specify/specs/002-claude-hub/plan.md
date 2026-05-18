# Implementation Plan: Claude Hub (Central MCP + Obsidian Plugins)

**Branch**: `002-claude-hub` | **Date**: 2026-05-13 | **Spec**: [`spec.md`](./spec.md)

## Technical Context

- **Language / runtime**: Node 22.13.1 (engine-strict, inherited from monorepo). TypeScript for Obsidian plugins under `Claude/`; CommonJS Node for the stdio MCP servers.
- **Module system**: TypeScript ESM-style imports inside the plugin packages (compiled to whatever the Obsidian plugin host accepts); CommonJS for `Medical-Zettelkasten-MCP/` and `trevorobeyinc-research-memory-mcp/`.
- **Workspace orchestrator**: None. Each Obsidian plugin builds independently via its own `npm run build`; each MCP server is started by its parent process (Claude Desktop, the Command Center plugin, etc.). No root `package.json`, no turbo, no nx.
- **Test framework**: Plugin-specific; Node's built-in test runner where present. No Hub-wide test count is recorded in `Claude/CLAUDE.md` (see Open Questions).

## Architecture

See root `CLAUDE.md` "Multi-Operator Topology" section (current source of truth) and `Claude/CLAUDE.md` (subproject deep-dive — note: stale in places, see Open Questions). The Claude Hub workspace owns five named code surfaces under `Claude/`:

1. **`obsidian-bridge-launcher/`** — Obsidian plugin. Spawns the canonical MCP bridge child process on `:8798` (HTTPS), tied to Obsidian's plugin host lifecycle. Owns the fd-3 line-delimited JSON-RPC IPC channel (`stdio: ["ignore","pipe","pipe","pipe"]` + `BRIDGE_IPC_FD=3`) that the bridge uses to reach renderer scope for console capture and gated eval.
2. **`obsidian-openclaw-command-center/`** — Obsidian plugin. Owns the additive `:8799` HTTPS bridge (biomedical workflow tools, 11 tools = 7 vault + 4 workflow). Spawns `trevor-robey-inc-agents/scripts/run-workflow.js` via `child_process.spawn()` for workflow dispatch. Directory rename to drop the `openclaw` prefix is pending (see Open Questions).
3. **`obsidian-vault-zettelkasten/`** — Obsidian plugin. Hosts the in-process `ZettelkastenService` (LLM-driven, vault-grounded) since 2026-04-11 — previously lived in the now-retired backend emulator on `:8789`. Talks to Miyo at `:8743` (HTTPS proxy) and Qdrant at `:6433` (HTTPS proxy).
4. **`Medical-Zettelkasten-MCP/`** — stdio MCP server, 10 tools, NO LLM. Runs algorithmic graph analyses (4-gram co-occurrence, Brandes betweenness, Louvain communities, Shannon entropy, gaps, clusters, diversity, cross-domain connections). Spawned on demand by the Command Center plugin after workflow completion.
5. **`trevorobeyinc-research-memory-mcp/`** — stdio MCP server, Qdrant-backed pack storage via `:6433` HTTPS proxy. Auto-ingested by the Command Center plugin after workflow completion.

Three operators share the canonical `:8798` vault-access bridge (Claude Desktop, the Command Center plugin, Raycast via stdio adapter). The bridge runs as an Obsidian-lifecycle-tied child process — when Obsidian quits, the bridge dies. Accepted trade-off for the "Obsidian is always open" model.

## Port Map (Claude Hub-owned, subset of root)

| Port | Service | Protocol | Owner | Manager |
|---|---|---|---|---|
| 8798 | Canonical Obsidian MCP Bridge (Claude Hub spawns it, but bridge code lives in `Copilot-Everything/bridges/obsidian-copilot-bridge/`) | HTTPS | Copilot-Everything code, Claude Hub lifecycle | `obsidian-bridge-launcher` plugin (Obsidian lifecycle) |
| 8799 | Command Center Bridge (additive) | HTTPS | Claude Hub | `obsidian-openclaw-command-center` plugin (Obsidian lifecycle) |

Consumed (not owned) by Claude Hub code: `:6433` (Qdrant via Copilot-Everything's TLS proxy), `:8743` (Miyo via Copilot-Everything's TLS proxy).

## Data Model

- **Vault notes** (markdown + YAML frontmatter + wikilinks): persisted under `/Volumes/ExtraCurricular/My Digital Garden/`. Workflow notes land under `OpenClaw/{template}/{date}/` (six notes per completed workflow). Vault path mount requires the `ExtraCurricular` volume.
- **Zettelkasten graph** (algorithmic, Medical Zettelkasten MCP): in-process, recomputed per analysis. No persistent DB.
- **Zettelkasten state** (LLM-driven, vault-zettelkasten plugin's `ZettelkastenService`): vault-filesystem-grounded, no separate DB; Miyo + Qdrant used for semantic similarity and fallback chunk retrieval.
- **Research Memory packs**: stored in Qdrant via the `:6433` HTTPS TLS proxy. Auto-ingested by the Command Center plugin after workflow completion.
- **Console capture ring buffers** (renderer-side, in `obsidian-bridge-launcher`): `console.{log,info,warn,error,debug}` + `window.error` + `unhandledrejection`. Capacities settable in the plugin's settings tab.

## External Integrations

- **Obsidian Local REST API plugin** (vault-side, on `:27124`): the canonical bridge prefers `RestApiBackend` over the CLI subprocess fallback.
- **Miyo v4 semantic search**: accessed via the `:8743` HTTPS TLS proxy (Copilot-Everything-owned). Used by `obsidian-vault-zettelkasten`'s `miyo-client.ts`.
- **Qdrant vector DB**: accessed via the `:6433` HTTPS TLS proxy (Copilot-Everything-owned). Used by Research Memory MCP for pack storage and by `obsidian-vault-zettelkasten`'s fallback chunk retrieval.
- **LM Studio**: accessed via the `:1235` HTTPS TLS proxy (Copilot-Everything-owned). Used by `obsidian-vault-zettelkasten`'s `model-gateway.ts` for LLM analysis in the in-process `ZettelkastenService`.
- **Subprocess delegation target**: the Command Center plugin spawns `trevor-robey-inc-agents/scripts/run-workflow.js` (workflows are stateless subprocesses; no persistent gateway).

## Constraints

- **HTTPS-only** (Constitution Principle I). Both bridges (`:8798`, `:8799`) MUST be HTTPS; on cert-load failure they MUST throw and refuse to listen. No plaintext fallback.
- **Obsidian-tied bridge lifecycle.** `:8798` and `:8799` die when Obsidian quits — accepted trade-off for "Obsidian is always open" operator workflows.
- **`obsidian_dev_console_eval` gate**: default OFF. Toggled via the `obsidian-bridge-launcher` plugin's settings tab → Dev console section → "Enable dev console eval tool". The bridge tool returns `LAUNCHER_IPC_UNAVAILABLE` when the bridge was started outside the launcher (e.g. via `bash scripts/bridge-start.sh`); when the launcher is present but the gate is OFF, it returns a structured error.
- **Backend emulator (`:8789`) MUST NOT be re-introduced** — retired 2026-04-11, deleted 2026-05-08. `ZettelkastenService` now runs in-process inside `obsidian-vault-zettelkasten`.
- **Chrome-devtools CDP path on `:8315` MUST NOT be re-introduced** — retired 2026-05-08, replaced by the three `obsidian_dev_console_*` bridge tools.
- **fd-3 IPC contract**: the `obsidian-bridge-launcher` plugin spawns the bridge with `BRIDGE_IPC_FD=3` and `stdio: ["ignore","pipe","pipe","pipe"]`. Bridge ↔ launcher requests serviced in renderer scope use this channel.
- **`Medical-Zettelkasten-MCP` MUST have NO LLM.** All analyses are deterministic algorithms (Brandes, Louvain, Shannon, 4-gram). Adding an LLM dependency requires a separate phase plan.
- **NODE_EXTRA_CA_CERTS required**: pointing at `~/Library/Application Support/mkcert/rootCA.pem`. Must be present in Obsidian's plugin host environment for Node's TLS verification.
- **Session artifacts** go to `.archive/` directories, not workspace roots (root `CLAUDE.md` Rules).

## Phase Status (reverse-engineered)

- **`:8798` ownership migration complete** (2026-05-03): from PM2-managed to `obsidian-bridge-launcher` Obsidian plugin lifecycle. `Claude/CLAUDE.md` Port Map still references PM2 (stale; see Open Questions); root `CLAUDE.md` is current.
- **Backend emulator (`:8789`) deleted** (2026-05-08, retired 2026-04-11). ZettelkastenService runs in-process inside `obsidian-vault-zettelkasten`.
- **Dev-console tools live on `:8798`** (post-2026-05-08 chrome-devtools/CDP retirement). Three tools: `obsidian_dev_console_logs`, `obsidian_dev_console_errors`, `obsidian_dev_console_eval` (gated).
- **`obsidian-openclaw-command-center/` directory rename** to drop the `openclaw` prefix is pending. Rename touches plugin manifests, vault `.obsidian/plugins/` references, and operator muscle memory.
- **Engine framework vs. consumer product disambiguation**: "OpenClaw" in the codebase refers to the open-source agent framework that powers the commercial product (`trevor-robey-inc-agents`). The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated.

## Open Questions / NEEDS CLARIFICATION

- **[NEEDS CLARIFICATION]** `Claude/CLAUDE.md` is stale relative to root `CLAUDE.md` — its Port Map still lists PM2 as the `:8798` manager (migrated to `obsidian-bridge-launcher` 2026-05-03), still references the retired backend emulator on `:8789` (deleted 2026-05-08), still references the retired OpenClaw Gateway on `:18789` (retired 2026-04-27), and still lists chrome-devtools as an active MCP server (retired 2026-05-12). Refresh `Claude/CLAUDE.md` to match the current state, or delete the stale Port Map rows and refer readers to root `CLAUDE.md`.
- **[NEEDS CLARIFICATION]** `Claude/CLAUDE.md` does not list `obsidian-bridge-launcher`, `obsidian-vault-zettelkasten`, or `trevorobeyinc-research-memory-mcp` in its Subprojects table — only `Medical-Zettelkasten-MCP` and `OpenClaw Command Center`. Add the missing plugins/MCPs.
- **[NEEDS CLARIFICATION]** Rename of `obsidian-openclaw-command-center/` directory to drop the `openclaw` prefix is "pending" per the root `CLAUDE.md` and spec 002 Open Questions. Confirm timeline; rename touches plugin manifests, vault `.obsidian/plugins/` references, and operator muscle memory.
- **[NEEDS CLARIFICATION]** Claude Hub-specific test count and coverage targets are not stated in any CLAUDE.md. Verify against each plugin/MCP package; the commercial engine (`trevor-robey-inc-agents`) records 906 tests, but Hub coverage is undocumented.

## Verification

1. Bridges live: `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz` returns 200; same against `:8799` while Obsidian is open.
2. HTTPS-only: `npm run lint:transport` in `Claude/obsidian-openclaw-command-center` exits 0.
3. Backend-emulator regression check: `grep -r "createServer.*8789" Claude/` returns no hits.
4. CDP-path regression check: `grep -r "8315" Claude/` returns no hits.
5. Dev-console eval default: `obsidian-bridge-launcher`'s settings show `devConsoleEvalEnabled: false` on a fresh install.
