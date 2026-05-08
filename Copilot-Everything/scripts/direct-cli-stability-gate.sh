#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command curl
require_command jq
require_command node
require_command npm
require_command obsidian
require_command pm2

VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

RUN_TS="$(timestamp)"
RUN_DIR="$VALIDATION_DIR/direct-cli-stability-gate-$RUN_TS"
ensure_dir "$RUN_DIR"

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
[[ -f "$MCP_CONFIG_PATH" ]] || die "Missing MCP config: $MCP_CONFIG_PATH"

EMULATOR_BASE_URL="${EMULATOR_BASE_URL:-http://127.0.0.1:8789}"
BRIDGE_MODE="$(jq -r '.transport.mode // "http"' "$MCP_CONFIG_PATH")"
BRIDGE_HOST="$(jq -r '.transport.host // "127.0.0.1"' "$MCP_CONFIG_PATH")"
BRIDGE_PORT="$(jq -r '.transport.port // 8798' "$MCP_CONFIG_PATH")"
BRIDGE_UDS_PATH="$(jq -r '.transport.udsPath // empty' "$MCP_CONFIG_PATH")"
BRIDGE_PIPE_NAME="$(jq -r '.transport.pipeName // empty' "$MCP_CONFIG_PATH")"
BRIDGE_BASE_URL="http://$BRIDGE_HOST:$BRIDGE_PORT"
MCP_TOKEN="$(jq -r '.security.authToken // empty' "$MCP_CONFIG_PATH")"
[[ -n "$MCP_TOKEN" ]] || die "Missing bridge auth token in $MCP_CONFIG_PATH"

REQUIRED_VAULT_NAME="$(jq -r '.cliStability.requiredVaultNames[0] // empty' "$MCP_CONFIG_PATH")"
if [[ -z "$REQUIRED_VAULT_NAME" ]]; then
  REQUIRED_VAULT_NAME="$(basename "$PRODUCTION_VAULT")"
fi

CLI_BINARY="$(jq -r '.obsidianCliBinary // "obsidian"' "$MCP_CONFIG_PATH")"
[[ -n "$CLI_BINARY" ]] || CLI_BINARY="obsidian"
EXECUTE_COMMAND_ID="${OBSIDIAN_LIVE_EXECUTE_COMMAND_ID:-app:go-back}"
COLD_LAUNCH_REQUESTED="${OBSIDIAN_DIRECT_CLI_FORCE_COLD_LAUNCH:-1}"
SKIP_BRIDGE_REGRESSION="${OBSIDIAN_DIRECT_CLI_SKIP_BRIDGE_REGRESSION:-0}"

PM2_JSON="$RUN_DIR/pm2-jlist.json"
SUMMARY_FILE="$RUN_DIR/summary.txt"

pm2 jlist >"$PM2_JSON"
jq -e '
  map(select(.name == "backend-emulator" or .name == "mcp-bridge"))
  | length == 2
  and all(.[]; .pm2_env.status == "online")
' "$PM2_JSON" >/dev/null || die "Required PM2 processes are not online."

curl -sS "$EMULATOR_BASE_URL/healthz" >"$RUN_DIR/backend-emulator-health.json"
jq -e '.ok == true and .status == "ready" and .bridgeOk == true' "$RUN_DIR/backend-emulator-health.json" >/dev/null \
  || die "Backend emulator health check failed."

curl -sS "$BRIDGE_BASE_URL/healthz" >"$RUN_DIR/mcp-bridge-health.json"
jq -e '.ok == true and .status == "ready"' "$RUN_DIR/mcp-bridge-health.json" >/dev/null \
  || die "MCP bridge health check failed."

INITIAL_RUNNING="false"
if obsidian_main_pid >/dev/null 2>&1; then
  INITIAL_RUNNING="true"
fi

force_obsidian_stopped() {
  if ! obsidian_main_pid >/dev/null 2>&1; then
    return 0
  fi

  osascript -e 'tell application "Obsidian" to quit' >/dev/null 2>&1 || true
  for _attempt in {1..30}; do
    if ! obsidian_main_pid >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  die "Forced cold-launch requested, but Obsidian did not exit in time."
}

reopen_production_vault() {
  /usr/bin/open -a Obsidian "$PRODUCTION_VAULT" >/dev/null 2>&1 || die "Failed to reopen production vault."
  sleep 2
}

run_bridge_gate() {
  local label="$1"
  local log_path="$RUN_DIR/${label}.log"
  "$SCRIPT_DIR/cli-stability-gate.sh" >"$log_path" 2>&1 || {
    cat "$log_path" >&2
    die "Bridge-backed regression check failed for $label."
  }
  printf '%s\n' "$log_path"
}

restore_bridge_parity() {
  local label="$1"
  local reopen_log="$RUN_DIR/${label}.reopen.log"
  local parity_log="$RUN_DIR/${label}.bridge-health-check.log"
  reopen_production_vault >"$reopen_log" 2>&1
  "$SCRIPT_DIR/bridge-health-check.sh" >"$parity_log" 2>&1 || {
    cat "$parity_log" >&2
    die "Bridge parity check failed after $label."
  }
}

case "$BRIDGE_MODE" in
  http)
    export OBSIDIAN_LIVE_MCP_HTTP_URL="$BRIDGE_BASE_URL"
    unset OBSIDIAN_LIVE_MCP_UDS_PATH OBSIDIAN_LIVE_MCP_PIPE_NAME
    ;;
  uds)
    [[ -n "$BRIDGE_UDS_PATH" ]] || die "UDS transport selected but udsPath missing in config."
    export OBSIDIAN_LIVE_MCP_UDS_PATH="$BRIDGE_UDS_PATH"
    unset OBSIDIAN_LIVE_MCP_HTTP_URL OBSIDIAN_LIVE_MCP_PIPE_NAME
    ;;
  pipe)
    [[ -n "$BRIDGE_PIPE_NAME" ]] || die "Pipe transport selected but pipeName missing in config."
    export OBSIDIAN_LIVE_MCP_PIPE_NAME="$BRIDGE_PIPE_NAME"
    unset OBSIDIAN_LIVE_MCP_HTTP_URL OBSIDIAN_LIVE_MCP_UDS_PATH
    ;;
  *)
    die "Unsupported bridge transport mode: $BRIDGE_MODE"
    ;;
esac

npm --prefix "$BRIDGE_REPO" run build >"$RUN_DIR/mcp-server-build.log" 2>&1 || {
  cat "$RUN_DIR/mcp-server-build.log" >&2
  die "mcp-server build failed."
}

run_direct_iteration() {
  local mode="$1"
  local iteration="$2"
  local force_cold_launch="$3"
  local log_path="$RUN_DIR/live-direct-cli-${mode}-${iteration}.log"

  if [[ "$force_cold_launch" == "1" ]]; then
    force_obsidian_stopped
  fi

  OBSIDIAN_LIVE_TEST=1 \
  OBSIDIAN_LIVE_VAULT_PATH="$PRODUCTION_VAULT" \
  OBSIDIAN_LIVE_VAULT_NAME="$REQUIRED_VAULT_NAME" \
  OBSIDIAN_LIVE_CLI_BIN="$CLI_BINARY" \
  OBSIDIAN_LIVE_MCP_TOKEN="$MCP_TOKEN" \
  OBSIDIAN_LIVE_VALIDATION_CONTRACT="full_direct_cli" \
  OBSIDIAN_LIVE_EXECUTE_COMMAND_ID="$EXECUTE_COMMAND_ID" \
  OBSIDIAN_DIRECT_CLI_FORCE_COLD_LAUNCH="$force_cold_launch" \
  npm --prefix "$BRIDGE_REPO" run live:communication:cli >"$log_path" 2>&1 || {
    cat "$log_path" >&2
    die "Raw direct CLI validation failed for ${mode} iteration ${iteration}."
  }

  restore_bridge_parity "post-${mode}-${iteration}"
}

BEFORE_BRIDGE_LOG="skipped"
AFTER_COLD_BRIDGE_LOG="skipped"
AFTER_WARM_BRIDGE_LOG="skipped"

if [[ "$SKIP_BRIDGE_REGRESSION" != "1" ]]; then
  BEFORE_BRIDGE_LOG="$(run_bridge_gate bridge-contract-before-direct)"
fi

if [[ "$COLD_LAUNCH_REQUESTED" == "1" ]]; then
  for iteration in 1 2 3; do
    run_direct_iteration "cold" "$iteration" "1"
  done
fi

if [[ "$SKIP_BRIDGE_REGRESSION" != "1" ]]; then
  AFTER_COLD_BRIDGE_LOG="$(run_bridge_gate bridge-contract-after-cold)"
fi

reopen_production_vault >/dev/null 2>&1 || true
for iteration in 1 2 3; do
  run_direct_iteration "warm" "$iteration" "0"
done

if [[ "$SKIP_BRIDGE_REGRESSION" != "1" ]]; then
  AFTER_WARM_BRIDGE_LOG="$(run_bridge_gate bridge-contract-after-warm)"
fi

{
  echo "run_dir=$RUN_DIR"
  echo "required_vault=$REQUIRED_VAULT_NAME"
  echo "initial_running=$INITIAL_RUNNING"
  echo "cold_launch_requested=$COLD_LAUNCH_REQUESTED"
  echo "validation_contract=full_direct_cli"
  echo "execute_command_id=$EXECUTE_COMMAND_ID"
  echo "bridge_mode=$BRIDGE_MODE"
  echo "cli_binary=$CLI_BINARY"
  echo "bridge_regression_status=$([[ \"$SKIP_BRIDGE_REGRESSION\" == \"1\" ]] && printf 'skipped' || printf 'passed')"
  echo "bridge_regression_log_before=$BEFORE_BRIDGE_LOG"
  echo "bridge_regression_log_after_cold=$AFTER_COLD_BRIDGE_LOG"
  echo "bridge_regression_log_after_warm=$AFTER_WARM_BRIDGE_LOG"
  for mode in cold warm; do
    for iteration in 1 2 3; do
      local_log="$RUN_DIR/live-direct-cli-${mode}-${iteration}.log"
      if [[ -f "$local_log" ]]; then
        echo "live_validation_log_${mode}_${iteration}=$local_log"
      fi
    done
  done
} >"$SUMMARY_FILE"

echo "Raw direct CLI stability gate passed."
echo "  summary: $SUMMARY_FILE"
if [[ "$SKIP_BRIDGE_REGRESSION" != "1" ]]; then
  echo "  bridge:  $AFTER_WARM_BRIDGE_LOG"
fi
