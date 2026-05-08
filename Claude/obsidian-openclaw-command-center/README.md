# trevor-robey-inc Command Center (Obsidian plugin)

An Obsidian plugin that turns your vault into the command center for **trevor-robey-inc** biomedical due-diligence workflows (powered by OpenClaw). Spawn pipelines, track progress in real time, and auto-generate interlinked research notes with Zettelkasten graph intelligence.

> Internal class names (`OpenClawPlugin`, `OpenClawRunner`, `openclaw-bridge`) reference the open-source [OpenClaw](https://github.com/trevorrobey/OpenClaw-Research-Agents) framework that powers this plugin. They stay as-is.

## Features

- **Run workflows from Obsidian** -- pick a template, fill in inputs, click Run. The plugin spawns `run-workflow.js` as a child process and streams progress to a sidebar.
- **Auto-generate vault notes** -- each completed workflow produces 6 interlinked notes (Overview, Scout, Analyst, Synthesizer, Quality Audit, Dataset Card) with full YAML frontmatter for Dataview queries.
- **Zettelkasten graph analysis** -- automatically discovers cross-domain connections, blind spots, semantic relationships, and orphan rescue proposals via the Medical Zettelkasten MCP server.
- **Miyo semantic search** -- finds related vault notes by meaning (not just keywords) using a local Qdrant-backed vector search backend.
- **In-plugin MCP bridge** -- runs an HTTP bridge server inside the plugin process so Copilot and other MCP clients can read/write vault notes and execute commands without a standalone bridge process.
- **Start/Stop bridge controls** -- manual Start and Stop buttons in settings with a live status indicator, plus an "Enable on startup" toggle for auto-start.

## Requirements

| Dependency | Version | Purpose |
|------------|---------|---------|
| Obsidian | 1.4.0+ | Plugin host |
| Node.js | 22.13.1 | Subprocess runtime (nvm recommended) |
| [trevor-robey-inc-agents](https://github.com/trevorrobey/trevor-robey-inc-agents) (powered by OpenClaw) | Phase 30+ | Workflow engine, agent roles, quality auditor |
| [Medical Zettelkasten MCP](https://github.com/trevorrobey/Medical-Zettelkasten-MCP) | Latest | Graph intelligence server (optional) |
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
- **Miyo port** -- default `8742`
- **Similarity threshold** -- minimum score (0-1) for matches
- **Max results** -- cap on semantic matches per query

### Copilot Bridge

- **Bridge status** -- live indicator ("Running on port 8798" / "Stopped") with Start and Stop buttons
- **Enable on startup** -- auto-start the bridge when Obsidian loads (default: on)
- **Bridge port** -- HTTP port for the MCP bridge (default: `8798`)

### Advanced

- **Poll interval** -- how often to check workflow state (default: 2000ms)
- **Workflow timeout** -- max time before killing a workflow (default: 600000ms / 10 min)

## MCP Bridge

The plugin runs an HTTP bridge server inside the Obsidian process. This replaces the standalone `obsidian-mcp-bridge.js` -- no separate terminal process needed.

### Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Health check with vault name, uptime, tool list |
| `/mcp/sse` | GET | SSE transport for MCP clients |
| `/mcp/tool` | POST | Tool call: `{tool, operation, input}` |
| Any path | POST | JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call` |

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

All tools use the Obsidian API directly -- no filesystem access or Advanced URI subprocess calls.

### Copilot Integration

The bridge works with the Copilot plugin's MCP configuration. Add this to your Copilot MCP config:

```json
{
  "obsidian-bridge": {
    "url": "http://127.0.0.1:8798"
  }
}
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
    mcp-bridge-server.ts     -- in-plugin HTTP bridge (7 tools)
  subprocess/
    openclaw-runner.ts       -- spawns run-workflow.js
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

## Encrypted-by-default invariant (2026-04-30)

The in-plugin MCP bridge (`src/bridge/mcp-bridge-server.ts`, port 8799) is **HTTPS-only**. It will refuse to start if the mkcert key/cert pair cannot be loaded; the previous `OPENCLAW_BRIDGE_TLS_DISABLE=1` escape hatch and the silent fallback-to-HTTP on missing certs were both removed. Default cert paths:

- key: `~/.local/share/mkcert/localhost-key.pem`
- cert: `~/.local/share/mkcert/localhost.pem`

Override via `OPENCLAW_BRIDGE_TLS_KEY` / `OPENCLAW_BRIDGE_TLS_CERT` if your install is non-default. If mkcert is not yet set up: `mkcert -install && mkcert localhost 127.0.0.1`.

A regression guard (`npm run lint:transport`) rejects any future addition of `http.createServer`, `OPENCLAW_BRIDGE_TLS_DISABLE` equality checks, `tlsDisable` ternaries, or bare `ws://` literals inside the bridge source. Run it as part of pre-commit or CI.

## License

MIT
