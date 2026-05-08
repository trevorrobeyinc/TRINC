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
RUN_DIR="$VALIDATION_DIR/cli-stability-gate-$RUN_TS"
ensure_dir "$RUN_DIR"

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
[[ -f "$MCP_CONFIG_PATH" ]] || die "Missing MCP config: $MCP_CONFIG_PATH"
BRIDGE_SERVER_DIR="$BRIDGE_REPO"
[[ -d "$BRIDGE_SERVER_DIR/dist" ]] || die "Missing bridge build output: $BRIDGE_SERVER_DIR/dist"

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

HEALTH_JSON="$RUN_DIR/bridge-health.json"
VAULTS_FILE="$RUN_DIR/registered-vaults.txt"
PM2_JSON="$RUN_DIR/pm2-jlist.json"
BRIDGE_HEALTH_LOG="$RUN_DIR/bridge-health-check.log"
LIVE_VALIDATION_LOG="$RUN_DIR/live-communication-cli.log"
SUMMARY_FILE="$RUN_DIR/summary.txt"
DIRECT_PROBE_JSON="$CONFIG_ROOT/validation/direct-cli-probe-with-bridge-runtime-env.json"

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

if [[ "${OBSIDIAN_CLI_STABILITY_FORCE_COLD_LAUNCH:-0}" == "1" ]]; then
  if obsidian_main_pid >/dev/null 2>&1; then
    osascript -e 'tell application "Obsidian" to quit' >/dev/null 2>&1 || true
    for _attempt in {1..30}; do
      if ! obsidian_main_pid >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done
    if obsidian_main_pid >/dev/null 2>&1; then
      die "Forced cold-launch requested, but Obsidian did not exit in time."
    fi
    INITIAL_RUNNING="false"
  fi
fi

"$SCRIPT_DIR/bridge-health-check.sh" >"$BRIDGE_HEALTH_LOG" 2>&1 || {
  cat "$BRIDGE_HEALTH_LOG" >&2
  die "Bridge health parity check failed."
}

[[ -f "$DIRECT_PROBE_JSON" ]] || die "Bridge runtime direct probe output missing: $DIRECT_PROBE_JSON"
jq -r '
  .diagnostics.requiredVaults[]?
  | "\(.name)\t\(.registered)\t\(.path // "")"
' "$DIRECT_PROBE_JSON" >"$VAULTS_FILE"
jq -e --arg requiredVault "$REQUIRED_VAULT_NAME" '
  any(.diagnostics.requiredVaults[]?; .name == $requiredVault and .registered == true)
' "$DIRECT_PROBE_JSON" >/dev/null || die "Required vault '$REQUIRED_VAULT_NAME' is not registered with Obsidian CLI."

OBSIDIAN_MCP_CONFIG="$MCP_CONFIG_PATH" node "$SCRIPT_DIR/mcp-health-check.js" >"$HEALTH_JSON"

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

OBSIDIAN_LIVE_TEST=1 \
OBSIDIAN_LIVE_VAULT_PATH="$PRODUCTION_VAULT" \
OBSIDIAN_LIVE_VAULT_NAME="$REQUIRED_VAULT_NAME" \
OBSIDIAN_LIVE_CLI_BIN="$CLI_BINARY" \
OBSIDIAN_LIVE_MCP_TOKEN="$MCP_TOKEN" \
OBSIDIAN_LIVE_VALIDATION_CONTRACT="bridge_contract" \
OBSIDIAN_LIVE_EXECUTE_COMMAND_ID="$EXECUTE_COMMAND_ID" \
npm --prefix "$BRIDGE_REPO" run live:communication:cli >"$LIVE_VALIDATION_LOG" 2>&1 || {
  cat "$LIVE_VALIDATION_LOG" >&2
  die "Live communication + CLI validation failed."
}

LAUNCH_ATTEMPTED="$(jq -r '.cli.diagnostics.launch.launchAttempted // false' "$HEALTH_JSON")"
READINESS_STATUS="$(jq -r '.cli.diagnostics.launch.readinessStatus // "unknown"' "$HEALTH_JSON")"
PARSED_VERSION="$(jq -r '.cli.diagnostics.parsedVersion // empty' "$HEALTH_JSON")"
RESOLVED_BINARY="$(jq -r '.cli.diagnostics.resolvedBinaryPath // empty' "$HEALTH_JSON")"

if [[ "$READINESS_STATUS" != "ready" && "$READINESS_STATUS" != "launched_and_ready" ]]; then
  die "CLI diagnostics did not report a ready state."
fi

{
  echo "run_dir=$RUN_DIR"
  echo "required_vault=$REQUIRED_VAULT_NAME"
  echo "initial_running=$INITIAL_RUNNING"
  echo "launch_attempted=$LAUNCH_ATTEMPTED"
  echo "readiness_status=$READINESS_STATUS"
  echo "parsed_version=$PARSED_VERSION"
  echo "resolved_binary=$RESOLVED_BINARY"
  echo "validation_contract=bridge_contract"
  echo "execute_command_id=$EXECUTE_COMMAND_ID"
  echo "bridge_mode=$BRIDGE_MODE"
  echo "bridge_health_log=$BRIDGE_HEALTH_LOG"
  echo "live_validation_log=$LIVE_VALIDATION_LOG"
  echo "health_json=$HEALTH_JSON"
} >"$SUMMARY_FILE"

echo "CLI stability gate passed."
echo "  summary: $SUMMARY_FILE"
echo "  health:  $HEALTH_JSON"
echo "  live:    $LIVE_VALIDATION_LOG"
