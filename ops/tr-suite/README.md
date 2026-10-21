# TR suite operations

One place that says what every TR-Obsidian Intelligence Network Citations component is,
where its source lives in this monorepo, where it is deployed, and how to check it.

| File | What it does |
|---|---|
| `manifest.json` | Registry of every Obsidian plugin, bridge, Raycast piece and MCP server, with source path, deploy target and port. Update it whenever a component is added or moved. |
| `verify.sh` | Read-only check: sources present, deployed builds byte-identical to source builds, MCP registrations resolve, Raycast template carries no key, no nested repos, no secret-shaped files tracked. Exit 1 on any FAIL. |
| `install-raycast.sh` | Installs the Raycast AI providers file from the repo template (never overwrites the live one, which holds the licence key) and builds the Raycast extension. |
| `absorb-external-plugins.sh` | One-time: pulls `origin-nest` and `contextual-wiki-definitions` into `Claude/` with their git history (git subtree). Needs a clean working tree and a signed commit. |

Run from anywhere:

```
bash /Users/myhome/TrevClaw-Obsidianodus/ops/tr-suite/verify.sh
```

## What stays outside this repo on purpose

- `trinc-security-bridge` and the MCP hook gates: `~/Security Everything` (security control
  plane kept separate from the research stack).
- Secrets and machine state: `~/.config/raycast/config.json`, `~/.config/raycast/ai/providers.yaml`,
  `~/.perseus-vault/*`, bridge `.env.local` / `*.local.json` / `*.pem`.
- Third-party servers: `perseus-vault` binary, `opencode-mcp`.
