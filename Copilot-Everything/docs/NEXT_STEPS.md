# Next Steps

> **SUPERSEDED — historical snapshot (banner added 2026-07-31).** This is a 2026-03-era
> follow-up list for the backend-emulator stack (emulator retired 2026-04-11, deleted
> 2026-05-08). The "Re-Run Commands" use the pre-monorepo path and point at scripts since
> deleted (`backend-contract-test.sh`) or tombstoned (`backend-bridge-compat-test.sh` +
> `plugin-backend-emulator-check.sh`, both retired 2026-07-31). Body left verbatim as history. Current health checks:
> `Copilot-Everything/CLAUDE.md` (Service Health Checks).

## Primary Follow-Ups

1. Exercise the newly aliased `/v0/index/*` routes from the side-by-side official plugin runtime, not just direct emulator forwarding.
2. Re-run related-note compatibility on a source note that has indexed chunks so the official plugin success path is validated alongside the already verified 404 pass-through path.
3. Keep exact in-app mode on the buffered canonical route by default while a separate desktop-only streaming transport experiment is evaluated.

## Lower Priority

1. Add non-HTTP MCP transports if the local bridge moves beyond HTTP.
2. Add an in-plugin diagnostics command for `v1/self-host/*` health and exact-mode request capture.
3. Continue namespace cleanup for residual generic `.copilot-*` CSS classes in the fork.

## Re-Run Commands

1. `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/backend-contract-test.sh`
2. `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/backend-bridge-compat-test.sh`
3. `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/plugin-backend-emulator-check.sh`
4. `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-miyo-check.sh`
