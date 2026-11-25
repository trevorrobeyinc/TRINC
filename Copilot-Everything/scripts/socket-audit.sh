#!/usr/bin/env bash
# Socket audit — asserts the canonical vault bridge's Unix socket and sweeps for legacy prompt-bridge
# processes. Since bridges-uds (2026-11-24) the bridge listens on no TCP port: it serves
# <home>/.local/state/trinc/run/vault-bridge.sock (home = $HOME, which is what os.homedir() reads).
#
# Asserted: the run directory is a real directory owned by this user with mode 0700; the socket is a real
# socket owned by this user with mode 0600; exactly one process holds it. A holder is found by the hidden name
# the shared helper binds before it publishes the socket, <run>/.vault-bridge.sock.<pid>.<8 hex>.tmp: the
# kernel keeps that name as the socket's address, so lsof shows it, with the owner's pid embedded, and never
# the published name. Only entries whose embedded pid equals the pid lsof lists them under count, once per
# process (the bridge's accepted connections carry the same name). A process that bound the published name
# itself is not the helper and fails the audit.
#
# Modes:
#   default                              — preflight: a bridge that is not running (no socket, or a stale
#                                          socket nobody holds) is reported but allowed (exit 0)
#   SOCKET_AUDIT_REQUIRE_LISTENERS=true  — the bridge must be serving (it is owned by the
#                                          obsidian-bridge-launcher plugin, so Obsidian must be open)
#
# Runs under stock macOS /bin/bash 3.2: no mapfile, no ${var,,} (2026-07-31 modernization). The :8789
# emulator assert was dropped then (the emulator was deleted 2026-05-08), and the TCP :8798 assert on
# 2026-11-24.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command lsof
require_command ps
require_command awk
require_command stat

REQUIRE_LISTENERS="${SOCKET_AUDIT_REQUIRE_LISTENERS:-false}"
LEGACY_PROCESS_REGEX="${LEGACY_PROCESS_REGEX:-prompt-bridge-hybrid|obsidian-bridge-fork}"

[[ "$HOME" == /* ]] || die "HOME is not an absolute path: $HOME"
RUN_DIR="$HOME/.local/state/trinc/run"
SOCKET_NAME="vault-bridge.sock"
SOCKET_PATH="$RUN_DIR/$SOCKET_NAME"
MY_UID="$(id -u)"

# ${var,,} is bash-4-only; stock macOS /bin/bash is 3.2. nocasematch (bash 3.1+) makes every [[ == ]] /
# [[ =~ ]] string match in this script case-insensitive, which is exactly what the old lowercase expansions
# provided. Every string comparison below wants that; keep it in mind if you add a case-SENSITIVE one.
shopt -s nocasematch

# "<uid> <permission bits in octal>" of a path, without following a symlink (BSD stat, else GNU stat).
uid_and_mode() {
  stat -f '%u %Lp' "$1" 2>/dev/null || stat -c '%u %a' "$1"
}

not_running() {
  if [[ "$REQUIRE_LISTENERS" == "true" ]]; then
    die "MCP bridge is not running: $1."
  fi
  echo "MCP bridge not running: $1 (allowed in preflight mode)."
}

# One line per holding process, "<pid>", for every Unix socket whose bound name is the helper's hidden name for
# SOCKET_NAME with that process's own pid embedded.
list_holders() {
  local out
  out="$(lsof -nP -U -Fpn 2>/dev/null || true)"
  printf '%s\n' "$out" | awk -v prefix="$RUN_DIR/.$SOCKET_NAME." '
    substr($0, 1, 1) == "p" { pid = substr($0, 2); next }
    substr($0, 1, 1) != "n" { next }
    {
      name = substr($0, 2)
      if (index(name, prefix) != 1) next
      rest = substr(name, length(prefix) + 1)
      if (rest !~ /^[0-9]+\.[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\.tmp$/) next
      split(rest, part, ".")
      if (part[1] == pid && !(pid in seen)) { seen[pid] = 1; print pid }
    }'
}

# Processes that bound the published name itself (the helper never does): "<pid>" per process.
list_direct_binders() {
  local out
  out="$(lsof -nP -U -Fpn 2>/dev/null || true)"
  printf '%s\n' "$out" | awk -v want="$SOCKET_PATH" '
    substr($0, 1, 1) == "p" { pid = substr($0, 2); next }
    substr($0, 1, 1) == "n" && substr($0, 2) == want && !(pid in seen) { seen[pid] = 1; print pid }'
}

assert_bridge_socket() {
  if [[ ! -e "$RUN_DIR" && ! -L "$RUN_DIR" ]]; then
    not_running "no run directory at $RUN_DIR"
    return 0
  fi
  [[ ! -L "$RUN_DIR" && -d "$RUN_DIR" ]] || die "$RUN_DIR is not a real directory."
  local uid mode
  read -r uid mode <<<"$(uid_and_mode "$RUN_DIR")"
  [[ "$uid" == "$MY_UID" ]] || die "$RUN_DIR is owned by uid $uid, not $MY_UID."
  [[ "$mode" == "700" ]] || die "$RUN_DIR has mode $mode; it must be 700."

  if [[ ! -e "$SOCKET_PATH" && ! -L "$SOCKET_PATH" ]]; then
    not_running "no socket at $SOCKET_PATH"
    return 0
  fi
  [[ ! -L "$SOCKET_PATH" && -S "$SOCKET_PATH" ]] || die "$SOCKET_PATH is not a socket."
  read -r uid mode <<<"$(uid_and_mode "$SOCKET_PATH")"
  [[ "$uid" == "$MY_UID" ]] || die "$SOCKET_PATH is owned by uid $uid, not $MY_UID."
  [[ "$mode" == "600" ]] || die "$SOCKET_PATH has mode $mode; it must be 600."

  local direct
  direct="$(list_direct_binders)"
  if [[ -n "$direct" ]]; then
    die "process(es) $(printf '%s' "$direct" | tr '\n' ' ')bound $SOCKET_PATH directly: not the bridge's helper."
  fi

  local holders count
  holders="$(list_holders)"
  if [[ -z "$holders" ]]; then
    not_running "$SOCKET_PATH is a stale socket that no process holds (the bridge's next start replaces it)"
    return 0
  fi
  count="$(printf '%s\n' "$holders" | wc -l | tr -d '[:space:]')"
  if [[ "$count" -ne 1 ]]; then
    printf '%s\n' "$holders" >&2
    die "$count processes hold $SOCKET_NAME; expected exactly 1."
  fi

  local pid="$holders" process_command
  process_command="$(ps -p "$pid" -o command= || true)"
  if [[ -z "$process_command" ]]; then
    die "Could not inspect process command for MCP bridge pid=${pid}."
  fi
  if [[ "$process_command" =~ $LEGACY_PROCESS_REGEX ]]; then
    die "MCP bridge socket is held by a legacy prompt-bridge process (pid=${pid})."
  fi

  echo "MCP bridge socket OK: pid=${pid} socket=${SOCKET_PATH} (run dir 700, socket 600, uid ${MY_UID})"
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

assert_bridge_socket
assert_no_legacy_bridge_processes

echo "Socket audit passed for ${SOCKET_PATH}."
