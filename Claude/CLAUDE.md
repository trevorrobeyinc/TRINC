# Claude Hub

Central organizational workspace housing all Claude-assisted projects for the biomedical research intelligence stack.

## Subprojects

| Project | Path | Role |
|---------|------|------|
| Medical Zettelkasten MCP | `Medical-Zettelkasten-MCP/` | Algorithmic graph engine (10 MCP tools, stdio transport) |
| OpenClaw Command Center | `obsidian-openclaw-command-center/` | Obsidian plugin — agent dispatch, monitoring, vault notes |

## Multi-Operator Topology

Three independent operators share this stack. None is subordinate to the others.

```
Claude Desktop (heavy-lift code/file operator)
  ├── [MCP stdio] → claude-code CLI
  ├── [MCP stdio] → obsidian-bridge adapter → [HTTPS :8798] → Canonical MCP Bridge
  ├── [MCP stdio] → chrome-devtools
  └── [MCP stdio] → filesystem server

OpenClaw Command Center (agent dispatch + monitoring, Obsidian plugin)
  ├── [child_process.spawn()] → OpenClaw Research Agents (stdout JSON events)
  ├── [MCP stdio] → Medical Zettelkasten MCP (post-workflow graph analysis)
  ├── [HTTP :8742] → Miyo semantic search
  └── [HTTP :8799] → Own additive MCP bridge (OpenClaw workflow tools)
```

## Port Map

| Port | Service | Protocol | Owner Workspace | Managed By |
|------|---------|----------|-----------------|------------|
| 8798 | Obsidian MCP Bridge (canonical) | HTTPS | copilot-everything | PM2 |
| 8799 | Command Center Bridge (additive) | HTTPS | claude-hub (Obsidian plugin) | Obsidian plugin lifecycle |
| 8789 | Backend Emulator | HTTP | copilot-everything | PM2 |
| 8742 | Miyo Semantic Search | HTTP | external | External process |
| 6333 | Qdrant Vector DB | HTTP | external | External process |
| 18789 | OpenClaw Gateway | HTTPS | openclaw-agents | LaunchAgent |
| 1234 | LM Studio (optional) | HTTP | external | LM Studio app |

**TLS**: Services on HTTPS use mkcert certificates at `~/.local/share/mkcert/localhost.pem`. All Node.js processes need `NODE_EXTRA_CA_CERTS` pointing to `~/Library/Application Support/mkcert/rootCA.pem`.

## Startup Order

1. PM2 ecosystem in copilot-everything (MCP bridge :8798, backend emulator :8789, OpenClaw bridge :18789)
2. Obsidian (loads Command Center plugin, which starts additive bridge at :8799)

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
| chrome-devtools | `mcp__chrome-devtools__*` | DOM inspection, JS evaluation, screenshots, network capture, Lighthouse audit, performance tracing | Extracting runtime parameters from live SaaS apps (Sigma settings, FA2 configs, inline scripts). Primary tool for capturing what the open-source repo doesn't expose. |
| Claude Preview | `mcp__Claude_Preview__*` | Dev server management, page snapshots, console logs, screenshots, click/fill/eval, CSS inspection | Verifying localhost clone output. Start/stop dev servers, run click-through tests, take comparison screenshots. |
| computer-use | `mcp__computer-use__*` | Desktop screenshots, mouse/keyboard control | Native app interaction, cross-app workflows. Browsers get read-only tier. |
| playwright (MCP) | `mcp__playwright__*` | Browser automation, navigation, form filling, screenshots | Automated regression testing, end-to-end flows. |

### Cloning Workflow (Proven Pattern)

1. **Recon**: chrome-devtools to capture reference screenshots, DOM snapshots, network requests, inline script extraction
2. **Source**: Check for open-source repo on GitHub first. Extract rendering parameters, algorithms, and configurations from source code.
3. **Diff**: Compare reference captures against localhost implementation. Generate delta tables.
4. **Implement**: Fix deltas one by one. Commit after each fix. Run regression tests after each commit.
5. **Verify**: Claude Preview for localhost verification (preview_start, preview_eval, preview_screenshot). chrome-devtools for live SaaS comparison.
6. **Regress**: Playwright tests (npx playwright test) — must stay green after every change.
7. **Polish**: Final click-through test of every interactive element.

### Key Learnings from Past Cloning Work

- HAR captures of SaaS marketing pages are useless — they contain analytics JS, not app logic. Always check for an open-source repo first.
- Runtime parameter extraction via chrome-devtools evaluate_script() is the fallback when source code isn't available (React closures, minified bundles).
- FA2 layout parameters have the biggest visual impact — scalingRatio and slowDown being off by 10-100x produces completely different graph layouts.
- CSP bugs can silently block web workers — always check workerSrc includes 'blob:' for libraries that use Worker threads.
- Sigma.js v1 (canvas 2D) vs v3 (WebGL) have inherent rendering differences. Parameter matching gets ~95% visual parity; the remaining 5% is renderer-specific.

## Related Workspaces

| Workspace | Path | Role |
|-----------|------|------|
| Copilot Everything | `/Users/trevorrobey/THE Copilot in Obsidian Everything` | Obsidian plugin fork, canonical MCP bridge, backend emulator, Miyo |
| trevor-robey-inc-agents (OpenClaw engine) | `/Users/trevorrobey/Code/trevor-robey-inc-agents` | Citation-traced biomedical due diligence engine. On-demand subprocess via `node scripts/run-workflow.js` — no persistent gateway. |
