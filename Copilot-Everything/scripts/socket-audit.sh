#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command lsof
require_command ps
require_command awk

EMULATOR_PORT="${EMULATOR_PORT:-8789}"
BRIDGE_PORT="${BRIDGE_PORT:-8798}"
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
REQUIRE_LISTENERS="${SOCKET_AUDIT_REQUIRE_LISTENERS:-false}"
LEGACY_PROCESS_REGEX="${LEGACY_PROCESS_REGEX:-prompt-bridge-hybrid|obsidian-bridge-fork}"

list_listeners() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null \
    | awk 'NR>1 {name=""; for (i=9; i<=NF; i++) name = name (i==9 ? "" : " ") $i; print $1 "\t" $2 "\t" name}'
}

assert_listener() {
  local label="$1"
  local port="$2"

  mapfile -t listeners < <(list_listeners "$port")
  local count="${#listeners[@]}"
  if [[ "$count" -eq 0 ]]; then
    if [[ "${REQUIRE_LISTENERS,,}" == "true" ]]; then
      die "$label listener missing on ${LISTEN_HOST}:${port}."
    fi
    echo "$label listener not running on ${LISTEN_HOST}:${port} (allowed in preflight mode)."
    return 0
  fi

  if [[ "$count" -ne 1 ]]; then
    printf '%s\n' "${listeners[@]}" >&2
    die "$label has ${count} listeners on port ${port}; expected exactly 1."
  fi

  IFS=$'\t' read -r command pid address <<<"${listeners[0]}"

  if [[ "$address" != *"${LISTEN_HOST}:${port}"* && "$address" != *"localhost:${port}"* ]]; then
    die "$label listener is not bound to ${LISTEN_HOST}:${port} (found: ${address})."
  fi

  local process_command
  process_command="$(ps -p "$pid" -o command= || true)"
  if [[ -z "$process_command" ]]; then
    die "Could not inspect process command for ${label} pid=${pid}."
  fi

  if [[ "${process_command,,}" =~ $LEGACY_PROCESS_REGEX ]]; then
    die "$label listener is hosted by a legacy prompt-bridge process (pid=${pid})."
  fi

  echo "$label listener OK: pid=${pid} command=${command} address=${address}"
}

assert_no_legacy_bridge_processes() {
  local matches=()
  while IFS= read -r process_line; do
    if [[ "${process_line,,}" =~ $LEGACY_PROCESS_REGEX ]]; then
      if [[ "${process_line,,}" == *"socket-audit.sh"* ]]; then
        continue
      fi
      matches+=("$process_line")
    fi
  done < <(ps ax -o pid=,command=)

  if [[ "${#matches[@]}" -gt 0 ]]; then
    printf '%s\n' "${matches[@]}" >&2
    die "Detected legacy prompt-bridge active process(es); decommission validation failed."
  fi
}

assert_listener "Emulator" "$EMULATOR_PORT"
assert_listener "MCP bridge" "$BRIDGE_PORT"
assert_no_legacy_bridge_processes

echo "Socket audit passed for ${LISTEN_HOST}:${EMULATOR_PORT} and ${LISTEN_HOST}:${BRIDGE_PORT}."
