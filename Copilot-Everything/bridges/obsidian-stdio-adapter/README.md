# obsidian-bridge-adapter

Stdio MCP adapter that gives **Claude one door into Obsidian**. It proxies a closed set of tools over
Unix sockets to two Obsidian plugin bridges, the Command Center bridge (`command-center.sock`) and the
Viz Studio bridge (`viz-studio.sock`), so a Claude Code session starts and watches research runs
through the same plugin the Copilot agent uses.

> **Unix sockets since 2026-11-24 (bridges-uds).** Both bridges stopped listening on TCP (`:8799`,
> `:8800`) and dropped mkcert TLS. They serve the same routes, bodies and bearer tokens over sockets in
> a private run directory, and the adapter has no TCP, TLS or CA code left.
>
> **One profile since 2026-11-21.** The `raycast` profile was retired by operator decision (Raycast is
> removed, and the Copilot agent runs the video pipeline itself). The client for the canonical vault
> bridge (then on `:8798`), unreachable since 2026-11-18, was deleted with it. The `claude` profile was
> retired on 2026-10-23. Both refuse to start.

## What it talks to

```
Claude Code ──stdio──► obsidian-bridge-adapter ──HTTP/1.1 on a Unix socket + bearer token──► Command Center bridge (command-center.sock)
                                               └─HTTP/1.1 on a Unix socket + bearer token──► Viz Studio bridge     (viz-studio.sock)
```

Each bridge is a separate daemon owned by its own Obsidian plugin, and both stop when Obsidian quits.
Both sockets live in the run directory `<home>/.local/state/trinc/run`, where `<home>` is
`os.homedir()` (so `HOME` decides it). The run directory is `0700` and each socket `0600`.

- **One request path.** Every request goes through `bridgesUdsRequest`, the byte-identical
  "bridges-uds client v1" block in `index.mjs` (`ops/tr-suite/verify.sh` compares it with the other
  three copies). Before it connects it checks the exact path, then every level from home down to the
  run directory (each a real directory owned by this uid that group and others cannot write, the run
  directory granting them nothing, no ACL allow entry), then the socket itself (a socket of this uid,
  mode `0600`). The connection is pinned to that socket, and no code path can dial TCP.
- **Tokens.** The adapter reads each bridge's `0600` bearer token at call time
  (`~/.config/openclaw-command-center/bridge-token`, `~/.config/trinc-viz-studio/bridge-token`), so a
  token rotation never needs a restart. It sends it only as `Authorization: Bearer`, never as
  `X-MCP-Token`, and reads no other secret and no config file.
- **Health check.** `node /Users/myhome/TRINC/ops/tr-suite/uds-health.mjs` prints one status line per
  bridge socket and never a token. There is no TCP port to probe any more.

## Required environment

- `OBSIDIAN_STDIO_PROFILE=openclaw`. Required: there is no default.
- Nothing else. No CA is needed: `NODE_EXTRA_CA_CERTS` is not read. The old upstream overrides
  `OBSIDIAN_STDIO_COMMAND_CENTER_URL` and `OBSIDIAN_STDIO_VIZ_URL` went with TCP: if either one is set,
  the adapter refuses to start and says so.

## Profiles

| Profile | Tools | Upstream |
|---|---|---|
| `openclaw` | **Claude's one door**, 27 tools: `obsidian_health`, 12 `obsidian_openclaw_*` tools (start/watch/cancel a research run, read results, history, artifacts, citation integrity, memory search, engine health, delivery evidence, a restricted `publish_vault`), read-only `obsidian_search_notes` + `obsidian_read_note`, and the 12 `viz_*` renders | Command Center bridge (`command-center.sock`) and Viz Studio bridge (`viz-studio.sock`) (`Authorization: Bearer`, each token read per-call). |

Retired, and refused at startup:

| Profile | Retired | Why |
|---|---|---|
| `raycast` | 2026-11-21 | Operator decision: Raycast is removed. Its last two tools, `video_pipeline_run` and `video_pipeline_status`, belong to the Copilot agent, which downloads a link with the `copilot-video-download` skill and then calls Command Center's built-in pipeline. Its 7 `obsidian_*` vault tools and `raycast_daily_open` had gone on 2026-11-18: they were an ungated write lane around Security Everything's YubiKey-gated `Obsidian Vault` server. |
| `claude` | 2026-10-23 | No Claude surface had registered it since 2026-10-07, and its last entry (`Copilot-Everything/.mcp.json` `obsidian-bridge`) was an ungated write lane into the vault. |

Never add a vault-write tool, a video tool or another client's surface here without an operator
decision. `npm run test:profiles` asserts the surface exactly, that both retired profiles refuse to
start, that the video tools are unknown on this door, and that the source holds no vault-bridge
client (see "Tests" below).

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
  sent): a missing token file, a missing run directory or socket (`ENOENT`, which is what a
  bridge that closed cleanly leaves), or a socket file nobody serves (`ECONNREFUSED`, left
  behind by a crash). A timeout or dropped connection during `run_workflow` returns
  `bridge_timeout_outcome_unknown` / `bridge_connection_lost_outcome_unknown` with the
  instruction to call `obsidian_openclaw_status` and **never re-send**. The adapter never
  retries.
- **Refused sockets.** A socket that fails the client block's checks (`SOCKET_UNTRUSTED`,
  `SOCKET_PATH_TOO_LONG`) or that the system refuses (`EACCES`, `EPERM`, `ENOTSOCK`) is
  refused before anything is sent. All of them go through one function,
  `socketRefusalCode(err)`, which reports `adapter_error` (the operator's decision, approval (i)
  in the bridges-uds decision record, 2026-11-25) and writes one `socket_refused code=<code> <message>` line to
  stderr. Without TLS there is no `tls_trust_failed` any more.
- **Per-tool timeouts** match the daemon's own spawn timeouts (engine health, publish,
  memory search and delivery evidence run for minutes); everything else keeps the shared 30 s.
- **Read-only vault (2026-10-23, decision D5):** `obsidian_search_notes` and
  `obsidian_read_note` on Command Center, which serves them through Obsidian's own file index
  (it never contains the `.obsidian/` config). Paths must be vault-relative with no `..`
  segment; `search_notes` takes `limit` 1–100.
- **Viz Studio renders (2026-10-23, decisions D4 + D5)** write **only into
  `Visualizations/`**. The 12 names are a closed allowlist in `VIZ_TOOL_NAMES`; their schemas
  come live from Viz Studio's `tools/list` (Viz Studio's `src/bridge/toolSchemas.ts` is the
  contract of record, ~900 lines, so they are not mirrored by hand). Six properties that would
  write elsewhere are stripped from every advertised schema and refused on every call:
  `folder`, `targetNote`, `targetCanvas`, `useActiveTab`, `useActiveNote` and `overwrite`.
  `fileName` must be a plain base name. With Viz Studio down (or silent for 3 s) at listing
  time, each Viz tool is listed as a stub that says to open Obsidian and start a new session.
  `test:profiles` fails if Viz Studio ever adds a `target*`/`folder`/`useActive*`/`overwrite`
  property that is not on the block list.
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

Failure isolation: the Command Center and Viz Studio proxies are per-call — if one bridge
is down, its tools return a clean MCP `isError` result (`obsidian_not_running` on the
`openclaw` profile) and the other upstream keeps working. There is no socket or URL
override: the socket paths always come from `os.homedir()`, and the tests point `HOME` at a
temporary directory instead.

### Adding a tool

1. Add its spec to `OPENCLAW_SPECS` in `index.mjs` (mirror the upstream daemon's schema verbatim, with a
   provenance comment and a `validate` function), or its name to `VIZ_TOOL_NAMES` for a Viz Studio tool.
2. `handleOpenclawCall` routes every spec through `callBridgeTool(COMMAND_CENTER | VIZ_STUDIO, …)`
   (an MCP tools/call over that bridge's socket). A new upstream is one more descriptor object like
   `VIZ_STUDIO`, with its socket name.
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

## Tests

`npm run test:profiles` (`scripts/test-profiles.mjs`, plain node). Every offline case runs the adapter
with `HOME` set to its own temporary `/tmp/uds-*` directory holding test tokens, so it never reads the
real tokens or reaches a real bridge:

- the exact 27-tool surface, the client-edge rejects, and the retired profiles and URL overrides
  refusing to start;
- `obsidian_not_running` for a missing token, a missing run directory or socket, and a stale socket;
  a run directory that grants group or others access is refused before anything is sent;
- a fake bridge (`test/fake-bridge.mjs`, spawned by the test; `test/` is outside the monorepo
  transport lint) on both sockets: `POST /mcp` with that bridge's Bearer token and no `X-MCP-*`
  header, `GET /healthz` without a token, replies passed through, live Viz schemas stripped, and a
  hung Viz Studio falling back to stubs after 3 s;
- static checks: no vault-bridge client, no `https`/`tls` import, no CA, no TCP endpoint, and every
  request inside the client block.

The live checks use the real `HOME` and run against Obsidian's bridges after a deploy.
`TEST_PROFILES_SKIP_LIVE=1` skips them, for a checkout whose bridges are newer than the build Obsidian
runs.

## Rollback

The adapter and both bridges moved to Unix sockets together on 2026-11-24 (bridges-uds), and nothing
here dials TCP any more: reverting this package alone leaves an old TCP adapter in front of socket
bridges, and every tool answers `obsidian_not_running`. Follow the cold rollback in the bridges-uds
decision record instead: with Obsidian quit, revert the bridges-uds commits, rebuild the vault bridge,
redeploy the four plugins and restore Copilot's MCP settings, then relaunch Obsidian and start a new
Claude Code session so the host respawns the adapter.

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
        "NODE_OPTIONS": "--require /Users/myhome/.claude/mcp/loopback-listen.cjs"
      }
    }
  }
}
```

`NODE_OPTIONS` loads the loopback-listen preload (keep `--require` as its first token); the preload
never touches the adapter's outbound socket connections. The adapter needs no CA, so the entry carries
no `NODE_EXTRA_CA_CERTS`.

Keep the server key `openclaw-obsidian`: the Security Everything gate hook matches that
prefix. A session sees new tools only after it restarts. Claude Desktop is not wired to
this adapter; it reaches the vault through FilesystemPlus and miyo.

## License

MIT — see [LICENSE](./LICENSE).
