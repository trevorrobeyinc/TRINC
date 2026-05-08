#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"
set +e

require_command jq
require_command curl
require_command node
require_command npm

RUN_TS="$(timestamp)"
RUN_DIR="$CONFIG_ROOT/validation/full-functional-sweep-$RUN_TS"
REPORT_FILE="$RUN_DIR/report.md"
RESULTS_FILE="$RUN_DIR/results.tsv"
ensure_dir "$RUN_DIR"

printf 'id\tstatus\tdescription\tartifact\n' >"$RESULTS_FILE"

SELF_HOST_API_KEY="$(resolve_self_host_api_key)"
EMULATOR_BASE_URL="${EMULATOR_BASE_URL:-http://127.0.0.1:8789}"
BRIDGE_BASE_URL="${BRIDGE_BASE_URL:-https://127.0.0.1:8798}"
OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
MCP_BRIDGE_AUTH_TOKEN=""
if [[ -f "$MCP_CONFIG_PATH" ]]; then
  MCP_BRIDGE_AUTH_TOKEN="$(jq -r '.security.authToken // empty' "$MCP_CONFIG_PATH")"
fi

record_result() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$RESULTS_FILE"
}

run_cmd_check() {
  local id="$1"
  local description="$2"
  shift 2
  local log_file="$RUN_DIR/${id}.log"
  if "$@" >"$log_file" 2>&1; then
    record_result "$id" "PASS" "$description" "$log_file"
    return 0
  fi
  record_result "$id" "FAIL" "$description" "$log_file"
  return 1
}

run_optional_cmd_check() {
  local id="$1"
  local description="$2"
  local reason="$3"
  shift 3
  local log_file="$RUN_DIR/${id}.log"
  if [[ -n "$reason" ]]; then
    printf '%s\n' "$reason" >"$log_file"
    record_result "$id" "SKIP" "$description" "$log_file"
    return 0
  fi
  run_cmd_check "$id" "$description" "$@"
}

write_markdown_report() {
  {
    echo "# Functional Test Report"
    echo
    echo "Run timestamp: $RUN_TS"
    echo
    echo "| ID | Status | Description | Artifact |"
    echo "|---|---|---|---|"
    while IFS=$'\t' read -r id status description artifact; do
      [[ "$id" == "id" ]] && continue
      echo "| $id | $status | $description | $artifact |"
    done <"$RESULTS_FILE"
  } >"$REPORT_FILE"
}

check_emulator_health() {
  local out="$RUN_DIR/CORE-01.json"
  curl -sS "$EMULATOR_BASE_URL/healthz" >"$out" &&
    jq -e '.ok == true and .status == "ready" and .bridgeOk == true' "$out" >/dev/null
}

check_bridge_health_http() {
  local out="$RUN_DIR/CORE-02.json"
  curl -sS "$BRIDGE_BASE_URL/healthz" >"$out" &&
    jq -e '.ok == true and .status == "ready"' "$out" >/dev/null
}

check_ollama_tags() {
  local out="$RUN_DIR/CORE-06.json"
  curl -sS "$OLLAMA_BASE_URL/api/tags" >"$out" &&
    jq -e '(.models | type == "array") and any(.models[]; .name == "llama3.1:8b")' "$out" >/dev/null
}

check_ollama_generate() {
  local out="$RUN_DIR/CORE-07.json"
  curl -sS -X POST "$OLLAMA_BASE_URL/api/generate" \
    -H "Content-Type: application/json" \
    -d '{"model":"llama3.1:8b","prompt":"Reply with OK only.","stream":false}' >"$out" &&
    jq -e '.response | strings | length > 0' "$out" >/dev/null
}

check_direct_miyo_health() {
  local base_url
  base_url="$(detect_miyo_base_url || true)"
  [[ -n "$base_url" ]] || {
    echo "No Miyo service file detected."
    return 2
  }
  local out="$RUN_DIR/CORE-09.json"
  curl -sS "$base_url/health" >"$out" &&
    jq -e 'type == "object"' "$out" >/dev/null
}

check_self_host_turn() {
  local out="$RUN_DIR/BACKEND-04.json"
  curl -sS -X POST "$EMULATOR_BASE_URL/v1/self-host/agent-turn" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{
      "requestId":"functional-sweep-agent-turn",
      "executionMode":"exact_backend_emulator",
      "runtimeLane":"production_official",
      "chainType":"copilot_plus",
      "rawUserMessage":"Reply with OK only.",
      "messages":[
        {"role":"system","content":"You are Copilot MCP."},
        {"role":"user","content":"Reply with OK only."}
      ],
      "tools":[],
      "responseStyle":{"stream":false,"includeReasoning":true}
    }' >"$out" &&
    jq -e '.ok == true' "$out" >/dev/null
}

check_self_host_tool_call() {
  local out="$RUN_DIR/BACKEND-05.json"
  curl -sS -X POST "$EMULATOR_BASE_URL/v1/self-host/tool-call" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d '{"tool":"obsidian_health","input":{}}' >"$out" &&
    jq -e '.ok == true' "$out" >/dev/null
}

check_mcp_tool_direct() {
  [[ -n "$MCP_BRIDGE_AUTH_TOKEN" ]] || {
    echo "Missing MCP bridge auth token in $MCP_CONFIG_PATH"
    return 2
  }
  local out="$RUN_DIR/BACKEND-05-bridge.json"
  local body='{"tool":"obsidian_health","input":{}}'
  local nonce
  nonce="$(node -e 'console.log(require("node:crypto").randomUUID())')"
  local ts
  ts="$(node -e 'console.log(Date.now())')"
  local body_hash
  body_hash="$(printf '%s' "$body" | shasum -a 256 | awk '{print $1}')"
  curl -sS -X POST "$BRIDGE_BASE_URL/mcp/tool" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MCP_BRIDGE_AUTH_TOKEN" \
    -H "X-MCP-Token: $MCP_BRIDGE_AUTH_TOKEN" \
    -H "X-MCP-Timestamp: $ts" \
    -H "X-MCP-Nonce: $nonce" \
    -H "X-MCP-Body-SHA256: $body_hash" \
    -d "$body" >"$out" &&
    jq -e '.ok == true' "$out" >/dev/null
}

run_cmd_check "PRE-01" "Emulator and MCP bridge listener audit" env SOCKET_AUDIT_REQUIRE_LISTENERS=true "$SCRIPT_DIR/socket-audit.sh"
run_cmd_check "CORE-01" "Backend emulator health endpoint" check_emulator_health
run_cmd_check "CORE-02" "MCP bridge health endpoint" check_bridge_health_http
run_cmd_check "CORE-03" "Bridge CLI probe alignment" "$SCRIPT_DIR/bridge-health-check.sh"
run_cmd_check "CORE-04" "Current-stack CLI stability gate" "$SCRIPT_DIR/cli-stability-gate.sh"
run_cmd_check "CORE-05" "Raw direct CLI gate" "$SCRIPT_DIR/direct-cli-stability-gate.sh"
run_cmd_check "CORE-06" "Ollama model inventory" check_ollama_tags
run_cmd_check "CORE-07" "Ollama text generation" check_ollama_generate

check_direct_miyo_health >"$RUN_DIR/CORE-09.log" 2>&1
case $? in
  0) record_result "CORE-09" "PASS" "Direct Miyo health probe" "$RUN_DIR/CORE-09.log" ;;
  2) record_result "CORE-09" "SKIP" "Direct Miyo health probe" "$RUN_DIR/CORE-09.log" ;;
  *) record_result "CORE-09" "FAIL" "Direct Miyo health probe" "$RUN_DIR/CORE-09.log" ;;
esac

run_cmd_check "BACKEND-01" "Backend contract tests" "$SCRIPT_DIR/backend-contract-test.sh"
run_cmd_check "BACKEND-02" "Backend smoke test" "$SCRIPT_DIR/backend-smoke-test.sh"
run_cmd_check "BACKEND-03" "Backend + bridge compat sweep" "$SCRIPT_DIR/backend-bridge-compat-test.sh"
run_cmd_check "BACKEND-04" "Buffered self-host turn" check_self_host_turn
run_cmd_check "BACKEND-05" "Deterministic self-host tool call" check_self_host_tool_call

check_mcp_tool_direct >"$RUN_DIR/BACKEND-05-bridge.log" 2>&1
case $? in
  0) record_result "BACKEND-06" "PASS" "Direct MCP bridge tool call" "$RUN_DIR/BACKEND-05-bridge.log" ;;
  2) record_result "BACKEND-06" "SKIP" "Direct MCP bridge tool call" "$RUN_DIR/BACKEND-05-bridge.log" ;;
  *) record_result "BACKEND-06" "FAIL" "Direct MCP bridge tool call" "$RUN_DIR/BACKEND-05-bridge.log" ;;
esac

run_cmd_check "MIYO-01" "Official plugin Miyo compatibility" "$SCRIPT_DIR/official-plugin-miyo-check.sh"
run_cmd_check "ZK-01" "Zettelkasten smoke test" "$SCRIPT_DIR/zettelkasten-smoke-test.sh"

run_cmd_check "TEST-01" "Backend package tests" bash -lc "cd '$WORKSPACE_ROOT/backend/copilot-backend-emulator' && npm test"
run_cmd_check "TEST-02" "Raycast extension tests" bash -lc "cd '$WORKSPACE_ROOT/bridges/raycast-obsidian-extension' && npm test"
run_cmd_check "TEST-03" "MCP bridge tests" bash -lc "cd '$WORKSPACE_ROOT/bridges/obsidian-copilot-bridge' && npm test"
run_cmd_check "TEST-04" "Copilot MCP repo tests" bash -lc "cd '$WORKSPACE_ROOT/repos/obsidian-copilot-mcp' && npm test"

write_markdown_report

echo "Functional sweep complete."
echo "  run dir:  $RUN_DIR"
echo "  report:   $REPORT_FILE"
echo "  results:  $RESULTS_FILE"
