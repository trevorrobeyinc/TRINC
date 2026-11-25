#!/usr/bin/env bash
# bridge-start.sh — run the vault bridge in this terminal, outside Obsidian (development only).
#
# Since 2026-11-25 a bridge started this way serves NO vault operation: its only backend is the fd-3 pipe that
# obsidian-bridge-launcher creates when it spawns the bridge (the Local REST API is no longer used). /healthz,
# obsidian_health, miyo_search_context and research_notify still answer; the six note and command tools fail
# with NO_CAPABLE_BACKEND and obsidian_health reports launcher_ipc_missing. For a working bridge, let the
# launcher start it (in Obsidian: the Bridge Launcher's 'Restart bridge' command).
#
# It first rebuilds dist/ in $BRIDGE_REPO, the main checkout's package, which is the build the launcher spawns,
# and it does so even when the start is then refused. Do not run it while a rollback to a saved dist/ is in
# place (ops/security/vault-ipc-2026-11-25.md, Rollback): the rebuild would put the current source back.
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
# bridges-uds (2026-11-24): the bridge serves only on <home>/.local/state/trinc/run/vault-bridge.sock; TCP is gone
# and --transport=https is a startup error. Keep the --transport= flag itself: Falcon Custom-IOA rule 176 matches
# the bridge as a parent by "dist/index.js ... --transport". A live socket (the launcher's bridge) makes this start
# refuse with ALREADY_SERVED instead of taking the socket.
echo "bridge-start.sh: a bridge started outside Obsidian has no launcher pipe, so its six vault tools will fail (development only)." >&2
exec node dist/index.js --transport=uds
