#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command obsidian

TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
TARGET_PLUGIN_ID="$OFFICIAL_PLUGIN_ID"
DATA_FILE="$OFFICIAL_PLUGIN_DIR/data.json"
MCP_CONFIG_FILE="$BRIDGE_REPO/config/obsidian-cli-mcp.local.json"
SERVER_ID="shared-obsidian-mcp"
SERVER_DISPLAY_NAME="Shared Obsidian MCP"

usage() {
  cat <<'EOF'
Usage:
  official-plugin-enable-write-mcp.sh [--vault <name>] [--mcp-config <path>]

Examples:
  official-plugin-enable-write-mcp.sh
  official-plugin-enable-write-mcp.sh --vault "My Digital Garden"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
  --vault)
    TARGET_VAULT_NAME="${2:-}"
    shift 2
    ;;
  --mcp-config)
    MCP_CONFIG_FILE="${2:-}"
    shift 2
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    die "Unknown argument: $1"
    ;;
  esac
done

[[ -f "$DATA_FILE" ]] || die "Official Copilot data file not found: $DATA_FILE"
[[ -f "$MCP_CONFIG_FILE" ]] || die "MCP config file not found: $MCP_CONFIG_FILE"
ensure_obsidian_running "$TARGET_VAULT_NAME"

TOOLS_JSON="$(jq -cn '[
  "obsidian_health",
  "obsidian_open_vault",
  "obsidian_read_note",
  "obsidian_search_notes",
  "obsidian_execute_command",
  "obsidian_create_note",
  "obsidian_append_note"
]')"
RUNTIME_TOOL_IDS_JSON="$(jq -cn --arg server "$SERVER_ID" --argjson tools "$TOOLS_JSON" '$tools | map("mcp_" + $server + "_" + .)')"
ALLOWLIST_JSON="$TOOLS_JSON"
DENYLIST_JSON='[]'

MCP_CONFIG_BACKUP="$(backup_target "$MCP_CONFIG_FILE" "bridge-config.pre-write-enable")"
DATA_BACKUP="$(backup_target "$DATA_FILE" "copilot-official-data.pre-write-enable")"

TMP_MCP_CONFIG="$(mktemp)"
trap 'rm -f "$TMP_MCP_CONFIG"' EXIT
jq '.readOnlyMode = false' "$MCP_CONFIG_FILE" >"$TMP_MCP_CONFIG"
mv "$TMP_MCP_CONFIG" "$MCP_CONFIG_FILE"

"$SCRIPT_DIR/bridge-restart.sh" >/dev/null

MCP_ENDPOINT="$(jq -r '"http://\(.transport.host):\(.transport.port)"' "$MCP_CONFIG_FILE")"
MCP_TOKEN="$(jq -r '.security.authToken' "$MCP_CONFIG_FILE")"
[[ -n "$MCP_TOKEN" && "$MCP_TOKEN" != "null" ]] || die "Missing auth token in $MCP_CONFIG_FILE"

PLUGIN_ID_JSON="$(printf '%s' "$TARGET_PLUGIN_ID" | jq -Rsa .)"
TARGET_VAULT_NAME_JSON="$(printf '%s' "$TARGET_VAULT_NAME" | jq -Rsa .)"
PRODUCTION_VAULT_JSON="$(printf '%s' "$PRODUCTION_VAULT" | jq -Rsa .)"
MCP_ENDPOINT_JSON="$(printf '%s' "$MCP_ENDPOINT" | jq -Rsa .)"
MCP_TOKEN_JSON="$(printf '%s' "$MCP_TOKEN" | jq -Rsa .)"
SERVER_ID_JSON="$(printf '%s' "$SERVER_ID" | jq -Rsa .)"
SERVER_DISPLAY_NAME_JSON="$(printf '%s' "$SERVER_DISPLAY_NAME" | jq -Rsa .)"

JS_CODE="$(cat <<EOF
(async () => {
  const plugin = app.plugins.plugins[$PLUGIN_ID_JSON];
  if (!plugin) {
    throw new Error("Official Copilot plugin is not loaded.");
  }

  const data = (await plugin.loadData()) || {};
  const tools = $TOOLS_JSON;
  const runtimeToolIds = $RUNTIME_TOOL_IDS_JSON;
  const denylist = $DENYLIST_JSON;

  data.backendMode = "self_host";
  data.enableSelfHostMode = true;
  data.selfHostExecutionMode = "direct_plugin_mcp";
  data.enableSemanticSearchV3 = true;
  data.enableMiyo = true;
  data.miyoVaultName = $TARGET_VAULT_NAME_JSON;
  data.miyoServerUrl = "";
  data.selfHostUrl = "";
  data.selfHostApiKey = "";
  data.selfHostAdapter = {
    ...(data.selfHostAdapter || {}),
    baseUrl: "",
    apiKey: "",
    enableMiyoBackend: true,
    runtimeLane: "production_official",
  };

  data.mcp = {
    enabled: true,
    confirmationPolicy: "prompt_on_writes",
    redactLogs: true,
    allowlist: tools,
    denylist,
    servers: [
      {
        id: $SERVER_ID_JSON,
        displayName: $SERVER_DISPLAY_NAME_JSON,
        enabled: true,
        transport: "http",
        httpEndpoint: $MCP_ENDPOINT_JSON,
        authToken: $MCP_TOKEN_JSON,
        timeoutMs: 20000,
        vaultName: $TARGET_VAULT_NAME_JSON,
        vaultRoot: $PRODUCTION_VAULT_JSON,
        enabledToolNames: tools,
      },
    ],
  };

  const currentEnabledToolIds = Array.isArray(data.autonomousAgentEnabledToolIds)
    ? data.autonomousAgentEnabledToolIds
    : [];
  data.autonomousAgentEnabledToolIds = Array.from(
    new Set([...currentEnabledToolIds, ...runtimeToolIds])
  );

  await plugin.saveData(data);

  return {
    ok: true,
    backendMode: data.backendMode,
    selfHostExecutionMode: data.selfHostExecutionMode,
    enableMiyo: data.enableMiyo,
    enableSemanticSearchV3: data.enableSemanticSearchV3,
    miyoVaultName: data.miyoVaultName,
    mcp: data.mcp,
    autonomousAgentEnabledToolIds: data.autonomousAgentEnabledToolIds ?? [],
  };
})()
EOF
)"
JS_CODE="${JS_CODE//$'\n'/ }"

RESULT="$(obsidian "vault=$TARGET_VAULT_NAME" eval "code=$JS_CODE" | sed '1s/^=> //')"
obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$TARGET_PLUGIN_ID" >/dev/null

jq -e '.readOnlyMode == false' "$MCP_CONFIG_FILE" >/dev/null || die "Bridge write enable verification failed."
jq -e '.backendMode == "self_host"' "$DATA_FILE" >/dev/null || die "backendMode verification failed."
jq -e '.enableSelfHostMode == true' "$DATA_FILE" >/dev/null || die "enableSelfHostMode verification failed."
jq -e '.selfHostExecutionMode == "direct_plugin_mcp"' "$DATA_FILE" >/dev/null || die "selfHostExecutionMode verification failed."
jq -e '.enableSemanticSearchV3 == true and .enableMiyo == true' "$DATA_FILE" >/dev/null || die "Miyo verification failed."
jq -e '.selfHostUrl == "" and .selfHostApiKey == ""' "$DATA_FILE" >/dev/null || die "selfHostUrl/selfHostApiKey verification failed."
jq -e '.selfHostAdapter.baseUrl == "" and .selfHostAdapter.apiKey == ""' "$DATA_FILE" >/dev/null || die "selfHostAdapter baseUrl/apiKey verification failed."
jq -e --arg endpoint "$MCP_ENDPOINT" --arg root "$PRODUCTION_VAULT" --arg vault "$TARGET_VAULT_NAME" '
  .mcp.enabled == true
  and .mcp.confirmationPolicy == "prompt_on_writes"
  and .mcp.redactLogs == true
  and (.mcp.allowlist | arrays)
  and (.mcp.denylist == [])
  and (.mcp.servers | length == 1)
  and (.mcp.servers[0].httpEndpoint == $endpoint)
  and (.mcp.servers[0].vaultRoot == $root)
  and (.mcp.servers[0].vaultName == $vault)
' "$DATA_FILE" >/dev/null || die "MCP verification failed."
jq -e --argjson ids "$RUNTIME_TOOL_IDS_JSON" '
  . as $root
  | ($ids | all(. as $id | ($root.autonomousAgentEnabledToolIds | index($id) != null)))
' "$DATA_FILE" >/dev/null || die "Autonomous agent MCP tool enablement verification failed."

echo "Official Copilot write-capable direct MCP mode applied."
echo "  vault:            $TARGET_VAULT_NAME"
echo "  plugin:           $TARGET_PLUGIN_ID"
echo "  mcp endpoint:     $MCP_ENDPOINT"
echo "  bridge writable:  true"
echo "  confirmation:     prompt_on_writes"
echo "  tool ids:         $(jq -cr . <<<"$RUNTIME_TOOL_IDS_JSON")"
echo "  bridge backup:    ${MCP_CONFIG_BACKUP:-none}"
echo "  plugin backup:    ${DATA_BACKUP:-none}"
echo "  result:           $RESULT"
