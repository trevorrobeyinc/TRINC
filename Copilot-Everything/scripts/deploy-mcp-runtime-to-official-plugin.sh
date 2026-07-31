#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command obsidian
require_command jq

TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
SOURCE_MAIN="$PLUGIN_REPO/main.js"
SOURCE_STYLES="$PLUGIN_REPO/styles.css"
TARGET_MAIN="$OFFICIAL_PLUGIN_DIR/main.js"
TARGET_STYLES="$OFFICIAL_PLUGIN_DIR/styles.css"
TARGET_MANIFEST="$OFFICIAL_PLUGIN_DIR/manifest.json"
TARGET_DATA="$OFFICIAL_PLUGIN_DIR/data.json"

[[ -f "$SOURCE_MAIN" ]] || die "Missing source runtime: $SOURCE_MAIN"
[[ -f "$SOURCE_STYLES" ]] || die "Missing source stylesheet: $SOURCE_STYLES"
[[ -f "$TARGET_MANIFEST" ]] || die "Missing official manifest: $TARGET_MANIFEST"
[[ -f "$TARGET_DATA" ]] || die "Missing official data file: $TARGET_DATA"

MANIFEST_ID="$(jq -r '.id // empty' "$TARGET_MANIFEST")"
[[ "$MANIFEST_ID" == "$OFFICIAL_PLUGIN_ID" ]] \
  || die "Official plugin slot manifest declares id '${MANIFEST_ID:-<none>}' (expected '$OFFICIAL_PLUGIN_ID'), refusing to overlay runtime: $TARGET_MANIFEST"

BACKUP_PATH="$(backup_target "$OFFICIAL_PLUGIN_DIR" "copilot-official-runtime-pre-mcp-overlay")"
ensure_obsidian_running "$TARGET_VAULT_NAME"
# Since 9c7ce09a the fork builds natively under id "copilot", so the runtime is
# deployed byte-identical. Never reintroduce an id-rewrite transform here: the old
# /copilot-mcp/g pass also matched inside longer strings like "obsidian-copilot-mcp"
# (the source repo name), silently diverging the deployed artifact from the build.
cp "$SOURCE_MAIN" "$TARGET_MAIN"
cp "$SOURCE_STYLES" "$TARGET_STYLES"

obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$OFFICIAL_PLUGIN_ID" >/dev/null

EXECUTION_MODE="$(jq -r '.selfHostExecutionMode // "direct_plugin_mcp"' "$TARGET_DATA")"
VERIFY_OUTPUT=""

if [[ "$EXECUTION_MODE" == "exact_backend_emulator" ]]; then
  for _attempt in {1..30}; do
    VERIFY_OUTPUT="$(obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => {
      const plugin = app.plugins.plugins.copilot;
      return {
        pluginLoaded: Boolean(plugin),
        hasProjectManager: Boolean(plugin?.projectManager),
        hasChatUIState: Boolean(plugin?.chatUIState),
        hasChainManager: Boolean(plugin?.projectManager?.getCurrentChainManager?.()),
      };
    })()' | sed '1s/^=> //')"

    if echo "$VERIFY_OUTPUT" | jq -e '.pluginLoaded and .hasProjectManager and .hasChatUIState and .hasChainManager' >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  echo "$VERIFY_OUTPUT" | jq -e '.pluginLoaded and .hasProjectManager and .hasChatUIState and .hasChainManager' >/dev/null \
    || die "Official plugin runtime overlay did not finish loading in exact_backend_emulator mode."
else
  for _attempt in {1..30}; do
    VERIFY_OUTPUT="$(obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => {
      const plugin = app.plugins.plugins.copilot;
      const runner = plugin?.projectManager?.getCurrentChainManager?.()?.getChainRunner?.();
      const tools = typeof runner?.getAvailableTools === "function" ? runner.getAvailableTools() : [];
      return {
        toolNames: Array.isArray(tools) ? tools.map((tool) => tool?.name || null) : [],
      };
    })()' | sed '1s/^=> //')"

    if echo "$VERIFY_OUTPUT" | jq -e '.toolNames | index("mcp_local-obsidian-mcp_obsidian_health") != null' >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  echo "$VERIFY_OUTPUT" | jq -e '.toolNames | index("mcp_local-obsidian-mcp_obsidian_health") != null' >/dev/null \
    || die "Official plugin runtime overlay did not expose the shared MCP tool."
fi

echo "MCP-capable runtime deployed into the official plugin slot."
echo "  vault:            $TARGET_VAULT_NAME"
echo "  source runtime:   $SOURCE_MAIN"
echo "  backup:           ${BACKUP_PATH:-none}"
echo "  execution mode:   $EXECUTION_MODE"
echo "  verification:     $VERIFY_OUTPUT"
