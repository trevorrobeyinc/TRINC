# TR suite operations

One place that says what every TR-Obsidian Intelligence Network Citations component is,
where its source lives in this monorepo, where it is deployed, and how to check it.

| File | What it does |
|---|---|
| `manifest.json` | Registry of every Obsidian plugin, bridge, Raycast piece and MCP server, with source path, deploy target and port. Update it whenever a component is added or moved. |
| `verify.sh` | Read-only check: sources present, deployed builds byte-identical to source builds, MCP registrations resolve, Raycast template carries no key, no nested repos, no secret-shaped files tracked. Exit 1 on any FAIL. |
| *(Raycast)* | The Raycast extension, its installer and its providers template moved to `~/Code/raycast-obsidian-bridge-fork` on 2026-10-23 (personal tooling). `manifest.json` still lists it as external, and `verify.sh` still checks the template carries no key. |

Run from anywhere:

```
bash /Users/myhome/TRINC/ops/tr-suite/verify.sh
```

## What stays outside this repo on purpose

- `trinc-security-bridge` and the MCP hook gates: `~/Security Everything` (security control
  plane kept separate from the research stack).
- Secrets and machine state: `~/.config/raycast/config.json`, `~/.config/raycast/ai/providers.yaml`,
  `~/.perseus-vault/*`, bridge `.env.local` / `*.local.json` / `*.pem`.
- Third-party servers: `perseus-vault` binary. (`opencode-mcp`, the Claude → opencode delegation
  worker, was retired 2026-10-23; its clone is in `~/.Trash/trinc-reorg-2026-10-23/`.)
