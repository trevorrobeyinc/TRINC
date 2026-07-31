#!/usr/bin/env bash
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

has_rg() {
  if [[ "${PHASE15_POLICY_FORCE_NO_RG:-0}" == "1" ]]; then
    return 1
  fi
  command -v rg >/dev/null 2>&1
}

search_quiet() {
  local pattern="$1"
  local file_path="$2"
  if has_rg; then
    rg -q -- "$pattern" "$file_path"
    return
  fi
  grep -Eq -- "$pattern" "$file_path"
}

search_lines() {
  local pattern="$1"
  shift
  if has_rg; then
    rg -n --glob '*.js' -- "$pattern" "$@" || true
    return
  fi
  grep -R -nE --include='*.js' -- "$pattern" "$@" || true
}

REQUIRED_FILES=(
  "$ROOT/config/agent-topology.json"
  "$ROOT/config/autonomy-ladder.json"
  "$ROOT/openclaw-bridge/core/agent-registry.js"
  "$ROOT/openclaw-bridge/core/role-router.js"
  "$ROOT/openclaw-bridge/core/lane-queue.js"
  "$ROOT/openclaw-bridge/core/comms-bus.js"
  "$ROOT/openclaw-bridge/core/autonomy-ladder.js"
  "$ROOT/openclaw-bridge/core/heartbeat-state.js"
  "$ROOT/scripts/verify-phase15-policy.sh"
  "$ROOT/tests/security/phase15-policy-gate.test.js"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$file" ]] || fail "Missing Phase 15 file: $file"
done

for dir in "$ROOT/workspace/comms/inbox" "$ROOT/workspace/comms/outbox" "$ROOT/workspace/comms/blackboard" "$ROOT/workspace/comms/events"; do
  [[ -d "$dir" ]] || fail "Missing Phase 15 comms directory: $dir"
done

SCAN_TARGETS=(
  "$ROOT/openclaw-bridge/core/agent-registry.js"
  "$ROOT/openclaw-bridge/core/role-router.js"
  "$ROOT/openclaw-bridge/core/lane-queue.js"
  "$ROOT/openclaw-bridge/core/comms-bus.js"
  "$ROOT/openclaw-bridge/core/autonomy-ladder.js"
  "$ROOT/openclaw-bridge/core/heartbeat-state.js"
)

NETWORK_HITS="$(search_lines 'fetch\(|axios|http\.request\(|https\.request\(|node:http|node:https|\bnet\b|node:net|\btls\b|node:tls|WebSocket' "${SCAN_TARGETS[@]}")"
if [[ -n "$NETWORK_HITS" ]]; then
  echo "$NETWORK_HITS" >&2
  fail "Phase 15 modules must remain network-free"
fi

search_quiet 'context\.supervisorDecision' "$ROOT/openclaw-bridge/core/role-router.js" || fail "role-router missing supervisor mediation marker"
search_quiet 'SUPERVISOR_APPROVAL_REQUIRED' "$ROOT/openclaw-bridge/core/role-router.js" || fail "role-router missing fail-closed supervisor denial marker"

# The OPERATOR human-approval gate had no marker here, so deleting the throw at role-router.js
# entirely would still pass every gate in `npm run phase2:gates`. These two mirror the supervisor
# markers above so the operator gate is covered by the same mechanism that covers its sibling.
search_quiet 'context\.operatorApproved' "$ROOT/openclaw-bridge/core/role-router.js" || fail "role-router missing operator human-approval marker"
search_quiet 'PHASE15_HUMAN_APPROVAL_REQUIRED' "$ROOT/openclaw-bridge/core/role-router.js" || fail "role-router missing fail-closed human-approval denial marker"

# The ladder itself is an unsigned 0644 file re-read on every policy check, and nothing asserted
# its CONTENTS. Emptying a role's requireHumanApproval list silently disables the operator gate for
# that role with every gate still green. This invariant is self-maintaining: any role permitted to
# execute_task must also require human approval for it, so a newly added research role is covered
# without editing this script.
LADDER_UNGATED="$(node -e '
const fs = require("node:fs");
const ladder = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const ungated = [];
for (const [role, policy] of Object.entries((ladder && ladder.roles) || {})) {
  const allowed = Array.isArray(policy.allowedActions) ? policy.allowedActions : [];
  const gated = Array.isArray(policy.requireHumanApproval) ? policy.requireHumanApproval : [];
  if (allowed.includes("execute_task") && !gated.includes("execute_task")) {
    ungated.push(role);
  }
}
process.stdout.write(ungated.join(","));
' "$ROOT/config/autonomy-ladder.json")"
if [[ -n "$LADDER_UNGATED" ]]; then
  fail "autonomy ladder: role(s) may execute_task without human approval: $LADDER_UNGATED"
fi
search_quiet 'queue_sequence' "$ROOT/openclaw-bridge/core/lane-queue.js" || fail "lane-queue missing deterministic sequence marker"
search_quiet 'sort\(' "$ROOT/openclaw-bridge/core/lane-queue.js" || fail "lane-queue missing deterministic ordering marker"
search_quiet 'writeAtomic' "$ROOT/openclaw-bridge/core/comms-bus.js" || fail "comms-bus missing atomic write marker"

echo "Phase 15 policy verification passed"
