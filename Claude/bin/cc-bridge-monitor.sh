#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="$HOME/Code/Claude/.logs"
EVENTS_LOG="$LOG_DIR/cc-bridge-monitor.events.jsonl"
STATE_FILE="$LOG_DIR/.cc-bridge-last-state"
mkdir -p "$LOG_DIR"

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log_event() {
  local level="$1" event="$2" detail="${3:-}"
  echo "{\"timestamp\":\"$(timestamp)\",\"level\":\"$level\",\"event\":\"$event\",\"detail\":\"$detail\"}" >> "$EVENTS_LOG"
}

last_state=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")
current_state="unknown"

# Check Obsidian
if ! pgrep -x "Obsidian" > /dev/null 2>&1; then
  current_state="obsidian_closed"
  if [ "$last_state" != "$current_state" ]; then
    log_event "info" "obsidian_not_running" "skipping bridge check"
  fi
  echo "$current_state" > "$STATE_FILE"
  exit 0
fi

# Check CC bridge
if response=$(curl -s -m 3 --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8799/health 2>&1); then
  if echo "$response" | grep -q '"ok"' 2>/dev/null || echo "$response" | grep -q '"status"' 2>/dev/null; then
    current_state="bridge_healthy"
    if [ "$last_state" != "$current_state" ]; then
      log_event "info" "bridge_healthy" "CC bridge responding on :8799"
    fi
  else
    current_state="bridge_unhealthy"
    if [ "$last_state" != "$current_state" ]; then
      log_event "warn" "bridge_unhealthy_response" "unexpected response from :8799"
    fi
  fi
else
  current_state="bridge_unreachable"
  if [ "$last_state" != "$current_state" ]; then
    log_event "error" "bridge_unreachable" "Obsidian running but :8799 not responding"
  fi
fi

echo "$current_state" > "$STATE_FILE"

# Rotate if > 5MB
if [ -f "$EVENTS_LOG" ] && [ "$(stat -f%z "$EVENTS_LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv "$EVENTS_LOG" "$EVENTS_LOG.$(date +%Y%m%d).old"
  log_event "info" "log_rotated" "previous log archived"
fi
