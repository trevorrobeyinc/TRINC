# Claude Hub

Central organizational workspace housing all Claude-assisted projects for the biomedical research intelligence stack.

> **📌 Shared Continuity Board:** the cross-surface work log lives at the repo root —
> [`../_continuity/CONTINUITY.md`](../_continuity/CONTINUITY.md). All four Claude surfaces (CLI
> Claude Code, Desktop Claude Code, Cowork, Claude Chat) read it at session start and append on
> progress/handoff. See [`../_continuity/README.md`](../_continuity/README.md).

## Why this workspace exists (vs `Copilot-Everything/`)

The split is **ownership-based**, not artifact-type-based:

- **`Claude/`** holds code **we built and maintain** — plugins and MCP servers authored in-house. Three of the entries below are Obsidian plugins, one is a standalone MCP server, one is the outbound `claude` CLI bridge — all of them ours, all of them iteratively developed here.
- **`Copilot-Everything/`** holds the **vendored obsidian-copilot fork** at `Copilot-Everything/repos/obsidian-copilot-mcp/` plus the **canonical HTTPS bridge daemon** at `Copilot-Everything/bridges/obsidian-copilot-bridge/` that talks to it. Nothing in there should be code we authored from scratch — that workspace exists so the upstream fork stays cleanly scoped and re-syncable.

If you ever wonder "this Obsidian plugin is ours, why isn't it under `Copilot-Everything/` with the other Obsidian stuff?" — that's the answer. Obsidian plugins WE wrote live here; the obsidian-copilot fork lives there. The taxonomy was set deliberately during the 2026-05-07 monorepo consolidation commit (`792d172`) and is reflected in the root `CLAUDE.md` "Repo Topology" table.

## Subprojects

| Project | Path | Role |
|---------|------|------|
| Medical Zettelkasten MCP | `Medical-Zettelkasten-MCP/` | Algorithmic graph engine (10 MCP tools, stdio transport, no LLM) |
| OpenClaw Command Center | `obsidian-command-center/` | Obsidian plugin — agent dispatch, monitoring, vault notes. Owns the additive `:8799` HTTPS bridge (**32 tools** as of 2026-09-22 = 7 vault + 16 `obsidian_openclaw_*` + 7 `zk_*` + 2 `video_pipeline_*`; corrected 2026-10-07, this row said 11). Since 2026-10-07 `obsidian_openclaw_run_workflow` takes `dry_run`, `obsidian_openclaw_status` reports a per-stage `post_run` ledger, and a gate refusal has its own code (not armed / expired / token mismatch) — details in the plugin's `CLAUDE.md`. Directory renamed 2026-06-30; plugin id is now `command-center`. |
| Obsidian Bridge Launcher | `obsidian-bridge-launcher/` | Obsidian plugin — spawns the canonical MCP bridge child process on `:8798` tied to Obsidian's plugin host lifecycle. Owns the fd-3 line-delimited JSON-RPC IPC channel (`BRIDGE_IPC_FD=3`) used for renderer-scope console capture and gated eval. Bridge **code** lives in `Copilot-Everything/bridges/obsidian-copilot-bridge/`; this plugin owns only the lifecycle. |
| Obsidian Vault Zettelkasten | `obsidian-vault-zettelkasten/` | Obsidian plugin — hosts the in-process `ZettelkastenService` (LLM-driven, vault-grounded). Migrated here 2026-04-11 from the now-deleted backend emulator on `:8789`. Consumes Miyo via `:8743` HTTPS proxy, Qdrant via `:6433` HTTPS proxy, and the hosted `copilot-plus-flash` model (no local runtime as of 2026-07-23). |
| Trevor Robey INC Research Memory MCP | `trevorobeyinc-research-memory-mcp/` | Stdio MCP server. Qdrant-backed pack storage via `:6433` HTTPS proxy. Auto-ingested by the Command Center plugin after workflow completion, and (since 2026-09-22) by the engine's own post-run step through `dist/cli.js` — idempotent on content hash — (switch `config/vault-publish.json` `researchMemory.enabled`, ON since 2026-09-22). The embedder is **offline by default** (`src/embed.ts`: remote model loading only with `EMBED_ALLOW_REMOTE=1`, which only the operator's one-time `scripts/research-memory.js ingest --allow-remote-model` sets; a cache miss fails loudly with `EMBED_MODEL_NOT_CACHED`); the nomic model lives in `node_modules/@xenova/transformers/.cache/`. Never ingested before 2026-09-22 — Qdrant held only the `miyo` collection; `trevorobeyinc-packs` was created and first filled that day. |
| Viz Studio | `obsidian-viz-studio/` | Obsidian plugin (id `trinc-viz-studio`, added 2026-08-16) — local visualization rendering into the vault: mermaid diagrams (native fence or SVG/PNG export via Obsidian's bundled `loadMermaid()`), dependency-free SVG charts, JSONCanvas boards, metadata-cache link-graph snapshots, and **Guided Learning explainer cards** (`viz_guided` — staged pedagogical diagram + legend + step key composed into one SVG, 4 presets). Grew 2026-08-19 → 08-28 to add perceptual maps, visualize-language **card diagrams** (`viz_diagram`), **stat tiles / KPI rows** (`viz_stat_tiles`), **UI mockups** (`viz_mockup`), and **interactive HTML explainers** (`viz_interactive` — strict no-network CSP, opens in the system browser, never bundle-eligible). Owns the additive `:8800` HTTPS bridge (**12 `viz_*` tools** as of 2026-08-28; bearer token at `~/.config/trinc-viz-studio/bridge-token`). Consumers: both Copilot agent-chat lanes + the engine's `viz-bridge-mcp` adapter. Tool results are text-only by platform constraint — every tool writes into `Visualizations/` and returns an `![[embed]]` string. |
| Outbound `claude` CLI bridge ⚠️ **RETIRED 2026-05-31** | `.archive/claude-cli-bridge/` | **Retired** — superseded by the native Claude Desktop Code tab; archived to `Claude/.archive/claude-cli-bridge/` (history + LEARNINGS preserved). Was a stdio MCP server wrapping the local `claude` CLI for OUTBOUND delegation. See the root `CLAUDE.md` deletion log; do not reintroduce. |


> **Plugin display names vs IDs (2026-07-23; Viz Studio added 2026-08-16).** The Obsidian plugins
> are display-branded as the **TR-Obsidian Intelligence Network Citations** suite (Command Center ·
> Zettelkasten · Bridge Launcher · Wiki Definitions · Viz Studio) so they group together in
> Obsidian's plugin list. Their **plugin IDs are FROZEN** (`command-center`, `vault-zettelkasten`,
> `obsidian-bridge-launcher`, `contextual-wiki-definitions`, `trinc-viz-studio`) and must never be
> renamed: Copilot's 23 `mcp_command-center_*` + 12 `mcp_viz-studio_*` MCP tool ids (Quick-Chat lane, as of 2026-08-28) and
> `mcp.servers[].id`, the wiki-definition plugin's `plugins['vault-zettelkasten']` api lookup (a
> **separate git repo**), Command Center's own lookup in `zettelkasten/linker.ts`, the 0600 tokens
> at `~/.config/openclaw-command-center/bridge-token` and `~/.config/trinc-viz-studio/bridge-token`,
> the fork's `ACP_MCP_CAPABLE_SERVER_IDS` allow-set (`command-center`, `viz-studio`), the engine's
> `viz-bridge-mcp` adapter, and the on-disk directory names under `.obsidian/plugins/` all key on
> the IDs, not the names. (Note the Viz Studio *fork server id* is `viz-studio` — deliberately
> shorter than the plugin id so Lane A tool ids stay readable.)

## Outbound `claude` CLI bridge — `claude-cli-bridge/` ⚠️ RETIRED 2026-05-31

> **RETIRED 2026-05-31 — superseded by the native Claude Desktop Code tab.** The code below is
> archived to `Claude/.archive/claude-cli-bridge/` (git history + `.learnings/LEARNINGS.md` preserved)
> and is **no longer wired into the topology or registered with Claude Desktop**. The section is kept
> as reference for the recursion-guard / heartbeat / keychain-ACL learnings only. Do not reintroduce a
> custom `claude -p` subprocess bridge or a `claude mcp serve` registration. See the root `CLAUDE.md`
> deletion log.

`claude-cli-bridge/` is the **inverse** of `claude mcp serve`. Where `claude mcp serve` exposes Claude Code's tools INTO an MCP client (the inbound direction registered in Claude Desktop as the `claude-code` server), `claude-cli-bridge` exposes the local `claude` CLI OUT — letting an MCP client (e.g. Claude Desktop chat) push a button and have a fresh, isolated `claude -p` subprocess go do an entire sub-task and hand the answer back.

Tools exposed (stdio MCP, single Node entry at `claude-cli-bridge/index.mjs`):

| Tool | Purpose |
|---|---|
| `claude_run` | One-shot prompt in a fresh session. Returns response text + `session_id` for chaining. |
| `claude_resume` | Continue a prior session by `session_id`. Optional `fork_session: true` clones instead of mutates. |
| `claude_version` | Sanity check — returns `claude --version` output. |
| `claude_diag` | Report the bridge subprocess's HOME/USER/PATH and `claude auth status` from inside the bridge's env. Use when `claude_run` reports "Not logged in" — usually a keychain-ACL mismatch fixed by setting `CLAUDE_CODE_OAUTH_TOKEN` in the parent MCP client's env block. |

**Recursion guard.** Every `claude -p` spawn carries `--strict-mcp-config` plus a temp-file MCP config containing only `{"mcpServers": {}}`. The spawned subprocess therefore sees zero `mcp__*` tools and cannot call `claude-cli-bridge` (or any other MCP server) back. Caller-supplied `mcp_config` is honored but the `claude-cli-bridge` entry is auto-stripped before forwarding.

**Auth.** The bridge inherits its env from the parent MCP client. Auth flows through `process.env.CLAUDE_CODE_OAUTH_TOKEN`, populated by Claude Desktop's `mcpServers["claude-cli-bridge"].env` block. Token is generated via `claude setup-token` and lives in the chmod-600 + `chflags uchg`-locked `~/Library/Application Support/Claude/claude_desktop_config.json`. **Why not keychain:** macOS Keychain ACLs are bundle-identifier-specific, and Claude Desktop's `disclaimer` helper has a different bundle ID than whatever process did the original `claude auth login` — so keychain reads silently fail and the spawned `claude` thinks it's not logged in. The env-var route bypasses the ACL entirely.

**HTTPS-only invariant.** N/A — stdio transport, no TCP listener, exempt from `scripts/lint-transport-monorepo.sh`.

**Argument-passing gotcha.** `claude --mcp-config <configs...>` is a variadic flag — it would swallow any positional args following it. The bridge therefore writes its temp MCP config to a file (single arg), passes the file path to `--mcp-config`, and feeds the prompt via stdin instead of as a positional. Don't refactor that without preserving the stdin-prompt invariant.

**Heartbeat.** Long subprocesses emit MCP `notifications/progress` events every 20s when the calling client supplies a `_meta.progressToken`, so per-request client timeouts (Claude Desktop's default ~60s) don't fire mid-call.

**History.** Originally lived at `~/.claude/mcp-servers/claude-cli-bridge/`, then moved into the monorepo at `Copilot-Everything/bridges/claude-cli-bridge/` (commit 9df72c0), then relocated here to `Claude/claude-cli-bridge/` for conceptual fit alongside the other Claude-tooling MCP servers (Medical Zettelkasten, Research Memory). See `claude-cli-bridge/.learnings/LEARNINGS.md` for the three discoveries from the build session (heartbeat fix, permission-mode gating, keychain-ACL bundle-ID issue).

## Multi-Operator Topology, Port Map, Startup Order

**Canonical source of truth**: [`/Users/myhome/TrevClaw-Obsidianodus/CLAUDE.md`](../CLAUDE.md) (root monorepo CLAUDE.md). It owns the operator-topology diagram, the unified port map (`:8798`, `:8799`, `:8743`, `:6433`, `:8891`, etc.), the TLS proxy table, and the startup order. This file used to duplicate that content; it is now stale-prone, so all questions about ports, protocols, ownership, or startup sequence MUST be answered from the root file.

This workspace's role-within-the-topology, in one sentence: Claude Hub owns the Obsidian-plugin lifecycle for the three HTTPS bridges (`:8798` canonical via `obsidian-bridge-launcher`; `:8799` additive via `obsidian-command-center`; `:8800` additive via `obsidian-viz-studio`) and houses the stdio MCP servers that those plugins spawn (Medical Zettelkasten MCP, Research Memory MCP).

## Workspace Conventions

- Session artifacts (exploration reports, test scripts, status snapshots) go to `.archive/`, not the workspace root

## Web App Cloning Toolkit

This workspace is the primary environment for cloning web apps into localhost servers. The following tools and skills are available:

### Browser Tools (MCP Servers)

| MCP Server | Tools Prefix | Capabilities | Best For |
|------------|-------------|--------------|----------|
| Claude Browser pane | `mcp__Claude_Browser__*` | navigate / read / click / type / JS eval / console / network in an isolated in-app Chromium | ALL browser work: reference captures, localhost verification, live comparison, and signed-in consoles. The only browser lane (cb-armed per session). |
| macOS connector | `mcp__Macos__*` | Shell / Snapshot / Click / Type — lane-agnostic OS glue | Native dialogs (Save / file pickers), pasting into other apps, shell. |
| computer-use | `mcp__computer-use__*` | Desktop screenshots, mouse/keyboard control | Disabled 2026-07-25 (Accessibility + Screen Recording revoked for Claude). |
| Claude Preview | `mcp__Claude_Preview__*` | Dev server management, page snapshots, console logs, screenshots, click/fill/eval | **Status: [NEEDS CLARIFICATION]** — verify still active in the operator's Claude Desktop config. |

No other browser-automation tool exists on this machine, by operator decision (2026-09-18), and
none may be installed for a cloning job.

### Cloning Workflow (Proven Pattern)

1. **Recon**: the Claude Browser pane to capture reference screenshots, DOM snapshots, network requests, inline script extraction.
2. **Source**: Check for open-source repo on GitHub first. Extract rendering parameters, algorithms, and configurations from source code.
3. **Diff**: Compare reference captures against localhost implementation. Generate delta tables.
4. **Implement**: Fix deltas one by one. Commit after each fix. Run regression tests after each commit.
5. **Verify**: the Claude Browser pane for both localhost verification AND live SaaS comparison — one browser surface for both legs cuts profile-drift risk.
6. **Regress**: the cloned project's own unit test suite — must stay green after every change.
7. **Polish**: Final click-through test of every interactive element via the Claude Browser pane.

### Key Learnings from Past Cloning Work

- HAR captures of SaaS marketing pages are useless — they contain analytics JS, not app logic. Always check for an open-source repo first.
- Runtime parameter extraction via the Claude Browser pane's javascript_tool is the fallback when source code isn't available (React closures, minified bundles).
- FA2 layout parameters have the biggest visual impact — scalingRatio and slowDown being off by 10-100x produces completely different graph layouts.
- CSP bugs can silently block web workers — always check workerSrc includes 'blob:' for libraries that use Worker threads.
- Sigma.js v1 (canvas 2D) vs v3 (WebGL) have inherent rendering differences. Parameter matching gets ~95% visual parity; the remaining 5% is renderer-specific.

## Related Workspaces

| Workspace | Path (relative to monorepo root) | Role |
|-----------|----------------------------------|------|
| Copilot-Everything | [`../Copilot-Everything/`](../Copilot-Everything/) | Obsidian plugin fork (vendored at `repos/obsidian-copilot-mcp/`), canonical MCP bridge (`bridges/obsidian-copilot-bridge/` → `:8798`), consolidated stdio adapter, ~~claude-cli-bridge~~ (retired 2026-05-31 → `Claude/.archive/`), three HTTPS TLS proxies (Miyo / Qdrant / SearXNG); LM Studio and Ollama proxies were removed 2026-07-16 / 2026-07-23. |
| Trevor Robey Intelligence Network Citations (engine + brand) | [`../Trevor Robey Intelligence Network Citations/`](../Trevor%20Robey%20Intelligence%20Network%20Citations/) | Single consolidated folder — flat-merged 2026-05-19 from the two former siblings `trevor-robey-inc-agents/` (engine) + `trevor-robey-inc/` (brand); those folder names no longer exist on disk. Holds BOTH (a) the citation-traced biomedical due-diligence **engine** (on-demand subprocess `node scripts/run-workflow.js`, no persistent gateway; backend emulator at `:8789` retired 2026-04-11) AND (b) the **brand/commercial** project (LLC formation paperwork, six-SKU offering ladder, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md`, `NOTICE.md`, numbered dirs `00-…15-`). Authoritative customer-facing copy authority is the `trevor-robey-inc-brand-guardian` skill, not this folder. |
