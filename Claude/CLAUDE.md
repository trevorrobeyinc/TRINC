# Claude Hub

Central organizational workspace housing all Claude-assisted projects for the biomedical research intelligence stack.

## Why this workspace exists (vs `Copilot-Everything/`)

The split is **ownership-based**, not artifact-type-based:

- **`Claude/`** holds code **we built and maintain** — plugins and MCP servers authored in-house. Three of the entries below are Obsidian plugins, one is a standalone MCP server, one is the outbound `claude` CLI bridge — all of them ours, all of them iteratively developed here.
- **`Copilot-Everything/`** holds the **vendored obsidian-copilot fork** at `Copilot-Everything/repos/obsidian-copilot-mcp/` plus the **canonical HTTPS bridge daemon** at `Copilot-Everything/bridges/obsidian-copilot-bridge/` that talks to it. Nothing in there should be code we authored from scratch — that workspace exists so the upstream fork stays cleanly scoped and re-syncable.

If you ever wonder "this Obsidian plugin is ours, why isn't it under `Copilot-Everything/` with the other Obsidian stuff?" — that's the answer. Obsidian plugins WE wrote live here; the obsidian-copilot fork lives there. The taxonomy was set deliberately during the 2026-05-07 monorepo consolidation commit (`792d172`) and is reflected in the root `CLAUDE.md` "Repo Topology" table.

## Subprojects

| Project | Path | Role |
|---------|------|------|
| Medical Zettelkasten MCP | `Medical-Zettelkasten-MCP/` | Algorithmic graph engine (10 MCP tools, stdio transport, no LLM) |
| OpenClaw Command Center | `obsidian-openclaw-command-center/` | Obsidian plugin — agent dispatch, monitoring, vault notes. Owns the additive `:8799` HTTPS bridge (11 tools = 7 vault + 4 workflow). Directory rename to drop `openclaw` prefix is pending. |
| Obsidian Bridge Launcher | `obsidian-bridge-launcher/` | Obsidian plugin — spawns the canonical MCP bridge child process on `:8798` tied to Obsidian's plugin host lifecycle. Owns the fd-3 line-delimited JSON-RPC IPC channel (`BRIDGE_IPC_FD=3`) used for renderer-scope console capture and gated eval. Bridge **code** lives in `Copilot-Everything/bridges/obsidian-copilot-bridge/`; this plugin owns only the lifecycle. |
| Obsidian Vault Zettelkasten | `obsidian-vault-zettelkasten/` | Obsidian plugin — hosts the in-process `ZettelkastenService` (LLM-driven, vault-grounded). Migrated here 2026-04-11 from the now-deleted backend emulator on `:8789`. Consumes Miyo via `:8743` HTTPS proxy, Qdrant via `:6433` HTTPS proxy, LM Studio via `:1235` HTTPS proxy. |
| Trevor Robey INC Research Memory MCP | `trevorobeyinc-research-memory-mcp/` | Stdio MCP server. Qdrant-backed pack storage via `:6433` HTTPS proxy. Auto-ingested by the Command Center plugin after workflow completion. |
| Outbound `claude` CLI bridge | `claude-cli-bridge/` | Stdio MCP server. Wraps the local `claude` CLI for OUTBOUND delegation (inverse of `claude mcp serve`). Lets a parent MCP client (Claude Desktop chat) shell out to a fresh `claude -p` subprocess. Recursion-isolated. Tools: `claude_run`, `claude_resume`, `claude_version`, `claude_diag`. |

## Outbound `claude` CLI bridge — `claude-cli-bridge/`

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

**Canonical source of truth**: [`/Users/trevorrobey/TrevClaw-Obsidianodus/CLAUDE.md`](../CLAUDE.md) (root monorepo CLAUDE.md). It owns the operator-topology diagram, the unified port map (`:8798`, `:8799`, `:8743`, `:6433`, `:1235`, `:11435`, etc.), the TLS proxy table, and the startup order. This file used to duplicate that content; it is now stale-prone, so all questions about ports, protocols, ownership, or startup sequence MUST be answered from the root file.

This workspace's role-within-the-topology, in one sentence: Claude Hub owns the Obsidian-plugin lifecycle for the two HTTPS bridges (`:8798` canonical via `obsidian-bridge-launcher`; `:8799` additive via `obsidian-openclaw-command-center`) and houses the stdio MCP servers that those plugins spawn (Medical Zettelkasten MCP, Research Memory MCP).

## Workspace Conventions

- Session artifacts (exploration reports, test scripts, status snapshots) go to `.archive/`, not the workspace root

## Web App Cloning Toolkit

This workspace is the primary environment for cloning web apps into localhost servers. The following tools and skills are available:

### Skill

| Skill | Path | Purpose |
|-------|------|---------|
| `web-app-clone` | `~/.claude/skills/web-app-clone/` | 7-phase SOP: recon, capture, diff, implement, verify, regress, polish. Includes bundled scripts for design token extraction, API capture, and validation. |

### Browser Tools (MCP Servers)

| MCP Server | Tools Prefix | Capabilities | Best For |
|------------|-------------|--------------|----------|
| Playwright MCP (`--isolated`) | `mcp__plugin_playwright_playwright__*` | Browser automation, navigation, form filling, screenshots, console capture, network requests | Automated regression testing, end-to-end flows, isolated-profile probes. Default browser surface per the global "Browser MCP Strategy" rule. Bundled Chromium with in-memory profile; safe for destructive/experimental work. |
| Claude in Chrome | `mcp__Claude_in_Chrome__*` | Browser control of the user's real signed-in Chrome session | Tasks that need existing authentication, open tabs, or persistent Chrome profile. Second browser surface per the global rule. |
| computer-use | `mcp__computer-use__*` | Desktop screenshots, mouse/keyboard control | Native macOS app interaction (Maps, Notes, Finder, System Settings). Browsers get read-only / click-only tiers; use the browser MCPs above for actual web automation. |
| Claude Preview | `mcp__Claude_Preview__*` | Dev server management, page snapshots, console logs, screenshots, click/fill/eval, CSS inspection | **Status: [NEEDS CLARIFICATION]** — Verify whether this MCP is still active in the operator's Claude Desktop config. Was used for verifying localhost clone output (start/stop dev servers, click-through tests, comparison screenshots). |
| **sentinel-cdp-mcp** (added 2026-05-19) | `mcp__sentinel-cdp__*` (8 tools) | **Read-only** CDP inspection of a dedicated debug Chrome (Falcon-monitored). `list_tabs` / `get_page_info` / `get_dom_snapshot` / `get_outer_html` / `get_console_log` / `get_network_log` / `get_performance_metrics` / `get_screenshot`. No navigate, click, type, or JS evaluation. | High-sensitivity inspection of anonymous URLs where you want the perimeter defenses on. Lives at `~/bin/sentinel-cdp-mcp/`; registered globally in `~/.claude.json`. Replaces Playwright/Claude-in-Chrome for the read-only-anonymous niche; see `~/bin/sentinel-cdp-mcp/MIGRATION.md` for the capability matrix. |

> chrome-devtools MCP (formerly listed here under the prefix `mcp__chrome-devtools__*`) was fully retired 2026-05-12 — process tree killed, caches/profile clone/npx cache deleted, `chrome-devtools-headless` entry removed from `claude_desktop_config.json`, the `~/Code/chrome-devtools-mcp/` clone removed. See `~/.local/share/browser-tools/CONTEXT-HANDOFF-browser-mcp-downsize.md` for the full purge inventory. Do NOT reintroduce.

### Cloning Workflow (Proven Pattern)

1. **Recon**: Playwright MCP (`--isolated`) to capture reference screenshots, DOM snapshots, network requests, inline script extraction. (Previously chrome-devtools MCP — retired 2026-05-12.)
2. **Source**: Check for open-source repo on GitHub first. Extract rendering parameters, algorithms, and configurations from source code.
3. **Diff**: Compare reference captures against localhost implementation. Generate delta tables.
4. **Implement**: Fix deltas one by one. Commit after each fix. Run regression tests after each commit.
5. **Verify**: Playwright MCP (`--isolated`) for both localhost verification AND live SaaS comparison — single browser surface for both legs cuts profile-drift risk. (Claude Preview MCP status [NEEDS CLARIFICATION] — verify before relying on it.)
6. **Regress**: Playwright tests (`npx playwright test`) in the cloned project — must stay green after every change.
7. **Polish**: Final click-through test of every interactive element via Playwright MCP.

### Key Learnings from Past Cloning Work

- HAR captures of SaaS marketing pages are useless — they contain analytics JS, not app logic. Always check for an open-source repo first.
- Runtime parameter extraction via chrome-devtools evaluate_script() is the fallback when source code isn't available (React closures, minified bundles).
- FA2 layout parameters have the biggest visual impact — scalingRatio and slowDown being off by 10-100x produces completely different graph layouts.
- CSP bugs can silently block web workers — always check workerSrc includes 'blob:' for libraries that use Worker threads.
- Sigma.js v1 (canvas 2D) vs v3 (WebGL) have inherent rendering differences. Parameter matching gets ~95% visual parity; the remaining 5% is renderer-specific.

## Related Workspaces

| Workspace | Path (relative to monorepo root) | Role |
|-----------|----------------------------------|------|
| Copilot-Everything | [`../Copilot-Everything/`](../Copilot-Everything/) | Obsidian plugin fork (vendored at `repos/obsidian-copilot-mcp/`), canonical MCP bridge (`bridges/obsidian-copilot-bridge/` → `:8798`), consolidated stdio adapter, claude-cli-bridge (outbound delegation), four HTTPS TLS proxies (Miyo / Qdrant / LM Studio / Ollama). |
| trevor-robey-inc-agents (powered by OpenClaw) | [`../trevor-robey-inc-agents/`](../trevor-robey-inc-agents/) | Citation-traced biomedical due diligence engine. On-demand subprocess via `node scripts/run-workflow.js` — no persistent gateway. (Path migrated from `/Users/trevorrobey/Code/trevor-robey-inc-agents` during the 2026-05-07 monorepo consolidation. Backend emulator at `:8789` retired 2026-04-11.) |
| trevor-robey-inc (brand / commercial) | [`../trevor-robey-inc/`](../trevor-robey-inc/) | Brand canon, LLC formation paperwork, six-SKU offering ladder, REVENUE_PLAYBOOK, NOTICE. Authoritative customer-facing copy authority is the `trevor-robey-inc-brand-guardian` skill, not this folder. |
