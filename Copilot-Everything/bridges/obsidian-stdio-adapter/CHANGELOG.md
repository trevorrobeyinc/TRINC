# Changelog

## 0.7.0 — 2026-11-24 — the bridges move to Unix sockets (bridges-uds)

Command Center and Viz Studio stopped listening on TCP (`:8799`, `:8800`) and dropped mkcert TLS. They
serve the same routes, bodies and bearer tokens as plain HTTP/1.1 on `command-center.sock` and
`viz-studio.sock` in `<home>/.local/state/trinc/run` (run directory 0700, sockets 0600). Tool names and
input schemas are byte-identical; the `openclaw` surface is unchanged (27 tools).

- **Changed:** every request goes through the byte-identical "bridges-uds client v1" block. It checks the
  exact socket path, the directory chain from home down and the socket before it connects, pins the
  connection to the socket, and leaves no code path that can dial TCP. The socket paths come from
  `os.homedir()`. The block passes each request's `timeout` option to the socket it connects, so the
  option arms the idle timer by itself; the `req.setTimeout` each request also calls re-arms the same
  timer, belt and braces.
- **Removed:** the mkcert CA requirement (`NODE_EXTRA_CA_CERTS` is no longer read), the https agent and the
  `tls_trust_failed` code.
- **Removed:** the test-only `OBSIDIAN_STDIO_COMMAND_CENTER_URL` and `OBSIDIAN_STDIO_VIZ_URL` overrides. If
  either one is set, the adapter now refuses to start.
- **Changed:** `obsidian_not_running` also covers a missing run directory or socket (`ENOENT`), which is
  what a closed Obsidian looks like now; a stale socket left by a crash (`ECONNREFUSED`) and a missing
  token still map there, and the message names the socket instead of a port. A refused socket
  (`SOCKET_UNTRUSTED`, `SOCKET_PATH_TOO_LONG`, `EACCES`, `EPERM`, `ENOTSOCK`) goes through
  `socketRefusalCode`, which answers `adapter_error` (the operator's decision, approval (i), 2026-11-25) and writes one
  `socket_refused` line to stderr.
- **Changed (listing):** two descriptions only. `obsidian_health` says "(Command Center socket)" instead of
  "(:8799)", and the Viz stubs say "(Viz Studio socket)" instead of "(:8800)".
- **Changed:** the per-call stderr label is `upstream=command-center|viz-studio` (was `8799|8800`), and the
  startup health probe logs `unix:<socket path>`.
- **Tests:** the offline cases run on temporary `/tmp/uds-*` homes. A missing token, run directory or
  socket and a stale socket give `obsidian_not_running`; a 0755 run directory is refused; a fake bridge
  (`test/fake-bridge.mjs`) checks the request heads, the pass-through, the live Viz stripping and a hung
  Viz `tools/list`; static checks ban an https or tls import, a CA, a TCP endpoint, and the vault bridge's
  socket name and lower-case headers. 62 offline checks; the live checks run after the deploy.

## 0.6.0 — 2026-11-21 — the `raycast` profile is retired; one profile, one client

Operator decision, 2026-11-21: Raycast is removed, and the video workflows run from the Copilot
agent (its `copilot-video-download` skill downloads a link, and Command Center's built-in pipeline
does the rest). This adapter stays for the TRINC workflow only, as Claude's door. The `openclaw`
surface is unchanged (27 tools).

- **Removed:** the `raycast` profile, which now refuses to start like `claude` does, with its two
  video tools, their client-edge input validation and URL allowlist, the mirror of Command Center's
  video descriptions, and `raycast-launch.sh`.
- **Removed:** the client for the canonical vault bridge on `:8798` (config loader, token header,
  request signer, the 7 vault tool definitions and `raycast_daily_open`). It had been unreachable
  since 2026-11-18. The adapter now reads no config file and holds one kind of secret, the two
  bridges' bearer tokens. `index.mjs` went from 1,334 lines to 773.
- **Tests:** both retired profiles and a missing profile refuse to start; `video_pipeline_run` is
  unknown on Claude's door; the 1 MB argument cap is checked on an `openclaw` tool; two static
  checks fail if the `:8798` client or a video or Raycast tool comes back. The raycast surface,
  video edge, live video and description-drift checks are gone with the profile. 50 checks with
  Obsidian open.

## 2026-11-20 — video tool text follows Command Center's phase 4 (version stays 0.5.0)

No tool added, removed or renamed.

- **Changed:** the `raycast` profile's two video tool definitions are Command Center's phase-4 text,
  word for word, copied from its built source rather than retyped. A link is now refused by the
  daemon: the copilot-video-download skill downloads it first, then the pipeline takes the file or
  folder.
- **Tests:** the two live video checks now expect a link to be refused with the download-skill pointer,
  and a folder dry run to return its `plan` (kind, video count, canonical path, no deeplink). That plan
  must also show the page link read from the `clip.url` file beside the fixture video, and, because
  "clip" is a generic title, a summary note named from that link. Run against the phase-3 daemon,
  exactly those two fail. `TEST_PROFILES_SKIP_LIVE=1` skips every live
  check, for a checkout whose Command Center source is newer than the running build.

## 0.5.0 — 2026-11-18 — the `raycast` profile is a video-only door

Operator decision, 2026-11-18: Raycast AI reads and writes the vault only through Security
Everything's YubiKey-gated `Obsidian Vault` server (its decision of 2026-10-16,
`mcp-gates/OBSIDIAN-VAULT-GATE.md`), and this profile's vault tools were an ungated write lane
around it. The `openclaw` surface is unchanged (27 tools).

- **Removed (raycast):** the 7 `obsidian_*` vault tools and `raycast_daily_open`. A Raycast that
  still holds the old snapshot gets each one refused by name, with a pointer to the gated server;
  nothing reaches `:8798` from this door. Re-register the server in Raycast (as `Video Pipeline`).
- **Changed:** neither profile loads the `:8798` bridge config or its auth token any more
  (`USES_VAULT_BRIDGE` is false); the startup health check of `raycast` probes `:8799`. The `:8798`
  client code stays in `index.mjs`, unreachable.
- **Tests:** `raycast` lists exactly its 2 tools, starts with the `:8798` config poisoned, and
  refuses all 8 retired tools (called with the config poisoned and every upstream dead, so no
  regression could write to the vault); the negative control is static now, since no profile
  reads the config. 61 checks with Obsidian open.

## 2026-11-18 — folder input on the `raycast` profile (version stays 0.4.0)

No tool added, removed or renamed; every profile surface is unchanged.

- **Changed:** `video_pipeline_run` accepts an absolute folder path (Command Center's folder
  mode): it passes the client edge when `stat` says it is a folder; a missing path is refused
  with `No such file or folder`; a non-video file is still refused; a path this process may not
  `stat` (EPERM/EACCES) is left to the `:8799` daemon, which re-validates every input.
- **Changed:** both video tool definitions are the bridge's text word for word (folder input,
  the `batch` status fields, `transcriber`).
- **Added:** `npm run test:profiles` checks the folder edge cases on a temp fixture, a live
  folder dry run when `:8799` is up (kind `folder`, video count, canonical path), and a drift
  guard that fails when a mirrored video description is not in the bridge source verbatim.

## 0.3.0 — 2026-10-07

Claude Code's dispatch lane. The `claude` (7 tools) and `raycast` (10 tools) surfaces are
**unchanged** and still asserted exactly by `npm run test:profiles`.

- **Added:** `openclaw` profile — a closed 13-tool allowlist proxied only to the Command Center
  bridge on `:8799` so a Claude Code session can start and watch OpenClaw runs through the same
  door the Copilot agent uses (plugin-dispatched runs get the whole post-run chain). It never
  loads the `:8798` config or token. Strict client-edge validation (unknown keys rejected,
  `publish_vault` limited to `workflow_id` + `dry_run`), per-tool timeouts matching the daemon's
  spawn timeouts, and structured `obsidian_not_running` / `*_outcome_unknown` failures.
- **Changed:** `callCommandCenter` takes an optional per-call timeout (default unchanged: 30 s).
- **Added:** `start:openclaw` script; regression guard grew from 6 to 32 checks (30 results when
  Obsidian is closed, because the live ones skip), including a least-privilege proof (the profile starts with the `:8798` config unreadable, with a negative
  control showing the same config crashes `claude`), forbidden-tool absence, a static drift guard
  against the Command Center source, and live checks that run only after a read-only version probe.
- Requires the Command Center plugin built 2026-10-07 or later for `dry_run` and the
  `post_run`/`post_run_done` status fields; against an older daemon the live dry-run check is
  skipped on purpose (an old daemon would ignore `dry_run`).

## 0.2.0 — 2026-08-20

Client-edge aggregation + guardrails. The `claude` profile's tool surface is
**unchanged** (still exactly 7 tools — Claude Desktop sees no difference).

- **Added:** `video_pipeline_run` / `video_pipeline_status` on the `raycast`
  profile, proxied to the Command Center bridge on `:8799` (Bearer token read
  per-call from `~/.config/openclaw-command-center/bridge-token`). The daemons
  themselves are unmodified — see "Client-edge aggregation pattern" in the root
  `CLAUDE.md`.
- **Added:** structured per-call stderr logging
  (`profile, tool, upstream, status, latency_ms` — never argument values).
- **Added:** `OBSIDIAN_STDIO_COMMAND_CENTER_URL` override (https-only) for
  failure-isolation testing.
- **Added:** `npm run test:profiles` regression guard asserting both profiles'
  exact tool surfaces, the dry-run deeplink shape, and the input-validation
  rejects.
- **Added:** URL allowlist for `video_pipeline_run` (https-only, exact-hostname
  match against the fork's documented hosts; local absolute video paths remain
  valid) + a 1 MB serialized-arguments cap on every tool call.

## 0.1.0

Initial consolidated adapter: 7 canonical `obsidian_*` tools tunneled to the
canonical bridge on `:8798`; `raycast` profile adds `raycast_daily_open`.
