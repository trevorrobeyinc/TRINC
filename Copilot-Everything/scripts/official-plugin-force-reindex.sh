#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command obsidian
require_command curl
require_command miyo

TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

SOURCE_INFO_FILE="$VALIDATION_DIR/official-plugin-reindex-source.json"
BEFORE_FILE="$VALIDATION_DIR/official-plugin-reindex-before.json"
AFTER_FILE="$VALIDATION_DIR/official-plugin-reindex-after.json"
STATUS_FILE="$VALIDATION_DIR/official-plugin-reindex-status.json"
SEARCH_FILE="$VALIDATION_DIR/official-plugin-reindex-search.json"
CONSOLE_FILE="$VALIDATION_DIR/official-plugin-reindex-console.txt"

ensure_obsidian_running "$TARGET_VAULT_NAME"

obsidian "vault=$TARGET_VAULT_NAME" eval "code=(() => {
  const plugin = app.plugins.plugins[${OFFICIAL_PLUGIN_ID@Q}];
  const miyoBackend = plugin?.vectorStoreManager?.miyoBackend;
  return {
    sourceId:
      miyoBackend && typeof miyoBackend.getSourceId === 'function'
        ? miyoBackend.getSourceId()
        : ${TARGET_VAULT_NAME@Q},
  };
})()" | sed '1s/^=> //' >"$SOURCE_INFO_FILE"

SOURCE_ID="$(jq -r '.sourceId // empty' "$SOURCE_INFO_FILE")"
[[ -n "$SOURCE_ID" && "$SOURCE_ID" != "null" ]] || SOURCE_ID="$TARGET_VAULT_NAME"
SOURCE_URI="$(jq -nr --arg value "$SOURCE_ID" '$value | @uri')"
MIYO_STATS_URL="http://127.0.0.1:8742/v0/index/stats?vault=$SOURCE_URI"

curl -sS "$MIYO_STATS_URL" >"$BEFORE_FILE"
obsidian "vault=$TARGET_VAULT_NAME" dev:debug on >/dev/null 2>&1 || true
obsidian "vault=$TARGET_VAULT_NAME" dev:console clear >/dev/null 2>&1 || true

START_CODE="$(cat <<EOF
(() => {
  const plugin = app.plugins.plugins["$OFFICIAL_PLUGIN_ID"];
  if (!plugin?.vectorStoreManager) {
    return { ok: false, error: "vector_store_manager_unavailable" };
  }

  window.__officialPluginReindexRun = {
    status: "running",
    startedAt: new Date().toISOString(),
  };

  (async () => {
    try {
      const rawData = (await plugin.loadData()) || {};
      const miyoBackend = plugin.vectorStoreManager?.miyoBackend;
      const baseUrl =
        miyoBackend && typeof miyoBackend.getBaseUrl === "function"
          ? await miyoBackend.getBaseUrl()
          : null;
      const sourceId =
        miyoBackend && typeof miyoBackend.getSourceId === "function"
          ? miyoBackend.getSourceId()
          : null;
      const count = await plugin.vectorStoreManager.indexVaultToVectorStore(true, {
        userInitiated: true,
      });

      window.__officialPluginReindexRun = {
        status: "completed",
        ok: true,
        finishedAt: new Date().toISOString(),
        count,
        backendMode: rawData.backendMode ?? null,
        selfHostExecutionMode: rawData.selfHostExecutionMode ?? null,
        enableSemanticSearchV3: rawData.enableSemanticSearchV3 ?? null,
        enableMiyo: rawData.enableMiyo ?? null,
        activeBackendKey: plugin.vectorStoreManager?.activeBackendKey || null,
        baseUrl,
        sourceId,
      };
    } catch (error) {
      window.__officialPluginReindexRun = {
        status: "failed",
        ok: false,
        finishedAt: new Date().toISOString(),
        error: String(error?.stack || error),
      };
    }
  })();

  return { ok: true, status: "started" };
})()
EOF
)"
START_CODE="${START_CODE//$'\n'/ }"
obsidian "vault=$TARGET_VAULT_NAME" eval "code=$START_CODE" >/dev/null

for _attempt in {1..1200}; do
  obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => window.__officialPluginReindexRun || null)()' | sed '1s/^=> //' >"$STATUS_FILE"
  if jq -e '.status == "completed"' "$STATUS_FILE" >/dev/null 2>&1; then
    break
  fi
  if jq -e '.status == "failed"' "$STATUS_FILE" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -sS "$MIYO_STATS_URL" >"$AFTER_FILE"
miyo search --json --url "http://127.0.0.1:8742" "wireless networking" >"$SEARCH_FILE"
obsidian "vault=$TARGET_VAULT_NAME" dev:console limit=400 >"$CONSOLE_FILE"

jq -e '.status == "completed" and .ok == true' "$STATUS_FILE" >/dev/null || die "Official plugin reindex run did not complete successfully."
jq -e '.selfHostExecutionMode == "direct_plugin_mcp"' "$STATUS_FILE" >/dev/null || die "Official plugin reindex is not using direct_plugin_mcp."
jq -e '.activeBackendKey == "miyo"' "$STATUS_FILE" >/dev/null || die "Official plugin did not index through the Miyo backend."
jq -e '.count > 0' "$STATUS_FILE" >/dev/null || die "Force reindex returned zero indexed documents."
jq -e '.total_files > 0 and .total_chunks > 0' "$BEFORE_FILE" >/dev/null || die "Pre-reindex Miyo stats are empty."
jq -e '.total_files > 0 and .total_chunks > 0' "$AFTER_FILE" >/dev/null || die "Post-reindex Miyo stats are empty."
jq -e '.results | arrays and length > 0' "$SEARCH_FILE" >/dev/null || die "Miyo retrieval failed after force reindex."

echo "Official plugin force reindex through Miyo passed."
echo "  source id:       $SOURCE_ID"
echo "  before stats:    $BEFORE_FILE"
echo "  after stats:     $AFTER_FILE"
echo "  status:          $STATUS_FILE"
echo "  search result:   $SEARCH_FILE"
echo "  console log:     $CONSOLE_FILE"
