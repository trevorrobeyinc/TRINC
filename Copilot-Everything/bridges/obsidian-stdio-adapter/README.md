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

| Profile | Tools | Upstream |
|---|---|---|
| `claude` (default) | the 7 canonical `obsidian_*` tools | `:8798` canonical bridge (HMAC + replay-guard, token from the bridge config file) |
| `raycast` | the 7 above + `raycast_daily_open` (local map to `obsidian_execute_command id="daily-notes"`) + `video_pipeline_run` / `video_pipeline_status` | vault tools → `:8798`; video tools → `:8799` Command Center bridge (`Authorization: Bearer`, token read per-call from `~/.config/openclaw-command-center/bridge-token`) |

| `openclaw` (0.3.0) | a closed **13-tool** allowlist: `obsidian_health` plus 12 `obsidian_openclaw_*` tools (start/watch/cancel a research run, read results, history, artifacts, citation integrity, memory search, engine health, delivery evidence, and a restricted `publish_vault`) | **only** `:8799` Command Center bridge (`Authorization: Bearer`, token read per-call). Never loads the `:8798` config or its auth token. |

The `claude` and `raycast` profiles' surfaces are **frozen** — Claude Desktop's and
Raycast's tool lists must never change as a side effect of work on other profiles.
`npm run test:profiles` asserts all three surfaces exactly.

### The `openclaw` profile — Claude Code's dispatch lane

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
- **Deliberately absent:** `execute_command`, every vault read/write tool, the dev-console
  tools, `research_task`, `zk_*`, `video_pipeline_*`, and `publish_vault` `force`/`all`.
  The reasons are in the comment block above `OPENCLAW_SPECS` in `index.mjs`.
- **Register it last.** The Claude Code gate hook is an allowlist with no catch-all, so a
  new MCP server name is ungated until the hook's matcher knows it. Do not add the
  `.mcp.json` entry before the Security Everything gate wiring is in. (Done in that order on 2026-10-07; the server key is
  `openclaw-obsidian`, so its tools are `mcp__openclaw-obsidian__*`.)

Failure isolation: the `:8799` proxy is per-call — if the Command Center bridge is
down, video tools return a clean MCP `isError` result and every `:8798` vault tool
keeps working. `OBSIDIAN_STDIO_COMMAND_CENTER_URL` (https-only) exists solely so
tests can point the video proxy at a dead port.

### Adding a tool to an existing profile

1. Add its definition next to `VIDEO_TOOLS`/`RAYCAST_DAILY_OPEN_TOOL` in `index.mjs`
   (mirror the upstream daemon's schema verbatim, with a provenance comment).
2. Gate it into `TOOLS` under the right profile conditional.
3. Route it in `handleToolCall` — either through `callBridge` (`:8798` operations) or
   `callCommandCenter` (`:8799` MCP tools/call), or a new upstream client function.
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
  `git -C /Users/myhome/TrevClaw-Obsidianodus checkout -- Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs Copilot-Everything/bridges/obsidian-stdio-adapter/package.json`
- After it is committed:
  `git -C /Users/myhome/TrevClaw-Obsidianodus revert <that commit>` (or `git checkout <commit>^ -- Copilot-Everything/bridges/obsidian-stdio-adapter/index.mjs`)

Then have each MCP host respawn the adapter (quit/reopen Raycast; restart Claude
Desktop). Nothing daemon-side needs rolling back — the daemons were never modified.

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
