#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command curl
require_command lsof

VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"
LOG_FILE="$VALIDATION_DIR/bridge-restart.log"
MCP_ENDPOINT="${MCP_ENDPOINT:-https://127.0.0.1:8798}"

if lsof -tiTCP:8798 -sTCP:LISTEN >/dev/null 2>&1; then
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done < <(lsof -tiTCP:8798 -sTCP:LISTEN)

  for _attempt in {1..20}; do
    if ! lsof -tiTCP:8798 -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

nohup "$SCRIPT_DIR/bridge-start.sh" >"$LOG_FILE" 2>&1 &
BRIDGE_PID=$!

for _attempt in {1..40}; do
  if curl -fsS "$MCP_ENDPOINT/healthz" >/dev/null 2>&1; then
    echo "Shared MCP bridge restarted."
    echo "  pid:             $BRIDGE_PID"
    echo "  endpoint:        $MCP_ENDPOINT"
    echo "  log:             $LOG_FILE"
    exit 0
  fi
  sleep 1
done

die "Shared MCP bridge did not become healthy after restart. See $LOG_FILE"
