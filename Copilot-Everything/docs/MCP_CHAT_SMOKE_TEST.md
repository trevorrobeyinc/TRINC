# MCP Chat Smoke Test

## Scope

Manual smoke test for `copilot-mcp` in the dev vault only.

Vault:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/dev-vault`

Plugin:
- `copilot-mcp`

Bridge:
- `https://127.0.0.1:8798`

## Preconditions

1. Run:
   - `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-health-check.sh`
   - `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/plugin-diagnostics-check.sh`
2. Confirm both scripts report pass.
3. Confirm production vault is not opened for edits.

## Manual Steps

1. In Obsidian, open the dev vault and open `copilot-mcp` chat.
2. Send this prompt:
   - `You must call the tool mcp_local-obsidian-mcp_obsidian_health once before giving a final answer. Return one sentence with CLI availability and read_note routing.`
3. Wait for a final AI response.
4. Check console logs with:
   - `obsidian vault='dev-vault' dev:console limit=400`
5. Verify these log lines exist:
   - `[Agent] Iteration 1: 1 tool call(s)`
   - `[MCP] local-obsidian-mcp:obsidian_health completed.`
   - `[Agent] Iteration 2: Final response (no tool calls)`
6. Verify chat history contains:
   - one user message with the prompt
   - one AI response summarizing CLI availability/routing

## Expected Artifacts

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/dev-console-mcp-chat.txt`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/inapp-chat-after.txt`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/plugin-diagnostics-check.txt`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/plugin-diagnostics-bridge-health.json`

## Pass Criteria

- MCP tool is registered and discoverable in the autonomous runner.
- One MCP tool-backed chat turn completes with final AI output.
- No unexpected writes under `/Volumes/ExtraCurricular/My Digital Garden` other than normal Obsidian workspace metadata.
