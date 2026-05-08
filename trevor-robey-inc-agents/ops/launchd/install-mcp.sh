#!/usr/bin/env bash
# Install the OCRA-rooted com.trevorrobeyinc.agents.mcp user LaunchAgent.
#
# Safe to re-run: bootout is a no-op if the agent isn't loaded. npm ci is
# skipped when node_modules already exists and the lockfile hasn't changed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OCRA_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MCP_DIR="$OCRA_ROOT/openclaw-bridge/github-pro-mcp"
LABEL="com.trevorrobeyinc.agents.mcp"
SRC_PLIST="$SCRIPT_DIR/$LABEL.plist"
DST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if [ ! -f "$SRC_PLIST" ]; then
  echo "Missing source plist: $SRC_PLIST" >&2
  exit 1
fi

if [ ! -d "$MCP_DIR" ]; then
  echo "Missing OCRA MCP dir: $MCP_DIR" >&2
  exit 1
fi

# 1. Restore node_modules for the lifted-and-shifted sub-project.
if [ ! -d "$MCP_DIR/node_modules" ]; then
  echo "[install-mcp] running 'npm ci' in $MCP_DIR ..."
  (cd "$MCP_DIR" && npm ci)
else
  echo "[install-mcp] node_modules already present at $MCP_DIR — skipping npm ci"
fi

# 2. Unload any existing agent with the same label.
if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
  echo "[install-mcp] booting out existing $LABEL"
  launchctl bootout "gui/$UID" "$DST_PLIST" || true
fi

# 3. Install the OCRA-rooted plist.
mkdir -p "$HOME/Library/LaunchAgents"
cp "$SRC_PLIST" "$DST_PLIST"
echo "[install-mcp] wrote $DST_PLIST"

# 4. Load the new agent.
launchctl bootstrap "gui/$UID" "$DST_PLIST"
echo "[install-mcp] loaded $LABEL"

# 5. Verification hints.
echo ""
echo "Verify:"
echo "  launchctl print gui/\$UID/$LABEL | grep -E 'state|path|working'"
echo "  tail -f ~/Library/Logs/openclaw-mcp.log"
