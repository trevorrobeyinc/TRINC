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

## Profiles — client-edge aggregation

`OBSIDIAN_STDIO_PROFILE` selects a per-client tool surface. This adapter is where
tools from **multiple** bridge daemons get aggregated into one MCP server per client
("client-edge aggregation") — the daemons themselves stay separate, each owned by its
own Obsidian plugin. Do not merge the daemons to widen a client's tool list; widen a
profile here instead.

`OBSIDIAN_STDIO_PROFILE` is **required**; there is no default.

| Profile | Tools | Upstream |
|---|---|---|
| `raycast` | the 7 canonical `obsidian_*` tools + `raycast_daily_open` (local map to `obsidian_execute_command id="daily-notes"`) + `video_pipeline_run` / `video_pipeline_status` | vault tools → `:8798` canonical bridge (HMAC + replay-guard, token from the bridge config file); video tools → `:8799` Command Center bridge (`Authorization: Bearer`, token read per-call from `~/.config/openclaw-command-center/bridge-token`) |
| `openclaw` (0.4.0) | **Claude's one door**, 27 tools: `obsidian_health`, 12 `obsidian_openclaw_*` tools (start/watch/cancel a research run, read results, history, artifacts, citation integrity, memory search, engine health, delivery evidence, a restricted `publish_vault`), read-only `obsidian_search_notes` + `obsidian_read_note`, and the 12 `viz_*` renders | `:8799` Command Center bridge and `:8800` Viz Studio bridge (`Authorization: Bearer`, each token read per-call; Viz's from `~/.config/trinc-viz-studio/bridge-token`). Never loads the `:8798` config or its auth token. |

The `raycast` profile's surface is **frozen**: Raycast's tool list must never change as a
side effect of work on another profile. The `claude` profile (the 7 vault tools for Claude
Desktop) was **retired 2026-10-23**: no Claude surface had registered it since 2026-10-07, and
its last entry (`Copilot-Everything/.mcp.json` `obsidian-bridge`) was an ungated write lane
into the vault. Asking for it now refuses to start. `npm run test:profiles` asserts both
surfaces exactly.

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

### Adding a tool to an existing profile

1. Add its definition next to `VIDEO_TOOLS`/`RAYCAST_DAILY_OPEN_TOOL` in `index.mjs`
   (mirror the upstream daemon's schema verbatim, with a provenance comment).
2. Gate it into `TOOLS` under the right profile conditional.
3. Route it in `handleToolCall` (or `handleOpenclawCall`) — either through `callBridge`
   (`:8798` operations) or `callBridgeTool(COMMAND_CENTER | VIZ_STUDIO, …)` (`:8799` / `:8800`
   MCP tools/call). A new upstream is one more descriptor object like `VIZ_STUDIO`.
4. Update the table above and extend `scripts/test-profiles.mjs`'s expected set —
   the test fails on any surface drift, which is the point.

### Input validation (0.2.0)

Two client-edge guardrails run before anything leaves the adapter; the daemons
independently re-validate.

- **Video URL allowlist** (`VIDEO_URL_ALLOWED_HOSTS` in `index.mjs`):
  `video_pipeline_run` accepts https URLs only, exact-hostname match against the
  fork's documented hosts — `youtube.com`, `www.youtube.com`, `m.youtube.com`,
  `youtu.be`, `vimeo.com`, `www.vimeo.com`, `linkedin.com`, `www.linkedin.com`,
  `tiktok.com`, `www.tiktok.com`, `onlinelibrary.wiley.com` — or an absolute
  local video file path (`.mp4/.mkv/.webm/.mov/.m4v`), which stays valid because
  it is part of the tool's documented input contract. Anything else returns a
  clean `isError` naming the violation. To extend the list: edit the const,
  extend `scripts/test-profiles.mjs`, and update this section — all three in the
  same change.
- **Argument size cap** (`MAX_ARGS_BYTES`): every tool call on every profile is
  rejected if its serialized arguments exceed 1 MB — protects against runaway or
  buggy client payloads before any network call.

### Adding a new profile

Add its name to the `PROFILE` validation, give it a conditional in `TOOLS`, and add an
expected-set assertion in `scripts/test-profiles.mjs`. Never touch the daemons.

## Rollback

The aggregation lives entirely in this package. To restore the previous adapter:

- While the change is uncommitted:
  `git -C /Users/myhome/TRINC checkout -- Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs Copilot-Everything/bridges/obsidian-stdio-adapter/package.json`
- After it is committed:
  `git -C /Users/myhome/TRINC revert <that commit>` (or `git checkout <commit>^ -- Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs`)

Then have each MCP host respawn the adapter (quit/reopen Raycast; restart Claude
Desktop). Nothing daemon-side needs rolling back — the daemons were never modified.

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

### Raycast (stdio profile)

Raycast's Install Server form takes a command with no environment fields, so register
`raycast-launch.sh` (it sets `OBSIDIAN_STDIO_PROFILE=raycast` and the CA). After changing its
tools, remove and re-add the server in Raycast: Raycast answers from a tool snapshot it took
at install time.

## License

MIT — see [LICENSE](./LICENSE).
