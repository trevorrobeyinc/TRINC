#!/usr/bin/env bash
# RETIRED 2026-07-31 — last CLI-era gate script (bridge-consolidation follow-up)
#
# This script compared the bridge's in-process CLI probe (`mcp-health-check.js`
# `.cli.available`) against a direct `new CliBackend(config).probe()` re-run
# under the bridge's PM2 environment. Both legs are gone: the 2026-05-09 bridge
# consolidation removed dist/backends/cliBackend.js (RestApiBackend is the sole
# backend — `BackendId = "restApi"`), and the bridge no longer runs under PM2 —
# it is spawned by the obsidian-bridge-launcher Obsidian plugin, so `pm2 jlist`
# has no bridge process to capture env from.
#
# Replacement check (canonical bridge health + REST API auth):
#   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
#        https://127.0.0.1:8798/healthz
#   curl -k -H "Authorization: Bearer $OBSIDIAN_REST_API_KEY" \
#        https://127.0.0.1:27124/
# Deeper probe: the `obsidian_health` tool via bridges/obsidian-stdio-adapter.
#
# This stub exits non-zero so any caller surfaces the retirement
# (its one known caller, backend-bridge-compat-test.sh, was tombstoned the same day).

echo "ERROR: bridge-health-check.sh was retired 2026-07-31. The CliBackend+PM2 stack it probed no longer exists; see this header for the replacement checks." >&2
exit 1
