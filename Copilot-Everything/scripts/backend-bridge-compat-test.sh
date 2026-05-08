#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

SOCKET_AUDIT_REQUIRE_LISTENERS=true "$SCRIPT_DIR/socket-audit.sh"
"$SCRIPT_DIR/bridge-health-check.sh"
"$SCRIPT_DIR/backend-smoke-test.sh"
