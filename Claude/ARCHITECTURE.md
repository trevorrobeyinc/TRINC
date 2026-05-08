# OpenClaw Biomedical Research Stack — Architecture (HISTORICAL)

> **STATUS: HISTORICAL SNAPSHOT — DO NOT USE AS REFERENCE.**
>
> This document is a 2026-04-07 snapshot of the architecture *before* the 2026-04-27 rebrand and several subsequent retirements. It still describes things that no longer exist:
> - `OpenClaw-Research-Agents` (renamed to `trevor-robey-inc-agents`)
> - `InfraNodus-Visual` / `TrevNodus` on `:3000` (retired 2026-04-25 — graph viz now via infranodus.com webview handoff)
> - Backend emulator on `:8789` (retired 2026-04-11 — ZettelkastenService now in-process in the `vault-zettelkasten` plugin)
> - `:18789` OpenClaw gateway (was the unrelated homebrew `openclaw.ai` consumer app, removed 2026-04-27)
> - `com.trevorrobey.infranodus-visual` and `com.trevorrobey.cc-bridge-monitor` launchd plists (no longer installed)
>
> **Source of truth:** [/Users/trevorrobey/TrevClaw-Obsidianodus/CLAUDE.md](/Users/trevorrobey/TrevClaw-Obsidianodus/CLAUDE.md). Read that instead.

Canonical reference for the full system. Updated 2026-04-07.

## System Overview

Five independently developed systems compose a biomedical research intelligence pipeline. A user types a natural-language research request into Obsidian Copilot chat. The request flows through an MCP bridge to the Command Center plugin, which spawns a multi-agent research workflow, tracks its progress, generates interlinked vault notes, runs graph analysis, and auto-ingests results into a visual knowledge graph.

```
User → Obsidian Copilot Chat
         │
         ▼
   MCP Bridge (:8799)              ← 11 tools (7 vault + 4 workflow)
         │
         ▼
   Command Center Plugin           ← Obsidian plugin, in-process
         │
    ┌────┼────────────┐
    ▼    ▼            ▼
  Runner  Tracker    Zettelkasten
  (spawn) (poll)     (stdio MCP)
    │
    ▼
  OpenClaw Research Agents         ← child_process.spawn(), NOT HTTP
    │
    ├─ Claude Code (LLM)
    ├─ ToolUniverse (2,173 biomedical tools)
    └─ Medical Zettelkasten MCP (optional graph analysis)
         │
         ▼
   Workflow Output (workflow.json + agent artifacts)
         │
    ┌────┼────────────┐
    ▼    ▼            ▼
  Vault Notes   Zettelkasten    InfraNodus-Visual
  (Obsidian)    Analysis        (auto-ingest :3000)
```

## The Five Systems

### 1. OpenClaw Research Agents
**Path**: `~/OpenClaw-Research-Agents/`
**Role**: Multi-agent research pipeline. No HTTP server for workflows.

Workflows execute via `scripts/run-workflow.js`, spawned as a child process by the Command Center plugin. Six agent roles (scout, analyst, synthesizer, etc.) execute sequentially with optional tool-call loops against ToolUniverse's 2,173 biomedical MCP tools.

Six workflow templates: `general-research-pack`, `drug-discovery-full`, `pharmacovigilance-report`, `target-validation-pack`, `clinical-trial-landscape`, `rare-disease-brief`.

LLM provider chain: Claude Code (primary, via `claude -p` stdin pipe) → LM Studio (fallback, localhost:1234) → Mock (testing).

Config toggles (both enabled):
- `config/tool-call-loop-config.json` — iterative ToolUniverse calling for analyst roles
- `config/zettelkasten-integration.json` — graph analysis during agent execution

### 2. OpenClaw Command Center (Obsidian Plugin)
**Path**: `~/Claude/obsidian-openclaw-command-center/`
**Role**: Dispatches workflows, monitors progress, generates vault notes, runs post-workflow analysis.

Key classes:
- `OpenClawPlugin` — lifecycle, command registration, workflow orchestration
- `McpBridgeServer` — in-plugin HTTP bridge on :8799 (11 tools)
- `OpenClawRunner` — subprocess spawner (`child_process.spawn`)
- `WorkflowTracker` — polls `workflow.json` every 2s + directory scan fallback every 3s
- `ZettelkastenClient` — on-demand stdio MCP client for graph analysis
- `WorkflowModal` — template selector UI (manual path)
- `WorkflowStatusView` — sidebar progress display

Workflow completion pipeline (three paths, shared `completionHandled` flag):
- **PATH A**: Tracker detects `status: "completed"` in workflow.json → `handleCompletion()`
- **PATH B**: Runner process exits with code 0 → reads result from disk → `handleCompletion()`
- **PATH C**: Runner error + completed workflow found on disk → `handleCompletion()`

Post-completion sequence: generate vault notes → run Zettelkasten analysis → auto-ingest to InfraNodus.

### 3. Medical Zettelkasten MCP
**Path**: `~/Claude/Medical-Zettelkasten-MCP/`
**Role**: Algorithmic graph engine. 10 MCP tools over stdio transport.

Graph algorithms (all hand-rolled, no Neo4J):
- Text-to-graph: 4-gram co-occurrence window (Paranyushkin 2019)
- Betweenness centrality: Brandes (2001)
- Community detection: Louvain (Blondel 2008)
- Structural gap detection, Shannon entropy diversity

Used two ways: (1) in-process `require()` by InfraNodus-Visual, (2) stdio subprocess by Command Center plugin and OpenClaw agents.

### 4. InfraNodus-Visual
**Path**: `~/Claude/InfraNodus-Visual/`
**Role**: Graph visualization, gap detection, AI chat, cross-graph memory.

Stack: Node.js + Express + Sigma.js v3 (WebGL) + Socket.IO. 40+ REST endpoints. 11 analysis panels.

Receives workflow output via POST `/api/bridge/ingest` (auto-ingest from Command Center). Can also push notes back to Obsidian via the canonical MCP bridge at :8798.

LLM: Copilot Plus Flash (Brevilabs API). Separate from Claude — InfraNodus has its own AI.

Storage: In-memory Map (50 graph LRU) + JSON disk persistence + JSONL entity memory.

### 5. Copilot Plugin (Obsidian)
**Path**: `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/`
**Role**: Chat interface. Routes user messages through MCP tools.

Connects to the Command Center bridge at :8799 via shared-obsidian-mcp configuration. 11 tools allowlisted. System prompt at `copilot/system-prompts/openclaw.md` maps natural language to tool calls.

## Port Map

| Port | Service | Process Manager | Health Check |
|------|---------|-----------------|--------------|
| 3000 | InfraNodus-Visual | launchd (`com.trevorrobey.infranodus-visual`) | `GET /` → HTTP 200 |
| 8742 | Miyo Semantic Search | External app | `GET /v0/health` |
| 8798 | Canonical MCP Bridge | PM2 (copilot-everything) | `GET /health` |
| 8799 | Command Center Bridge | Obsidian plugin lifecycle | `GET /health` → JSON with tools list |
| 18789 | OpenClaw Gateway | launchd (`ai.openclaw.gateway`) | `GET /health` → HTML dashboard |

Ports NOT used for research workflows: 8788 (bounty bridge), 8789 (backend emulator), 1234 (LM Studio), 6333 (Qdrant).

## Service Management

### launchd Services (managed by `openclaw-stack` CLI)

| Service | Plist | Behavior |
|---------|-------|----------|
| `com.trevorrobey.infranodus-visual` | `~/Library/LaunchAgents/` | RunAtLoad, KeepAlive on crash, ThrottleInterval 30s |
| `com.trevorrobey.cc-bridge-monitor` | `~/Library/LaunchAgents/` | RunAtLoad, StartInterval 60s (periodic health check) |

### Pre-existing launchd Services (DO NOT MODIFY)

| Service | Purpose |
|---------|---------|
| `ai.openclaw.gateway` | OpenClaw bounty gateway on :18789 |
| `com.openclaw.bridge` | Bounty bridge on :8788 |
| `com.openclaw.mcp` | Bounty MCP server |

### openclaw-stack CLI

Location: `~/Claude/bin/openclaw-stack`

```
openclaw-stack start     # Load InfraNodus + monitor plists
openclaw-stack stop      # Unload managed plists
openclaw-stack restart   # Stop then start
openclaw-stack status    # Show all service PIDs and states
openclaw-stack health    # Curl all health endpoints
openclaw-stack logs      # Tail logs (infranodus|monitor|gateway)
openclaw-stack errors    # Show recent errors across all services
openclaw-stack events    # Tail structured event log with colors
openclaw-stack verify    # Full status + health + errors check
```

### cc-bridge-monitor

Location: `~/Claude/bin/cc-bridge-monitor.sh`
Runs every 60 seconds via launchd. Checks Obsidian, CC bridge (:8799), and InfraNodus (:3000). State-change-only JSONL logging to `~/Claude/.logs/cc-bridge-monitor.events.jsonl`. Auto-rotates at 5MB.

## Data Flow: Research Workflow

```
1. User types "research aspirin for pain" in Copilot chat
2. Copilot calls obsidian_openclaw_run_workflow via MCP bridge (:8799)
3. Command Center plugin resolves template (general-research-pack)
4. OpenClawRunner spawns: node scripts/run-workflow.js --template general-research-pack --topic "aspirin for pain"
5. WorkflowTracker starts dir-scan + polls workflow.json every 2s
6. Agents execute: scout → analyst → synthesizer (5-15 min, ~150-300K tokens)
7. workflow.json status transitions: running → completed
8. Tracker fires onWorkflowDone (PATH A)
9. Plugin generates 6+ vault notes with YAML frontmatter, wikilinks, tags
10. Plugin runs Zettelkasten analysis (structural gaps, echo chambers, cross-domain)
11. Plugin POSTs synthesizer output to InfraNodus (:3000/api/bridge/ingest)
12. Knowledge graph auto-appears in InfraNodus
13. User asks "what did the research find?" → Copilot reads vault notes
```

## Integration Matrix

| From | To | Transport | Purpose |
|------|----|-----------|---------|
| Copilot | Command Center Bridge | HTTP POST :8799 | MCP tool calls |
| Command Center | OpenClaw Agents | child_process.spawn() | Workflow execution |
| Command Center | Zettelkasten MCP | stdio subprocess | Post-workflow graph analysis |
| Command Center | InfraNodus | HTTP POST :3000 | Auto-ingest results |
| InfraNodus | Zettelkasten MCP | in-process require() | Graph engine |
| InfraNodus | Obsidian Bridge | HTTP POST :8798 | Push notes to vault |
| InfraNodus | OpenClaw Gateway | HTTP :18789 | Submit workflows from UI |
| OpenClaw Agents | Claude Code | stdin pipe | Primary LLM |
| OpenClaw Agents | ToolUniverse | stdio MCP | 2,173 biomedical tools |
| OpenClaw Agents | Zettelkasten MCP | stdio | Optional in-workflow analysis |

## Directory Structure

```
~/Claude/                                    # Hub workspace
├── ARCHITECTURE.md                          # This file
├── CLAUDE.md                                # Project instructions
├── bin/
│   ├── openclaw-stack                       # Service management CLI
│   └── cc-bridge-monitor.sh                 # Periodic health checker
├── .logs/                                   # All service logs
│   ├── infranodus.out.log
│   ├── infranodus.err.log
│   ├── cc-bridge-monitor.out.log
│   ├── cc-bridge-monitor.err.log
│   └── cc-bridge-monitor.events.jsonl       # Structured state-change events
├── .diagnostics/                            # Migration and verification snapshots
├── InfraNodus-Visual/                       # Graph visualization (port 3000)
├── Medical-Zettelkasten-MCP/                # Graph engine (stdio MCP)
└── obsidian-openclaw-command-center/        # Obsidian plugin source
    └── src/
        ├── main.ts                          # Plugin lifecycle + workflow orchestration
        ├── bridge/mcp-bridge-server.ts      # HTTP bridge (port 8799, 11 tools)
        ├── subprocess/openclaw-runner.ts     # child_process spawner
        ├── workflow/workflow-tracker.ts      # Polling + dir-scan tracker
        ├── notes/note-generator.ts          # Vault note generation
        ├── notes/content-builder.ts         # Markdown content formatting
        └── subprocess/zettelkasten-client.ts # Zettelkasten MCP stdio client

~/OpenClaw-Research-Agents/                  # Multi-agent pipeline
├── scripts/run-workflow.js                  # Entry point (spawned by plugin)
├── config/
│   ├── workflow-templates/*.json            # 6 template definitions
│   ├── tool-call-loop-config.json           # ToolUniverse iteration (enabled)
│   └── zettelkasten-integration.json        # Graph analysis (enabled)
└── workspace/workflows/                     # Workflow output directories

/Volumes/ExtraCurricular/My Digital Garden/  # Obsidian vault
├── .obsidian/plugins/
│   ├── openclaw-command-center/             # Deployed plugin (main.js)
│   └── copilot/                             # Copilot plugin + MCP config
├── copilot/
│   ├── system-prompts/openclaw.md           # System prompt for research mode
│   └── copilot-custom-prompts/             # Custom prompt templates
└── OpenClaw/                                # Generated research notes
    └── {template}/{date}/                   # Per-workflow output
```

## Startup Order

1. launchd loads `com.trevorrobey.infranodus-visual` (InfraNodus on :3000)
2. launchd loads `com.trevorrobey.cc-bridge-monitor` (health checks every 60s)
3. Pre-existing: `ai.openclaw.gateway` runs on :18789
4. PM2 ecosystem in copilot-everything (canonical MCP bridge :8798, backend emulator :8789)
5. Obsidian opens → Command Center plugin starts → bridge on :8799
6. Miyo.app starts → semantic search on :8742

Verify with: `openclaw-stack verify`

## Key Design Decisions

1. **Subprocess-only workflow execution**: No HTTP server for research workflows. The :18789 port is the bounty-hunting gateway, completely separate from the research pipeline. Workflows are spawned via `child_process.spawn()`.

2. **Dual completion detection**: Tracker (polling workflow.json) + Runner exit (reading from disk) with shared `completionHandled` flag. Directory scanning as a fallback when stderr doesn't provide workflow_id.

3. **Warn-only timeout**: The 30-minute workflow timeout logs a warning but does NOT kill the subprocess. Only explicit user cancellation sends SIGTERM.

4. **State-change-only monitoring**: The bridge monitor only writes JSONL events when service state changes, avoiding log noise from successful health checks.

5. **launchd over PM2**: Native macOS service management with crash restart, throttle intervals, and no zombie processes. PM2 was removed after persistent reliability issues.

6. **Three independent operators**: Claude Desktop, Command Center plugin, and InfraNodus-Visual are peers. None is subordinate. Each has its own LLM (Claude, Claude, Copilot Plus Flash respectively).
