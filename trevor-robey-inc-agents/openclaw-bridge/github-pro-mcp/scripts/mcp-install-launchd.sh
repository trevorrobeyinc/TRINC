#!/usr/bin/env bash
set -euo pipefail
# Generate user LaunchAgents using env vars from .env (if present).
#
# Hardening note (2026-04-30): the persistent OpenClaw bridge plist
# (com.openclaw.bridge -> dist/bridge/server.js on 127.0.0.1:18789) is no longer
# installed by this script. Reasons:
#   - The biomedical workflow runs on-demand via scripts/run-workflow.js; it
#     does not need a persistent listener.
#   - com.openclaw.bridge is the legacy launchd label that Sophos and similar
#     endpoint-control tools historically allowed. Auto-installing it on a
#     fresh machine resurrects an exception the operator may have already
#     revoked.
# To run the bridge for one-off manual testing, build with `npm run build` and
# launch directly with `node openclaw-bridge/dist/bridge/server.js`. Do not
# re-introduce the plist write below without explicit operator review.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
MCP_PLIST_PATH="$PLIST_DIR/com.trevorrobeyinc.agents.mcp.plist"
BRIDGE_PLIST_PATH="$PLIST_DIR/com.openclaw.bridge.plist"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
BRIDGE_CWD="$ROOT_DIR/.."
ENV_FILE="$ROOT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$ROOT_DIR/../.env"
fi

if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node || true)"
fi

if [ -z "${NODE_BIN}" ] || [ ! -x "${NODE_BIN}" ]; then
  echo "Unable to locate a usable node binary (checked /opt/homebrew/bin/node and PATH)." >&2
  exit 1
fi

mkdir -p "$PLIST_DIR"

ENV_CONTENT=""
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line; do
    case "$line" in
      ""|\#*) continue ;;
    esac
    key=$(echo "$line" | cut -d= -f1)
    val=$(echo "$line" | cut -d= -f2-)
    ENV_CONTENT="$ENV_CONTENT
      <key>$key</key>
      <string>$val</string>"
  done < "$ENV_FILE"
fi

write_plist() {
  local label="$1"
  local plist_path="$2"
  local working_dir="$3"
  local script_path="$4"
  local stdout_log="$5"
  local stderr_log="$6"

  cat > "$plist_path" <<EOF2
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$script_path</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>$working_dir</string>
  <key>StandardOutPath</key>
  <string>$stdout_log</string>
  <key>StandardErrorPath</key>
  <string>$stderr_log</string>
  <key>EnvironmentVariables</key>
  <dict>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>$ENV_CONTENT
  </dict>
</dict>
</plist>
EOF2
}

write_plist \
  "com.trevorrobeyinc.agents.mcp" \
  "$MCP_PLIST_PATH" \
  "$ROOT_DIR" \
  "$ROOT_DIR/dist/server.js" \
  "$HOME/Library/Logs/openclaw-mcp.log" \
  "$HOME/Library/Logs/openclaw-mcp.err.log"

# DISABLED 2026-04-30 — see header. Persistent bridge plist write is intentionally
# removed; bridge is run manually for testing only. Do not uncomment without review.
#
# write_plist \
#   "com.openclaw.bridge" \
#   "$BRIDGE_PLIST_PATH" \
#   "$BRIDGE_CWD" \
#   "$BRIDGE_CWD/dist/bridge/server.js" \
#   "$HOME/Library/Logs/openclaw-bridge.log" \
#   "$HOME/Library/Logs/openclaw-bridge.err.log"

echo "Wrote $MCP_PLIST_PATH"
echo "(skipped) com.openclaw.bridge plist intentionally not installed; see script header."
echo "To load MCP: launchctl unload $MCP_PLIST_PATH 2>/dev/null || true; launchctl load $MCP_PLIST_PATH"
