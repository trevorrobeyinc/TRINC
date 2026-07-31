#!/usr/bin/env bash
# RETIRED 2026-07-31 — emulator-era compat sweep (bridge-consolidation follow-up)
#
# This wrapper chained socket-audit.sh (SOCKET_AUDIT_REQUIRE_LISTENERS=true)
# then bridge-health-check.sh — originally backend-smoke-test.sh too (removed
# 2026-06-04) — as the :8789 backend-emulator <-> :8798 bridge compat sweep
# (FUNCTIONAL_TEST_CHECKLIST.md BACKEND-03). Every leg is dead:
#   * bridge-health-check.sh was tombstoned 2026-07-31 (CLI-era gate: the
#     CliBackend + PM2 stack it probed is gone).
#   * the socket-audit leg died even earlier: require-listeners mode asserted
#     an "Emulator" listener on :8789 (emulator retired 2026-04-11, deleted
#     2026-05-08), and under stock macOS bash 3.2 socket-audit.sh exited 127
#     at `mapfile` (a bash-4 builtin) before any assertion ran. (Both defects
#     were fixed in socket-audit.sh on 2026-07-31 — see below. That does not
#     un-retire this wrapper: the :8789 emulator half of the sweep it existed
#     for is still gone.)
# So this sweep cannot have passed since the emulator retirement; its trailing
# "now covers ... canonical :8798 bridge health check" comment was stale.
#
# Replacement checks (same pair as bridge-health-check.sh's header):
#   bash scripts/socket-audit.sh   # standalone; bash-3.2-clean and the dead
#                                  # :8789 emulator assert dropped (both fixed
#                                  # 2026-07-31) — SOCKET_AUDIT_REQUIRE_LISTENERS=true
#                                  # now asserts only the :8798 bridge
#                                  # (Obsidian open => bridge up)
#   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
#        https://127.0.0.1:8798/healthz
#   curl -k -H "Authorization: Bearer $OBSIDIAN_REST_API_KEY" \
#        https://127.0.0.1:27124/
# Deeper probe: the `obsidian_health` tool via bridges/obsidian-stdio-adapter.
#
# This stub exits non-zero so any caller surfaces the retirement.

echo "ERROR: backend-bridge-compat-test.sh was retired 2026-07-31. The :8789 emulator <-> :8798 bridge sweep it chained no longer exists; see this header for the replacement checks." >&2
exit 1
