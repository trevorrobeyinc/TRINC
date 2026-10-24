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
cd /Users/myhome/TRINC/Claude/obsidian-command-center   # path corrected 2026-10-07 (was the pre-rename ...-openclaw-command-center)
npm run build
npm run dev
npm test              # unit tests for the pure modules (node --test, strip-types); no Obsidian needed
npm run lint:transport
```

Plugin output goes to `main.js` in the project root (gitignored). Obsidian loads the copy in
`/Users/myhome/My Digital Garden/.obsidian/plugins/command-center/`, so a build is not live until
`main.js` is copied there (see the `deploy-surface` skill) — and **a plugin reload cancels a run in
progress**, so deploy only when `obsidian_openclaw_status` shows `process_running:false`. `tsc --noEmit`
reports 4 pre-existing errors in `src/workflow/workflow-modal.ts` (esbuild does not typecheck, so the
build is unaffected); a change that adds a fifth is yours.

## Architecture

### MCP Bridge (port 8799)

The plugin runs an in-process HTTPS bridge providing **32 tools** (7 `obsidian_*` + 16 `obsidian_openclaw_*` + 7 `zk_*` + 2 `video_pipeline_*`; engine suite added 2026-08-20; `obsidian_openclaw_publish_vault` + `obsidian_openclaw_research_memory_search` added 2026-09-22 — both spawn engine CLIs, no gate, no model spend; the memory search honours the engine's `researchMemory.enabled` switch). Default port is **8799** to avoid collision with the canonical copilot-everything bridge at **8798**.

**Run dispatch contract (2026-10-07).** This is the door a Claude Code session uses to start OpenClaw runs
(through the stdio adapter's `openclaw` profile, `Copilot-Everything/bridges/obsidian-stdio-adapter/`), so
the plugin's post-run chain runs with nobody operating Obsidian:

- `obsidian_openclaw_run_workflow` accepts `dry_run:true`: every pre-start check runs (template exists, required
  inputs present, no run active) and it returns before anything is spawned or any operator token is touched. A
  reply WITHOUT `dry_run:true` means the bridge predates the parameter — callers must treat that as "a run may
  have started".
- A fail-closed engine gate refusal comes back with its own code: `operator_gate_not_armed` (spelling unchanged —
  the Copilot agent already knows it), `operator_gate_expired`, `operator_gate_token_mismatch`, or
  `operator_gate_denied` for a reason this plugin does not recognise. Parsing lives in
  `src/subprocess/gate-denial.ts` (pure, unit-tested against the engine's real reason strings).
- `obsidian_openclaw_status` keeps its existing `status` key (the engine's own workflow.json status, which goes
  terminal BEFORE the plugin's enrichment stages run) and adds `process_running`, `engine_status`, `post_run`
  and `post_run_done`. `post_run` is the per-stage ledger for the stages in `main.ts` `onWorkflowComplete`
  (`notes, notify, miyo, zk, memory, open` → `pending|running|ok|skipped|failed` + a short detail); it lives in
  `src/workflow/post-run-ledger.ts`. `post_run_done` is `true` only when every stage is terminal, `false` while
  the engine runs, and `null` when no ledger exists for that workflow. The memory ingest is fire-and-forget, so
  `post_run_done` can lag the rest of the chain.
- Each run writes to a ledger captured in a local variable, never to the plugin field, so a late stage of run N
  cannot land in run N+1's ledger.
- **`status` stays small (2026-10-08).** A finished research step carries every rendered deliverable inline in
  `workflow.json` (run #2's reply was 483 K characters, one field being a 428 KB graveyard memo), so
  `src/workflow/status-compaction.ts` replaces any step `result` or artifact over 4,000 characters with a size
  summary (`{trimmed, chars, fields, hint}`) unless the call passes `verbose:true`. The content is served by
  `obsidian_openclaw_results` / `_artifacts` / `_citation_integrity`. Step ids, statuses, errors, `post_run` and
  `post_run_done` are never touched. `verbose` exists on the bridge only: the stdio adapter's `openclaw` profile still
  validates status as no-argument, so Claude Code always receives the compact form.
- **Node builtins are imported statically, never with `import()` (2026-10-08).** esbuild (cjs, node) rewrites a static
  `import { spawn } from "child_process"` to `require()` but leaves a dynamic `await import("child_process")` as a real
  `import()`, which Obsidian's renderer rejects with "Failed to resolve module specifier 'child_process'". That killed
  the `memory` stage of the first passing run, and Node's own test runner resolves the same call happily, so only
  `test/no-dynamic-builtin-imports.test.ts` (it reads the source) can see it. The engine ingests the research-memory
  pack itself, headless and idempotent, so this stage had cost no data, only an honest `failed` in the ledger.

The canonical Obsidian MCP bridge (with auth, replay protection, idempotency) lives at:
`/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-copilot-bridge/`

### OpenClaw Integration

Spawns `scripts/run-workflow.js` in `/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations/` via `child_process.spawn()`. The tracker polls `workflow.json` every 2s for progress and completion detection. On completion (since 2026-09-22) it **rehydrates** the vault notes the engine already wrote — `waitForEngineVaultNotes` + `rehydrateEngineNotes` in `src/notes/note-generator.ts` read `artifacts.vault_notes` from `workflow.json` — and runs only its enrichment stages (chat bubble, Miyo index, LLM Zettelkasten linking, research-memory ingest); `generateWorkflowNotes` is the fallback for runs the engine did not write. On load it backfills (`scripts/publish-workflow-to-vault.js --all`, setting `backfillVaultNotesOnLoad`) and links up to `zkCatchUpMaxPerLoad` synthesizer notes that lack the Zettelkasten section (`zkCatchUpOnLoad`). The single "Open Pipeline" ribbon icon opens the pipeline status sidebar; no automatic visualization handoff. (InfraNodus integration was fully removed 2026-05-06 — no local clone, no webview handoff, no MCP server.)

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
