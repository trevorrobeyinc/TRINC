#!/usr/bin/env bash
set -euo pipefail

# Phase 30: Workflow Orchestration Engine — Policy Verification
# Validates that all Phase 30 governance requirements are met.

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

echo "=== Phase 30 Policy Verification ==="
echo ""

# 1. Core module: workflow-engine.js
check "openclaw-bridge/core/workflow-engine.js exists" \
  test -f "$ROOT_DIR/openclaw-bridge/core/workflow-engine.js"

# 2. Core module: workflow-schema.js
check "openclaw-bridge/core/workflow-schema.js exists" \
  test -f "$ROOT_DIR/openclaw-bridge/core/workflow-schema.js"

# 3. Core module: _workflow-runtime.js
check "scripts/_workflow-runtime.js exists" \
  test -f "$ROOT_DIR/scripts/_workflow-runtime.js"

# 4. Script: run-workflow.js
check "scripts/run-workflow.js exists" \
  test -f "$ROOT_DIR/scripts/run-workflow.js"

# 5. Workflow templates directory has at least 6 files
check "config/workflow-templates/ has >= 6 files" \
  bash -c "[ \$(find \"$ROOT_DIR/config/workflow-templates\" -type f 2>/dev/null | wc -l | tr -d ' ') -ge 6 ]"

# 6. Role prompts config
check "config/role-prompts.json exists" \
  test -f "$ROOT_DIR/config/role-prompts.json"

# 7. Autonomy ladder — 6 new roles
AUTONOMY="$ROOT_DIR/config/autonomy-ladder.json"
for role in literature_reviewer safety_signal_detector molecular_profiler competitive_intel_analyst quality_auditor report_generator; do
  check "autonomy-ladder.json contains role: $role" \
    grep -q "\"$role\"" "$AUTONOMY"
done

# 8. Agent topology — 6 new roles
TOPOLOGY="$ROOT_DIR/config/agent-topology.json"
for role in literature_reviewer safety_signal_detector molecular_profiler competitive_intel_analyst quality_auditor report_generator; do
  check "agent-topology.json contains role: $role" \
    grep -q "\"$role\"" "$TOPOLOGY"
done

# 9. Mission templates — 5 new templates
MISSIONS="$ROOT_DIR/config/mission-templates.json"
for template in drug_repurposing_deep pharmacovigilance_enterprise competitive_landscape target_validation_deep regulatory_safety_profile; do
  check "mission-templates.json contains template: $template" \
    grep -q "\"$template\"" "$MISSIONS"
done

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "=== Phase 30 Policy Verification: $FAILURES CHECK(S) FAILED ==="
  exit 1
fi

echo "=== Phase 30 Policy Verification: ALL CHECKS PASSED ==="
exit 0
