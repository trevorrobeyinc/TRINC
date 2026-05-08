#!/usr/bin/env bash
# Retire (not peel) the legacy com.openclaw.bridge LaunchAgent.
#
# Why retirement instead of re-anchoring to OCRA:
#   - The legacy agent pointed at /Users/trevorrobey/AI-Agent-BountyHunt/
#     openclaw-bridge/dist/bridge/server.js, a compiled build of AABH's
#     original bridge.
#   - OCRA's own openclaw-bridge/bridge/server.ts is a security-hardened
#     clean-room redesign (phase26 policy gates enforce /mcp endpoint,
#     createBridgePrincipalResolver, createExecutionRouter, and
#     TOOL_EXECUTION_BLOCKED — see scripts/verify-phase26-policy.sh).
#   - The two bridges are NOT drop-in equivalents, so pointing the legacy
#     agent at OCRA's server.ts would silently change runtime behavior.
#   - At the time of this writing, com.openclaw.bridge was not loaded
#     (launchctl list did not show it), so retiring it has zero live-service
#     impact.
#
# When OCRA's bridge reaches a production-ready state, ship a NEW plist here
# (e.g., com.openclaw-ocra-bridge.plist) with an OCRA-native installer —
# do not resurrect the legacy label.
set -euo pipefail

LABEL="com.openclaw.bridge"
DST_PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
  echo "[retire-bridge] booting out $LABEL"
  launchctl bootout "gui/$UID" "$DST_PLIST" || true
fi

if [ -f "$DST_PLIST" ]; then
  mv "$DST_PLIST" "$HOME/.Trash/$LABEL.plist.$(date +%Y%m%d-%H%M%S)"
  echo "[retire-bridge] moved $DST_PLIST to Trash"
else
  echo "[retire-bridge] no plist at $DST_PLIST — nothing to retire"
fi
