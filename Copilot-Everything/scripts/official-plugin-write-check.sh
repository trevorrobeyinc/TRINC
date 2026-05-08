#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib.sh"

require_command jq
require_command obsidian

TARGET_VAULT_NAME="$(vault_name "$PRODUCTION_VAULT")"
VALIDATION_DIR="$CONFIG_ROOT/validation"
ensure_dir "$VALIDATION_DIR"

STATUS_FILE="$VALIDATION_DIR/official-plugin-write-check-status.json"
CONSOLE_FILE="$VALIDATION_DIR/official-plugin-write-check-console.txt"
NOTE_PATH="copilot-mcp/validation/phase-2-write-check-$(date +%Y%m%d-%H%M%S).md"
INITIAL_CONTENT="# Phase 2 Write Check"
APPEND_CONTENT=$'\nWrite path verified via MCP.'
NOTE_PATH_JSON="$(printf '%s' "$NOTE_PATH" | jq -Rsa .)"
INITIAL_CONTENT_JSON="$(printf '%s' "$INITIAL_CONTENT" | jq -Rsa .)"
APPEND_CONTENT_JSON="$(printf '%s' "$APPEND_CONTENT" | jq -Rsa .)"

ensure_obsidian_running "$TARGET_VAULT_NAME"

obsidian "vault=$TARGET_VAULT_NAME" plugin:reload "id=$OFFICIAL_PLUGIN_ID" >/dev/null
obsidian "vault=$TARGET_VAULT_NAME" dev:debug on >/dev/null 2>&1 || true
obsidian "vault=$TARGET_VAULT_NAME" dev:console clear >/dev/null 2>&1 || true

START_CODE="$(cat <<EOF
(() => {
  const plugin = app.plugins.plugins["$OFFICIAL_PLUGIN_ID"];
  const runner = plugin?.projectManager?.getCurrentChainManager?.()?.getChainRunner?.();
  if (!runner || typeof runner.getAvailableTools !== "function") {
    return { ok: false, error: "write_runtime_unavailable" };
  }

  const availableTools = runner.getAvailableTools();
  window.__officialWriteCheckRun = {
    status: "running",
    startedAt: new Date().toISOString(),
    notePath: $NOTE_PATH_JSON,
    availableTools: availableTools.map((tool) => tool?.name || null),
  };

  (async () => {
    try {
      const createTool = availableTools.find((tool) => tool?.name === "mcp_shared-obsidian-mcp_obsidian_create_note");
      const appendTool = availableTools.find((tool) => tool?.name === "mcp_shared-obsidian-mcp_obsidian_append_note");
      const readTool = availableTools.find((tool) => tool?.name === "mcp_shared-obsidian-mcp_obsidian_read_note");

      if (!createTool || !appendTool || !readTool) {
        throw new Error("required_write_tools_unavailable");
      }

      const clickConfirmation = async () => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const allowButton = Array.from(document.querySelectorAll("button")).find((button) => {
            return button.textContent?.trim() === "Allow";
          });
          if (allowButton instanceof HTMLButtonElement) {
            allowButton.click();
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error("write_confirmation_button_not_found");
      };

      const invokeWithConfirmation = async (tool, args) => {
        const resultPromise = tool.invoke(args);
        await clickConfirmation();
        return JSON.parse(await resultPromise);
      };

      const createResult = await invokeWithConfirmation(createTool, {
        path: $NOTE_PATH_JSON,
        content: $INITIAL_CONTENT_JSON,
        open: false,
      });
      const appendResult = await invokeWithConfirmation(appendTool, {
        path: $NOTE_PATH_JSON,
        content: $APPEND_CONTENT_JSON,
      });
      const readResult = JSON.parse(await readTool.invoke({ path: $NOTE_PATH_JSON }));

      window.__officialWriteCheckRun = {
        ...window.__officialWriteCheckRun,
        status: "completed",
        finishedAt: new Date().toISOString(),
        createResult,
        appendResult,
        readResult,
      };
    } catch (error) {
      window.__officialWriteCheckRun = {
        ...window.__officialWriteCheckRun,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: String(error?.stack || error),
      };
    }
  })();

  return { ok: true, status: "started", notePath: $NOTE_PATH_JSON };
})()
EOF
)"
START_CODE="${START_CODE//$'\n'/ }"

obsidian "vault=$TARGET_VAULT_NAME" eval "code=$START_CODE" | sed -n '/^=> /,$p' | sed '1s/^=> //' >/dev/null

for _attempt in {1..120}; do
  obsidian "vault=$TARGET_VAULT_NAME" eval 'code=(() => window.__officialWriteCheckRun || null)()' \
    | sed -n '/^=> /,$p' | sed '1s/^=> //' >"$STATUS_FILE"
  if jq -e '.status == "completed"' "$STATUS_FILE" >/dev/null 2>&1; then
    break
  fi
  if jq -e '.status == "failed"' "$STATUS_FILE" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

obsidian "vault=$TARGET_VAULT_NAME" dev:console limit=400 >"$CONSOLE_FILE"

if jq -e '.status == "failed"' "$STATUS_FILE" >/dev/null 2>&1; then
  die "Official plugin write check failed: $(jq -r '.error // "unknown error"' "$STATUS_FILE")"
fi
jq -e '.status == "completed"' "$STATUS_FILE" >/dev/null || die "Official plugin write check did not complete."
jq -e '.createResult.canceled != true and .appendResult.canceled != true' "$STATUS_FILE" >/dev/null || die "Write confirmation was not approved during validation."
jq -e '.readResult.data.content | strings | contains("# Phase 2 Write Check")' "$STATUS_FILE" >/dev/null || die "Created note content missing."
jq -e '.readResult.data.content | strings | contains("Write path verified via MCP.")' "$STATUS_FILE" >/dev/null || die "Appended note content missing."
rg -q '\[MCP\] shared-obsidian-mcp:obsidian_create_note completed\.' "$CONSOLE_FILE" || die "Create note MCP completion log not found."
rg -q '\[MCP\] shared-obsidian-mcp:obsidian_append_note completed\.' "$CONSOLE_FILE" || die "Append note MCP completion log not found."

echo "Official plugin MCP write check passed."
echo "  status:          $STATUS_FILE"
echo "  console log:     $CONSOLE_FILE"
echo "  note path:       $NOTE_PATH"
