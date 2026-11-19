# Changelog

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
