# claude-cli-bridge — LEARNINGS

## [LRN-20260513-001] best_practice — MCP per-request timeout vs. tool-level timeout

**Logged**: 2026-05-13T05:30:00-07:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
`claude_run` calls were timing out around 60s with `MCP error -32001: Request timed out`, even though `timeout_seconds=1800` was passed. The two timeouts are different clocks.

### Details
There are two independent timeouts in play when an MCP client calls a tool:

1. **MCP per-request timeout** — enforced by the MCP CLIENT (Claude Desktop). Default ~60s in many SDKs. Fires when the server is silent for that long.
2. **Subprocess wallclock timeout** — enforced by the BRIDGE via `setTimeout` + `AbortController` (the `timeout_seconds` tool argument).

The bridge previously awaited the spawned `claude` subprocess's `close` event for up to `timeout_seconds` (default 300, often 1800 for long jobs) without sending any traffic to the MCP client during that wait. The client's 60s timer fired regardless of what we passed.

**Observed failure**: fired a `claude_run` to reverse-engineer Spec Kit specs onto TrevClaw-Obsidianodus. MCP request timed out after ~60s. The spawned `claude` subprocess kept running and finished writing some files before exiting. The work happened; the bridge result never came back.

### Suggested Action
Emit MCP `notifications/progress` from the bridge every ~20s during the subprocess wait. Per MCP spec, each progress notification resets the client's request-timeout deadline. If the incoming request carries `_meta.progressToken`, use it in the notification's `params.progressToken` field; without a token, the notifications won't extend the timeout but also won't hurt.

### Fix Applied (2026-05-13)
- Added `onProgress` parameter to `runClaude()` (around line 73)
- Added a `setInterval` heartbeat (~20s) inside the Promise wrapping the spawn; cleared on `close` and `error` (around lines 137-160)
- In the `CallToolRequestSchema` handler, extracted `request.params?._meta?.progressToken` and built an `onProgress` callback that calls `server.notification({ method: "notifications/progress", params: { progressToken, progress: elapsedSec } })` (around lines 376-393)
- Passed `onProgress` into both `runClaude` call sites (claude_run and claude_resume)
- Total diff: +47 lines, 498 lines total. `node --check` clean.

### Validation
Cannot validate in-session — killing the running bridge process to force respawn was blocked by the auto-mode classifier (correct call: it would disrupt other Claude Desktop sessions). Fix activates on next Claude Desktop restart, after which any long `claude_run` job should return its result instead of throwing `-32001`.

### Metadata
- Source: error
- Related Files: index.mjs (this directory)
- Tags: mcp, timeout, progress-notifications, subprocess
- See Also: MCP spec § "Progress notifications", `@modelcontextprotocol/sdk` v1.27.1

## [LRN-20260513-002] knowledge_gap — Spawning Claude subagents in Claude Desktop is gated

**Logged**: 2026-05-13T05:30:00-07:00
**Priority**: medium
**Status**: resolved

### Summary
`claude_run` with `permission_mode: "bypassPermissions"` was blocked by Claude Desktop's auto-mode classifier ("Create Unsafe Agents"). Surgical `allowed_tools` + `permission_mode: "acceptEdits"` was not blocked.

### Suggested Action
For multi-tool autonomous jobs through the bridge, prefer `permission_mode: "acceptEdits"` combined with a named `allowed_tools` allowlist (e.g., `["Read", "Write", "Edit", "Bash(specify *)", "Bash(ls *)"]`). Document this in the bridge README if added.

### Metadata
- Source: error
- Tags: mcp, permissions, auto-mode, subagent

## [LRN-20260513-003] knowledge_gap — macOS Keychain ACLs are bundle-identifier-specific

**Logged**: 2026-05-13T05:45:00-07:00
**Priority**: high
**Status**: promoted
**Area**: infra

### Summary
The `claude` CLI auth tokens stored by one bundle (e.g., a Claude Code session that ran `claude auth login`) are NOT readable by another bundle (e.g., Claude Desktop's `disclaimer` helper that spawns the bridge), even when both bundles share the same Anthropic team identifier `Q6L2SF6YDW`. Workaround: `claude setup-token` + `CLAUDE_CODE_OAUTH_TOKEN` env var.

### Details
The bridge's first end-to-end test from Claude Desktop returned `"Not logged in · Please run /login"` despite `claude auth status` from a normal terminal showing `loggedIn: true` with a valid Max-subscription session. Diagnostics ruled out env-var corruption (HOME, USER, PATH, LOGNAME all correct in the bridge subprocess via `ps eww`). Code-signing investigation found:

- `claude` binary identifier: `com.anthropic.claude-code`, signed by team `Q6L2SF6YDW`.
- Claude Desktop's MCP-server wrapper: `/Applications/Claude.app/Contents/Helpers/disclaimer`, identifier `disclaimer`, same team `Q6L2SF6YDW`.

Same team, different bundle ID. macOS Keychain ACLs bind to the **specific bundle identifier** of the requesting process, not just team — so the keychain item created when `claude auth login` ran under one bundle (the original auth flow's exec context) is silently inaccessible to the bridge's `disclaimer`-spawned subprocess.

The `claude` CLI binary's strings expose the workaround:
```
ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN env var is required
```

Solution: run `claude setup-token` interactively to mint a long-lived OAuth token, paste it into the bridge entry's `env.CLAUDE_CODE_OAUTH_TOKEN` in `/Users/trevorrobey/Library/Application Support/Claude/claude_desktop_config.json`. The env var bypasses keychain entirely. Token is locked at rest with `chmod 600` + `chflags uchg` (integrity flag — does not block reads). macOS TCC on `~/Library/Application Support/Claude/` provides the actual confidentiality gate against non-Anthropic apps.

### Suggested Action
Future MCP servers that wrap Anthropic CLIs and run under a non-default bundle context (Claude Desktop's `disclaimer` helper, third-party MCP hosts, launchd plists with restricted ACLs) should default to env-var auth (`CLAUDE_CODE_OAUTH_TOKEN`) rather than expecting keychain inheritance. If keychain is required, the token-storing process must run under the same bundle ID as the eventual consumer.

### Metadata
- Source: error
- Related Files:
  - `/Users/trevorrobey/TrevClaw-Obsidianodus/Claude/claude-cli-bridge/index.mjs`
  - `/Users/trevorrobey/Library/Application Support/Claude/claude_desktop_config.json`
- Tags: macos, keychain, code-signing, oauth, claude-cli, bundle-identifier, mcp
- See Also: LRN-20260513-001 (heartbeat fix from same session), LRN-20260513-002 (permission-mode gating)
- Promoted to: `/Users/trevorrobey/TrevClaw-Obsidianodus/Claude/CLAUDE.md` § "Outbound `claude` CLI bridge — `claude-cli-bridge/`" → "Auth" subsection
