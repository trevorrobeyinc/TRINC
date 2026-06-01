# ARCHIVED — claude-cli-bridge (retired 2026-05-31)

This `claude-cli-bridge` MCP server was **retired on 2026-05-31** and moved here under
`Claude/.archive/` during the post-wipe recovery. It is kept for reference only; it is no longer
registered with Claude Desktop, no longer wired into the topology, and should not be reintroduced.

**Why retired.** Claude Desktop now has a **native Code tab** (Claude Code running inside Desktop's own
UI). That natively supersedes *both* directions of the old custom orchestration layer: the **OUTBOUND**
`claude-cli-bridge` (which spawned an isolated `claude -p` subprocess via a stdio MCP `claude_run` /
`claude_resume` tool) **and** the **INBOUND** `claude mcp serve` registration (which exposed Claude
Code's tools to Desktop). Neither is needed when Claude Code is driven directly from the Desktop Code
tab. See the root `CLAUDE.md` deletion log and `ARCHITECTURE.md` Multi-Operator Topology.

**What is preserved here.** The full source (`index.mjs`), its lockfile/manifest, and — most importantly
— `.learnings/LEARNINGS.md`, which records three hard-won discoveries from the original build session and
remains valuable reference even though the bridge itself is retired:
- the ~20 s MCP `notifications/progress` heartbeat that defeats the client's ~60 s per-request timeout;
- using `permission_mode: acceptEdits` + a named `allowed_tools` allowlist to avoid Claude Desktop's
  auto-mode classifier (which blocks `bypassPermissions`);
- the macOS Keychain-ACL bundle-ID mismatch that forces auth through `CLAUDE_CODE_OAUTH_TOKEN` rather
  than a keychain read.

**Do not reintroduce** a custom `claude -p` subprocess bridge or a `claude mcp serve` registration —
drive Claude Code through the native Desktop Code tab instead. Git history follows the move
(`git log --follow Claude/.archive/claude-cli-bridge/index.mjs`).
