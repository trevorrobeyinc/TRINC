#!/usr/bin/env bash
set -euo pipefail

# Phase 31: Research API & Scheduling — Policy Verification
# Validates that all Phase 31 governance requirements are met.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "ERROR: --root requires a path argument" >&2; exit 1; }
      ROOT_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

FAILURES=0

check() {
  local desc="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "OK:   $desc"
  else
    echo "FAIL: $desc"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "=== Phase 31 Policy Verification ==="
echo ""

# 1. Research API module
check "openclaw-bridge/bridge/research-api.js exists" \
  test -f "$ROOT_DIR/openclaw-bridge/bridge/research-api.js"

# 2. Workflow scheduler module
check "openclaw-bridge/core/workflow-scheduler.js exists" \
  test -f "$ROOT_DIR/openclaw-bridge/core/workflow-scheduler.js"

# 3. Usage meter module
check "openclaw-bridge/core/usage-meter.js exists" \
  test -f "$ROOT_DIR/openclaw-bridge/core/usage-meter.js"

# 4. Scheduled workflows config
check "config/scheduled-workflows.json exists" \
  test -f "$ROOT_DIR/config/scheduled-workflows.json"

# 5. Bridge routing contains API_RESEARCH route type
check "bridge-routing.js contains API_RESEARCH route type" \
  grep -q "API_RESEARCH" "$ROOT_DIR/openclaw-bridge/bridge/bridge-routing.js"

# 6. Bridge auth contains API_CLIENT principal
check "bridge-auth.js contains API_CLIENT principal" \
  grep -q "API_CLIENT" "$ROOT_DIR/openclaw-bridge/bridge/bridge-auth.js"

# 7. Bridge auth contains api_client in derivePrincipalFromTokenRecord
check "bridge-auth.js contains api_client in derivePrincipalFromTokenRecord" \
  grep -q "api_client" "$ROOT_DIR/openclaw-bridge/bridge/bridge-auth.js"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "=== Phase 31 Policy Verification: $FAILURES CHECK(S) FAILED ==="
  exit 1
fi

echo "=== Phase 31 Policy Verification: ALL CHECKS PASSED ==="
exit 0
