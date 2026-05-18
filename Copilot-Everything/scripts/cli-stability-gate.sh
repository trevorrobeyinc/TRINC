#!/usr/bin/env bash
# RETIRED 2026-05-09 — bridge consolidation
#
# This script verified the legacy two-process stack (PM2 backend-emulator at
# :8789 + PM2 mcp-bridge) which no longer exists. The bridge daemon now runs
# under the obsidian-bridge-launcher Obsidian plugin lifecycle, and the
# emulator is gone. Default backend is RestApiBackend (https://127.0.0.1:27124).
#
# Replacement check (canonical bridge health + REST API auth):
#   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
#        https://127.0.0.1:8798/healthz
#   curl -k -H "Authorization: Bearer $OBSIDIAN_REST_API_KEY" \
#        https://127.0.0.1:27124/
#
# This stub exits non-zero so any caller surfaces the retirement.

echo "ERROR: cli-stability-gate.sh was retired 2026-05-09. The emulator+PM2 model it tested no longer exists." >&2
exit 1
