#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command obsidian

TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

STATUS_FILE="$VALIDATION_DIR/official-plugin-direct-chat-status.json"
CHAT_FILE="$VALIDATION_DIR/official-plugin-direct-chat-messages.json"
CONSOLE_FILE="$VALIDATION_DIR/official-plugin-direct-chat-console.txt"
TOOL_ID="mcp_shared-obsidian-mcp_obsidian_health"
PROMPT="You must call the tool $TOOL_ID exactly once before your final answer. Then answer in one short sentence stating whether the MCP bridge is healthy and which backend it is using."

ensure_obsidian_running "$TARGET_VAULT_NAME"

obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$OFFICIAL_PLUGIN_ID" >/dev/null
obsidian "vault=$TARGET_VAULT_NAME" dev:debug on >/dev/null 2>&1 || true
obsidian "vault=$TARGET_VAULT_NAME" dev:console clear >/dev/null 2>&1 || true

START_CODE="$(cat <<EOF
(() => {
  const plugin = app.plugins.plugins["$OFFICIAL_PLUGIN_ID"];
  if (!plugin?.chatUIState || !plugin?.projectManager?.getCurrentChainManager) {
    return { ok: false, error: "chat_runtime_unavailable" };
  }

  const chainManager = plugin.projectManager.getCurrentChainManager();
  const runner = chainManager?.getChainRunner?.();
  const toolId = ${TOOL_ID@Q};
  const prompt = ${PROMPT@Q};

  window.__officialDirectChatRun = {
    status: "running",
    startedAt: new Date().toISOString(),
    toolId,
    runnerCtor: runner?.constructor?.name || null,
  };

  (async () => {
    try {
      const rawData = (await plugin.loadData()) || {};
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

      window.__officialDirectChatRun = {
        ...window.__officialDirectChatRun,
        backendMode: rawData.backendMode ?? null,
        enableAutonomousAgent: rawData.enableAutonomousAgent ?? null,
        selfHostExecutionMode: rawData.selfHostExecutionMode ?? null,
        autonomousAgentEnabledToolIds: rawData.autonomousAgentEnabledToolIds ?? [],
        defaultModelKey: rawData.defaultModelKey ?? null,
        mcp: rawData.mcp ?? null,
        messageId,
      };

      const llmMessage = plugin.chatUIState.getLLMMessage(messageId);
      if (!llmMessage) {
        throw new Error("llm_message_missing");
      }

      const abortController = new AbortController();
      await chainManager.runChain(
        llmMessage,
        abortController,
        (message) => {
          window.__officialDirectChatRun.currentAiMessage = message;
          window.__officialDirectChatRun.updatedAt = new Date().toISOString();
        },
        (message) => {
          plugin.chatUIState.addMessage(message);
          window.__officialDirectChatRun.finalAiMessage = message.message;
          window.__officialDirectChatRun.responseMetadata = message.responseMetadata || null;
          window.__officialDirectChatRun.updatedAt = new Date().toISOString();
        },
        { debug: true }
      );

      window.__officialDirectChatRun.status = "completed";
      window.__officialDirectChatRun.finishedAt = new Date().toISOString();
    } catch (error) {
      window.__officialDirectChatRun.status = "failed";
      window.__officialDirectChatRun.error = String(error?.stack || error);
      window.__officialDirectChatRun.finishedAt = new Date().toISOString();
    }
  })();

  return { ok: true, status: "started" };
})()
EOF
)"
START_CODE="${START_CODE//$'\n'/ }"
obsidian "vault=$TARGET_VAULT_NAME" eval "code=$START_CODE" >/dev/null

for _attempt in {1..120}; do
  obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => window.__officialDirectChatRun || null)()' | sed '1s/^=> //' >"$STATUS_FILE"
  if jq -e '.status == "completed"' "$STATUS_FILE" >/dev/null 2>&1; then
    break
  fi
  if jq -e '.status == "failed"' "$STATUS_FILE" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

obsidian "vault=$TARGET_VAULT_NAME" eval "code=(() => {
  const plugin = app.plugins.plugins[${OFFICIAL_PLUGIN_ID@Q}];
  const chainManager = plugin?.projectManager?.getCurrentChainManager?.();
  const runner = chainManager?.getChainRunner?.();
  return {
    timestamp: new Date().toISOString(),
    runnerCtor: runner?.constructor?.name || null,
    messageCount: plugin?.chatUIState?.getMessages?.()?.length || 0,
    messages: plugin?.chatUIState?.getMessages?.() || [],
  };
})()" | sed '1s/^=> //' >"$CHAT_FILE"
obsidian "vault=$TARGET_VAULT_NAME" dev:console limit=400 >"$CONSOLE_FILE"

jq -e '.status == "completed"' "$STATUS_FILE" >/dev/null || die "Official direct chat run did not complete."
jq -e '.selfHostExecutionMode == "direct_plugin_mcp"' "$STATUS_FILE" >/dev/null || die "Official chat is not using direct_plugin_mcp."
jq -e --arg tool "$TOOL_ID" '(.autonomousAgentEnabledToolIds | index($tool) != null)' "$STATUS_FILE" >/dev/null || die "Required MCP tool is not enabled for the autonomous agent."
jq -e '.finalAiMessage | strings | ascii_downcase | contains("not available") | not' "$STATUS_FILE" >/dev/null || die "Hosted model reported the MCP tool as unavailable."
jq -e '.messageCount >= 2' "$CHAT_FILE" >/dev/null || die "Expected chat history was not recorded."
rg -q '\[MCP\] shared-obsidian-mcp:obsidian_health completed\.' "$CONSOLE_FILE" || die "Expected MCP completion log not found in console output."
if rg -q '127\.0\.0\.1:8789|/v1/self-host/agent-turn|SelfHostAdapter' "$CONSOLE_FILE"; then
  die "Emulator activity was detected during the direct MCP hosted-model check."
fi

echo "Official plugin hosted-model direct MCP chat check passed."
echo "  status:          $STATUS_FILE"
echo "  chat messages:   $CHAT_FILE"
echo "  console log:     $CONSOLE_FILE"
echo "  tool id:         $TOOL_ID"
