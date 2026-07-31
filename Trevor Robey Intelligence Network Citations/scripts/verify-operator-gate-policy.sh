#!/usr/bin/env bash
# verify-operator-gate-policy.sh — asserts the CLI-side operator-authorization ceremony is WIRED.
#
# Why this exists: the ceremony used to be called from exactly one file, and nothing asserted even
# that. Deleting the gate block from a CLI restored the original bypass (real research on --confirm
# alone) with the full 1013-test suite and every phase2 gate still green. This is the same
# meta-defect that verify-phase15-policy.sh now covers for role-router's in-process gates — this
# script covers their CLI counterpart, so the single chokepoint cannot be silently removed.
#
# Fail-closed by construction: a missing file is a FAILURE, never a skip. (verify-phase18-policy.sh
# uses `[[ -f "$abs" ]] || continue`, which silently passes when a pinned file is deleted — do not
# copy that shape here.)
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SELF_DIR}/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "ERROR: --root requires a path argument" >&2; exit 1; }
      ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

fail() {
  echo "$1" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || fail "operator-gate policy: required file missing: ${1#"$ROOT"/}"
}

require_pattern() {
  local pattern="$1" file_path="$2" message="$3"
  require_file "$file_path"
  grep -Eq -- "$pattern" "$file_path" || fail "operator-gate policy: $message"
}

GATE_HELPER="$ROOT/scripts/_operator-gate-cli.js"

# 1. The shared helper exists and actually performs the ceremony.
require_pattern 'verifyAndConsumeOperatorApproval' "$GATE_HELPER" \
  "_operator-gate-cli.js must call verifyAndConsumeOperatorApproval (the ceremony)"
require_pattern 'ceremonyVerified' "$GATE_HELPER" \
  "_operator-gate-cli.js must expose ceremonyVerified so callers cannot thread a raw CLI flag"
require_pattern 'roleMapReachesRealProvider' "$GATE_HELPER" \
  "_operator-gate-cli.js must consult role-provider-map (an explicit --provider is NOT authoritative on a role-routed lane)"

# 2. Every CLI that can reach a real model consults the shared gate. run-dataset-mission.js is
#    deliberately absent: its lane cannot thread operator approval, so it refuses up front instead
#    (asserted separately below) rather than consuming a one-shot token for a run that must fail.
for cli in run-workflow.js run-research-task.js test-llm-connection.js run-live-llm-verification.js; do
  require_pattern 'enforceOperatorGate' "$ROOT/scripts/$cli" \
    "scripts/$cli must call enforceOperatorGate before reaching a model"
done

# 3. run-workflow.js is the production lane: it must declare itself role-routed (so a defaultProvider
#    edit cannot exempt it) and must thread the gate's VERDICT downstream, never the raw flag.
require_pattern 'roleRouted:[[:space:]]*true' "$ROOT/scripts/run-workflow.js" \
  "run-workflow.js must pass roleRouted:true — it dispatches through role-router, so config/agent-config.json defaultProvider must not decide its gate"
require_pattern 'operatorApproved:[[:space:]]*gate\.ceremonyVerified' "$ROOT/scripts/run-workflow.js" \
  "run-workflow.js must thread gate.ceremonyVerified as operatorApproved — forwarding args.operatorApprove lets the router's PHASE15_HUMAN_APPROVAL_REQUIRED be satisfied by an unverified value"

# 4. The dead lanes refuse BEFORE the gate, so an impossible run never burns a physical touch.
require_pattern 'LANE_IS_AUTHORIZATION_CAPABLE' "$ROOT/scripts/run-dataset-mission.js" \
  "run-dataset-mission.js must keep its explicit authorization-capability guard"
require_pattern 'lane_cannot_thread_operator_approval' "$ROOT/scripts/run-research-task.js" \
  "run-research-task.js must refuse mission/resume BEFORE consuming the one-shot token"

# 5. A refusal must never be masked by a broken audit sink.
require_pattern 'function denyAndExit' "$ROOT/scripts/run-research-task.js" \
  "run-research-task.js must route rejections through denyAndExit (reason to stderr first, then the ledger append)"

echo "Operator gate policy verification passed"
