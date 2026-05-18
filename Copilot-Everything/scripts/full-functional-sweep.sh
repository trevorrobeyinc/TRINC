#!/usr/bin/env bash
# RETIRED 2026-05-09 — bridge consolidation
#
# This script wired against the Backend Emulator at http://127.0.0.1:8789
# and the obsolete plugin/CLI backend selection logic. The emulator was
# retired Phase D (2026-04-11) and the plugin backend was deleted in the
# 2026-05-09 bridge consolidation. Default backend is now RestApiBackend
# (https://127.0.0.1:27124) with no silent CLI fallback.
#
# Replacement health check (covers what this script used to verify):
#   curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" \
#        https://127.0.0.1:8798/healthz
#   curl -k -H "Authorization: Bearer $OBSIDIAN_REST_API_KEY" \
#        https://127.0.0.1:27124/

echo "ERROR: full-functional-sweep.sh was retired 2026-05-09. Use the canonical bridge healthz + REST API auth check (see header)." >&2
exit 1
