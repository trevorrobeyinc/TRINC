# OpenClaw Command Center (Obsidian Plugin)

## What This Is

Obsidian plugin that turns a vault into the single UI for the OpenClaw biomedical research pipeline. Dispatches multi-agent workflows, monitors progress in a sidebar, auto-generates interlinked vault notes, and runs Zettelkasten graph analysis on results.

## Tech Stack

- **Language**: TypeScript
- **Build**: esbuild (`esbuild.config.mjs`)
- **Runtime**: Obsidian plugin API (no standalone server)
- **Dependencies**: Dev-only (TypeScript, esbuild, @types/node, obsidian)

## Quick Reference

```bash
cd /Users/trevorrobey/Claude/obsidian-openclaw-command-center
npm run build
npm run dev
```

Plugin output goes to `main.js` in the project root, which Obsidian loads.

## Architecture

### MCP Bridge (port 8799)

The plugin runs an in-process HTTP bridge providing 11 tools (7 `obsidian_*` + 4 `obsidian_openclaw_*`). Default port is **8799** to avoid collision with the canonical copilot-everything bridge at **8798**.

The canonical Obsidian MCP bridge (with auth, replay protection, idempotency) lives at:
`/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/`

### OpenClaw Integration

Spawns `scripts/run-workflow.js` in `/Users/trevorrobey/Code/trevor-robey-inc-agents/` via `child_process.spawn()`. The tracker polls `workflow.json` every 2s for progress and completion detection. On completion, auto-generates vault notes and runs Zettelkasten analysis. The single "Open Pipeline" ribbon icon opens the pipeline status sidebar; no automatic visualization handoff. (InfraNodus integration was fully removed 2026-05-06 — no local clone, no webview handoff, no MCP server.)

- **PATH enrichment**: `src/subprocess/openclaw-runner.ts:73-89` enriches the spawned subprocess PATH to include `~/.local/bin` (claude CLI), nvm node bin, `/opt/homebrew/bin`, and `/usr/local/bin`. Without this, Obsidian launched from Finder/Spotlight inherits a minimal PATH that breaks `claude -p` spawning.

### Zettelkasten MCP

Spawns Medical Zettelkasten MCP server on-demand (`/Users/trevorrobey/Claude/Medical-Zettelkasten-MCP/src/server.js`) for graph analysis of research output. Uses 5 analytical tools: cross-domain connect, echo-chamber breaker, semantic linker, orphan rescue, serendipity generator.

### Miyo

Queries Miyo semantic search via TLS proxy at `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`) for related vault notes during workflow processing.

## Integration Points

| System | Transport | URL/Port | Purpose |
|--------|-----------|----------|---------|
| OpenClaw Agents | subprocess | child_process.spawn() | Workflow execution |
| Obsidian MCP Bridge (canonical) | HTTPS | :8798 | Vault operations |
| Medical Zettelkasten MCP | stdio (subprocess) | N/A | Graph analysis |
| Miyo (via TLS proxy) | HTTPS | :8743 → upstream :8742 | Semantic search |

## Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Plugin bootstrap, command registration, lifecycle |
| `src/bridge/mcp-bridge-server.ts` | In-plugin HTTP bridge (port 8799) |
| `src/subprocess/openclaw-runner.ts` | OpenClaw subprocess spawner |
| `src/subprocess/zettelkasten-client.ts` | Zettelkasten MCP stdio client |
| `src/notes/note-generator.ts` | Vault note generation with YAML frontmatter |
| `src/settings.ts` | Settings UI (paths, vault, behavior, bridge, advanced) |
| `src/constants.ts` | Default settings values |
| `src/types.ts` | TypeScript interfaces |
