#!/bin/sh
# OpenClaw MCP launcher — OCRA-rooted, no AI-Agent-BountyHunt dependency.
#
# Called by the user LaunchAgent `com.trevorrobeyinc.agents.mcp`. Replaces the legacy
# `~/.openclaw/bin/launch-mcp.sh`, which hardcoded AABH paths. This script
# resolves its own location so the whole tree can be moved without breakage.
set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
OCRA_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
MCP_DIR="$OCRA_ROOT/openclaw-bridge/github-pro-mcp"

# Secrets + mkcert trust carry over from the existing ~/.openclaw layout.
if [ -f "$HOME/.openclaw/secrets.env" ]; then
  . "$HOME/.openclaw/secrets.env"
fi
export NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/mkcert/rootCA.pem"

# Runtime deps live inside the sub-project. `npm ci` restores node_modules
# the first time (see ops/launchd/README.md).
if [ ! -d "$MCP_DIR/node_modules" ]; then
  echo "[launch-mcp] node_modules missing at $MCP_DIR — run 'cd \"$MCP_DIR\" && npm ci' before bootstrapping the agent" >&2
  exit 1
fi

exec /opt/homebrew/bin/node "$MCP_DIR/dist/server.js"
