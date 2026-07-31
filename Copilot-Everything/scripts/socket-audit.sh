#!/usr/bin/env bash
# Socket audit — asserts the canonical :8798 MCP bridge listener state and
# sweeps for legacy prompt-bridge processes.
#
# Modes:
#   default                              — preflight: a missing bridge listener
#                                          is reported but allowed (exit 0)
#   SOCKET_AUDIT_REQUIRE_LISTENERS=true  — the :8798 bridge listener must exist
#                                          (it is owned by the
#                                          obsidian-bridge-launcher plugin, so
#                                          Obsidian must be open)
#
# 2026-07-31 modernization: runs under stock macOS /bin/bash 3.2 — `mapfile`
# and ${var,,} (both bash-4-only) removed. The unconditional "Emulator" assert
# on :8789 was DROPPED, not parameterized: the backend emulator was retired
# 2026-04-11 and deleted 2026-05-08, so require-listeners mode could never
# pass while it asserted a service that no longer exists.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command lsof
require_command ps
require_command awk

BRIDGE_PORT="${BRIDGE_PORT:-8798}"
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
REQUIRE_LISTENERS="${SOCKET_AUDIT_REQUIRE_LISTENERS:-false}"
LEGACY_PROCESS_REGEX="${LEGACY_PROCESS_REGEX:-prompt-bridge-hybrid|obsidian-bridge-fork}"

# ${var,,} is bash-4-only; stock macOS /bin/bash is 3.2. nocasematch (bash
# 3.1+) makes every [[ == ]] / [[ =~ ]] string match in this script
# case-insensitive, which is exactly what the old lowercase expansions
# provided. Every string comparison below wants that; keep it in mind if you
# add a case-SENSITIVE one.
shopt -s nocasematch

list_listeners() {
  local port="$1"
  # `|| true`: lsof exits 1 on zero matches, but "no listeners" is a valid
  # answer here (preflight mode depends on it). Without the mask, pipefail +
  # set -e would kill the script inside the caller's $(...) capture — silently,
  # before any assertion or error message. (The old `mapfile < <(...)` shape
  # hid that status; the string capture does not.)
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null \
    | awk 'NR>1 {name=""; for (i=9; i<=NF; i++) name = name (i==9 ? "" : " ") $i; print $1 "\t" $2 "\t" name}' \
    || true
}

assert_listener() {
  local label="$1"
  local port="$2"

  # bash-3.2-safe replacement for `mapfile -t`: capture the lines in a plain
  # string and count them (3.2 + `set -u` also errors on empty-array
  # expansion, so strings avoid two version traps at once).
  local listeners
  listeners="$(list_listeners "$port")"

  if [[ -z "$listeners" ]]; then
    if [[ "$REQUIRE_LISTENERS" == "true" ]]; then
      die "$label listener missing on ${LISTEN_HOST}:${port}."
    fi
    echo "$label listener not running on ${LISTEN_HOST}:${port} (allowed in preflight mode)."
    return 0
  fi

  local count
  count="$(printf '%s\n' "$listeners" | wc -l | tr -d '[:space:]')"

  if [[ "$count" -ne 1 ]]; then
    printf '%s\n' "$listeners" >&2
    die "$label has ${count} listeners on port ${port}; expected exactly 1."
  fi

  local command pid address
  IFS=$'\t' read -r command pid address <<<"$listeners"

  if [[ "$address" != *"${LISTEN_HOST}:${port}"* && "$address" != *"localhost:${port}"* ]]; then
    die "$label listener is not bound to ${LISTEN_HOST}:${port} (found: ${address})."
  fi

  local process_command
  process_command="$(ps -p "$pid" -o command= || true)"
  if [[ -z "$process_command" ]]; then
    die "Could not inspect process command for ${label} pid=${pid}."
  fi

  if [[ "$process_command" =~ $LEGACY_PROCESS_REGEX ]]; then
    die "$label listener is hosted by a legacy prompt-bridge process (pid=${pid})."
  fi

  echo "$label listener OK: pid=${pid} command=${command} address=${address}"
}

assert_no_legacy_bridge_processes() {
  local matches=""
  local process_line
  while IFS= read -r process_line; do
    if [[ "$process_line" =~ $LEGACY_PROCESS_REGEX ]]; then
      if [[ "$process_line" == *"socket-audit.sh"* ]]; then
        continue
      fi
      matches="${matches}${process_line}"$'\n'
    fi
  done < <(ps ax -o pid=,command=)

  if [[ -n "$matches" ]]; then
    printf '%s' "$matches" >&2
    die "Detected legacy prompt-bridge active process(es); decommission validation failed."
  fi
}

assert_listener "MCP bridge" "$BRIDGE_PORT"
assert_no_legacy_bridge_processes

echo "Socket audit passed for ${LISTEN_HOST}:${BRIDGE_PORT}."
