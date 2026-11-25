# Claude Hub

The Obsidian plugins and MCP servers built for the business. Current facts only (slimmed 2026-10-23; the
previous text is `git show 2077e79:Claude/CLAUDE.md`). Ports, the bridge sockets, topology and the repo-wide
invariants are in the root [`../CLAUDE.md`](../CLAUDE.md); read the shared board,
[`../_continuity/CONTINUITY.md`](../_continuity/CONTINUITY.md), at session start.

## Why this folder exists (vs `Copilot-Everything/`)

The split is by ownership. **`Claude/`** holds plugins and MCP servers written here from scratch.
**`Copilot-Everything/`** holds the vendored obsidian-copilot fork and the bridge and adapter layer around
it, kept separate so the fork stays cleanly re-syncable with upstream.

## What is here

| Project | Path | Role |
|---|---|---|
| Command Center | `obsidian-command-center/` | Obsidian plugin (id `command-center`). Dispatches research runs, rehydrates the engine's vault notes and runs the post-run enrichment (chat bubble, Miyo indexing, Zettelkasten linking, research-memory ingest). Owns the Command Center bridge, served on its Unix socket `command-center.sock`: 32 tools (7 vault, 16 `obsidian_openclaw_*`, 7 `zk_*`, 2 `video_pipeline_*`). `run_workflow` takes `dry_run`; `status` carries a per-stage `post_run` ledger and `post_run_done`; a gate refusal has its own code (not armed, expired, token mismatch). Details in its own `CLAUDE.md`. |
| Bridge Launcher | `obsidian-bridge-launcher/` | Obsidian plugin (id `obsidian-bridge-launcher`). Spawns the canonical vault bridge (code in `Copilot-Everything/bridges/obsidian-copilot-bridge/`, run as `dist/index.js --transport=uds`, served on `vault-bridge.sock`) as a child tied to Obsidian's lifecycle, and owns the fd-3 IPC used for renderer console capture and the eval tool, which is off by default. |
| Viz Studio | `obsidian-viz-studio/` | Obsidian plugin (id `trinc-viz-studio`). Owns the Viz Studio bridge, served on its Unix socket `viz-studio.sock`: 12 `viz_*` tools for Mermaid diagrams, SVG charts, canvases, link-graph snapshots, guided explainer cards, perceptual maps, card diagrams, stat tiles, UI mockups and interactive HTML. Every render is written under `Visualizations/` and returns an embed string. Token at `~/.config/trinc-viz-studio/bridge-token`. Callers: both Copilot agent lanes, and Claude through the `openclaw-obsidian` door, which strips every write-elsewhere option. `src/bridge/toolSchemas.ts` is the contract of record. |
| Vault Zettelkasten | `obsidian-vault-zettelkasten/` | Obsidian plugin (id `vault-zettelkasten`). The in-process, LLM-driven `ZettelkastenService` (serendipity, cross-domain, echo chamber, semantic linker, orphan rescue, vault health) on hosted `copilot-plus-flash`, reading Miyo via `:8743` and Qdrant via `:6433`; its scheduler writes reports to `Zettelkasten/Reports/` while Obsidian is open. |
| Medical Zettelkasten MCP | `Medical-Zettelkasten-MCP/` | The deterministic graph engine (no LLM). The research engine calls it in-process to write each run's `Graph Analysis.md`. |
| Research Memory MCP | `trevorobeyinc-research-memory-mcp/` | Pack storage in Qdrant (`trevorobeyinc-packs`, via `:6433`). The engine ingests every finished run through `dist/cli.js`, idempotent on content hash (`config/vault-publish.json` `researchMemory.enabled`). The embedder is **offline by default**: only the operator's one-time `scripts/research-memory.js ingest --allow-remote-model` may download the model; a cache miss fails loudly with `EMBED_MODEL_NOT_CACHED`. |
| trinc-content MCP | `trinc-content-mcp/` | Drafts and checks content for the business channels; publishing is per channel, two-call confirmed and inert without a credential. Gated: every call needs `operator-approved-gate arm trinc-content`. Runtime copy at `~/.claude/mcp-servers/trinc-content`, staged by `install-connector.sh`. |
| searxng-search MCP | `searxng-search-mcp/` | Web and science search over the local SearXNG (`:8891`). Runtime copy at `~/.claude/mcp-servers/searxng-search`, staged by `install-connector.sh`. Its general-web results are poor (Bing-only); science engines work. |

Personal vault tooling (Origin Nest, Contextual Wiki Definitions, Claude Console Mirror) moved to its own
repos under `~/Code` on 2026-10-23; the deployed vault copies keep working, and
`ops/tr-suite/manifest.json` lists them as `external`.

## Rules

- **Plugin IDs are frozen**: `command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`,
  `trinc-viz-studio` (and the moved-out `contextual-wiki-definitions`). Copilot's `mcp_command-center_*` and
  `mcp_viz-studio_*` tool ids, the fork's allow-set (`command-center`, `viz-studio`; the fork's server id for
  Viz Studio is deliberately the shorter `viz-studio`), the token paths, the cross-plugin api lookups and
  the folders under `.obsidian/plugins/` all key on them. Display names may change.
- **Deploy plugins only with `ops/tr-suite/deploy.sh`** (dry run by default; `--build --apply <id>`); run
  `ops/tr-suite/verify.sh` before and after. A new `main.js` in a protected plugin raises a critical
  `obsidianwatch` finding: check `--status` first, batch fixes into one deploy, and leave the blessing to
  the operator (Obsidian must be open).
- **MCP servers run from their staged copies**: re-run the server's `install-connector.sh` after editing
  its `src/`, or `verify.sh` reports drift.
- **No TCP for the bridges here** (2026-11-24, bridges-uds; record:
  [`../ops/security/bridges-uds-2026-11-24.md`](../ops/security/bridges-uds-2026-11-24.md)). Command Center,
  Viz Studio and the vault bridge the launcher spawns listen only on 0600 Unix sockets in the 0700 run
  directory `~/.local/state/trinc/run/`, through one helper kept byte-identical in three packages
  (`obsidian-command-center/src/bridge/uds-listener.ts`, `obsidian-viz-studio/src/bridge/uds-listener.ts`,
  `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/udsListener.ts`; `ops/tr-suite/verify.sh`
  compares them, so change all three together). There is no TCP listener, no TCP fallback and no client path
  that can dial TCP, and a bridge that cannot secure its socket refuses to start. **HTTPS-only still applies to
  any TCP listener** (root `CLAUDE.md`). Run `npm run lint:transport` in `obsidian-command-center` and
  `obsidian-viz-studio` before committing a bridge change: each fails on a `createServer(` or `.listen(`
  anywhere in `src` outside `src/bridge/uds-listener.ts`.
- Session artifacts (exploration reports, scratch scripts, snapshots) go in a gitignored `.archive/`
  folder, never at a project root.

## Retired here

`claude-cli-bridge` (retired 2026-05-31; Claude Code runs in the Desktop Code tab, so do not reintroduce a
custom `claude -p` bridge or `claude mcp serve`), the Zettelkasten stdio lane in Command Center (retired
2026-08-20), and the web-app cloning toolkit notes (dropped 2026-10-23, not business tooling). The full
list is the "Retired" table in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).
