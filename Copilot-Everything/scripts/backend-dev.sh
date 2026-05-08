#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command npm

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
[[ -f "$MCP_CONFIG_PATH" ]] || die "Missing MCP config: $MCP_CONFIG_PATH"

BRIDGE_HOST="${BRIDGE_HOST:-$(jq -r '.transport.host' "$MCP_CONFIG_PATH")}"
BRIDGE_PORT="${BRIDGE_PORT:-$(jq -r '.transport.port' "$MCP_CONFIG_PATH")}"
BRIDGE_TOKEN="${BRIDGE_TOKEN:-$(jq -r '.security.authToken' "$MCP_CONFIG_PATH")}"
MIYO_DISCOVERED_BASE_URL="${MIYO_BASE_URL:-$(detect_miyo_base_url || true)}"

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-8789}"
export SELF_HOST_API_KEY="$(resolve_self_host_api_key)"
export MCP_BRIDGE_BASE_URL="${MCP_BRIDGE_BASE_URL:-http://$BRIDGE_HOST:$BRIDGE_PORT}"
export MCP_BRIDGE_AUTH_TOKEN="${MCP_BRIDGE_AUTH_TOKEN:-$BRIDGE_TOKEN}"
export MIYO_BASE_URL="${MIYO_DISCOVERED_BASE_URL:-}"
export MIYO_AUTH="${MIYO_AUTH:-}"
export REQUEST_TIMEOUT_MS="${REQUEST_TIMEOUT_MS:-30000}"
export ENABLE_VERBOSE_LOGS="${ENABLE_VERBOSE_LOGS:-true}"

cd "$WORKSPACE_ROOT/backend/copilot-backend-emulator"
npm run dev
