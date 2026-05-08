#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command curl

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"

SELF_HOST_API_KEY="$(resolve_self_host_api_key)"
EMULATOR_BASE_URL="${EMULATOR_BASE_URL:-http://127.0.0.1:8789}"
BRIDGE_BASE_URL="${BRIDGE_BASE_URL:-https://127.0.0.1:8798}"
MCP_BRIDGE_AUTH_TOKEN=""
if [[ -f "$MCP_CONFIG_PATH" ]]; then
  MCP_BRIDGE_AUTH_TOKEN="$(jq -r '.security.authToken // empty' "$MCP_CONFIG_PATH")"
fi

REPORT_FOLDER="Zettelkasten/Reports"
TODAY="$(date +%Y-%m-%d)"
WEEK="$(date +%Y-W%V)"

usage() {
  cat <<EOF
Zettelkasten Scheduled Operations

Usage: $(basename "$0") <command>

Commands:
  orphan-scan       Run vault-wide orphan detection, write report note
  health-digest     Compute vault health score, write weekly digest
  serendipity-digest Run serendipity on random notes, write weekly digest
  all               Run all scheduled operations

Environment:
  EMULATOR_BASE_URL   Backend emulator (default: http://127.0.0.1:8789)
  BRIDGE_BASE_URL     MCP bridge (default: https://127.0.0.1:8798)
EOF
  exit 1
}

# ── Bridge note writer ───────────────────────────────────────────────

write_note_via_bridge() {
  local note_path="$1"
  local content="$2"

  local body
  body="$(jq -n \
    --arg tool "obsidian_create_note" \
    --arg path "$note_path" \
    --arg content "$content" \
    '{tool: $tool, input: {vault: "My Digital Garden", path: $path, content: $content, overwrite: true}}'
  )"

  local nonce
  nonce="$(node -e 'console.log(require("node:crypto").randomUUID())')"
  local ts
  ts="$(node -e 'console.log(Date.now())')"
  local body_hash
  body_hash="$(printf '%s' "$body" | shasum -a 256 | awk '{print $1}')"

  curl -sS -X POST "$BRIDGE_BASE_URL/mcp/tool" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $MCP_BRIDGE_AUTH_TOKEN" \
    -H "X-MCP-Token: $MCP_BRIDGE_AUTH_TOKEN" \
    -H "X-MCP-Timestamp: $ts" \
    -H "X-MCP-Nonce: $nonce" \
    -H "X-MCP-Body-SHA256: $body_hash" \
    -d "$body" >/dev/null 2>&1
}

# ── Zettelkasten API caller ──────────────────────────────────────────

call_zettelkasten() {
  local endpoint="$1"
  local payload="$2"

  curl -sS -X POST "$EMULATOR_BASE_URL/v1/self-host/zettelkasten/$endpoint" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SELF_HOST_API_KEY" \
    -d "$payload"
}

# ── Operations ───────────────────────────────────────────────────────

run_orphan_scan() {
  echo "Running vault-wide orphan scan..."
  local result
  result="$(call_zettelkasten "orphan-rescue" '{"options":{"batchMode":true,"limit":20}}')"

  local ok
  ok="$(echo "$result" | jq -r '.ok // false')"
  if [[ "$ok" != "true" ]]; then
    echo "  ERROR: Orphan scan failed"
    echo "$result" | jq -r '.error.message // "Unknown error"' 2>/dev/null
    return 1
  fi

  local content
  content="$(echo "$result" | jq -r '.content // "No content returned"')"
  local note_path="$REPORT_FOLDER/Orphan Report $TODAY.md"

  write_note_via_bridge "$note_path" "$content"
  echo "  Report written to: $note_path"
}

run_health_digest() {
  echo "Computing vault health score..."
  local result
  result="$(call_zettelkasten "health" '{}')"

  local ok
  ok="$(echo "$result" | jq -r '.ok // false')"
  if [[ "$ok" != "true" ]]; then
    echo "  ERROR: Health check failed"
    return 1
  fi

  local content
  content="$(echo "$result" | jq -r '.content // "No content returned"')"
  local note_path="$REPORT_FOLDER/Weekly Health $WEEK.md"

  write_note_via_bridge "$note_path" "$content"
  echo "  Report written to: $note_path"
}

run_serendipity_digest() {
  echo "Generating serendipity digest..."
  local result
  result="$(call_zettelkasten "serendipity" '{"options":{"limit":5}}')"

  local ok
  ok="$(echo "$result" | jq -r '.ok // false')"
  if [[ "$ok" != "true" ]]; then
    echo "  ERROR: Serendipity generation failed"
    return 1
  fi

  local content
  content="$(echo "$result" | jq -r '.content // "No content returned"')"
  local note_path="$REPORT_FOLDER/Discovery $WEEK.md"

  write_note_via_bridge "$note_path" "$content"
  echo "  Report written to: $note_path"
}

# ── Main ─────────────────────────────────────────────────────────────

COMMAND="${1:-}"

case "$COMMAND" in
  orphan-scan)
    run_orphan_scan
    ;;
  health-digest)
    run_health_digest
    ;;
  serendipity-digest)
    run_serendipity_digest
    ;;
  all)
    run_orphan_scan
    run_health_digest
    run_serendipity_digest
    ;;
  *)
    usage
    ;;
esac

echo "Done."
