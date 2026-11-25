# trevor-robey-inc Command Center (Obsidian plugin)

An Obsidian plugin that turns your vault into the command center for **trevor-robey-inc** biomedical due-diligence workflows (powered by OpenClaw). Spawn pipelines, track progress in real time, and auto-generate interlinked research notes with Zettelkasten graph intelligence.

> Internal class names (`OpenClawPlugin`, `OpenClawRunner`, `openclaw-bridge`) reference the open-source [OpenClaw](https://github.com/trevorrobey/OpenClaw-Research-Agents) framework that powers this plugin. They stay as-is.

## Features

- **Run workflows from Obsidian** -- pick a template, fill in inputs, click Run. The plugin spawns `run-workflow.js` as a child process and streams progress to a sidebar.
- **Auto-generate vault notes** -- each completed workflow produces 6 interlinked notes (Overview, Scout, Analyst, Synthesizer, Quality Audit, Dataset Card) with full YAML frontmatter for Dataview queries.
- **Zettelkasten graph analysis** -- automatically discovers cross-domain connections, blind spots, semantic relationships, and orphan rescue proposals via the Medical Zettelkasten MCP server.
- **Miyo semantic search** -- finds related vault notes by meaning (not just keywords) using a local Qdrant-backed vector search backend.
- **In-plugin MCP bridge** -- runs an HTTP bridge server inside the plugin process, on a private Unix socket (no TCP port), so Copilot and other MCP clients can read/write vault notes and execute commands without a standalone bridge process.
- **Start/Stop bridge controls** -- manual Start and Stop buttons in settings with a live status indicator, plus an "Enable on startup" toggle for auto-start.

## Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| Obsidian | 1.4.0+ | Plugin host |
| Node.js | 22.13.1 | Subprocess runtime (nvm recommended) |
| [trevor-robey-inc-agents](https://github.com/trevorrobey/trevor-robey-inc-agents) (powered by OpenClaw) | Phase 30+ | Workflow engine, agent roles, quality auditor |
| vault-zettelkasten plugin (in-vault) | Latest | Graph intelligence, in-process (the stdio Medical-Zettelkasten server was retired 2026-08-20) |
| Miyo | Latest | Semantic search backend (optional) |

## Installation

1. Clone or download this repo into your vault's `.obsidian/plugins/` directory:

```
.obsidian/plugins/openclaw-command-center/
  main.js
  manifest.json
  styles.css
```

2. Enable the plugin in Settings > Community plugins.

3. Configure paths in Settings > trevor-robey-inc Command Center:
   - **Engine path**: absolute path to the `trevor-robey-inc-agents` repo root (the OpenClaw-powered engine)
   - **Zettelkasten MCP server path**: absolute path to `Medical-Zettelkasten-MCP/src/server.js`
   - **Node.js path**: path to your Node.js binary (e.g., `~/.nvm/versions/node/v22.13.1/bin/node`)

## Commands

| Command | Description |
|---------|-------------|
| **Run Workflow** | Opens a modal to pick a template and fill in inputs, then spawns the pipeline |
| **Cancel Running Workflow** | Kills the running subprocess |
| **Toggle Pipeline Status Sidebar** | Shows/hides the real-time progress sidebar |
| **Run Zettelkasten Analysis on Current Note** | Appends graph intelligence connections to the active note |

## Settings

### Paths

- **OpenClaw path** -- root of the OpenClaw-Research-Agents repository
- **Zettelkasten MCP server path** -- `server.js` for the Medical Zettelkasten MCP
- **Node.js path** -- explicit path to avoid Electron's bundled Node

### Vault

- **Output folder** -- where generated research notes go (default: `OpenClaw`)

### Behavior

- **Auto-generate notes** -- create vault notes when a workflow completes
- **Auto-run Zettelkasten** -- append graph analysis after note generation

### Miyo Semantic Search

- **Enable Miyo** -- use vector search to find related notes during auto-linking
- **Miyo port** -- default `8743` (the HTTPS TLS-proxy port, never Miyo's plaintext upstream)
- **Similarity threshold** -- minimum score (0-1) for matches
- **Max results** -- cap on semantic matches per query

### Copilot Bridge

- **Bridge status** -- live indicator ("Running on unix:" and the socket path, or "Stopped") with Start and Stop buttons
- **Enable on startup** -- auto-start the bridge when Obsidian loads (default: on)
- **Bridge socket** -- read-only: the Unix socket the bridge serves, `~/.local/state/trinc/run/command-center.sock`. There is no port to set (the former "Bridge port" field is gone; a `bridgePort` left in `data.json` is ignored)

### Advanced

- **Poll interval** -- how often to check workflow state (default: 2000ms)
- **Workflow timeout warning** -- console warning threshold; never kills the run (default: 1800000ms / 30 min — use Cancel Workflow to stop)

## MCP Bridge

The plugin runs an HTTP bridge server inside the Obsidian process. This replaces the standalone `obsidian-mcp-bridge.js` -- no separate terminal process needed. It listens only on the Unix socket `~/.local/state/trinc/run/command-center.sock` (see "Transport" below). Every route except the health probes needs the bearer token from `~/.config/openclaw-command-center/bridge-token`, sent as `Authorization: Bearer <token>` or `X-MCP-Token: <token>`.

### Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/`, `/health`, `/healthz` | GET | Health check with vault name, uptime, tool list (no token needed) |
| `/mcp/sse`, `/sse`, `/mcp/events` | GET | SSE stub: an `endpoint` event, then keepalives only |
| `/mcp/tool` | POST | Tool call: `{tool, operation, input}` |
| Any path | POST | JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call` |
| Any path | OPTIONS | `405`: CORS preflight is disabled |

### Tools

| Tool | Description |
|------|-------------|
| `obsidian_health` | Bridge and vault status |
| `obsidian_open_vault` | Open a note in the editor |
| `obsidian_read_note` | Read note content and metadata |
| `obsidian_search_notes` | Search notes by content with path scoping |
| `obsidian_execute_command` | Execute any Obsidian command by ID |
| `obsidian_create_note` | Create a new note (with folder creation) |
| `obsidian_append_note` | Append content to an existing note |

Plus the **engine suite** (2026-08-20): `obsidian_openclaw_{run_workflow, status, results,
templates, cancel, history, artifacts, engine_health, research_task, research_tasks_list,
research_output, delivery_evidence, citation_integrity, feed_stats}` (and, since 2026-09-22,
`publish_vault` and `research_memory_search`), the seven `zk_*` Zettelkasten tools, and
`video_pipeline_{run,status}` — 32 tools total (see `src/bridge/mcp-bridge-server.ts` for the
contract of record).

The `obsidian_*` tools use the Obsidian API directly -- no filesystem access or Advanced URI subprocess calls.

### Copilot Integration

The bridge works with the Copilot plugin's MCP configuration: the server `command-center` with transport `uds`. Its socket path is resolved at run time (leave it empty), and its token is the one in `~/.config/openclaw-command-center/bridge-token`. Copilot converts an old `https://127.0.0.1:8799` entry by itself when it loads. Claude Code reaches the bridge through the `openclaw-obsidian` stdio adapter (`Copilot-Everything/bridges/obsidian-stdio-adapter`), and the Copilot agent through its stdio proxy; neither needs a URL or a CA any more.

To check that the bridges answer, run the documented health check (it prints one status line per bridge and never a token):

```bash
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs
```

Create a system prompt at `copilot/system-prompts/openclaw.md` with `copilot-mcp-system-prompt-default: true` in the frontmatter to auto-load OpenClaw commands into every chat.

## Generated Note Structure

Each workflow produces a folder at `{output_folder}/{template}/{date} {inputs}/` containing:

```
Overview.md          -- pipeline summary, wikilinks to all agents, quality score
Scout.md             -- literature review, tool discovery, initial data collection
Analyst.md           -- structured analysis, target validation framework
Synthesizer.md       -- cross-domain synthesis with Zettelkasten appendix
Quality Audit.md     -- citation verification, confidence score, pass/fail
Dataset Card.md      -- dataset metadata, row counts, schema
```

All notes include YAML frontmatter compatible with Dataview:

```dataview
TABLE type, quality_confidence, status, template
FROM "OpenClaw"
WHERE type = "openclaw/workflow"
```

### Citation integrity layer (engine-side)

The OpenClaw engine now runs a zero-fabrication citation-integrity gate at the report level. Every identifier cited in the assembled report is cross-checked against the union of source records actually retrieved at runtime: a cited id is "grounded" if it appeared in fetched evidence, otherwise "ungrounded" (likely model-introduced). The engine refuses to ship a report whose grounded ratio falls below `minGroundedCitationRatio` (default `0.34`, error `PHASE30_CITATION_UNVERIFIED`), and each cited DOI is retraction-screened against Crossref — any retracted paper hard-stops the report (`PHASE30_CITATION_RETRACTED`). Surviving ungrounded cites are annotated inline `[UNVERIFIED]`. Citations are grounded in the retrieved source records plus the DOI retraction screen; they are not independently re-resolved against a live external database.

Two new deliverables ship in each mission bundle (alongside the vault notes above):

- **`citation-integrity.md`** -- a graded provenance ledger (grade A–D from the grounded ratio; F/BLOCKED if any retraction) that is the report's audit-trail spine.
- **`graveyard-memo.md`** -- a memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented) and a protocol amendment-risk band (LOW/MODERATE/HIGH). Rendered deterministically from the fetched ClinicalTrials.gov records, so every claim is verifiable.

## Development

```bash
npm install
npm run dev     # watch mode
npm run build   # production build
```

Build output is `main.js` (single bundle via esbuild). Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin directory.

## Project Structure

```
src/
  main.ts                    -- plugin entry, commands, bridge lifecycle
  types.ts                   -- all TypeScript interfaces
  constants.ts               -- defaults, view types, step labels
  settings.ts                -- settings tab UI
  bridge/
    mcp-bridge-server.ts     -- in-plugin HTTP bridge on command-center.sock (32 tools)
    uds-listener.ts          -- Unix-socket listener + client rules (byte-identical in 3 packages)
  subprocess/
    openclaw-runner.ts       -- spawns run-workflow.js
    research-notify.ts       -- research_notify to the vault bridge over vault-bridge.sock
    zettelkasten-client.ts   -- MCP JSON-RPC 2.0 client
  workflow/
    workflow-modal.ts        -- template picker + input form
    workflow-tracker.ts      -- polls workflow.json for progress
    workflow-history.ts      -- scans past workflow runs
  notes/
    note-generator.ts        -- reads OpenClaw output, creates vault notes
    frontmatter.ts           -- YAML frontmatter builders
    content-builder.ts       -- markdown body builders
  views/
    workflow-sidebar.ts      -- pipeline progress sidebar
  copilot-integration/
    miyo-client.ts           -- HTTP client for Miyo semantic search
  zettelkasten/
    linker.ts                -- runs 5 ZK commands + Miyo, appends to notes
  util/
    json-reader.ts           -- safe JSON file reading
    path-resolver.ts         -- OpenClaw workspace path resolution
scripts/
  generate-test-notes.js     -- generate vault notes from existing workflow data
```

## Transport: a private Unix socket, never TCP (bridges-uds, 2026-11-24)

The in-plugin MCP bridge (`src/bridge/mcp-bridge-server.ts`) serves plain HTTP/1.1 on one Unix socket, `~/.local/state/trinc/run/command-center.sock`, and on nothing else: there is no TCP listener, no TCP fallback and no client path that dials TCP. From 2026-04-30 until this change it was HTTPS-only on `127.0.0.1:8799` with the mkcert pair; the bridge no longer reads that pair or its `OPENCLAW_BRIDGE_TLS_*` overrides. (The Miyo client still uses HTTPS on `:8743` with the mkcert root CA.)

- **Who can reach it.** The run directory is `0700` and the socket `0600`, so only processes of your own account can connect, and no browser can. The bearer token stays as defence in depth against other programs of your account, and the browser guard still refuses any request with an Origin, a Referer or a cross-site `Sec-Fetch-Site`. Its Host check applies to TCP only.
- **Refuses rather than repairs.** The bridge does not start (the console logs the reason and its code) when a level of `~/.local/state/trinc/run` is a symlink, not yours or writable by others, when the run directory is not `0700` (`RUN_DIR_MODE`: check who changed it, then `chmod 700` it), when something other than a socket sits at the path, or when a live server already holds it (`ALREADY_SERVED`, for example this plugin in a second vault window). A stale socket left by a crash is replaced.
- **One helper.** `src/bridge/uds-listener.ts` does all of this. It is byte-identical with the Viz Studio and vault-bridge copies (`ops/tr-suite/verify.sh` compares them), so change all three together or none.
- **Guard.** `npm run lint:transport` fails on any `createServer(` or `.listen(` in `src` outside `src/bridge/uds-listener.ts`, and fails if that file is missing. Run it as part of pre-commit or CI.

## License

MIT
