# Changelog

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
