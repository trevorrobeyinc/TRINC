#!/usr/bin/env bash
set -euo pipefail

# node:sqlite (required by idempotency ledger) needs Node 22.5+
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 >/dev/null 2>&1 || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command npm
require_command node

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
[[ -f "$MCP_CONFIG_PATH" ]] || die "Missing MCP config: $MCP_CONFIG_PATH"

export NODE_ENV="${NODE_ENV:-production}"
export OBSIDIAN_MCP_CONFIG="$MCP_CONFIG_PATH"

cd "$BRIDGE_REPO"
npm run build >/dev/null
exec node dist/index.js --transport=https
