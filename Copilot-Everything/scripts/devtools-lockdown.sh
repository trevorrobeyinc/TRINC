#!/bin/bash
# devtools-lockdown.sh — Clears DevTools debug port on demand
# Safe to run anytime; does not affect bridge/CLI/Miyo connectivity

PORT_FILE="$HOME/Library/Application Support/obsidian/DevToolsActivePort"

if [ -f "$PORT_FILE" ]; then
  rm -f "$PORT_FILE"
  echo "[devtools-lockdown] Cleared DevToolsActivePort"
else
  echo "[devtools-lockdown] No active DevTools port file found"
fi
