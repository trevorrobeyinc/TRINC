# obsidian-bridge-adapter

Stdio MCP adapter that tunnels tool calls to a **canonical Obsidian bridge daemon** running over HTTPS with HMAC + replay-guard, instead of letting every MCP client maintain its own Obsidian connection. Lets Claude Code, Claude Desktop, Qwen Chat, Raycast (or any MCP host) all share one bridge — single auth surface, single audit log, single point to swap out backends.

## What it talks to

The bridge daemon's HTTPS endpoint is configured in a single local file (`obsidian-cli-mcp.local.json`) that lives outside this package. The adapter reads it at startup to discover the daemon URL, mkcert CA path, and HMAC auth token. The daemon (separate codebase) routes each call to the **Obsidian Local REST API plugin** (or another configured backend) and returns the result.

```
MCP client ──stdio──► obsidian-bridge-adapter ──HTTPS+HMAC──► canonical bridge daemon ──► Obsidian Local REST API plugin ──► vault
```

## Install

```
npx -y @trevoralexanderrobey/obsidian-bridge-adapter
```

Or as a global command:

```
npm install -g @trevoralexanderrobey/obsidian-bridge-adapter
obsidian-bridge-adapter
```

## Required environment

The adapter needs to find the bridge's local config file. Set `OBSIDIAN_MCP_CONFIG` in your MCP host's spawn env, OR place the config at `~/.config/obsidian-bridge/obsidian-cli-mcp.local.json`.

The config file must contain `transport.tls`, `transport.host`, `transport.port`, and `security.authToken`.

The adapter also needs `NODE_EXTRA_CA_CERTS` pointing at your local CA root (mkcert root CA on macOS is at `~/Library/Application Support/mkcert/rootCA.pem`).

## Profiles

`OBSIDIAN_STDIO_PROFILE`:
- `claude` (default) — exposes the seven canonical `obsidian_*` tools.
- `raycast` — adds `raycast_daily_open`, mapped locally to `obsidian_execute_command id="daily-notes"`.

## MCP host configurations

### Claude Code (user-scope)

```
claude mcp add -s user obsidian-bridge npx -y @trevoralexanderrobey/obsidian-bridge-adapter
```

### Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "obsidian-bridge": {
      "command": "npx",
      "args": ["-y", "@trevoralexanderrobey/obsidian-bridge-adapter"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "/absolute/path/to/obsidian-cli-mcp.local.json",
        "NODE_EXTRA_CA_CERTS": "/path/to/your/mkcert/rootCA.pem"
      }
    }
  }
}
```

### Qwen Chat — "Add MCP via JSON"

```json
{
  "mcpServers": {
    "obsidian-bridge": {
      "command": "npx",
      "args": ["-y", "@trevoralexanderrobey/obsidian-bridge-adapter"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "/absolute/path/to/obsidian-cli-mcp.local.json",
        "NODE_EXTRA_CA_CERTS": "/path/to/your/mkcert/rootCA.pem"
      }
    }
  }
}
```

### Raycast (stdio profile)

```json
{
  "command": "npx",
  "args": ["-y", "@trevoralexanderrobey/obsidian-bridge-adapter"],
  "env": {
    "OBSIDIAN_STDIO_PROFILE": "raycast",
    "OBSIDIAN_MCP_CONFIG": "/absolute/path/to/obsidian-cli-mcp.local.json",
    "NODE_EXTRA_CA_CERTS": "/path/to/your/mkcert/rootCA.pem"
  }
}
```

## License

MIT — see [LICENSE](./LICENSE).
