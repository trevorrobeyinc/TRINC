#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

SOCKET_AUDIT_REQUIRE_LISTENERS=true "$SCRIPT_DIR/socket-audit.sh"
"$SCRIPT_DIR/bridge-health-check.sh"
# backend-smoke-test.sh removed 2026-06-04: the :8789 copilot-backend-emulator
# it targeted was retired 2026-04-11 / deleted 2026-05-08. This test now covers
# only the live socket audit + canonical :8798 bridge health check.
