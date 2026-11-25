#!/usr/bin/env bash
# bridge-restart.sh — restart a standalone (dev) vault bridge on its Unix socket (bridges-uds, 2026-11-24).
#
# The bridge serves <home>/.local/state/trinc/run/vault-bridge.sock (home = $HOME, which is what os.homedir()
# reads) and rewrites vault-bridge.pid next to it on every start. Normally the obsidian-bridge-launcher plugin
# owns the bridge. This script never takes the launcher's socket and never removes a socket or the pidfile:
#   1. The pid in the pidfile is stopped only when lsof shows it holding the shared helper's hidden bind name
#      <run>/.vault-bridge.sock.<pid>.<8 hex>.tmp with that same pid embedded, its working directory is this
#      bridge package, and its parent is launchd (pid 1): a dev bridge from an earlier run of this script, or the
#      bridge of an Obsidian that crashed. A bridge with a live parent belongs to the launcher (or to a terminal
#      running bridge-start.sh): restart it there.
#   2. SIGTERM, then a wait for the process to exit (the bridge closes its socket and drains first).
#   3. bridge-start.sh in the background, then ops/tr-suite/uds-health.mjs until the bridge answers /healthz.
# A stale socket left by a killed bridge needs nothing: the bridge's next start replaces it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command node
require_command lsof
require_command ps
require_command awk

[[ "$HOME" == /* ]] || die "HOME is not an absolute path: $HOME"
RUN_DIR="$HOME/.local/state/trinc/run"
SOCKET_NAME="vault-bridge.sock"
PIDFILE="$RUN_DIR/vault-bridge.pid"
UDS_HEALTH="$SCRIPT_DIR/../../ops/tr-suite/uds-health.mjs"
[[ -f "$UDS_HEALTH" ]] || die "Missing health check: $UDS_HEALTH"

bridge_healthy() {
  node "$UDS_HEALTH" vault-bridge >/dev/null 2>&1
}

# The pid in the pidfile, or nothing unless it is a regular file of this user (not a symlink) holding "<pid>".
pidfile_pid() {
  [[ -f "$PIDFILE" && ! -L "$PIDFILE" && -O "$PIDFILE" ]] || return 0
  local content
  content="$(head -c 32 "$PIDFILE" 2>/dev/null || true)"
  if [[ "$content" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$content"
  fi
  return 0
}

# True when lsof shows pid holding the helper's hidden bind name with pid's own number embedded. The kernel keeps
# that name as the socket's address, so lsof never shows the published name.
holds_hidden_name() {
  local pid="$1" out
  out="$(lsof -a -p "$pid" -U -Fn 2>/dev/null || true)"
  printf '%s\n' "$out" | awk -v prefix="n$RUN_DIR/.$SOCKET_NAME." -v pid="$pid" '
    index($0, prefix) == 1 {
      rest = substr($0, length(prefix) + 1)
      if (rest ~ /^[0-9]+\.[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]\.tmp$/) {
        split(rest, part, ".")
        if (part[1] == pid) found = 1
      }
    }
    END { exit found ? 0 : 1 }'
}

cwd_of() {
  local out
  out="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null || true)"
  # awk reads to the end (no early exit), so printf never meets a closed pipe under pipefail.
  printf '%s\n' "$out" | awk 'substr($0, 1, 1) == "n" && !done { print substr($0, 2); done = 1 }'
}

parent_of() {
  local out
  out="$(ps -o ppid= -p "$1" 2>/dev/null || true)"
  printf '%s' "$out" | tr -d '[:space:]'
}

holder=""
pid="$(pidfile_pid)"
if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null && holds_hidden_name "$pid"; then
  holder="$pid"
fi

if [[ -z "$holder" ]] && bridge_healthy; then
  die "$SOCKET_NAME answers, but its pidfile names no process that holds it: not touching it (socket-audit.sh lists the holder)."
fi

if [[ -n "$holder" ]]; then
  # The cwd check fails closed. BRIDGE_REPO must resolve, and the holder passes only when its cwd resolves to the
  # same physical directory. A cwd lsof did not report, or one that no longer resolves (a deleted checkout), never
  # matches: two directories that both fail to resolve are not "the same".
  repo_dir="$(cd "$BRIDGE_REPO" 2>/dev/null && pwd -P)" || die "cannot resolve the bridge package $BRIDGE_REPO: not touching pid $holder."
  cwd="$(cwd_of "$holder")"
  holder_dir=""
  if [[ -n "$cwd" ]]; then
    holder_dir="$(cd "$cwd" 2>/dev/null && pwd -P || true)"
  fi
  if [[ -z "$repo_dir" || -z "$holder_dir" || "$holder_dir" != "$repo_dir" ]]; then
    die "pid $holder holds $SOCKET_NAME but does not run from $BRIDGE_REPO: not touching it."
  fi
  ppid="$(parent_of "$holder")"
  if [[ -n "$ppid" && "$ppid" != "1" ]]; then
    parent_cmd="$(ps -o comm= -p "$ppid" 2>/dev/null || true)"
    die "the vault bridge (pid $holder) belongs to live parent pid $ppid (${parent_cmd:-unknown}): the Obsidian bridge launcher, or a terminal running bridge-start.sh. Restart it there (in Obsidian: disable and enable obsidian-bridge-launcher, or restart Obsidian); this script never takes the launcher's socket."
  fi
  if [[ -n "$ppid" ]]; then
    # Read the parent again right before the signal: only an orphan of this package is ever signalled.
    [[ "$(parent_of "$holder")" == "1" ]] || die "pid $holder changed parent: not signalling it."
    kill -TERM "$holder" 2>/dev/null || true
    for _attempt in {1..20}; do
      kill -0 "$holder" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$holder" 2>/dev/null; then
      die "pid $holder did not exit within 20 s of SIGTERM: not starting a second bridge."
    fi
  fi
fi

VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"
LOG_FILE="$VALIDATION_DIR/bridge-restart.log"

nohup "$SCRIPT_DIR/bridge-start.sh" >"$LOG_FILE" 2>&1 &
BRIDGE_PID=$!

for _attempt in {1..40}; do
  if bridge_healthy; then
    echo "Shared MCP bridge restarted."
    echo "  pid:             $BRIDGE_PID"
    echo "  socket:          $RUN_DIR/$SOCKET_NAME"
    echo "  log:             $LOG_FILE"
    exit 0
  fi
  # bridge-start.sh execs the bridge, so this pid is the bridge; a refused start (for example ALREADY_SERVED)
  # ends it at once.
  kill -0 "$BRIDGE_PID" 2>/dev/null || die "the bridge exited before it answered /healthz. See $LOG_FILE"
  sleep 1
done

die "Shared MCP bridge did not become healthy after restart. See $LOG_FILE"
