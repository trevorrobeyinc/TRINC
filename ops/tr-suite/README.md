# TR suite operations

One place that says what every TR-Obsidian Intelligence Network Citations component is,
where its source lives in this monorepo, where it is deployed, and how to check it.

| File | What it does |
|---|---|
| `manifest.json` | Registry of every Obsidian plugin, bridge and MCP server, with source path, deploy target and, for the three TRINC bridges, the Unix socket they serve on (`socket`; since 2026-11-24 they listen on no TCP port). The Security Bridge keeps its TCP `port`. Update it whenever a component is added or moved. |
| `verify.sh` | Read-only check: sources present, deployed builds byte-identical to source builds, MCP registrations resolve, no nested repos, no secret-shaped files tracked, and the bridges' socket pieces in step (helper and client-block copies identical, one socket path rule in every client, a current build of the vault bridge, an executable deployed stdio proxy). Exit 1 on any FAIL. |
| `uds-health.mjs` | The bridges' health check: `GET /healthz` over each bridge's Unix socket, one status line per bridge, no token read or sent. Name bridges to check only those (`vault-bridge`, `command-center`, `viz-studio`). |
| `bridge-guard-live-check.mjs` | Live check of the browser guard over the three sockets, plus a tripwire that nothing accepts TCP connections on 8798, 8799 or 8800. Run it after a bridge redeploy, with Obsidian open. |
| *(Raycast)* | Retired on 2026-11-21 by operator decision: both video workflows run from the Copilot agent. `manifest.json` keeps a `raycast` block that lists the leftovers the operator removes with Raycast, and `verify.sh` warns while any of them exists. |

Run from anywhere:

```
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs     # the three bridges; Obsidian must be open
```

## What stays outside this repo on purpose

- `trinc-security-bridge` and the MCP hook gates: `~/Security Everything` (security control
  plane kept separate from the research stack).
- Secrets and machine state: `~/.config/raycast/config.json`, `~/.config/raycast/ai/providers.yaml`,
  `~/.perseus-vault/*`, bridge `.env.local` / `*.local.json` / `*.pem`.
- Third-party servers: `perseus-vault` binary. (`opencode-mcp`, the Claude → opencode delegation
  worker, was retired 2026-10-23; its clone is in `~/.Trash/trinc-reorg-2026-10-23/`.)
