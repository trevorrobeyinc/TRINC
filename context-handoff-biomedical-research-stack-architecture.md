> **Status (2026-04-30):** Historical handoff snapshot. Superseded by the 2026-04-30 rebrand. Current architecture summary lives in `TrevClaw-Obsidianodus/ARCHITECTURE.md` (with brand-note banner) and `trevor-robey-inc-agents/TREVOR_ROBEY_INC_AGENTS_DOSSIER.md`.

```xml
<context_handoff>
  <meta>
    <source>Claude (Anthropic) — Opus 4.6</source>
    <date>2026-04-12 (Phase 35 update)</date>
    <turns>2 (architecture audit → Phase 35 multi-backend parallel workflows + observability)</turns>
    <topic>TrevClaw-Obsidianodus biomedical research intelligence stack — full architecture handoff</topic>
    <subsequent_updates>This handoff is a 2026-04-12 snapshot. Updates since: (a) TrevNodus / InfraNodus-Visual retired 2026-04-25; (a2) on 2026-05-06 InfraNodus was fully removed from the stack — no local clone, no webview handoff, no MCP server, no graph-sync hydrator package. Any narrative below referencing InfraNodus integration is historical; (b) backend emulator on :8789 retired 2026-04-11 (ZettelkastenService runs in-process inside the `vault-zettelkasten` Obsidian plugin); (c) the persistent OpenClaw gateway on :18789 was removed 2026-04-27 (the launchd entry was an unrelated homebrew openclaw consumer product); (d) the repo was renamed `OpenClaw-Research-Agents` → `trevor-robey-inc-agents` and merged to main on 2026-04-27 as commit `4bc633f`; (e) ToolUniverse tool count is `~2,116` per the current dossier (this doc says 2,173 — keep the dossier number authoritative for new narrative). For current state see `TrevClaw-Obsidianodus/CLAUDE.md` and `trevor-robey-inc-agents/TREVOR_ROBEY_INC_AGENTS_DOSSIER.md`.</subsequent_updates>
  </meta>

  <summary>
    TrevClaw-Obsidianodus is a meta-workspace that unifies three symlinked project directories into a biomedical research intelligence pipeline. A user types a natural-language research request in Obsidian Copilot chat; the request flows through an MCP bridge to a Command Center plugin, which spawns a multi-agent research workflow (6 agent roles, 2,173 biomedical tools), generates interlinked vault notes, runs graph analysis, and auto-ingests results into the InfraNodus SaaS knowledge graph at infranodus.com. The system is local-first for compute, runs on macOS with mkcert TLS, and has two independent operators (Claude Desktop and OpenClaw Command Center) that communicate via localhost HTTPS/HTTP, stdio MCP, and child_process spawning. Visualization is delegated to InfraNodus SaaS (via the InfraNodus MCP server) and the official InfraNodus AI Graph View Obsidian plugin. The local TrevNodus / InfraNodus-Visual server (:3000) has been retired from the active workflow; the codebase remains on disk at ~/Claude/InfraNodus-Visual/ but is no longer started or relied upon. Phase 35 (2026-04-12) added: structured IPC protocol (JSON stdout events), parallel step execution (topological levels via Promise.allSettled), multi-backend LLM routing (Ollama for scout, LM Studio for analyst, Claude Code for synthesizer), Traefik v3 failover proxying, and Prometheus + Grafana observability.
  </summary>

  <key_decisions>
    1. **Subprocess-only workflow execution** — Research workflows are spawned via child_process.spawn(), NOT HTTP. The :18789 gateway is for the bounty-hunting/REST API path, completely separate from the Obsidian-initiated research pipeline. Reason: tighter lifecycle control and no HTTP overhead for local operations.

    2. **Two independent operators, no subordination** — Claude Desktop and OpenClaw Command Center (Obsidian plugin) are peers. Each uses Claude Code as its LLM. No single operator orchestrates the other. (The third peer, TrevNodus/InfraNodus-Visual, was retired from the workflow on 2026-04-25; its codebase remains on disk but is not started.)

    3. **Canonical MCP bridge at :8798** — All vault access goes through this single bridge. No alternative vault bridges allowed. Replay-protected, TLS-encrypted, auth via x-mcp-token header.

    4. **Dual Zettelkasten implementations (complementary, not duplicate)** — Copilot-Everything has an LLM-driven ZettelkastenService (backend emulator, vault-grounded). Claude Hub has the algorithmic Medical Zettelkasten MCP (graph analysis without LLM, Brandes/Louvain/4-gram co-occurrence). Both are used.

    5. **launchd over PM2 for managed services** — Native macOS service management chosen for InfraNodus and bridge monitor after PM2 reliability issues. PM2 still used for the canonical MCP bridge and backend emulator via Copilot-Everything's ecosystem.config.js.

    6. **Claude Code as primary LLM provider** — Runs via `claude -p` stdin pipe using Trevor's authenticated Claude Max Pro session. Produces biomedical output with real verifiable citations. LM Studio is fallback. Mock for CI.

    7. **Fail-closed governance** — Unknown states default to blocked/review_required. Append-only evidence ledgers with chain-hashing. Immutable config after boot. No autonomous publishing — all external distribution is manual-only.

    8. **State-change-only monitoring** — Bridge monitor writes JSONL events only when service state changes, avoiding log noise from successful health checks.

    9. **Structured IPC protocol (Phase 35)** — `run-workflow.js` emits JSON events on stdout (`workflow_created`, `workflow_result`), one per line. The Command Center plugin parses these instead of scraping workflow_id from stderr log noise. stderr remains unchanged for human-readable logs.

    10. **Parallel step execution (Phase 35)** — Workflow steps at the same topological level (no mutual dependencies) run concurrently via `Promise.allSettled()`. Steps with dependencies still execute level-by-level. Transparent to step implementations.

    11. **Intentional role-to-backend routing (Phase 35)** — NOT round-robin. Scout → Ollama (CLI model management for fast iteration on triage models). Analyst → LM Studio (GUI for loading/tuning larger 70B INT4 models with memory controls). Synthesizer → Claude Code (Claude-level reasoning required for citation-dense output). Configured via `config/agent-config.json` → `roleProviderMap`.

    12. **Traefik failover, not load balancing (Phase 35)** — Primary/backup topology per role. Scout: Ollama primary, LM Studio fallback. Analyst: LM Studio primary, Ollama fallback. If the primary crashes, traffic switches to the backup within health check interval. Activated by copying `config/llm-providers.local.json.traefik-example` → `config/llm-providers.local.json`.

    13. **Prometheus + Grafana observability (Phase 35)** — Optional Docker Compose sidecar. 5 custom metrics (tokens_consumed, routing_ratio, tool_call_duration, workflow_duration, workflow_status). Gateway exposes `/metrics` endpoint (unauthenticated for Prometheus scraper). Grafana on :3001.

    14. **InfraNodus webview handoff replaces the MCP/API path (2026-04-25, live-tested)** — The OpenClaw Command Center plugin no longer spawns `npx -y infranodus-mcp-server` or holds an InfraNodus API key. On workflow completion, the synthesizer markdown is handed off to InfraNodus by opening `https://infranodus.com/import/editor?text=<URL-encoded>&context=<graph name>` in Obsidian's built-in webviewer. The user's existing infranodus.com session cookie carries auth — no API key needed. Two ribbon icons collapsed to one ("OpenClaw Pipeline" now opens the pipeline status sidebar AND the InfraNodus webview together). The infranodus MCP server entries in both `~/.claude.json` and `claude_desktop_config.json` were fully removed on 2026-04-25 (timestamped `.bak.cleanup.*` backups exist on disk if ever needed); the empty `mcpServersDisabled` parents were also dropped. There is no longer any InfraNodus MCP server in either Claude Code or Claude Desktop. Cross-origin sandbox blocks fully automated submit, so the user clicks "Generate Graph" once on the InfraNodus page. **Verified end-to-end** by direct invocation of `activateInfranodusWebview()` via Obsidian dev console with mock synthesizer text — InfraNodus pre-filled the textarea correctly and the URL contained both `?text=` and `&context=` params.

    15. **AI generation import is paid (2026-04-25, ruled out)** — InfraNodus's "AI & GPT LLMs" import group (`AI Knowledge Graph`, `AI Ontologies Graph`, `Live AI Graph Brainstorming`, `LLM Topic Overview`, `Live AI Chat Mode`) was investigated as a way to skip the user's manual "Generate Graph" click. All five variants open a "Generate a knowledge graph using the AI" dialog with an "AI Model to Use" dropdown set to Claude Opus, which consumes the user's InfraNodus AI token quota. **Decision: stay on the existing zero-cost `/import/editor?text=` path** (uses InfraNodus's local non-LLM graph algorithms — 4-gram co-occurrence, Brandes betweenness, Louvain clustering — at zero token cost). Per user constraint: "ONLY if that doesn't use any infranodus api token usage."

    16. **End-to-end webview handoff verified — three fixes applied (2026-04-25, 🟢 fully working)** — The auto-handoff path was end-to-end tested by running `general-research-pack` with topic "caffeine and sleep" from Obsidian. The workflow now completes all 5 steps (research → build_dataset → package → approve → export) in ~4.5 minutes, generates 5 vault notes (Overview, Scout, Analyst, Synthesizer, Dataset Card) under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/general-research-pack/<date> ... caffeine and sleep/`, and the InfraNodus webview auto-navigates to `/import/editor?text=...&context=...` with the synthesizer text pre-filled. Three bugs were found and fixed along the way:

      **Fix A — llm-adapter fallback model (`/Users/trevorrobey/trevor-robey-inc-agents/openclaw-bridge/core/llm-adapter.js:382-388`)**: When Claude Code failed and fell back to LM Studio, the code passed the Claude model (`claude-sonnet-4-6`) into the LM Studio request, which 400'd because LM Studio doesn't have that ID. Fix: drop the `model` override in the fallback path so each provider uses its own configured model from `config/llm-providers.json`.

      **Fix B — PATH enrichment in plugin runner spawn (`/Users/trevorrobey/Claude/obsidian-openclaw-command-center/src/subprocess/openclaw-runner.ts:73-89`)**: Obsidian launched from Finder/Spotlight inherits a minimal PATH that doesn't include `~/.local/bin` (where `claude` lives) or the nvm node bin. So `claude -p` failed to spawn from the plugin's subprocess and the workflow silently fell back to LM Studio. Fix: prepend `~/.local/bin`, the nvm node bin, `/opt/homebrew/bin`, and `/usr/local/bin` to PATH when spawning `scripts/run-workflow.js`. After this fix, claude-sonnet-4-6 actually runs for scout/analyst/synthesizer.

      **Fix C — URL truncation for InfraNodus webview (`/Users/trevorrobey/Claude/obsidian-openclaw-command-center/src/main.ts:716-743`)**: A 17KB synthesizer markdown encoded into the `?text=` URL parameter pushed the URL beyond InfraNodus's server-side URI limit (~16KB), returning HTTP 414 Request-URI Too Large. Fix: cap the prefilled text at 6000 chars (~10–12KB URL-encoded) with a trailing marker `[Truncated to 6000 chars to fit InfraNodus URL limit. Full text is in the Synthesizer.md vault note.]`. Full content remains in the vault note for human review.

      A separate, secondary bug remains as a known quirk: mission IDs are deterministic from `(template, topic)` inputs, so re-running with identical topic re-uses the same mission ID and OpenClaw's state machine reads the FIRST recorded subtask result from `outbox.jsonl` rather than the latest, causing stale-failure replay on retries. Workaround: delete `/Users/trevorrobey/trevor-robey-inc-agents/workspace/missions/<mission-id>/` between retries, or vary the topic slightly.
  </key_decisions>

  <technical_context>
    ## Workspace Structure

    ```
    ~/TrevClaw-Obsidianodus/              # Meta-workspace root (NOT a git repo)
    ├── CLAUDE.md                          # Unified port map, topology, startup order
    ├── Claude/          → ~/Claude/       # Symlink: Zettelkasten MCP, Command Center plugin (InfraNodus-Visual archived, not in workflow)
    ├── Copilot-Everything/ → ~/THE Copilot in Obsidian Everything/  # Symlink: plugin fork, MCP bridge, backend emulator
    └── trevor-robey-inc-agents/ → ~/trevor-robey-inc-agents/       # Symlink: multi-agent pipeline, gateway, datasets
    ```

    ## The Five Systems

    ### 1. OpenClaw Research Agents (`~/trevor-robey-inc-agents/`)
    - Multi-agent research pipeline. Node.js 22.13.1, CommonJS, Zod validation.
    - Entry point: `scripts/run-workflow.js` (spawned by Command Center plugin as child_process)
    - 6 workflow templates: general-research-pack, drug-discovery-full, pharmacovigilance-report, target-validation-pack, clinical-trial-landscape, rare-disease-brief
    - 6 agent roles: literature_reviewer, safety_signal_detector, molecular_profiler, competitive_intel_analyst, quality_auditor, report_generator
    - LLM chain: Claude Code (synthesizer, `claude -p` stdin pipe, claude-sonnet-4-6) → Ollama (scout, localhost:11434/v1/chat/completions) → LM Studio (analyst, localhost:1234/v1/chat/completions) → Mock (testing)
    - Role-based routing: `config/agent-config.json` → `roleProviderMap` → `createMultiProviderAdapter()` in `llm-adapter.js`
    - Harvard ToolUniverse: 2,173 biomedical MCP tools (Phase 29), pre-fetched per agent role via `config/tool-prefetch-map.json`
    - Agentic tool-call loop (Phase 34): iterative ToolUniverse calling via `<tool_call>` XML protocol, configurable iteration/token budgets
    - **bioRxiv/medRxiv MCP** (local CommonJS module at `openclaw-bridge/mcp/biorxiv-mcp/`):
      - Direct HTTPS client to api.biorxiv.org (not stdio transport — embedded in composite tool executor)
      - 4 tools: `biorxiv_search_preprints` (by date/category, 27 subject areas), `biorxiv_get_preprint` (full metadata by DOI), `biorxiv_search_published` (preprints published in journals), `biorxiv_search_by_funder` (by funder ROR ID)
      - Zod-validated schemas (`biorxiv-schema.js`), tool descriptions for agent prompts (`biorxiv-tool-descriptions.js`)
      - Routed via composite tool executor (`openclaw-bridge/core/composite-tool-executor.js`, accepts `biorxivMcp` option)
      - **Status**: Fully wired. Instantiated in `scripts/_workflow-runtime.js:108-112`, passed to composite executor at line 122, tool descriptions injected into agent prompts at line 137. Agents can call bioRxiv tools mid-workflow via the agentic tool-call loop.
    - **Remote bioRxiv MCP** (MCP server ID `d3109d6a-...`, configured at Claude Code level):
      - Separate from the local module — available as a deferred MCP tool set for Claude Desktop/Claude Code sessions
      - 7 tools: `search_preprints`, `get_preprint`, `search_published_preprints`, `get_categories`, `get_content_statistics`, `get_usage_statistics`, `search_by_funder`
      - Used for ad-hoc preprint lookup in conversations, not part of the automated workflow pipeline
    - Structured IPC: `run-workflow.js` emits `{"type":"workflow_created",...}` and `{"type":"workflow_result",...}` on stdout (Phase 35)
    - Parallel execution: `computeTopologicalLevels()` groups steps by dependency level, runs each level via `Promise.allSettled()` (Phase 35)
    - Phase system: 35 phases implemented (1-35, 32 skipped)
    - Gateway at :18789 (HTTPS, mkcert TLS, bearer token auth) — REST API path, NOT used for Obsidian-initiated workflows
    - Config toggles: `config/tool-call-loop-config.json` (enabled), `config/zettelkasten-integration.json` (enabled)

    ### 2. OpenClaw Command Center (`~/Claude/obsidian-openclaw-command-center/`)
    - Obsidian plugin (TypeScript). Dispatches workflows, monitors progress, generates vault notes.
    - Key classes: OpenClawPlugin, McpBridgeServer (:8799, 11 tools), OpenClawRunner (subprocess spawner), WorkflowTracker (polls workflow.json every 2s + dir-scan fallback every 3s), ZettelkastenClient (stdio MCP), WorkflowModal (template UI), WorkflowStatusView (sidebar)
    - Post-completion pipeline: generate 6 vault notes → Zettelkasten analysis → **InfraNodus webview handoff** (opens https://infranodus.com/import/editor?text=&context= in Obsidian's built-in webviewer; cookie auth, no API key, user clicks "Generate Graph" once)
    - Dual completion detection: Tracker (poll workflow.json PATH A) + Runner exit (disk read PATH B) + error recovery (PATH C), shared completionHandled flag
    - 30-minute warn-only timeout (does NOT kill subprocess)

    ### 3. Medical Zettelkasten MCP (`~/Claude/Medical-Zettelkasten-MCP/`)
    - Algorithmic graph engine. 10 MCP tools over stdio transport. No LLM.
    - Algorithms: 4-gram co-occurrence (Paranyushkin 2019), Brandes betweenness centrality (2001), Louvain community detection (Blondel 2008), structural gap detection, Shannon entropy diversity
    - Used as a stdio subprocess by Command Center plugin and OpenClaw agents (the in-process `require()` by InfraNodus-Visual is no longer relevant since TrevNodus is retired)
    - 12 tools: analyze_network, find_gaps, detect_clusters, measure_diversity, cross_domain_connect, break_echo_chamber, link_semantically, rescue_orphans, generate_serendipity, full_zettelkasten_analysis, memory_add_relation, memory_query_entity

    ### 4. Graph Visualization (InfraNodus SaaS + official Obsidian plugin)
    - **InfraNodus SaaS** (https://infranodus.com): hosted graph generation, gap detection, AI chat, cross-graph memory. Accessed via the InfraNodus MCP server (`mcp__infranodus__*` — 31+ tools including create_knowledge_graph, generate_content_gaps, generate_research_questions, develop_text_tool, memory_add_relations).
    - **Auto-ingest path**: OpenClaw plugin's `InfranodusClient` (`/Users/trevorrobey/Claude/obsidian-openclaw-command-center/src/subprocess/infranodus-client.ts`) spawns `npx -y infranodus-mcp-server` as a stdio subprocess with `INFRANODUS_API_KEY` env var, then calls `create_knowledge_graph` with the synthesizer markdown (`src/main.ts:716-739`). The new graph appears at https://infranodus.com/apps under the user's account.
    - **InfraNodus AI Graph View Obsidian plugin** (`infranodus-graph-view` v0.9.4 by Nodus Labs): in-vault interactive 3D graph view. Reads vault content directly. Requires the same SaaS API key (configured via plugin settings, not data.json yet).
    - **Retired**: The local TrevNodus / InfraNodus-Visual server at HTTPS :3000 (`~/Claude/InfraNodus-Visual/`) was previously the auto-ingest target but has been removed from the active workflow as of 2026-04-25. The codebase, launchd plist (`com.trevorrobey.infranodus-visual`), and start script remain on disk for archival reference but are not started. The Sigma.js v3 WebGL clone, Brevilabs Copilot Plus Flash LLM, and `/api/bridge/*` endpoints are no longer part of any documented data flow.

    ### 5. Copilot Plugin + Infrastructure (`~/THE Copilot in Obsidian Everything/`)
    - Obsidian plugin fork with two runtime modes: direct_plugin_mcp and exact_backend_emulator
    - Canonical MCP bridge at :8798 (HTTPS, TLS, replay-protected, PM2-managed)
    - Backend emulator at :8789 (HTTP, PM2-managed) — self-host orchestration layer
    - Zettelkasten backend: 5 vault-grounded commands (serendipity, cross-domain, echo-chamber, semantic-linker, orphan-rescue) + pipeline chaining
    - PM2 cron: daily orphan scan (2 AM), weekly health digest (Sun 9 AM), weekly serendipity (Wed 9 AM)
    - Miyo v4 semantic search at :8742 (external, Qdrant-backed, deprecated index endpoints)
    - Claude adapter: stdio MCP adapter at bridges/obsidian-copilot-bridge/claude-adapter/ — forwards to :8798
    - Obsidian CLI: /Applications/Obsidian.app/Contents/MacOS/obsidian (ships with 1.12.7+)

    ## Multi-Operator Topology

    ```
    Claude Desktop (heavy-lift code/file operator)
      ├── [MCP stdio] → claude-code CLI
      ├── [MCP stdio] → obsidian-bridge adapter → [HTTPS :8798] → Canonical MCP Bridge
      ├── [MCP stdio] → chrome-devtools
      └── [MCP stdio] → filesystem server

    OpenClaw Command Center (agent dispatch + monitoring, Obsidian plugin)
      ├── [child_process.spawn()] → OpenClaw Research Agents (scripts/run-workflow.js)
      ├── [stdio subprocess: npx infranodus-mcp-server] → InfraNodus SaaS create_knowledge_graph (auto-ingest after workflows)
      ├── [HTTP :8742] → Miyo semantic search
      └── [HTTP :8799] → Own additive MCP bridge (11 tools: 7 Obsidian + 4 OpenClaw)

    InfraNodus SaaS (https://infranodus.com — visualization + graph algorithms)
      ← [stdio MCP] from OpenClaw Command Center (auto-ingest after workflows)
      ← [stdio MCP] from Claude Desktop / Claude Code (mcp__infranodus__* tools, ad-hoc analysis)
      ← [HTTPS] from official InfraNodus AI Graph View Obsidian plugin (vault content visualization)

    [Retired 2026-04-25] TrevNodus / InfraNodus-Visual at HTTPS :3000 — codebase preserved at ~/Claude/InfraNodus-Visual/, no longer started or used in workflow.
    ```

    ## Unified Port Map

    | Port  | Service                          | Protocol | Owner                   | Manager                    | Health Check                |
    |-------|----------------------------------|----------|-------------------------|----------------------------|-----------------------------|
    | ~~3000~~ | ~~TrevNodus (InfraNodus-Visual)~~ | ~~HTTPS~~ | ~~Claude~~              | **Retired 2026-04-25**     | n/a                         |
    | 8798  | Canonical MCP Bridge             | HTTPS    | Copilot-Everything      | PM2                        | GET /healthz                |
    | 8799  | Command Center Bridge (additive) | HTTP     | Claude (Obsidian plugin)| Obsidian plugin lifecycle  | GET /health → JSON          |
    | 8789  | Backend Emulator                 | HTTP     | Copilot-Everything      | PM2                        | GET /healthz                |
    | 8742  | Miyo Semantic Search             | HTTP     | External                | External app               | GET /v0/health              |
    | 6333  | Qdrant Vector DB                 | HTTP     | External                | External process           | GET /collections/miyo       |
    | 18789 | OpenClaw Gateway (REST API)      | HTTPS    | trevor-robey-inc-agents| launchd                    | GET /health → HTML dashboard|
    | 1234  | LM Studio (analyst role)         | HTTP     | External                | LM Studio app              | N/A                         |
    | 11434 | Ollama (scout role)              | HTTP     | External                | Ollama app                 | GET /api/tags               |
    | 11480 | Traefik scout proxy (optional)   | HTTP     | trevor-robey-inc-agents| Docker Compose             | Traefik dashboard           |
    | 11481 | Traefik analyst proxy (optional) | HTTP     | trevor-robey-inc-agents| Docker Compose             | Traefik dashboard           |
    | 9090  | Prometheus (optional)            | HTTP     | trevor-robey-inc-agents| Docker Compose             | GET /-/healthy              |
    | 3001  | Grafana (optional)               | HTTP     | trevor-robey-inc-agents| Docker Compose             | GET /api/health             |

    ## TLS Configuration

    - All HTTPS services use mkcert certificates at `~/.local/share/mkcert/localhost.pem`
    - Key at `~/.local/share/mkcert/localhost-key.pem`
    - CA root at `~/Library/Application Support/mkcert/rootCA.pem` (installed in macOS System Keychain)
    - Valid for localhost and 127.0.0.1, expires 2028-07-07
    - All Node.js processes require: `NODE_EXTRA_CA_CERTS=/Users/trevorrobey/Library/Application Support/mkcert/rootCA.pem`
    - Node version: 22.13.1 (engine-strict in trevor-robey-inc-agents)

    ## Process Management

    ### launchd Services (via `openclaw-stack` CLI at ~/Claude/bin/openclaw-stack)
    | Service Plist                          | What                                      | Behavior                        |
    |----------------------------------------|-------------------------------------------|---------------------------------|
    | ~~com.trevorrobey.infranodus-visual~~   | ~~TrevNodus on :3000~~                    | **Retired** — plist on disk but not loaded. Run `launchctl unload ~/Library/LaunchAgents/com.trevorrobey.infranodus-visual.plist` to ensure it stays down. |
    | com.trevorrobey.cc-bridge-monitor       | Health checker (every 60s)                | RunAtLoad, StartInterval 60s    |
    | ai.openclaw.gateway                     | OpenClaw gateway on :18789                | Pre-existing, DO NOT MODIFY     |
    | com.openclaw.bridge                     | Bounty bridge on :8788                    | Pre-existing                    |
    | com.openclaw.mcp                        | Bounty MCP server                         | Pre-existing                    |

    ### PM2 (via Copilot-Everything/ecosystem.config.js)
    - mcp-bridge → :8798 (canonical MCP bridge)
    - openclaw-bridge → :18789
    - backend-emulator → :8789
    - Memory ceiling: 768M (bump to 1024M if ToolUniverse causes OOM)
    - Anti-restart-loop: max_restarts 10, min_uptime 10s, exp_backoff_restart_delay 1000
    - Graceful shutdown: SIGTERM → server.close() with 15s drain timeout

    ### cc-bridge-monitor (~/Claude/bin/cc-bridge-monitor.sh)
    - Runs every 60s via launchd
    - Checks Obsidian and CC bridge (:8799). The :3000 TrevNodus check should be removed from `~/Claude/bin/cc-bridge-monitor.sh` since the service is retired.
    - State-change-only JSONL logging to ~/Claude/.logs/cc-bridge-monitor.events.jsonl
    - Auto-rotates at 5MB

    ## Startup Order

    1. PM2 ecosystem: `cd "Copilot-Everything" && pm2 start ecosystem.config.js` → MCP bridge :8798, backend emulator :8789, OpenClaw bridge :18789
    2. Obsidian opens → Command Center plugin starts → additive bridge at :8799
    3. ~~TrevNodus startup~~ — **Retired**. Visualization is now SaaS via the InfraNodus MCP server (no local startup step required).
    4. Miyo.app → semantic search at :8742
    5. Verify: `openclaw-stack verify`

    ## End-to-End Data Flow (Research Workflow)

    ```
    1. User types "research aspirin for pain" in Obsidian Copilot chat
    2. Copilot calls obsidian_openclaw_run_workflow via MCP bridge (:8799)
    3. Command Center plugin resolves template (general-research-pack)
    4. OpenClawRunner spawns: node scripts/run-workflow.js --template general-research-pack --topic "aspirin for pain"
    4a. run-workflow.js emits {"type":"workflow_created","workflow_id":"...","template_id":"..."} on stdout (Phase 35)
    5. Tool-prefetch module queries ToolUniverse for role-specific biomedical tools
    6. WorkflowTracker starts dir-scan + polls workspace/workflows/{id}/workflow.json every 2s
    7. Agents execute by topological level — independent steps run in parallel (Phase 35):
       - Scout → Ollama (port 11434) for literature triage
       - Analyst → LM Studio (port 1234) for deep analysis
       - Synthesizer → Claude Code (`claude -p` stdin pipe) for citation-dense reasoning
       - Each agent gets ToolUniverse pre-fetch results injected as synthetic input docs
       - Agentic tool-call loop: agents can invoke ToolUniverse tools mid-task via <tool_call> XML
    8. workflow.json transitions: running → completed
    8a. run-workflow.js emits {"type":"workflow_result",...} on stdout (Phase 35)
    9. Tracker fires onWorkflowDone (PATH A: poll detection)
    10. Plugin generates 6 interlinked vault notes with YAML frontmatter + wikilinks + tags
        → Saved to /Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/
    11. Plugin runs Zettelkasten analysis (structural gaps, echo chambers, cross-domain)
    12. Plugin's `activateInfranodusWebview(text, graphName)` (`src/main.ts:716-741`) builds `https://infranodus.com/import/editor?text=<encoded synthesizer markdown>&context=<encoded graph name>` and navigates Obsidian's built-in webviewer leaf to that URL (reusing an existing infranodus.com leaf if one is open)
    13. The InfraNodus editor pre-fills the textarea with the synthesizer markdown and the context dropdown with the graph name. User clicks "Generate Graph" once to commit. Graph appears under the user's infranodus.com account.
    14. User asks "what did the research find?" → Copilot reads vault notes via :8799 tools
    ```

    ## Integration Matrix

    | From                  | To                     | Transport                | Purpose                              |
    |-----------------------|------------------------|--------------------------|--------------------------------------|
    | Copilot               | Command Center Bridge  | HTTP POST :8799          | MCP tool calls (11 tools)            |
    | Command Center        | OpenClaw Agents        | child_process.spawn()    | Workflow execution                   |
    | Command Center        | Zettelkasten MCP       | stdio subprocess         | Post-workflow graph analysis          |
    | Command Center        | InfraNodus SaaS        | Obsidian webview navigation → HTTPS infranodus.com/import/editor | Auto-handoff synthesizer markdown via `?text=` URL param (cookie auth, no API key) |
    | Claude Desktop / Code | InfraNodus SaaS        | stdio MCP (mcp__infranodus__*) | Ad-hoc graph analysis (31+ tools)     |
    | Official InfraNodus Graph View plugin | InfraNodus SaaS | HTTPS infranodus.com   | In-vault 3D graph visualization       |
    | OpenClaw Agents       | Claude Code            | stdin pipe (`claude -p`) | Synthesizer LLM                      |
    | OpenClaw Agents       | Ollama                 | HTTP :11434              | Scout LLM (Phase 35)                |
    | OpenClaw Agents       | LM Studio              | HTTP :1234               | Analyst LLM (Phase 35)              |
    | Traefik (optional)    | Ollama / LM Studio     | HTTP :11480/:11481       | Failover proxy (Phase 35)           |
    | Prometheus (optional) | OpenClaw Gateway       | HTTPS :18789/metrics     | Metrics scraping (Phase 35)         |
    | OpenClaw Agents       | ToolUniverse           | stdio MCP                | 2,173 biomedical tools               |
    | OpenClaw Agents       | bioRxiv API            | HTTPS (via local module) | Preprint search/metadata (4 tools, Phase 35)      |
    | OpenClaw Agents       | Zettelkasten MCP       | stdio                    | Optional in-workflow graph analysis   |
    | Claude Desktop        | Obsidian Bridge        | MCP stdio → HTTPS :8798  | Vault CRUD via claude-adapter         |
    | Backend Emulator      | Miyo                   | HTTP :8742               | Semantic search                      |
    | Backend Emulator      | Qdrant                 | HTTP :6333               | Fallback chunk retrieval             |
    | Backend Emulator      | LM Studio              | HTTP :1234               | LLM analysis (ZK service)           |

    ## Obsidian Vault

    - Path: `/Volumes/ExtraCurricular/My Digital Garden` (ExtraCurricular volume must be mounted)
    - Plugin dir: `<vault>/.obsidian/plugins/`
    - Key plugins: `copilot/` (chat interface), `openclaw-command-center/` (workflow dispatch)
    - Copilot system prompt: `copilot/system-prompts/openclaw.md`
    - Research output: `OpenClaw/{template}/{date}/` (6 notes per workflow)
    - Zettelkasten reports: `Zettelkasten/Reports/` (daily orphan scan, weekly health, weekly serendipity)

    ## Monetization Pipeline (Manual-Only External Steps)

    - 6 workflow templates → research packs → dataset builder → offer packaging → release approval → export (ZIP)
    - Distribution adapters: Datarade, Kaggle, HuggingFace, AWS Data Exchange, Data & Sons, Outlier.ai, Mindrift.ai
    - Pricing: Standard ($2.5K-$5K), Custom ($15K-$35K), Enterprise ($60K-$120K+ ARR)
    - Brand: Trevor Robey Inc., dark-mode Bloomberg Terminal aesthetic
    - Website: https://trevorrobeyinc.github.io (GitHub Pages)
    - All external publishing is manual. The system prepares assets, the human uploads them.

    ## Health Check Commands

    ```bash
    curl http://127.0.0.1:8789/healthz                                                              # Backend emulator
    curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz  # Canonical MCP bridge
    curl http://127.0.0.1:8742/health                                                               # Miyo
    curl http://127.0.0.1:6333/collections/miyo                                                     # Qdrant
    curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:18789/healthz # OpenClaw gateway
    openclaw-stack verify                                                                            # Full status + health + errors
    pm2 status                                                                                       # PM2 process status
    ```

    ## Key File Paths

    | File | Purpose |
    |------|---------|
    | ~/Claude/ARCHITECTURE.md | Canonical architecture reference (Claude subproject) |
    | ~/Claude/bin/openclaw-stack | Service management CLI (start/stop/restart/status/health/logs/errors/events/verify) |
    | ~/Claude/bin/cc-bridge-monitor.sh | Periodic health checker (launchd, every 60s) |
    | ~/Claude/InfraNodus-Visual/ | **Retired** — codebase preserved on disk for archival reference; no longer started or used in workflow |
    | ~/Claude/obsidian-openclaw-command-center/src/main.ts:716-741 | `activateInfranodusWebview()` + `ingestToInfranodus()` — opens InfraNodus webview with synthesizer markdown pre-filled via `?text=` URL param (former subprocess client deleted 2026-04-25) |
    | /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/openclaw-command-center/data.json | Holds `infranodusApiKey` setting consumed by InfranodusClient |
    | /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/infranodus-graph-view/ | Official InfraNodus AI Graph View plugin (Nodus Labs v0.9.4) |
    | ~/Claude/obsidian-openclaw-command-center/src/main.ts | Command Center plugin entry |
    | ~/Claude/obsidian-openclaw-command-center/src/bridge/mcp-bridge-server.ts | :8799 bridge (11 tools) |
    | ~/Claude/obsidian-openclaw-command-center/src/subprocess/openclaw-runner.ts | Workflow spawner |
    | ~/Claude/obsidian-openclaw-command-center/src/workflow/workflow-tracker.ts | Progress polling |
    | ~/Claude/Medical-Zettelkasten-MCP/ | Algorithmic graph engine root |
    | ~/trevor-robey-inc-agents/scripts/run-workflow.js | Workflow entry point (spawned by plugin) |
    | ~/trevor-robey-inc-agents/config/workflow-templates/*.json | 6 template definitions |
    | ~/trevor-robey-inc-agents/config/tool-call-loop-config.json | Agentic tool loop toggle |
    | ~/trevor-robey-inc-agents/config/zettelkasten-integration.json | Graph analysis toggle |
    | ~/trevor-robey-inc-agents/config/llm-providers.json | LLM provider configs |
    | ~/trevor-robey-inc-agents/config/tool-prefetch-map.json | Role-to-ToolUniverse mappings |
    | ~/trevor-robey-inc-agents/openclaw-bridge/mcp/biorxiv-mcp/biorxiv-mcp.js | bioRxiv API client (local CommonJS module) |
    | ~/trevor-robey-inc-agents/openclaw-bridge/mcp/biorxiv-mcp/biorxiv-schema.js | Zod schemas for 4 bioRxiv tools |
    | ~/trevor-robey-inc-agents/openclaw-bridge/core/composite-tool-executor.js | Routes tool calls to ToolUniverse, bioRxiv, Zettelkasten |
    | ~/trevor-robey-inc-agents/openclaw-bridge/core/prometheus-metrics.js | Prometheus metrics (prom-client, Phase 35) |
    | ~/trevor-robey-inc-agents/config/agent-config.json → roleProviderMap | Role-to-backend routing config (Phase 35) |
    | ~/trevor-robey-inc-agents/config/llm-providers.local.json.traefik-example | Traefik endpoint overrides (copy to activate) |
    | ~/trevor-robey-inc-agents/observability/ | Traefik, Prometheus, Grafana configs + docker-compose.yml |
    | ~/TrevClaw-Obsidianodus/ARCHITECTURE.md | Canonical full-pipeline architecture reference (Phase 35) |
    | ~/trevor-robey-inc-agents/openclaw-bridge/ | Gateway source (12 submodules) |
    | ~/trevor-robey-inc-agents/ecosystem.config.js | PM2 config (standalone) |
    | ~/THE Copilot in Obsidian Everything/ecosystem.config.js | PM2 config (bridge + emulator + openclaw) |
    | ~/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/ | Canonical MCP bridge source |
    | ~/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/claude-adapter/ | Claude Desktop stdio adapter |
    | ~/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator/ | Backend emulator source |
    | /Volumes/ExtraCurricular/My Digital Garden/ | Obsidian vault |
    | ~/.local/share/mkcert/localhost.pem | TLS cert (all HTTPS services) |
    | ~/Library/Application Support/mkcert/rootCA.pem | mkcert CA root |
  </technical_context>

  <action_items>
    1. [done] Created root-level ARCHITECTURE.md in TrevClaw-Obsidianodus/ as canonical pipeline reference (Phase 35, 2026-04-12). Supersedes ~/Claude/ARCHITECTURE.md for full-stack view.
    2. [done] Updated all architecture docs with Phase 35 additions (structured IPC, parallel execution, multi-backend routing, Traefik failover, Prometheus/Grafana).
    3. [pending] Memory directory at ~/.claude/projects/-Users-trevorrobey-TrevClaw-Obsidianodus/memory/ is empty — no persistent cross-session memories stored yet for the meta-workspace.
    4. [pending] ~/Claude/ARCHITECTURE.md (259 lines, updated Apr 7) covers only the Claude subproject's view. Now superseded by root ARCHITECTURE.md but may still be useful for Command Center/Zettelkasten-specific details. Consider linking or deprecating.
  </action_items>

  <constraints_and_preferences>
    - **Plan-first**: Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
    - **Subagent-heavy**: Use subagents liberally to keep main context clean.
    - **Self-improvement loop**: After any correction, update .learnings/LEARNINGS.md.
    - **Verification before done**: Never mark a task complete without proving it works.
    - **No autonomous publishing**: External uploads, marketplace submissions, browser automation are manual-only.
    - **Port coordination**: All port assignments coordinated in TrevClaw-Obsidianodus/CLAUDE.md. No reassignment without updating that file.
    - **Canonical vault access**: All operators must go through the MCP bridge at :8798. No alternative vault bridges.
    - **Full filepaths**: Always provide full relative filepath from project root when mentioning files.
    - **No comments in terminal blocks**: Clean, copy-paste-ready commands first, explanations after.
    - **Session artifacts**: Go to .archive/ directories, not workspace roots.
    - **Node version**: 22.13.1, strictly enforced in trevor-robey-inc-agents.
    - **CommonJS**: trevor-robey-inc-agents uses require()/module.exports, not ESM.
    - **Restricted globals**: Date.now(), new Date(), Math.random(), randomUUID() forbidden in openclaw-bridge/ — use timeProvider and entropyProvider.
  </constraints_and_preferences>

  <conversation_arc>
    Single-turn architecture audit. The user requested an outline of the current architecture with instructions to update an existing architecture file if one exists, or create a context-handoff if missing. Exploration revealed:
    - ~/Claude/ARCHITECTURE.md exists (259 lines, updated Apr 6) but covers only the Claude subproject's view of the pipeline
    - No root-level architecture file exists in TrevClaw-Obsidianodus/
    - Memory directory is initialized but empty
    - All four CLAUDE.md files (root + 3 subprojects) are current and authoritative for their domains
    - Existing context-handoff docs in Claude/ are topic-specific (TrevNodus-for-OpenClaw, unified-research-stack-consolidation), not a full pipeline handoff

    Decision: Generate a comprehensive context-handoff bundle covering the full pipeline, suitable for any LLM to pick up work cold on this stack.
  </conversation_arc>

  <handoff_instructions>
    You are continuing work on a biomedical research intelligence stack called TrevClaw-Obsidianodus. The owner is Trevor Robey (trevor@trevorrobey.com, company Trevor Robey Inc.).

    This is a local-first macOS system with four interconnected components: OpenClaw Research Agents (multi-agent pipeline), OpenClaw Command Center (Obsidian plugin), Medical Zettelkasten MCP (graph engine), and the Copilot infrastructure (MCP bridge, backend emulator, Miyo semantic search). Visualization is delegated to InfraNodus SaaS (via the InfraNodus MCP server) and the official InfraNodus AI Graph View Obsidian plugin. The local TrevNodus / InfraNodus-Visual server (HTTPS :3000) was retired from the workflow on 2026-04-25; its codebase remains on disk but is not started.

    The primary workflow: user types a research query in Obsidian → MCP bridge → Command Center plugin → spawns OpenClaw agents as child_process → agents use Claude Code LLM + 2,173 ToolUniverse biomedical tools → generates vault notes → runs graph analysis → auto-ingests into InfraNodus SaaS knowledge graph at infranodus.com via the `InfranodusClient` subprocess (`npx -y infranodus-mcp-server`).

    Before making changes:
    1. Read the relevant subproject's CLAUDE.md — each is authoritative for its own domain.
    2. Check the port map in TrevClaw-Obsidianodus/CLAUDE.md before touching any service.
    3. Verify services are running: `openclaw-stack verify` and `pm2 status`.
    4. The canonical MCP bridge at :8798 MUST be running for vault access.
    5. The ExtraCurricular volume must be mounted for the Obsidian vault at /Volumes/ExtraCurricular/My Digital Garden/.

    Respect the constraints listed above, especially: plan-first for non-trivial work, no autonomous external publishing, canonical vault access through :8798 only, CommonJS in trevor-robey-inc-agents, restricted globals in openclaw-bridge/.
  </handoff_instructions>
</context_handoff>
```
