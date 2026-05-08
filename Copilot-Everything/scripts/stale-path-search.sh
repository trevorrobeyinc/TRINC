#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

OUTPUT="$CONFIG_ROOT/stale-path-search.txt"
ensure_dir "$CONFIG_ROOT"

{
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Searching for stale path references..."
  echo
  rg -n -F --hidden \
    --glob '!**/.git/**' \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    "$OLD_SOURCE_REPO" "$WORKSPACE_ROOT" || true
  echo
  rg -n -F --hidden \
    --glob '!**/.git/**' \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    "$OLD_BRIDGE_REPO" "$WORKSPACE_ROOT" || true
} >"$OUTPUT"

echo "Wrote $OUTPUT"
