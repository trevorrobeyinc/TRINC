# Claude Hub — opencode instructions

> **opencode mirror (created 2026-08-09).** This is the opencode counterpart to the `CLAUDE.md`
> next to it: same rules, worded for opencode. Claude surfaces read `CLAUDE.md`; opencode reads
> this file. If both twins are in your context, treat them as ONE description of the same stack
> and let this file's wording govern opencode behavior. When you change a rule, update both.

Central organizational workspace housing all Claude-assisted projects for the biomedical research intelligence stack.

> **📌 Shared Continuity Board:** the cross-surface work log lives at the repo root —
> [`../_continuity/CONTINUITY.md`](../_continuity/CONTINUITY.md). All four Claude surfaces (CLI
> Claude Code, Desktop Claude Code, Cowork, Claude Chat) **and opencode** read it at session start
> and prepend on progress/handoff. See [`../_continuity/README.md`](../_continuity/README.md).

## Why this workspace exists (vs `Copilot-Everything/`)

The split is **ownership-based**, not artifact-type-based:

- **`Claude/`** holds code **we built and maintain** — plugins and MCP servers authored in-house. Three of the entries below are Obsidian plugins, one is a standalone MCP server, one is the (retired) outbound `claude` CLI bridge — all of them ours, all of them iteratively developed here.
- **`Copilot-Everything/`** holds the **vendored obsidian-copilot fork** at `Copilot-Everything/repos/obsidian-copilot-mcp-v4/` plus the **canonical HTTPS bridge daemon** at `Copilot-Everything/bridges/obsidian-copilot-bridge/` that talks to it. Nothing in there should be code we authored from scratch — that workspace exists so the upstream fork stays cleanly scoped and re-syncable.

If you ever wonder "this Obsidian plugin is ours, why isn't it under `Copilot-Everything/` with the other Obsidian stuff?" — that's the answer. Obsidian plugins WE wrote live here; the obsidian-copilot fork lives there. The taxonomy was set deliberately during the 2026-05-07 monorepo consolidation commit (`792d172`) and is reflected in the root `AGENTS.md` "Repo Topology" table.

## Subprojects

| Project | Path | Role |
|---------|------|------|
| Medical Zettelkasten MCP | `Medical-Zettelkasten-MCP/` | Algorithmic graph engine (10 MCP tools, stdio transport, no LLM). **No longer spawned by Command Center** — its stdio lane was retired 2026-08-20 (vault-zettelkasten's in-process api is the lane of record); code kept on disk, unused. |
| OpenClaw Command Center | `obsidian-command-center/` | Obsidian plugin — agent dispatch, monitoring, vault notes. Owns the additive `:8799` HTTPS bridge (**30 tools** = 7 vault + 14 OpenClaw engine + 7 `zk_*` + 2 video; engine suite added 2026-08-20). Directory renamed 2026-06-30; plugin id is now `command-center`. |
| Obsidian Bridge Launcher | `obsidian-bridge-launcher/` | Obsidian plugin — spawns the canonical MCP bridge child process on `:8798` tied to Obsidian's plugin host lifecycle. Owns the fd-3 line-delimited JSON-RPC IPC channel (`BRIDGE_IPC_FD=3`) used for renderer-scope console capture and gated eval. Bridge **code** lives in `Copilot-Everything/bridges/obsidian-copilot-bridge/`; this plugin owns only the lifecycle. |
| Obsidian Vault Zettelkasten | `obsidian-vault-zettelkasten/` | Obsidian plugin — hosts the in-process `ZettelkastenService` (LLM-driven, vault-grounded). Migrated here 2026-04-11 from the now-deleted backend emulator on `:8789`. Consumes Miyo via `:8743` HTTPS proxy, Qdrant via `:6433` HTTPS proxy, and the hosted `copilot-plus-flash` model (no local runtime as of 2026-07-23). |
| Trevor Robey INC Research Memory MCP | `trevorobeyinc-research-memory-mcp/` | Stdio MCP server. Qdrant-backed pack storage via `:6433` HTTPS proxy. Auto-ingested by the Command Center plugin after workflow completion. |
| Outbound `claude` CLI bridge ⚠️ **RETIRED 2026-05-31** | `.archive/claude-cli-bridge/` | **Retired** — superseded by the native Claude Desktop Code tab; archived to `Claude/.archive/claude-cli-bridge/` (history + LEARNINGS preserved). Was a stdio MCP server wrapping the local `claude` CLI for OUTBOUND delegation. See the root `AGENTS.md` deletion log; do not reintroduce. |

> **Plugin display names vs IDs (2026-07-23).** The Obsidian plugins are display-branded as the
> **TR-Obsidian Intelligence Network Citations** suite (Command Center · Zettelkasten · Bridge
> Launcher · Wiki Definitions) so they group together in Obsidian's plugin list. Their **plugin IDs
> are FROZEN** (`command-center`, `vault-zettelkasten`, `obsidian-bridge-launcher`,
> `contextual-wiki-definitions`) and must never be renamed: Copilot's `mcp_command-center_*` MCP
> tool ids (23 enabled as of 2026-08-20) and `mcp.servers[].id`, the wiki-definition plugin's `plugins['vault-zettelkasten']`
> api lookup (a **separate git repo**), Command Center's own lookup in `zettelkasten/linker.ts`,
> the 0600 token at `~/.config/openclaw-command-center/bridge-token`, and the on-disk directory
> names under `.obsidian/plugins/` all key on the IDs, not the names.

## Outbound `claude` CLI bridge — ⚠️ RETIRED 2026-05-31

> **RETIRED 2026-05-31 — superseded by the native Claude Desktop Code tab.** The code is archived
> to `Claude/.archive/claude-cli-bridge/` (git history + `.learnings/LEARNINGS.md` preserved) and
> is **no longer wired into the topology or registered with Claude Desktop**. The full historical
> section (recursion guard, keychain-ACL auth, heartbeat, argument-passing gotcha) is preserved in
> the CLAUDE.md twin of this file. Do not reintroduce a custom `claude -p` subprocess bridge or a
> `claude mcp serve` registration. See the root `AGENTS.md` deletion log.

## Multi-Operator Topology, Port Map, Startup Order

**Canonical source of truth**: [`/Users/myhome/TrevClaw-Obsidianodus/AGENTS.md`](../AGENTS.md)
(root monorepo instructions; the CLAUDE.md twin carries identical content). It owns the
operator-topology diagram, the unified port map (`:8798`, `:8799`, `:8743`, `:6433`, `:8891`,
etc.), the TLS proxy table, and the startup order. All questions about ports, protocols,
ownership, or startup sequence MUST be answered from the root file.

This workspace's role-within-the-topology, in one sentence: Claude Hub owns the Obsidian-plugin lifecycle for the two HTTPS bridges (`:8798` canonical via `obsidian-bridge-launcher`; `:8799` additive via `obsidian-command-center`) and houses the Research Memory stdio MCP/CLI that Command Center spawns (the Medical Zettelkasten stdio spawn was retired 2026-08-20 — Zettelkasten now runs in-process via the vault-zettelkasten plugin api).

## Workspace Conventions

- Session artifacts (exploration reports, test scripts, status snapshots) go to `.archive/`, not the workspace root

## Web App Cloning Toolkit

This workspace is the primary environment for cloning web apps into localhost servers.

### Skill

| Skill | Path | Purpose |
|-------|------|---------|
| `web-app-clone` | `~/.claude/skills/web-app-clone/` | 7-phase SOP: recon, capture, diff, implement, verify, regress, polish. Includes bundled scripts for design token extraction, API capture, and validation. (Shared skills dir — loaded into opencode too.) |

### Browser Tools (Claude-surface MCP servers — reference)

The browser lane is registered on the **Claude surfaces**, not in opencode's MCP config (opencode
has no browser MCP). The only browser lane is the **Claude Browser pane** (`mcp__Claude_Browser__*`,
cb-armed); the tool table lives in the CLAUDE.md twin. No other browser-automation tool exists on
this machine, by operator decision (2026-09-18), and none may be installed.

### Cloning Workflow (Proven Pattern)

The 7 phases apply to any surface with the requisite tools; where Claude uses chrome-devtools
MCP (Lane B debug Canary), an opencode session would use whatever browser MCP is registered for
it (none today — until then opencode's cloning work is source-code-side: steps 2–4 and 6).

1. **Recon**: capture reference screenshots, DOM snapshots, network requests, inline script extraction.
2. **Source**: Check for open-source repo on GitHub first. Extract rendering parameters, algorithms, and configurations from source code.
3. **Diff**: Compare reference captures against localhost implementation. Generate delta tables.
4. **Implement**: Fix deltas one by one. Commit after each fix. Run regression tests after each commit.
5. **Verify**: single debug-browser surface for both localhost verification AND live SaaS comparison cuts profile-drift risk.
6. **Regress**: the cloned project's own test suite must stay green after every change.
7. **Polish**: Final click-through test of every interactive element.

### Key Learnings from Past Cloning Work

- HAR captures of SaaS marketing pages are useless — they contain analytics JS, not app logic. Always check for an open-source repo first.
- Runtime parameter extraction via `evaluate_script()` is the fallback when source code isn't available (React closures, minified bundles).
- FA2 layout parameters have the biggest visual impact — scalingRatio and slowDown being off by 10-100x produces completely different graph layouts.
- CSP bugs can silently block web workers — always check workerSrc includes 'blob:' for libraries that use Worker threads.
- Sigma.js v1 (canvas 2D) vs v3 (WebGL) have inherent rendering differences. Parameter matching gets ~95% visual parity; the remaining 5% is renderer-specific.

## Related Workspaces

| Workspace | Path (relative to monorepo root) | Role |
|-----------|----------------------------------|------|
| Copilot-Everything | [`../Copilot-Everything/`](../Copilot-Everything/) | Obsidian plugin fork (vendored at `repos/obsidian-copilot-mcp-v4/`), canonical MCP bridge (`bridges/obsidian-copilot-bridge/` → `:8798`), consolidated stdio adapter, three HTTPS TLS proxies (Miyo / Qdrant / SearXNG); LM Studio and Ollama proxies were removed 2026-07-16 / 2026-07-23. |
| Trevor Robey Intelligence Network Citations (engine + brand) | [`../Trevor Robey Intelligence Network Citations/`](../Trevor%20Robey%20Intelligence%20Network%20Citations/) | Single consolidated folder — flat-merged 2026-05-19 from the two former siblings `trevor-robey-inc-agents/` (engine) + `trevor-robey-inc/` (brand); those folder names no longer exist on disk. Holds BOTH the citation-traced biomedical due-diligence **engine** and the **brand/commercial** project. Authoritative customer-facing copy authority is the `trevor-robey-inc-brand-guardian` skill, not this folder. |
