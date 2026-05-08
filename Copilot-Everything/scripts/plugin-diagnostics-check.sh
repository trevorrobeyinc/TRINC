#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command obsidian
require_command node
require_command rg
require_command jq

TARGET_VAULT_NAME="$(vault_name "$DEV_VAULT")"
DIAG_DIR="$CONFIG_ROOT/validation"
ensure_dir "$DIAG_DIR"

PLUGIN_DIAG_FILE="$DIAG_DIR/plugin-diagnostics-check.txt"
BRIDGE_HEALTH_FILE="$DIAG_DIR/plugin-diagnostics-bridge-health.json"

ensure_obsidian_running "$TARGET_VAULT_NAME"

obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$PLUGIN_ID"

# Ensure chat view exists so runner/tool checks can execute.
if ! obsidian "vault=$TARGET_VAULT_NAME" command "id=$PLUGIN_ID:chat-open-window" >/dev/null 2>&1; then
  obsidian "vault=$TARGET_VAULT_NAME" command "id=$PLUGIN_ID:chat-toggle-window" >/dev/null 2>&1 || true
fi

for _attempt in {1..12}; do
  obsidian "vault=$TARGET_VAULT_NAME" eval "code=(() => {
    const plugin = app.plugins.plugins['$PLUGIN_ID'];
    const leaves = app.workspace.getLeavesOfType('$PLUGIN_ID-chat-view');
    const view = leaves[0]?.view;
    const runner = view?.chainManager?.getChainRunner?.();
    const tools = typeof runner?.getAvailableTools === 'function'
      ? runner.getAvailableTools().map((tool) => tool.name)
      : [];
    return {
      timestamp: new Date().toISOString(),
      pluginLoaded: !!plugin,
      chatViewCount: leaves.length,
      runnerCtor: runner?.constructor?.name || null,
      mcpHealthToolPresent: tools.includes('mcp_local-obsidian-mcp_obsidian_health'),
      toolCount: tools.length,
      model: view?.chainManager?.chatModelManager?.getChatModel?.()?.model || null
    };
  })()" >"$PLUGIN_DIAG_FILE"

  if rg -q '"pluginLoaded": true' "$PLUGIN_DIAG_FILE" && rg -q '"mcpHealthToolPresent": true' "$PLUGIN_DIAG_FILE"; then
    break
  fi
  sleep 1
done

node "$SCRIPT_DIR/mcp-health-check.js" >"$BRIDGE_HEALTH_FILE"

rg -q '"pluginLoaded": true' "$PLUGIN_DIAG_FILE" || die "Plugin diagnostics failed: plugin not loaded."
rg -q '"mcpHealthToolPresent": true' "$PLUGIN_DIAG_FILE" || die "Plugin diagnostics failed: MCP tool not present."
jq -e '.ok == true and .cli.available == true' "$BRIDGE_HEALTH_FILE" >/dev/null \
  || die "Bridge health diagnostics failed."

echo "Plugin diagnostics check passed."
echo "  plugin diagnostics: $PLUGIN_DIAG_FILE"
echo "  bridge health:      $BRIDGE_HEALTH_FILE"
