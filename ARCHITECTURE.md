# TrevClaw-Obsidianodus — Full Pipeline Architecture

> **Brand note (2026-04-30):** This document describes the technical stack that powers **Trevor Robey, INC.** (the brand wordmark of **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company filed 2026-05-06; bizfileOnline receipt B20260217250) — citation-traced biomedical due diligence. "OpenClaw" appears throughout as the open-source agent framework that the stack uses; it is not a brand owned by the operator. The retired homebrew `openclaw.ai` consumer assistant is unrelated and is disambiguated inline where it appears.

> **Repo topology (2026-05-07):** the entire stack now lives in a single **local-only** monorepo at `/Users/trevorrobey/TrevClaw-Obsidianodus` (the private GitHub remote was **deleted 2026-05-26**; the repo now has **no git remotes** — durable backup is a `git bundle --all` at `~/TrevClaw-Obsidianodus.bundle`). The previously separate `Claude/`, `Copilot-Everything/`, and `trevor-robey-inc-agents/` sub-trees are first-class members of this repo. Submodule retained: `trevor-robey-inc-agents/vendor/tooluniverse` (mims-harvard/ToolUniverse, pinned at v1.1.10). Vendored fork: `Copilot-Everything/repos/obsidian-copilot-mcp/` at SHA `df61538` of logancyang/obsidian-copilot. The previous standalone GitHub remote `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` is the rollback anchor (tag `pre-monorepo-consolidation-2026-05-07` at SHA `8e782a0`); archive pending.

> **Status (2026-05-07):** This document captures the Phase-35 snapshot from 2026-04-12 and several components have been retired since: TrevNodus / InfraNodus-Visual (retired 2026-04-25), then on **2026-05-06 InfraNodus was fully removed from the stack** — no local clone, no webview handoff, no MCP server, no graph-sync hydrator package. Any "InfraNodus webview handoff" references below are also now historical. Other retirements: the backend emulator on :8789 (retired 2026-04-11), the persistent OpenClaw gateway on :18789 (removed 2026-04-27). The standalone trevor-robey-inc-agents GitHub repo was folded into TrevClaw-Obsidianodus on 2026-05-07. This file remains useful as a Phase-35 architectural reference; for current state see:
> - `CLAUDE.md` (Repo Topology, Multi-Operator Topology, Unified Port Map)
> - `README.md` (single-repo invariant, brand canon, legal entity)
> - `trevor-robey-inc-agents/TREVOR_ROBEY_INC_AGENTS_DOSSIER.md` (current Architecture Map + Provider Stack)
> - `trevor-robey-inc-agents/REVENUE_PLAYBOOK.md` (§0a legal status; §0c AWS Marketplace progress) and `trevor-robey-inc-agents/NOTICE.md` (attribution)
>
> Retired sections below are marked inline.

Canonical reference for the biomedical research intelligence stack as of Phase 35 (2026-04-12).

Supersedes `~/Claude/ARCHITECTURE.md` for full-stack view. That file remains useful for Command Center / Zettelkasten-specific internals.

## System Overview

Five independently developed systems compose a biomedical research intelligence pipeline. A user types a natural-language research request into Obsidian Copilot chat. The request flows through an MCP bridge to the Command Center plugin, which spawns a multi-agent research workflow, tracks its progress, generates interlinked vault notes, runs graph analysis, and auto-ingests results into a visual knowledge graph.

```
User -> Obsidian Copilot Chat
         |
         v
   MCP Bridge (:8799)              <- 11 tools (7 vault + 4 workflow)
         |
         v
   Command Center Plugin           <- Obsidian plugin, in-process
         |
    +----+------------+
    v    v            v
  Runner  Tracker    Zettelkasten
  (spawn) (poll)     (stdio MCP)
    |
    v
  OpenClaw Research Agents         <- child_process.spawn(), stdout JSON events
    |
    +-- Scout      -> Ollama (:11434)     CLI model mgmt, fast iteration
    +-- Analyst    -> LM Studio (:1234)   GUI, larger models, memory controls
    +-- Synthesizer -> Claude Code        Claude-level reasoning, citations
    +-- ToolUniverse (2,116 biomedical tools)
    +-- bioRxiv MCP (preprint search)
    +-- Medical Zettelkasten MCP (optional graph analysis)
         |
         v
   Workflow Output (stdout: workflow_created -> workflow_result)
         |
    +----+------------+
    v    v            v
  Vault Notes   Zettelkasten    TrevNodus
  (Obsidian)    Analysis        (auto-ingest :3000)

   [Optional Observability Sidecar]
   Traefik (:11480/:11481) -> failover between Ollama/LM Studio
   Prometheus (:9090) -> scrapes gateway :18789/metrics
   Grafana (:3001) -> dashboards
```

## The Five Systems

### 1. trevor-robey-inc-agents (formerly "OpenClaw Research Agents")
**Path**: `~/trevor-robey-inc-agents/` (renamed from `~/OpenClaw-Research-Agents/` on 2026-04-27)
**Role**: Multi-agent research pipeline. No HTTP server for workflows — spawned as child_process.

- **Entry point**: `scripts/run-workflow.js` (spawned by Command Center plugin)
- **Structured IPC** (Phase 35): emits JSON events on stdout — `{"type":"workflow_created",...}` immediately, `{"type":"workflow_result",...}` at completion. stderr unchanged for logs.
- **6 workflow templates**: general-research-pack, drug-discovery-full, pharmacovigilance-report, target-validation-pack, clinical-trial-landscape, rare-disease-brief
- **6 agent roles**: literature_reviewer, safety_signal_detector, molecular_profiler, competitive_intel_analyst, quality_auditor, report_generator
- **Parallel execution** (Phase 35): `computeTopologicalLevels()` groups steps by dependency level, runs each level via `Promise.allSettled()`. Steps with dependencies execute level-by-level.
- **LLM routing** (Phase 35): Each role hits a specific backend for a specific reason:

| Role | Provider | Port | Why |
|------|----------|------|-----|
| Scout | Ollama | 11434 | CLI model management for fast iteration on triage models |
| Analyst | LM Studio | 1234 | GUI for loading/tuning larger 70B INT4 models with memory controls |
| Synthesizer | Claude Code | N/A | Claude-level reasoning required for citation-dense output |

- **Config**: `config/agent-config.json` -> `roleProviderMap`, `config/llm-providers.json` for provider endpoints
- **Harvard ToolUniverse**: 2,116 biomedical MCP tools (Phase 29), pre-fetched per role via `config/tool-prefetch-map.json`
- **Agentic tool-call loop** (Phase 34): iterative ToolUniverse calling via `<tool_call>` XML protocol
- **bioRxiv MCP**: local CommonJS module, 4 tools (search, get, published, funder) via composite tool executor
- **Phase system**: 35 phases implemented (1-35, 32 skipped). 906 tests passing.
- **Gateway**: ~~:18789 (HTTPS, mkcert TLS, bearer token auth) — REST API path, separate from Obsidian-initiated workflows. Exposes `GET /metrics` for Prometheus.~~ **[RETIRED 2026-04-27]** No persistent gateway service. The :18789 launchd entry was an unrelated homebrew openclaw v2026.2.14 (consumer Personal AI assistant from openclaw.ai) that was removed 2026-04-27. The biomedical workflow is subprocess-only.

### 2. Command Center (Obsidian Plugin)
**Path**: `~/Claude/obsidian-openclaw-command-center/` (directory name retains `openclaw` prefix; rename pending)
**Role**: Dispatches workflows, monitors progress, generates vault notes, runs post-workflow analysis.

Key classes:
- `OpenClawPlugin` — lifecycle, command registration, workflow orchestration
- `McpBridgeServer` — in-plugin HTTP bridge on :8799 (11 tools)
- `OpenClawRunner` — subprocess spawner, parses stdout JSON events (Phase 35)
- `WorkflowTracker` — polls `workflow.json` every 2s + directory scan fallback every 3s
- `ZettelkastenClient` — on-demand stdio MCP client for graph analysis

Workflow completion pipeline (three paths, shared `completionHandled` flag):
- **PATH A**: Tracker detects `status: "completed"` in workflow.json
- **PATH B**: Runner process exits with code 0, reads result from disk
- **PATH C**: Runner error + completed workflow found on disk

Post-completion: generate 6 vault notes -> Zettelkasten analysis -> ~~auto-ingest to TrevNodus~~ **[RETIRED 2026-04-25 — replaced by InfraNodus.com webview handoff; the Command Center plugin opens `https://infranodus.com/import/editor?text=<encoded synthesizer markdown>&context=<graph name>` in Obsidian's built-in webviewer]**.

### 3. Medical Zettelkasten MCP
**Path**: `~/Claude/Medical-Zettelkasten-MCP/`
**Role**: Algorithmic graph engine. 10 MCP tools over stdio transport. No LLM.

Algorithms: 4-gram co-occurrence (Paranyushkin 2019), Brandes betweenness centrality (2001), Louvain community detection (Blondel 2008), structural gap detection, Shannon entropy diversity.

Used two ways: (1) in-process `require()` by TrevNodus, (2) stdio subprocess by Command Center plugin and OpenClaw agents.

### 4. TrevNodus / InfraNodus-Visual **[RETIRED 2026-04-25]**
~~**Path**: `~/Claude/InfraNodus-Visual/`
**Role**: Graph visualization, gap detection, AI chat, cross-graph memory.

Stack: Node.js + Express + Sigma.js v3 (WebGL) + Socket.IO. 40+ REST endpoints. LLM: Copilot Plus Flash (Brevilabs API, separate from Claude). Port 3000 (HTTPS via launchd).

Receives workflow output via POST `/api/bridge/ingest` (auto-ingest from Command Center). Pushes notes to vault via canonical MCP bridge at :8798.~~

Retired 2026-04-25. Graph visualization is now provided by `infranodus.com` SaaS via a webview handoff (the Command Center plugin opens an InfraNodus import URL in Obsidian's built-in webviewer; user clicks "Generate Graph" once on the InfraNodus page to commit). The local server, launchd plist, and `:3000` port are all gone. Source archived at `~/Claude/.archive/InfraNodus-Visual/`.

### 5. Copilot Infrastructure
**Path**: `~/THE Copilot in Obsidian Everything/`
**Role**: MCP bridge, backend emulator, Miyo semantic search.

- Canonical MCP bridge at :8798 (HTTPS, TLS, replay-protected, PM2-managed)
- Backend emulator at :8789 (HTTP, PM2-managed)
- Miyo v4 semantic search at :8742 (external, Qdrant-backed)

## Multi-Operator Topology

Three independent operators share this stack. None is subordinate to the others.

```
Claude Desktop (heavy-lift code/file operator)
  +-- [MCP stdio] -> claude-code CLI
  +-- [MCP stdio] -> obsidian-bridge adapter -> [HTTPS :8798] -> Canonical MCP Bridge
  +-- [MCP stdio] -> chrome-devtools
  +-- [MCP stdio] -> filesystem server

Command Center (workflow dispatch + monitoring, Obsidian plugin)
  +-- [child_process.spawn()] -> trevor-robey-inc-agents (stdout JSON events)
  +-- [Obsidian webviewer] -> infranodus.com import URL (replaced TrevNodus auto-ingest, 2026-04-25)
  +-- [HTTP :8742] -> Miyo semantic search
  +-- [HTTP :8799] -> Own additive MCP bridge (11 tools: 7 Obsidian + 4 workflow)

# [RETIRED 2026-04-25] TrevNodus operator removed — graph viz is now infranodus.com webview handoff
# The local TrevNodus server, :3000 port, and :18789 gateway are all gone.

Biomedical Workflow Observability Stack (optional Docker Compose sidecar)
  +-- Traefik :11480/:11481 -> Ollama :11434 / LM Studio :1234 (failover)
  +-- Prometheus :9090 -> [no scrape target after :18789 gateway retired 2026-04-27]
  +-- Grafana :3001 -> Prometheus datasource
```

## Unified Port Map

| Port | Service | Protocol | Owner | Manager | Health Check |
|------|---------|----------|-------|---------|--------------|
| 3000 | TrevNodus | HTTPS | Claude | launchd | GET / -> 200 |
| 8798 | Canonical MCP Bridge | HTTPS | Copilot-Everything | PM2 | GET /healthz |
| 8799 | Command Center Bridge | HTTP | Claude (plugin) | Obsidian lifecycle | GET /health |
| 8789 | Backend Emulator | HTTP | Copilot-Everything | PM2 | GET /healthz |
| 8742 | Miyo Semantic Search | HTTP | External | External app | GET /v0/health |
| 6333 | Qdrant Vector DB | HTTP | External | External | GET /collections/miyo |
| 18789 | OpenClaw Gateway | HTTPS | trevor-robey-inc-agents | launchd | GET /health |
| 1234 | LM Studio (analyst) | HTTP | External | LM Studio app | N/A |
| 11434 | Ollama (scout) | HTTP | External | Ollama app | GET /api/tags |
| 11480 | Traefik scout proxy | HTTP | trevor-robey-inc-agents | Docker Compose | Traefik dashboard |
| 11481 | Traefik analyst proxy | HTTP | trevor-robey-inc-agents | Docker Compose | Traefik dashboard |
| 9090 | Prometheus | HTTP | trevor-robey-inc-agents | Docker Compose | GET /-/healthy |
| 3001 | Grafana | HTTP | trevor-robey-inc-agents | Docker Compose | GET /api/health |

## Data Flow: Research Workflow

```
1. User types "research aspirin for pain" in Copilot chat
2. Copilot calls obsidian_openclaw_run_workflow via MCP bridge (:8799)
3. Command Center plugin resolves template (general-research-pack)
4. OpenClawRunner spawns: node scripts/run-workflow.js --template general-research-pack --topic "aspirin for pain"
5. stdout emits: {"type":"workflow_created","workflow_id":"...","template_id":"..."}
6. Tool-prefetch module queries ToolUniverse for role-specific biomedical tools
7. WorkflowTracker starts dir-scan + polls workspace/workflows/{id}/workflow.json every 2s
8. Agents execute by topological level (independent steps run in parallel):
   - Scout -> Ollama (:11434) for literature triage
   - Analyst -> LM Studio (:1234) for deep analysis
   - Synthesizer -> Claude Code (`claude -p`) for citation-dense reasoning
   - Each agent gets ToolUniverse pre-fetch results injected as synthetic input docs
   - Agentic tool-call loop: agents invoke tools mid-task via <tool_call> XML
9. workflow.json transitions: running -> completed
10. stdout emits: {"type":"workflow_result",...}
11. Tracker fires onWorkflowDone (PATH A: poll detection)
12. Plugin generates 6 interlinked vault notes (YAML frontmatter, wikilinks, tags)
    -> Saved to /Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/
13. Plugin runs Zettelkasten analysis (structural gaps, echo chambers, cross-domain)
14. Plugin POSTs synthesizer markdown to TrevNodus (:3000/api/bridge/ingest)
15. Knowledge graph auto-appears in TrevNodus (Sigma.js v3 WebGL)
16. User asks "what did the research find?" -> Copilot reads vault notes via :8799 tools
```

## Integration Matrix

| From | To | Transport | Purpose |
|------|----|-----------|---------|
| Copilot | Command Center Bridge | HTTP POST :8799 | MCP tool calls (11 tools) |
| Command Center | OpenClaw Agents | child_process.spawn() | Workflow execution |
| Command Center | Zettelkasten MCP | stdio subprocess | Post-workflow graph analysis |
| Command Center | TrevNodus | HTTP POST :3000 | Auto-ingest results |
| TrevNodus | Zettelkasten MCP | in-process require() | Graph engine (12 tools) |
| TrevNodus | Obsidian Bridge | HTTP POST :8798 | Push notes to vault |
| TrevNodus | OpenClaw Gateway | HTTPS :18789 | Submit workflows from UI |
| OpenClaw Agents | Claude Code | stdin pipe (`claude -p`) | Synthesizer LLM |
| OpenClaw Agents | Ollama | HTTP :11434 | Scout LLM |
| OpenClaw Agents | LM Studio | HTTP :1234 | Analyst LLM |
| OpenClaw Agents | ToolUniverse | stdio MCP | 2,116 biomedical tools |
| OpenClaw Agents | bioRxiv API | HTTPS (local module) | Preprint search (4 tools) |
| OpenClaw Agents | Zettelkasten MCP | stdio | Optional in-workflow analysis |
| Claude Desktop | Obsidian Bridge | MCP stdio -> HTTPS :8798 | Vault CRUD via obsidian-stdio-adapter |
| Backend Emulator | Miyo | HTTP :8742 | Semantic search |
| Backend Emulator | Qdrant | HTTP :6333 | Fallback chunk retrieval |
| Traefik (opt.) | Ollama / LM Studio | HTTP :11480/:11481 | Failover proxy |
| Prometheus (opt.) | OpenClaw Gateway | HTTPS :18789/metrics | Metrics scraping |

## LLM Provider Routing

NOT round-robin. Each role hits a specific backend for a specific reason.

| Role | Provider | Config Key | Port | Rationale |
|------|----------|-----------|------|-----------|
| Scout | Ollama | `ollama` | 11434 | CLI-driven model management (`ollama pull/rm`) for fast iteration on literature triage models |
| Analyst | LM Studio | `lm-studio` | 1234 | GUI for loading/tuning larger models (70B INT4) with explicit memory controls |
| Synthesizer | Claude Code | `claude-code` | N/A | Needs Claude-level reasoning for citation-dense, verifiable output |
| (fallback) | Mock | `mock` | N/A | CI/testing only |

Configured in `config/agent-config.json` -> `roleProviderMap`. Provider endpoints in `config/llm-providers.json`. Multi-provider adapter created by `createMultiProviderAdapter()` in `openclaw-bridge/core/llm-adapter.js`.

### Traefik Failover (Optional)

Primary/backup topology per role — if the primary backend crashes, traffic switches to the backup:
- Scout: `:11480` -> Ollama (primary) -> LM Studio (fallback)
- Analyst: `:11481` -> LM Studio (primary) -> Ollama (fallback)

**Activate**: `docker compose -f observability/docker-compose.yml up traefik -d`, then copy `config/llm-providers.local.json.traefik-example` -> `config/llm-providers.local.json`.

## Observability (Optional)

All observability infrastructure is opt-in via Docker Compose.

```bash
docker compose -f observability/docker-compose.yml up -d
```

### Prometheus (:9090)
Scrapes `https://localhost:18789/metrics` every 15s (HTTPS, skip TLS verify for mkcert).

### Grafana (:3001)
Credentials: admin/openclaw. Pre-provisioned with Prometheus datasource and OpenClaw dashboard.

5 dashboard panels:
1. Token consumption rate by role/provider
2. Routing ratio by provider (gauge)
3. Workflow duration heatmap
4. Workflow success/failure rate
5. Tool call duration P50/P95/P99

### Custom Metrics

| Metric | Type | Labels | Source |
|--------|------|--------|--------|
| `openclaw_tokens_consumed_total` | Counter | role, provider, model | llm-adapter.js |
| `openclaw_routing_ratio` | Gauge | provider | llm-adapter.js |
| `openclaw_tool_call_duration_seconds` | Histogram | tool | composite-tool-executor.js |
| `openclaw_workflow_duration_seconds` | Histogram | template | workflow-engine.js |
| `openclaw_workflow_status_total` | Counter | template, status | workflow-engine.js |

## TLS Configuration

All HTTPS services use mkcert certificates at `~/.local/share/mkcert/localhost.pem`. CA root at `~/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain). Valid for localhost and 127.0.0.1, expires 2028-07-07. All Node.js processes require `NODE_EXTRA_CA_CERTS` pointing to the CA root.

## Service Management

### launchd (via `openclaw-stack` CLI at ~/Claude/bin/openclaw-stack)

| Service | Plist | Behavior |
|---------|-------|----------|
| ~~`com.trevorrobey.infranodus-visual`~~ **[RETIRED 2026-04-25]** | ~/Library/LaunchAgents/ | Removed when TrevNodus was retired |
| `com.trevorrobey.cc-bridge-monitor` | ~/Library/LaunchAgents/ | RunAtLoad, StartInterval 60s |
| ~~`ai.openclaw.gateway`~~ **[RETIRED 2026-04-27]** | Pre-existing | Removed; was the unrelated homebrew openclaw consumer product |

### PM2 (via Copilot-Everything/ecosystem.config.js)

- mcp-bridge -> :8798 (canonical MCP bridge)
- ~~openclaw-bridge -> :18789~~ **[RETIRED 2026-04-27]**
- ~~backend-emulator -> :8789~~ **[RETIRED 2026-04-11 — ZettelkastenService now runs in-process inside the `vault-zettelkasten` Obsidian plugin]**

### Docker Compose (observability sidecar)

```bash
docker compose -f observability/docker-compose.yml up -d          # All (Traefik + Prometheus + Grafana)
docker compose -f observability/docker-compose.yml up traefik -d  # Traefik only
```

## Startup Order

1. PM2 ecosystem: `cd "Copilot-Everything" && pm2 start ecosystem.config.js` -> bridge :8798 only (emulator :8789 retired 2026-04-11; gateway :18789 retired 2026-04-27)
2. Obsidian opens -> Command Center plugin starts -> bridge on :8799
3. ~~TrevNodus: launchd or `bash ~/Claude/InfraNodus-Visual/scripts/start.sh` -> :3000~~ **[RETIRED 2026-04-25 — InfraNodus.com webview handoff replaces it]**
4. Miyo.app -> :8742
5. (Optional) `docker compose -f observability/docker-compose.yml up -d` -> Traefik + Prometheus + Grafana (Prometheus has no scrape target after :18789 retirement)
6. Verify: `openclaw-stack verify`

## Health Checks

```bash
curl http://127.0.0.1:8789/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
curl http://127.0.0.1:8742/health
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:18789/healthz
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:18789/metrics
openclaw-stack verify
pm2 status
```

## Key Design Decisions

1. **Subprocess-only workflow execution** — Research workflows spawned via `child_process.spawn()`, NOT HTTP. The :18789 gateway is for the REST API path, separate from the Obsidian-initiated pipeline.

2. **Structured IPC protocol** (Phase 35) — `run-workflow.js` emits JSON events on stdout. The Command Center plugin parses these deterministically instead of scraping stderr log noise for workflow_id.

3. **Intentional role-to-backend routing** (Phase 35) — Each agent role hits a specific LLM backend for a specific reason. NOT round-robin. Scout on Ollama for CLI model iteration, Analyst on LM Studio for GUI-driven large model tuning, Synthesizer on Claude Code for reasoning quality.

4. **Traefik as failover, not load balancer** (Phase 35) — Primary/backup topology. If one backend crashes, the other takes over. Not round-robin between identical backends (which adds complexity for zero value).

5. **Parallel step execution** (Phase 35) — Steps at the same topological level run concurrently via `Promise.allSettled()`. Steps with dependencies execute level-by-level. Transparent to step implementations.

6. **Three independent operators** — Claude Desktop, Command Center, and TrevNodus are peers. None subordinate. Each has its own LLM.

7. **Canonical vault access at :8798** — All operators go through the single MCP bridge. No alternative vault bridges.

8. **Fail-closed governance** — Unknown states default to blocked/review_required. Append-only evidence ledgers. Immutable config after boot. No autonomous publishing.

9. **State-change-only monitoring** — Bridge monitor writes JSONL events only when service state changes, no noise from successful health checks.

## Directory Structure

```
~/TrevClaw-Obsidianodus/                         # Meta-workspace root (NOT a git repo)
+-- ARCHITECTURE.md                              # This file (canonical full-pipeline reference)
+-- CLAUDE.md                                    # Unified port map, topology, rules
+-- context-handoff-*.md                         # LLM-to-LLM handoff bundles
+-- Claude/ -> ~/Claude/                         # TrevNodus, Zettelkasten MCP, Command Center
+-- Copilot-Everything/ -> ~/THE Copilot.../     # MCP bridge, backend emulator, Miyo
+-- trevor-robey-inc-agents/ -> ~/OpenClaw-.../  # Multi-agent pipeline, gateway, datasets

~/trevor-robey-inc-agents/
+-- scripts/run-workflow.js                      # Entry point (spawned by plugin)
+-- scripts/_workflow-runtime.js                 # Runtime factory (wires metrics, multi-provider adapter)
+-- config/
|   +-- agent-config.json                        # roleProviderMap, defaultProvider
|   +-- llm-providers.json                       # Provider endpoints (ollama, lm-studio, claude-code, mock)
|   +-- llm-providers.local.json.traefik-example # Traefik endpoint overrides (copy to activate)
|   +-- workflow-templates/*.json                # 6 template definitions
|   +-- tool-call-loop-config.json               # Agentic tool loop toggle
|   +-- zettelkasten-integration.json            # Graph analysis toggle
|   +-- tool-prefetch-map.json                   # Role-to-ToolUniverse mappings
+-- openclaw-bridge/
|   +-- core/llm-adapter.js                      # createLLMAdapter, createMultiProviderAdapter, callOllamaChat
|   +-- core/workflow-engine.js                  # computeTopologicalLevels, parallel execution, metrics
|   +-- core/prometheus-metrics.js               # prom-client metrics (Phase 35)
|   +-- core/composite-tool-executor.js          # Routes tool calls + timing metrics
|   +-- core/agent-engine.js                     # Passes role in complete() calls
|   +-- bridge/server.ts                         # Gateway HTTP server, /metrics endpoint
|   +-- bridge/bridge-routing.js                 # Route types including METRICS
+-- observability/
|   +-- docker-compose.yml                       # Traefik + Prometheus + Grafana
|   +-- traefik/traefik.yml                      # Static config (:11480, :11481)
|   +-- traefik/dynamic.yml                      # Failover services + health checks
|   +-- prometheus/prometheus.yml                # Scrape config
|   +-- dashboards/openclaw.json                 # Grafana dashboard (5 panels)
|   +-- grafana/provisioning/                    # Datasource + dashboard provisioning
+-- tests/
    +-- core/phase35-parallel-workflow.test.js    # 5 tests
    +-- core/phase35-ollama-provider.test.js      # 8 tests
    +-- core/phase35-prometheus-metrics.test.js   # 10 tests
    +-- integration/phase35-structured-ipc.test.js # 3 tests
    +-- integration/phase35-role-routing.test.js  # 3 tests
    +-- integration/phase35-traefik-health.test.js # 6 tests
    +-- integration/phase35-metrics-endpoint.test.js # 8 tests

/Volumes/ExtraCurricular/My Digital Garden/      # Obsidian vault
+-- .obsidian/plugins/openclaw-command-center/   # Deployed plugin
+-- .obsidian/plugins/copilot/                   # Copilot plugin + MCP config
+-- OpenClaw/{template}/{date}/                  # Generated research notes (6 per workflow)
```

## Constraints

- **Plan-first**: Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- **No autonomous publishing**: External uploads, marketplace submissions are manual-only.
- **Port coordination**: All port assignments coordinated in `TrevClaw-Obsidianodus/CLAUDE.md`.
- **Canonical vault access**: All operators go through :8798. No alternative vault bridges.
- **Node version**: 22.13.1 (engine-strict in trevor-robey-inc-agents).
- **CommonJS**: trevor-robey-inc-agents uses `require()`/`module.exports`, not ESM.
- **Restricted globals**: `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` forbidden in `openclaw-bridge/` — use timeProvider and entropyProvider.
- **Session artifacts**: Go to `.archive/` directories, not workspace roots.
