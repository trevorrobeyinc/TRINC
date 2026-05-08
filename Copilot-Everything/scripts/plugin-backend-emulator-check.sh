#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command obsidian
require_command rg
require_command npm

TARGET_VAULT_NAME="$(vault_name "$DEV_VAULT")"
VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

MCP_CONFIG_PATH="${MCP_CONFIG_PATH:-$BRIDGE_REPO/config/obsidian-cli-mcp.local.json}"
[[ -f "$MCP_CONFIG_PATH" ]] || die "Missing MCP config: $MCP_CONFIG_PATH"

EMULATOR_HOST="${EMULATOR_HOST:-127.0.0.1}"
EMULATOR_PORT="${EMULATOR_PORT:-8789}"
EMULATOR_BASE_URL="${EMULATOR_BASE_URL:-http://$EMULATOR_HOST:$EMULATOR_PORT}"
SELF_HOST_API_KEY="$(resolve_self_host_api_key)"
DATA_FILE="$DEV_VAULT/.obsidian/plugins/$PLUGIN_ID/data.json"
BACKUP_PATH="$VALIDATION_DIR/copilot-mcp-data.json.backend-emulator-backup-$(timestamp)"
CONSOLE_FILE="$VALIDATION_DIR/dev-console-backend-emulator-chat.txt"
CHAT_FILE="$VALIDATION_DIR/inapp-backend-emulator-chat-after.txt"
CAPTURE_FILE="$VALIDATION_DIR/backend-emulator-capture.json"
STATUS_FILE="$VALIDATION_DIR/backend-emulator-status.json"
PROMPT='You must call the tool mcp_local-obsidian-mcp_obsidian_health exactly once before your final answer. Return one sentence with CLI availability and the backend used for the health result.'

SOCKET_AUDIT_REQUIRE_LISTENERS=true "$SCRIPT_DIR/socket-audit.sh"

[[ -f "$DATA_FILE" ]] || die "Missing plugin data file: $DATA_FILE"
ensure_obsidian_running "$TARGET_VAULT_NAME"
cp "$DATA_FILE" "$BACKUP_PATH"

TMP_JSON="$(mktemp)"
jq \
  --arg baseUrl "$EMULATOR_BASE_URL" \
  --arg apiKey "$SELF_HOST_API_KEY" \
  '.backendMode = "self_host"
   | .enableSelfHostMode = true
   | .selfHostExecutionMode = "exact_backend_emulator"
   | .selfHostUrl = $baseUrl
   | .selfHostApiKey = $apiKey
   | .selfHostAdapter.baseUrl = $baseUrl
   | .selfHostAdapter.apiKey = $apiKey
   | .selfHostAdapter.runtimeLane = "fork_dev"
   | .debug = true
   | .stream = false' \
  "$DATA_FILE" >"$TMP_JSON"
mv "$TMP_JSON" "$DATA_FILE"

"$SCRIPT_DIR/dev-deploy.sh"
"$SCRIPT_DIR/plugin-reload.sh" "$PLUGIN_ID"

if ! obsidian "vault=$TARGET_VAULT_NAME" command "id=$PLUGIN_ID:chat-open-window" >/dev/null 2>&1; then
  obsidian "vault=$TARGET_VAULT_NAME" command "id=$PLUGIN_ID:chat-toggle-window" >/dev/null 2>&1 || true
fi

obsidian "vault=$TARGET_VAULT_NAME" dev:debug on >/dev/null 2>&1 || true
obsidian "vault=$TARGET_VAULT_NAME" dev:console clear >/dev/null 2>&1 || true

START_CODE="$(cat <<'EOF'
(() => {
  const plugin = app.plugins.plugins["copilot-mcp"];
  if (!plugin) {
    return { ok: false, error: "plugin_not_loaded" };
  }

  globalThis.__copilotMcpSelfHostCapture = { requests: [] };

  const chainManager = plugin.projectManager.getCurrentChainManager();
  const prompt = "You must call the tool mcp_local-obsidian-mcp_obsidian_health exactly once before your final answer. Return one sentence with CLI availability and the backend used for the health result.";
  plugin.chatUIState.clearMessages();
  window.__backendEmulatorChatRun = {
    status: "running",
    prompt,
    startedAt: new Date().toISOString()
  };

  (async () => {
    try {
      const messageId = await plugin.chatUIState.sendMessage(
        prompt,
        {
          notes: [],
          urls: [],
          tags: [],
          folders: [],
          selectedTextContexts: [],
          webTabs: []
        },
        "copilot_plus",
        false,
        false
      );
      window.__backendEmulatorChatRun.messageId = messageId;
      const llmMessage = plugin.chatUIState.getLLMMessage(messageId);
      if (!llmMessage) {
        throw new Error("llm_message_missing");
      }

      const abortController = new AbortController();
      await chainManager.runChain(
        llmMessage,
        abortController,
        (message) => {
          window.__backendEmulatorChatRun.currentAiMessage = message;
          window.__backendEmulatorChatRun.updatedAt = new Date().toISOString();
        },
        (message) => {
          plugin.chatUIState.addMessage(message);
          window.__backendEmulatorChatRun.finalAiMessage = message.message;
          window.__backendEmulatorChatRun.responseMetadata = message.responseMetadata || null;
          window.__backendEmulatorChatRun.updatedAt = new Date().toISOString();
        },
        { debug: true }
      );

      window.__backendEmulatorChatRun.status = "completed";
      window.__backendEmulatorChatRun.finishedAt = new Date().toISOString();
    } catch (error) {
      window.__backendEmulatorChatRun.status = "failed";
      window.__backendEmulatorChatRun.error = String(error?.stack || error);
      window.__backendEmulatorChatRun.finishedAt = new Date().toISOString();
    }
  })();

  return { ok: true, status: "started" };
})()
EOF
)"
START_CODE="${START_CODE//$'\n'/ }"
obsidian "vault=$TARGET_VAULT_NAME" eval "code=$START_CODE" >/dev/null

for _attempt in {1..120}; do
  STATUS_CODE='(() => window.__backendEmulatorChatRun || null)()'
  obsidian "vault=$TARGET_VAULT_NAME" eval "code=$STATUS_CODE" >"$STATUS_FILE"

  if rg -q '"status": "completed"' "$STATUS_FILE"; then
    break
  fi
  if rg -q '"status": "failed"' "$STATUS_FILE"; then
    cat "$STATUS_FILE" >&2
    die "Backend emulator chat run failed."
  fi
  sleep 1
done

obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => {
  const plugin = app.plugins.plugins["copilot-mcp"];
  return {
    timestamp: new Date().toISOString(),
    runnerCtor: plugin?.projectManager?.getCurrentChainManager?.()?.getChainRunner?.()?.constructor?.name || null,
    messages: plugin?.chatUIState?.getMessages?.() || []
  };
})()' >"$CHAT_FILE"

obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => globalThis.__copilotMcpSelfHostCapture || null)()' >"$CAPTURE_FILE"
obsidian "vault=$TARGET_VAULT_NAME" dev:console limit=400 >"$CONSOLE_FILE"

rg -q '"status": "completed"' "$STATUS_FILE" || die "Backend emulator chat did not complete."
rg -q '"sender": "ai"' "$CHAT_FILE" || die "Expected final AI message was not added to chat history."
if rg -q 'Debugger not attached' "$CONSOLE_FILE"; then
  echo "Console debugger output unavailable; validating via adapter capture fallback."
  rg -q '/v1/self-host/agent-turn' "$CAPTURE_FILE" || die "Canonical non-stream self-host route was not captured by SelfHostAdapter."
  rg -q 'mcp_local-obsidian-mcp_obsidian_health' "$CAPTURE_FILE" || die "Expected MCP tool binding was not captured by SelfHostAdapter."
else
  rg -q '\[SelfHostAdapter\]' "$CONSOLE_FILE" || die "Self-host adapter request log was not captured."
  rg -q '/v1/self-host/agent-turn' "$CONSOLE_FILE" || die "Canonical non-stream self-host route was not called."
  rg -q 'mcp_local-obsidian-mcp_obsidian_health' "$CONSOLE_FILE" || die "Expected MCP tool binding was not logged."
fi

echo "Backend emulator plugin check passed."
echo "  settings backup: $BACKUP_PATH"
echo "  status:          $STATUS_FILE"
echo "  request capture: $CAPTURE_FILE"
echo "  chat result:     $CHAT_FILE"
echo "  console log:     $CONSOLE_FILE"
echo "  prompt:          $PROMPT"
