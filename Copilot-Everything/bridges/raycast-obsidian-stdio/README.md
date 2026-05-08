# raycast-obsidian-stdio

Raycast-flavoured stdio MCP server wrapping the Obsidian CLI directly.

## Why this is a sibling of obsidian-mcp-stdio (and not a symlink)

The Claude path (`bridges/obsidian-mcp-stdio/`) is the canonical wrapper.
This Raycast version starts as a near-identical copy on purpose — the goal
isn't to duplicate code today, it's to give Raycast a self-contained MCP
server it can evolve independently. Future Raycast-only additions (extra
tools, alternate timeouts, Raycast-themed defaults) live here without
affecting the Claude wrapper.

If you find yourself diverging by less than ~10 lines six months from now,
consider extracting a shared helper module. Until then, two files is fine.

## Tools

Same as `obsidian-mcp-stdio` plus:

| Name | Description |
|---|---|
| `raycast_daily_open` | Open today's daily note (`obsidian daily`) |

## Configuration

Same env vars as `obsidian-mcp-stdio`:

| Var | Default |
|---|---|
| `OBSIDIAN_VAULT` | `My Digital Garden` |
| `OBSIDIAN_VAULT_ROOT` | `/Volumes/ExtraCurricular/My Digital Garden` |
| `OBSIDIAN_BIN` | `/Applications/Obsidian.app/Contents/MacOS/obsidian` |
| `OBSIDIAN_CLI_TIMEOUT` | `20000` (ms) |

## Migrating Raycast away from the HTTPS daemon

Raycast currently consumes `bridges/raycast-obsidian-mcp/` running as
`node dist/index.js --transport=https` on port 18799. To move Raycast onto
this stdio wrapper, configure your Raycast extension's MCP settings to
spawn this script directly via stdio instead of opening an HTTPS socket.
The exact wiring depends on the Raycast extension's MCP client API, but the
spawn command will look like:

```
/Users/trevorrobey/bin/node \
  /Users/trevorrobey/Code/THE\ Copilot\ in\ Obsidian\ Everything/bridges/raycast-obsidian-stdio/index.mjs
```

Once Raycast is fully migrated and `bridges/raycast-obsidian-mcp/` has no
remaining consumers, you can `pm2 stop raycast-obsidian-mcp` and archive
that folder.
