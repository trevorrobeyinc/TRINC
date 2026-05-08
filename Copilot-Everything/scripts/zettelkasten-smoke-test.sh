#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
set +e

require_command jq
require_command curl

SELF_HOST_API_KEY="$(resolve_self_host_api_key)"
EMULATOR_BASE_URL="${EMULATOR_BASE_URL:-http://127.0.0.1:8789}"

PASS=0
FAIL=0
SKIP=0

check() {
  local name="$1"
  local description="$2"
  shift 2
  if "$@" >/dev/null 2>&1; then
    echo "  PASS  $name — $description"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $name — $description"
    FAIL=$((FAIL + 1))
  fi
}

echo "Zettelkasten Backend Smoke Test"
echo "================================"
echo "Emulator: $EMULATOR_BASE_URL"
echo

# ── Endpoint reachability ────────────────────────────────────────────

check "ZK-01" "Serendipity endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/serendipity" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"Emergence is a phenomenon where complex systems exhibit properties not present in their individual parts.","options":{"limit":3}}'

check "ZK-02" "Cross-Domain endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/cross-domain" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"Feedback loops amplify or dampen system behavior over time.","options":{"limit":3}}'

check "ZK-03" "Echo Chamber endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/echo-chamber" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"AI will eventually surpass human intelligence in every domain.","options":{"limit":3}}'

check "ZK-04" "Semantic Linker endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/semantic-linker" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"Antifragility is a property of systems that benefit from disorder.","options":{"limit":5}}'

check "ZK-05" "Orphan Rescue endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/orphan-rescue" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"A disconnected thought about the nature of randomness.","options":{"limit":3}}'

check "ZK-06" "Vault Health endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/health" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{}'

check "ZK-07" "Pipeline endpoint accepts request" \
  curl -sS -f -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/pipeline" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"Systems thinking connects feedback loops to emergent behavior.","steps":[{"command":"serendipity"},{"command":"cross-domain"}]}'

# ── Response validation ──────────────────────────────────────────────

check_response_shape() {
  local endpoint="$1"
  local out
  out="$(curl -sS -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/$endpoint" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"noteContent":"Test content for shape validation.","options":{"limit":2}}' 2>/dev/null)"
  echo "$out" | jq -e '.ok == true and .command != null and .content != null and .metadata != null' >/dev/null 2>&1
}

check "ZK-08" "Serendipity response has correct shape" check_response_shape "serendipity"
check "ZK-09" "Cross-Domain response has correct shape" check_response_shape "cross-domain"
check "ZK-10" "Echo Chamber response has correct shape" check_response_shape "echo-chamber"

# ── Health endpoint returns structured score ─────────────────────────

check_health_score() {
  local out
  out="$(curl -sS -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/health" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{}' 2>/dev/null)"
  echo "$out" | jq -e '.ok == true and .healthScore != null and .healthScore.totalFiles >= 0' >/dev/null 2>&1
}

check "ZK-11" "Health response includes VaultHealthScore" check_health_score

echo
echo "================================"
echo "Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo

[[ "$FAIL" -eq 0 ]]
