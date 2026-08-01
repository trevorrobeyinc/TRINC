#!/usr/bin/env bash
# Registered-path assertion — for every service that STORES a filesystem path,
# ask the service what path it thinks it is watching and assert that path exists.
#
# Why this exists (2026-07-31). After the 2026-07-26 move off
# /Volumes/ExtraCurricular, Miyo kept a folder registration pointing at the OLD
# vault path for five days. Every indicator stayed green the entire time —
# service running, Qdrant connected, embedding model ready, folder
# `status: "ready"`, `last_error: null`, scan timestamps updating — because
# scanning a directory that no longer exists is indistinguishable from scanning
# an empty one. The vault's semantic index silently held ZERO vectors, and
# triggering a reindex "succeeded" while indexing nothing.
#
# That value lives in Miyo's own SQLite, so no `git grep` and no path-migration
# sweep over repo files could ever have reached it. The generalizable check is
# not "search files for the old path" but "ask each running service what path it
# is registered against, and stat it".
#
# Exit codes: 0 = every registered path exists (or its service is down, which is
# an Obsidian/app-lifecycle fact, not a drift bug); 1 = at least one service is
# registered against a path that does not exist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command curl
require_command python3

CA_ROOT="${NODE_EXTRA_CA_CERTS:-$HOME/Library/Application Support/mkcert/rootCA.pem}"
MIYO_URL="${MIYO_URL:-https://127.0.0.1:8743}"
BRIDGE_CONFIG="${BRIDGE_CONFIG:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
COPILOT_DATA_JSON="${COPILOT_DATA_JSON:-$OFFICIAL_PLUGIN_DIR/data.json}"

FAILURES=0
CHECKED=0

report_path() {
  # report_path <source-label> <path>
  local label="$1" path="$2"
  CHECKED=$((CHECKED + 1))
  if [[ -z "$path" || "$path" == "None" || "$path" == "null" ]]; then
    printf '  SKIP  %-34s (no path registered)\n' "$label"
    return
  fi
  if [[ -e "$path" ]]; then
    printf '  OK    %-34s %s\n' "$label" "$path"
  else
    printf '  FAIL  %-34s %s  <-- REGISTERED PATH DOES NOT EXIST\n' "$label" "$path"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "Registered-path assertion  ($(timestamp))"
echo

# --- Miyo: folder registrations (the 2026-07-31 drift case) -------------------
echo "Miyo $MIYO_URL/v0/folder"
MIYO_JSON="$(mktemp)"
trap 'rm -f "$MIYO_JSON"' EXIT
if curl -s --max-time 10 --cacert "$CA_ROOT" -o "$MIYO_JSON" "$MIYO_URL/v0/folder" 2>/dev/null; then
  # `absolute_path` is the resolved truth; `path` in the response is only a
  # display basename (the SQLite primary key holds the absolute path).
  while IFS= read -r line; do
    [[ -n "$line" ]] && report_path "miyo folder" "$line"
  done < <(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for f in d.get("folders", []):
    print(f.get("absolute_path") or f.get("path") or "")
' "$MIYO_JSON")
else
  echo "  SKIP  miyo unreachable (app not running) — not a drift failure"
fi
echo

# --- Bridge: allowedVaultRoots (a security allowlist; a dead entry = no writes)
echo "Bridge $BRIDGE_CONFIG"
if [[ -f "$BRIDGE_CONFIG" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && report_path "allowedVaultRoots" "$line"
  done < <(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for r in d.get("allowedVaultRoots", []):
    print(r)
' "$BRIDGE_CONFIG")
else
  echo "  SKIP  bridge config not found at $BRIDGE_CONFIG"
fi
echo

# --- Copilot plugin: per-MCP-server vaultRoot --------------------------------
echo "Copilot plugin $COPILOT_DATA_JSON"
if [[ -f "$COPILOT_DATA_JSON" ]]; then
  while IFS= read -r line; do
    [[ -n "$line" ]] && report_path "mcp server vaultRoot" "$line"
  done < <(python3 -c '
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for s in (d.get("mcp") or {}).get("servers", []):
    if s.get("vaultRoot"):
        print(s["vaultRoot"])
' "$COPILOT_DATA_JSON")
else
  echo "  SKIP  plugin data.json not found (plugin never configured?)"
fi
echo

# --- The vault itself ---------------------------------------------------------
echo "Workspace constants"
report_path "PRODUCTION_VAULT" "$PRODUCTION_VAULT"
report_path "RUNTIME_PLUGIN_DIR" "$RUNTIME_PLUGIN_DIR"
echo

if (( FAILURES > 0 )); then
  echo "FAIL: $FAILURES of $CHECKED registered path(s) do not exist."
  echo "A service registered against a missing path reports healthy and returns"
  echo "nothing. Repoint it at the source (for Miyo: DELETE then POST /v0/folder —"
  echo "note it enforces uniqueness on the folder BASENAME, and a POST comes back"
  echo "with allow_writes=true, so PATCH it back if that is not wanted)."
  exit 1
fi

echo "OK: all $CHECKED registered path(s) exist."
