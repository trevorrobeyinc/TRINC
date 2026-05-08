#!/usr/bin/env bash
# Unload and remove the com.trevorrobeyinc.agents.mcp user LaunchAgent.
set -euo pipefail

LABEL="com.trevorrobeyinc.agents.mcp"
DST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
  echo "[uninstall-mcp] booting out $LABEL"
  launchctl bootout "gui/$UID" "$DST_PLIST" || true
fi

if [ -f "$DST_PLIST" ]; then
  mv "$DST_PLIST" "$HOME/.Trash/$LABEL.plist.$(date +%Y%m%d-%H%M%S)"
  echo "[uninstall-mcp] moved $DST_PLIST to Trash"
else
  echo "[uninstall-mcp] no plist at $DST_PLIST — nothing to remove"
fi
