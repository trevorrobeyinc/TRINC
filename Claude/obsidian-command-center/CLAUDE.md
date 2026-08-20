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
cd /Users/myhome/TrevClaw-Obsidianodus/Claude/obsidian-openclaw-command-center
npm run build
npm run dev
```

Plugin output goes to `main.js` in the project root, which Obsidian loads.

## Architecture

### MCP Bridge (port 8799)

The plugin runs an in-process HTTPS bridge providing **30 tools** (7 `obsidian_*` + 14 `obsidian_openclaw_*` + 7 `zk_*` + 2 `video_pipeline_*`; engine suite added 2026-08-20). Default port is **8799** to avoid collision with the canonical copilot-everything bridge at **8798**.

The canonical Obsidian MCP bridge (with auth, replay protection, idempotency) lives at:
`/Users/myhome/TrevClaw-Obsidianodus/Copilot-Everything/bridges/obsidian-copilot-bridge/`

### OpenClaw Integration

Spawns `scripts/run-workflow.js` in `/Users/myhome/TrevClaw-Obsidianodus/Trevor Robey Intelligence Network Citations/` via `child_process.spawn()`. The tracker polls `workflow.json` every 2s for progress and completion detection. On completion, auto-generates vault notes and runs Zettelkasten analysis. The single "Open Pipeline" ribbon icon opens the pipeline status sidebar; no automatic visualization handoff. (InfraNodus integration was fully removed 2026-05-06 — no local clone, no webview handoff, no MCP server.)

- **PATH enrichment**: `src/subprocess/openclaw-runner.ts:73-89` enriches the spawned subprocess PATH to include `~/.local/bin` (claude CLI), nvm node bin, `/opt/homebrew/bin`, and `/usr/local/bin`. Without this, Obsidian launched from Finder/Spotlight inherits a minimal PATH that breaks `claude -p` spawning.

### Zettelkasten (in-process via vault-zettelkasten)

Graph analysis of research output runs in-process through the `vault-zettelkasten`
plugin's api (5 analyses: cross-domain, echo-chamber, semantic linker, orphan rescue,
serendipity). **The Medical Zettelkasten stdio-subprocess lane was RETIRED 2026-08-20**
(it had been unreachable since the plugin lane became preferred; the server files remain
on disk, unused).

### Miyo

Queries Miyo semantic search via TLS proxy at `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`) for related vault notes during workflow processing.

## Integration Points

| System | Transport | URL/Port | Purpose |
|--------|-----------|----------|---------|
| OpenClaw Agents | subprocess | child_process.spawn() | Workflow execution |
| Obsidian MCP Bridge (canonical) | HTTPS | :8798 | Vault operations |
| vault-zettelkasten plugin | in-process api | N/A | Graph analysis |
| Miyo (via TLS proxy) | HTTPS | :8743 → upstream :8742 | Semantic search |

## manifest.json version is pinned at 9.9.9 on purpose (2026-07-26)

The plugin id `command-center` (frozen — see `../CLAUDE.md` "Plugin display names vs IDs")
**collides with an unrelated, real community plugin**: `command-center` by Dustin Stringer,
repo `scrunchds/Command-Center`, an "orchestrate AI agents / dashboard" plugin, currently at
version `1.0.6`, `minAppVersion 1.13.0`. Obsidian's plugin manager matches installed plugins to
the official registry **by id only** — it has no concept of "this install didn't come from that
repo." With our version below theirs, Obsidian's Community Plugins pane showed a false "Update"
pill; clicking it attempted to download `scrunchds/Command-Center`'s release assets over
`.obsidian/plugins/command-center/`, which would have silently replaced this plugin (workflow
dispatch + the `:8799` MCP bridge) with their unrelated dashboard plugin. It failed on this
machine (their `minAppVersion` isn't met here), which is what surfaced the collision rather than
silently overwriting files.

**Fix**: `version` bumped to `9.9.9` (both here and in the deployed copy at
`/Users/myhome/My Digital Garden/.obsidian/plugins/command-center/manifest.json`) so the semver
comparison never again reads their releases as newer. `versions.json` carries both the real
`0.1.0` history entry and `9.9.9` mapped to the same `minAppVersion: 1.4.0` (no API surface
changed). **Do not renumber this back down toward 0.x/1.x** without re-checking
`scrunchds/Command-Center`'s current version — the id collision is permanent, only staying ahead
of their version avoids it. Never click "Update" for `command-center` in Obsidian's UI; deploy
new versions of this plugin only by copying `main.js`/`manifest.json`/`styles.css` here to the
vault plugin directory manually (see repo `README.md` → Installation).

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
