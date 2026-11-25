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
npm run lint:transport  # fails on createServer( or .listen( anywhere in src except src/bridge/uds-listener.ts
```

Plugin output goes to `main.js` in the project root (gitignored). Obsidian loads the copy in
`/Users/myhome/My Digital Garden/.obsidian/plugins/command-center/`, so a build is not live until
`main.js` is copied there (see the `deploy-surface` skill) — and **a plugin reload cancels a run in
progress**, so deploy only when `obsidian_openclaw_status` shows `process_running:false`. `tsc --noEmit`
reports 4 pre-existing errors in `src/workflow/workflow-modal.ts` (esbuild does not typecheck, so the
build is unaffected); a change that adds a fifth is yours.

## Architecture

### MCP Bridge (Unix socket `command-center.sock`)

The plugin runs an in-process HTTP bridge providing **32 tools** (7 `obsidian_*` + 16 `obsidian_openclaw_*` + 7 `zk_*` + 2 `video_pipeline_*`; engine suite added 2026-08-20; `obsidian_openclaw_publish_vault` + `obsidian_openclaw_research_memory_search` added 2026-09-22 — both spawn engine CLIs, no gate, no model spend; the memory search honours the engine's `researchMemory.enabled` switch). Since **bridges-uds (2026-11-24)** it serves only the Unix socket `~/.local/state/trinc/run/command-center.sock` (run directory 0700, socket 0600; it was HTTPS on TCP :8799 before), and the canonical copilot-everything vault bridge (once :8798) serves `vault-bridge.sock` in the same directory. There is no TCP listener, no TCP fallback and no TLS on either link; the bearer token (`~/.config/openclaw-command-center/bridge-token`) and the browser guard stay. Health check: `node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs` (never type a socket path on a command line).

- **`src/bridge/uds-listener.ts` is byte-identical** with Viz Studio's copy and the vault bridge's `udsListener.ts`
  (`ops/tr-suite/verify.sh` compares them). Never edit one copy: change all three together. It is the only file in
  src that creates a server (`npm run lint:transport`). It refuses, never repairs: a run directory that is not 0700,
  a symlinked or group/other-writable level, a non-socket or a live socket at the path (`ALREADY_SERVED`, e.g. this
  plugin in a second vault window). A stale socket (a crash) is replaced. Logs name `listener.socketPath`; the
  server's own address is the hidden bind name.
- **Lifecycle (D3).** One `McpBridgeServer` per plugin instance, so the layout-ready start and the settings Start
  button share one start in flight. `onunload` sets `disposed` first, then stops the bridge before the runner, the
  tracker and the video run; a start that lands after a stop or the unload closes what it opened; a successful start
  registers its close with `this.register`. A plugin reload in the same window supersedes the old listener. If the
  socket's name is removed or taken over, the bridge closes itself with a "Bridge stopped" Notice; Start it again.
- **Settings.** The status reads "Running on unix:<path>" / "Stopped"; a read-only "Bridge socket" row replaced the
  port field. A `bridgePort` left in data.json is ignored, not scrubbed.
- **research_notify** (the post-run chat bubble) goes to `vault-bridge.sock` through `src/subprocess/research-notify.ts`
  (`requestOverSocket`, 10 s timeout, no CA). A missing socket (ENOENT: bridge not running) or a trust refusal is a
  logged `notify` failure in the post-run ledger, never a TCP retry.

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

**Video pipeline (2026-11-19, phase 3 of `~/.claude/plans/in-a-new-session-sharded-valley.md`; the only one since
phase 4, 2026-11-20).** `video_pipeline_run` runs a local video file or folder inside Obsidian through
`src/video/`, a port of the Raycast extension's file and folder pipeline. Since 2026-11-22 it also takes a link
on the approved list and has Downie download it (next bullet). Any other link is refused with a pointer to
the download script (`video-pipeline-source.ts` `LINK_REFUSAL`): the Copilot agent downloads it first with the
`copilot-video-download` skill and passes the file or course folder. The Raycast deeplink, its dispatch
confirm and phase 3's `videoBackend` switch are gone (`test/video-raycast-path-retired.test.ts` guards that;
`main.ts` scrubs a stored `videoBackend`).
- **The Downie hand-off (2026-11-22, operator decision "Yes, build it"; it reverses 2026-11-19's "Downie
  retires").** For sites that need the operator's own sign-in. `video_pipeline_run` with an approved link replies
  at once (`kind: "link"`); `src/video/downie.ts` opens it in Downie 4 (`/usr/bin/open` with one `downie://` address,
  argv array), watches `~/Movies/Downie`, and the run goes on with the finished file, as a local-file run whose
  `source` is the link. LinkedIn Learning lessons and Kaltura: Downie tries by itself for 3 minutes, then its guided
  window opens. Strayer library films: the window opens at once. In the window the operator presses play, then +;
  the run waits up to 30 minutes, and `video_pipeline_status` carries `waitingForUser` with the exact steps. A run
  that is only waiting can be given up with `replace_waiting`; one that is working is never replaced.
  - **The approved list is code (`src/video/downie-sites.ts`), never a setting.** Downie opens pages with the
    operator's sign-ins and the caller is an agent that reads untrusted text, so any other address would be a way
    to send note text out. A link is REBUILT from checked parts; no path or query part may hold `:`, `/` or `%`, so a
    nested address (what a redirect page needs) cannot be written; Kaltura is pinned to the school's partner
    number; LinkedIn is `/learning/<course>/<lesson>` only; the library's sign-in and DOI hosts are never opened (a
    sign-in link is rewritten to the film's own proxied page). `openInDownie` asks the list again right before
    the program runs. Adding a site is a code change with its refusals tested first.
  - **The claim** compares the folder with how it looked before the hand-off (inode and size, not times, which a
    tag or Finder changes), waits for two equal sizes, and prefers the file whose `.json` names the page. With no
    match after 20 s the one new finished video is taken, and status says so (`downloadNote`).
  - **What it never does:** read Downie's settings, history, cache or sign-ins; move, rename or delete a file in
    Downie's folder (notes are named by `pathForNaming` instead); drive any other app. Only `src/video/downie.ts`
    may name the open program (`test/video-raycast-path-retired.test.ts`).
  - **A chat follows the skill text it loaded,** even after the file changes. The first live test (2026-11-22) ran in a
    chat that had loaded the old video-pipeline skill, so it used the download script and never called this tool. The
    vault script `copilot/skills/copilot-video-download/video_download.py` (`downie_link`) therefore refuses these
    three kinds of link in pipeline mode and names `video_pipeline_run`, so any chat ends up here.
  - **Live, 2026-11-22:** two LinkedIn lessons went through Downie by themselves (59 s and 56 s end to end). Downie's
    guided window (library films) has not been run live through the hand-off yet.
- **Front matter (2026-11-22).** The model writes most of the summary's keys, and one bare colon in a value
  ("course: Finance Foundations: Corporate Governance") made Obsidian read no property of the note. The normalizer
  quotes such values, and `created` is the local date (`localDate`), not the UTC one.
- **Steps.** Subtitles or the audio through the fixed `~/.local/bin/whisper-parakeet-shim` (Whisper as the
  fallback; the binaries are constants in `transcribe.ts`, never settings, because data.json lives in the vault).
  Then the transcription note through `app.vault.create`, the Copilot fork's `copilot:super-summarize-to-note`
  (falling back to `copilot:summarize-to-note`), the rename to `Copilot Summaries/<title> summary.md`, the
  frontmatter (`title`, `created`, `source`), and cleanup.
- **Failure.** There is no paid fallback. A failed or timed-out summary ends the run `failed`, keeps the
  transcription note and the video, and stops watching, so a late Copilot note cannot race the Copilot agent,
  which writes the summary itself. `video_pipeline_status` reports `summaryError` and `transcriptNote`.
- **Source URL (phase 4).** The download script writes `<video base>.url` (an InternetShortcut) beside each
  video. `src/video/source-url.ts` reads it strictly: one `open(O_RDONLY | O_NOFOLLOW | O_NONBLOCK)`, then
  `fstat` on that descriptor (a regular file, at most 4 KB) and a read capped at 4 KB + 1, so a symlink or
  FIFO swapped in after the first `lstat` is refused without blocking Obsidian's main thread. It needs one
  `URL=` line with an https URL that parses, no whitespace, control or format characters, no credentials,
  at most 2048 characters, and keeps the parser's normalized `href`. Its FIFO tests make the pipe through
  `test/support/make-named-pipe.py` (the system call), so the tool's name is on no command line: Falcon rule 8
  (Critical, Block) kills a shell whose command line holds that word followed by `nc`, and a Bash grep for it
  was blocked on 2026-11-20. The URL names the notes (the generic-title rule;
  folder mode's planner uses the same read), becomes the transcription note's Source URL and the summary's
  `source`, and shows in the dry run's `plan`. Anything else is no URL plus one `no source URL:` log line,
  and the run goes on.
- **Downloaded videos are deleted** after a successful summary, with their subtitle and metadata files, when they
  sit inside the video download folder (`Video Downloads/`, where the download script saves). This is the
  operator's decision of 2026-11-19, "Delete (today's cleanup)". A video anywhere else is never touched.
- **One run at a time.** The plugin owns the single `VideoPipelineController`, which refuses a second dispatch
  and aborts the run on unload (`RUN FAIL`). The run log and the run marker keep their Raycast-era paths in
  `~/.local/share/raycast-obsidian/` and their line formats. *(2026-11-22: Raycast was uninstalled on 2026-11-21, so
  no Raycast run can exist any more and the marker's stand-down for one is inert. The folder keeps its old name and
  stays live.)*
- **Tests.** The modules import each other as `./x.ts` (tsconfig `allowImportingTsExtensions`, `noEmit`), so
  `node --test` runs whole pipelines against a fake vault. Only `obsidian-host.ts` imports `obsidian`.
- **Contract.** The Copilot fork's `src/mcp/catalog.ts` describes the same tools for its in-plugin agent: change
  both together. (The stdio adapter's word-for-word copy left with its `raycast` profile, `41a0822`.)
  A reply carries `backend: "builtin"` (a constant the Copilot skill checks), `kind`, `runId`, `videoCount`
  for a folder, and `site` and `firstTry` for a link; a dry run returns `plan` instead of starting anything.

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
| Obsidian MCP Bridge (canonical vault bridge) | HTTP over a Unix socket (since 2026-11-24) | `vault-bridge.sock` | research_notify chat bubble |
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
dispatch + the MCP bridge, then on `:8799`) with their unrelated dashboard plugin. It failed on this
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
| `src/bridge/mcp-bridge-server.ts` | In-plugin HTTP bridge on `command-center.sock` (no TCP port) |
| `src/bridge/uds-listener.ts` | The Unix-socket listener and client rules (byte-identical in three packages; never edit one copy) |
| `src/subprocess/research-notify.ts` | research_notify to the vault bridge over `vault-bridge.sock` |
| `src/video/pipeline.ts` | Built-in video pipeline: one video, folder mode, the run's start and end, the one-run controller |
| `src/video/obsidian-host.ts` | The pipeline's only `obsidian` import: vault writes, the active note, the Copilot command |
| `src/subprocess/openclaw-runner.ts` | OpenClaw subprocess spawner |
| `src/subprocess/zettelkasten-client.ts` | Zettelkasten MCP stdio client |
| `src/notes/note-generator.ts` | Vault note generation with YAML frontmatter |
| `src/settings.ts` | Settings UI (paths, vault, behavior, bridge, advanced) |
| `src/constants.ts` | Default settings values |
| `src/types.ts` | TypeScript interfaces |
