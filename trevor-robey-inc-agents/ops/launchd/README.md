# ops/launchd — OpenClaw user LaunchAgents, OCRA-rooted

These files replace the legacy `~/Library/LaunchAgents/com.openclaw.*` plists
whose `ProgramArguments` used to point at `/Users/trevorrobey/AI-Agent-BountyHunt/`.
After installing from here, AABH can be removed without breaking any agent.

## What's here

| File | Purpose |
|---|---|
| `com.trevorrobeyinc.agents.mcp.plist` | LaunchAgent template for the `openclaw-github-pro-mcp` MCP server |
| `launch-mcp.sh` | Wrapper the agent shells out to — resolves its own location, loads secrets, execs node |
| `install-mcp.sh` | One-shot installer — runs `npm ci`, copies the plist, `launchctl bootstrap`s it |
| `uninstall-mcp.sh` | Unloads and trashes the MCP plist |
| `retire-bridge.sh` | Unloads and trashes the legacy `com.openclaw.bridge` plist — see notes below |

## Peel-away status

- **com.trevorrobeyinc.agents.mcp — RETIRED (not peeled).** The `github-pro-mcp` server
  is a pure stdio MCP (`StdioServerTransport` only — confirmed in
  `../openclaw-bridge/github-pro-mcp/src/server.ts`). Stdio MCPs are
  spawned on demand by MCP clients (VS Code Agent Mode, Claude Desktop,
  Claude Code), not run as daemons. Running one under `launchd` with
  `KeepAlive=true` produces a crash-loop (agent exits on first stdin EOF,
  launchd relaunches, repeat). The pre-existing
  `~/Library/Logs/openclaw-mcp.err.log` had grown to ~42 MB of nothing
  but relaunch banners — evidence of months of wasted respawn. The plist
  has been trashed; the server source lives on in OCRA at
  `../openclaw-bridge/github-pro-mcp/` so any MCP client can be configured
  to spawn it directly (see "Using the MCP from a client" below).

- **com.openclaw.bridge — RETIRED.** OCRA's own
  `openclaw-bridge/bridge/server.ts` is a security-hardened clean-room
  redesign (enforced by `scripts/verify-phase26-policy.sh`); it is not a
  drop-in replacement for AABH's legacy compiled `dist/bridge/server.js`.
  The legacy agent was not loaded at the time of retirement, so removing
  its plist has zero live-service impact. When OCRA's bridge is ready
  for production, ship a fresh plist here under a new label
  (e.g. `com.openclaw-ocra-bridge`) rather than resurrecting the legacy one.

- **ai.openclaw.gateway — out of scope.** That agent points at
  `~/.openclaw/bin/launch-gateway.sh` and never touched AABH. It is not
  managed from this directory.

## Using the MCP from a client

Register the server with whichever MCP client needs it — do NOT re-install
the launchd agent.

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "openclaw-github-pro": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/trevorrobey/trevor-robey-inc-agents/openclaw-bridge/github-pro-mcp/dist/server.js"],
      "env": {
        "OPENCLAW_BRIDGE_BASE_URL": "http://127.0.0.1:8788"
      }
    }
  }
}
```

### VS Code Agent Mode (`.vscode/mcp.json` or settings)

Point at the same `dist/server.js`. See the server's `SKILL.md` for the
full tool surface.

The `OPENCLAW_BRIDGE_BASE_URL` env is only meaningful when the OCRA bridge
is running on port 8788. With the bridge retired, the MCP falls back to
`router=legacy` and exposes a reduced tool set.

## Install the MCP agent

```
./ops/launchd/install-mcp.sh
```

Inside OCRA root, or call with an absolute path. The installer:
1. Runs `npm ci` inside `openclaw-bridge/github-pro-mcp/` if
   `node_modules/` is missing.
2. Boots out any currently loaded agent named `com.trevorrobeyinc.agents.mcp`.
3. Copies `com.trevorrobeyinc.agents.mcp.plist` to `~/Library/LaunchAgents/`.
4. `launchctl bootstrap gui/$UID ...` loads the new agent.

## Retire the legacy bridge agent

```
./ops/launchd/retire-bridge.sh
```

Run this **before** you delete or archive the old
`/Users/trevorrobey/AI-Agent-BountyHunt` tree. It will
`launchctl bootout` the legacy agent if it happens to be loaded and move
its plist file to the Trash.

## Uninstall the MCP agent

```
./ops/launchd/uninstall-mcp.sh
```

## Verify

```
launchctl print gui/$UID/com.trevorrobeyinc.agents.mcp | grep -E 'state|path|working'
tail -f ~/Library/Logs/openclaw-mcp.log ~/Library/Logs/openclaw-mcp.err.log
```

The MCP listens on the port set by `BRIDGE_PORT` (default `8788`); the plist
env block is the authoritative source for runtime config.

## Secrets

Neither the plist nor the launcher script contains key material. Secrets
come from `~/.openclaw/secrets.env` (sourced by `launch-mcp.sh`). That
file is managed outside this repo — treat its mode as `0600` and never
check it in.
