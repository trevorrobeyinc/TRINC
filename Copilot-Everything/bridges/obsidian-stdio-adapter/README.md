# obsidian-bridge-adapter

Stdio MCP adapter that gives **Claude one door into Obsidian**. It proxies a closed set of tools over
HTTPS to two Obsidian plugin bridges, the Command Center bridge on `:8799` and the Viz Studio bridge on
`:8800`, so a Claude Code session starts and watches research runs through the same plugin the Copilot
agent uses.

> **One profile since 2026-11-21.** The `raycast` profile was retired by operator decision (Raycast is
> removed, and the Copilot agent runs the video pipeline itself). The client for the canonical vault
> bridge on `:8798`, unreachable since 2026-11-18, was deleted with it. The `claude` profile was retired
> on 2026-10-23. Both refuse to start.

## What it talks to

```
Claude Code ──stdio──► obsidian-bridge-adapter ──HTTPS + bearer token──► Command Center bridge (:8799)
                                               └─HTTPS + bearer token──► Viz Studio bridge     (:8800)
```

Each bridge is a separate daemon owned by its own Obsidian plugin, and both stop when Obsidian quits.
The adapter reads each bridge's `0600` bearer token at call time
(`~/.config/openclaw-command-center/bridge-token`, `~/.config/trinc-viz-studio/bridge-token`), so a token
rotation never needs a restart. It reads no other secret and no config file.

## Required environment

- `OBSIDIAN_STDIO_PROFILE=openclaw`. Required: there is no default.
- `NODE_EXTRA_CA_CERTS`, pointing at the local CA root. The mkcert root CA on macOS is at
  `~/Library/Application Support/mkcert/rootCA.pem`, which is also the fallback. HTTPS only: nothing
  falls back to plaintext.

## Profiles

| Profile | Tools | Upstream |
|---|---|---|
| `openclaw` | **Claude's one door**, 27 tools: `obsidian_health`, 12 `obsidian_openclaw_*` tools (start/watch/cancel a research run, read results, history, artifacts, citation integrity, memory search, engine health, delivery evidence, a restricted `publish_vault`), read-only `obsidian_search_notes` + `obsidian_read_note`, and the 12 `viz_*` renders | `:8799` Command Center bridge and `:8800` Viz Studio bridge (`Authorization: Bearer`, each token read per-call). |

Retired, and refused at startup:

| Profile | Retired | Why |
|---|---|---|
| `raycast` | 2026-11-21 | Operator decision: Raycast is removed. Its last two tools, `video_pipeline_run` and `video_pipeline_status`, belong to the Copilot agent, which downloads a link with the `copilot-video-download` skill and then calls Command Center's built-in pipeline. Its 7 `obsidian_*` vault tools and `raycast_daily_open` had gone on 2026-11-18: they were an ungated write lane around Security Everything's YubiKey-gated `Obsidian Vault` server. |
| `claude` | 2026-10-23 | No Claude surface had registered it since 2026-10-07, and its last entry (`Copilot-Everything/.mcp.json` `obsidian-bridge`) was an ungated write lane into the vault. |

Never add a vault-write tool, a video tool or another client's surface here without an operator
decision. `npm run test:profiles` asserts the surface exactly, that both retired profiles refuse to
start, that the video tools are unknown on this door, and that the source holds no `:8798` client.

### The `openclaw` profile — Claude's one door into Obsidian

Purpose: let a Claude Code session start and watch OpenClaw research runs through the
**same door the Copilot agent uses**, so the run is dispatched by the command-center
plugin and its post-run chain (notes, chat bubble, Miyo index, Zettelkasten linking,
research-memory ingest) fires with nobody operating Obsidian. Runbook and the exact
call sequence: the `openclaw-dispatch` skill (see the monorepo `CLAUDE.md`).

- **It does not replace the operator's YubiKey touch.** `obsidian_openclaw_run_workflow`
  still fails closed with `operator_gate_not_armed` / `operator_gate_expired` /
  `operator_gate_token_mismatch` unless a fresh one-shot token was armed
  (`operator-approved-gate arm openclaw`, valid 300 s, one run).
- **Strict client-edge validation** (the daemon re-validates): template ids and input
  keys match `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`; input values are non-empty strings of at
  most 2000 characters, at most 20 fields; **unknown keys are rejected, not ignored**;
  `publish_vault` takes only `workflow_id` + `dry_run` (`force` and `all` are refused);
  no-argument tools reject stray arguments.
- **Structured failures.** A closed Obsidian returns `obsidian_not_running` (nothing was
  sent). A timeout or dropped connection during `run_workflow` returns
  `bridge_timeout_outcome_unknown` / `bridge_connection_lost_outcome_unknown` with the
  instruction to call `obsidian_openclaw_status` and **never re-send**. The adapter never
  retries.
- **Per-tool timeouts** match the daemon's own spawn timeouts (engine health, publish,
  memory search and delivery evidence run for minutes); everything else keeps the shared 30 s.
- **Read-only vault (2026-10-23, decision D5):** `obsidian_search_notes` and
  `obsidian_read_note` on `:8799`, which serves them through Obsidian's own file index (it
  never contains the `.obsidian/` config). Paths must be vault-relative with no `..`
  segment; `search_notes` takes `limit` 1–100.
- **Viz Studio renders (2026-10-23, decisions D4 + D5)** write **only into
  `Visualizations/`**. The 12 names are a closed allowlist in `VIZ_TOOL_NAMES`; their schemas
  come live from `:8800`'s `tools/list` (Viz Studio's `src/bridge/toolSchemas.ts` is the
  contract of record, ~900 lines, so they are not mirrored by hand). Six properties that would
  write elsewhere are stripped from every advertised schema and refused on every call:
  `folder`, `targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote` and `overwrite`.
  `fileName` must be a plain base name. With `:8800` down at listing time, each Viz tool is
  listed as a stub that says to open Obsidian and start a new session. `test:profiles`
  fails if Viz Studio ever adds a `target*`/`folder`/`useActive*`/`overwrite` property
  that is not on the block list.
- **Deliberately absent:** `execute_command`, `create_note`, `append_note`, `open_vault`, the
  dev-console tools, `research_task`, `zk_*`, `video_pipeline_*`, and `publish_vault`
  `force`/`all`. The reasons are in the comment block above `OPENCLAW_SPECS` in `index.mjs`.
- **Gating.** The Security Everything hook matches the `mcp__openclaw-obsidian__` prefix, so
  every tool here, the new ones included, is barred to sub-agents. During a Ralph loop only
  `run_workflow`, `cancel` and `publish_vault` are barred; Viz renders stay open by operator
  decision (2026-10-23): they spend nothing, need no YubiKey and write only into
  `Visualizations/`.
- **Register it last.** The Claude Code gate hook is an allowlist with no catch-all, so a
  new MCP server name is ungated until the hook's matcher knows it. Do not add the
  `.mcp.json` entry before the Security Everything gate wiring is in. (Done in that order on 2026-10-07; the server key is
  `openclaw-obsidian`, so its tools are `mcp__openclaw-obsidian__*`.)

Failure isolation: the `:8799` and `:8800` proxies are per-call — if one bridge is
down, its tools return a clean MCP `isError` result (`obsidian_not_running` on the
`openclaw` profile) and the other upstreams keep working.
`OBSIDIAN_STDIO_COMMAND_CENTER_URL` and `OBSIDIAN_STDIO_VIZ_URL` (both https-only) exist
solely so tests can point a proxy at a dead port.

### Adding a tool

1. Add its spec to `OPENCLAW_SPECS` in `index.mjs` (mirror the upstream daemon's schema verbatim, with a
   provenance comment and a `validate` function), or its name to `VIZ_TOOL_NAMES` for a Viz Studio tool.
2. `handleOpenclawCall` routes every spec through `callBridgeTool(COMMAND_CENTER | VIZ_STUDIO, …)`
   (`:8799` / `:8800` MCP tools/call). A new upstream is one more descriptor object like `VIZ_STUDIO`.
3. Update the table above and extend `scripts/test-profiles.mjs`'s expected set. The test fails on any
   surface drift, which is the point.

### Input validation

Client-edge guardrails run before anything leaves the adapter, and the daemons re-validate
independently.

- **Per-tool validation**: each spec's `validate` function (see the `openclaw` section above).
- **Argument size cap** (`MAX_ARGS_BYTES`): every tool call is rejected if its serialized arguments
  exceed 1 MB, which protects against runaway or buggy client payloads before any network call.

### Adding a profile

A second client gets a profile only by operator decision. Add its name to the `PROFILE` validation,
build its tool list beside `OPENCLAW_TOOLS`, and add an expected-set assertion in
`scripts/test-profiles.mjs`. Never touch the daemons, and never merge them to widen a client's tool
list: aggregate per client here.

## Rollback

The adapter lives entirely in this package. To restore an earlier version:
`git -C /Users/myhome/TRINC revert <that commit>`, then start a new Claude Code session so the host
respawns the adapter. Nothing daemon-side needs rolling back: the daemons were never modified.

## MCP host configurations

### Claude Code (this monorepo's `.mcp.json`, server `openclaw-obsidian`)

```json
{
  "mcpServers": {
    "openclaw-obsidian": {
      "type": "stdio",
      "command": "/Users/myhome/.nvm/versions/node/v22.13.1/bin/node",
      "args": ["/Users/myhome/TRINC/Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs"],
      "env": {
        "OBSIDIAN_STDIO_PROFILE": "openclaw",
        "NODE_EXTRA_CA_CERTS": "/Users/myhome/Library/Application Support/mkcert/rootCA.pem"
      }
    }
  }
}
```

Keep the server key `openclaw-obsidian`: the Security Everything gate hook matches that
prefix. A session sees new tools only after it restarts. Claude Desktop is not wired to
this adapter; it reaches the vault through FilesystemPlus and miyo.

## License

MIT — see [LICENSE](./LICENSE).
