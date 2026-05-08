#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command node
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

BACKUP_PATH="$(backup_target "$OFFICIAL_PLUGIN_DIR" "copilot-official-runtime-pre-mcp-overlay")"
ensure_obsidian_running "$TARGET_VAULT_NAME"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TRANSFORMED_MAIN="$TMP_DIR/main.js"
TRANSFORMED_STYLES="$TMP_DIR/styles.css"

node - "$SOURCE_MAIN" "$SOURCE_STYLES" "$TRANSFORMED_MAIN" "$TRANSFORMED_STYLES" <<'NODE'
const fs = require("fs");
const [sourceMain, sourceStyles, outMain, outStyles] = process.argv.slice(2);

const replacements = [
  [/copilot-mcp/g, "copilot"],
  [/Copilot MCP/g, "Copilot"],
];

let main = fs.readFileSync(sourceMain, "utf8");
for (const [pattern, value] of replacements) {
  main = main.replace(pattern, value);
}
fs.writeFileSync(outMain, main, "utf8");

let styles = fs.readFileSync(sourceStyles, "utf8");
for (const [pattern, value] of replacements) {
  styles = styles.replace(pattern, value);
}
fs.writeFileSync(outStyles, styles, "utf8");
NODE

cp "$TRANSFORMED_MAIN" "$TARGET_MAIN"
cp "$TRANSFORMED_STYLES" "$TARGET_STYLES"

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

    if echo "$VERIFY_OUTPUT" | jq -e '.toolNames | index("mcp_shared-obsidian-mcp_obsidian_health") != null' >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  echo "$VERIFY_OUTPUT" | jq -e '.toolNames | index("mcp_shared-obsidian-mcp_obsidian_health") != null' >/dev/null \
    || die "Official plugin runtime overlay did not expose the shared MCP tool."
fi

echo "MCP-capable runtime deployed into the official plugin slot."
echo "  vault:            $TARGET_VAULT_NAME"
echo "  source runtime:   $SOURCE_MAIN"
echo "  backup:           ${BACKUP_PATH:-none}"
echo "  execution mode:   $EXECUTION_MODE"
echo "  verification:     $VERIFY_OUTPUT"
