# Backend Emulator Runbook

> **⚠️ RETIRED 2026-04-11 (Phase D).** The backend emulator at `127.0.0.1:8789` is no longer running. ZettelkastenService now runs in-process inside the `vault-zettelkasten` Obsidian plugin. Tool dispatch goes through the MCP bridge at `https://127.0.0.1:8798`. This runbook is retained for historical reference. See `ecosystem.config.js` for current PM2 layout.

Updated: 2026-03-24 (retirement banner added 2026-04-30)

## Canonical Commands

Start the bridge:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-start.sh
```

Start the emulator:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/backend-start.sh
```

Start both with PM2:

```bash
cd "/Users/trevorrobey/THE Copilot in Obsidian Everything"
pm2 start ecosystem.config.js
pm2 save
```

Contract tests:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/backend-contract-test.sh
```

Bridge and emulator smoke:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/backend-bridge-compat-test.sh
```

Socket audit only:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/socket-audit.sh
```

Fork plugin exact-mode check:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/plugin-backend-emulator-check.sh
```

## Environment Defaults

Derived from:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/config/obsidian-cli-mcp.local.json`

Defaults:
- emulator `HOST=127.0.0.1`
- emulator `PORT=8789`
- bridge `https://127.0.0.1:8798`
- self-host API key default:
  - `copilot-mcp-dev-self-host-key`

## Validation Artifacts

Expected outputs:
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/dev-console-backend-emulator-chat.txt`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/inapp-backend-emulator-chat-after.txt`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/backend-emulator-capture.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/backend-emulator-status.json`

## Manual Checklist

1. Bridge process is running on `127.0.0.1:8798`.
2. Emulator health returns `contractVersion=v1/self-host`.
3. Backend smoke confirms a signed `obsidian_health` tool call succeeds through the bridge client.
4. Installed `copilot` plugin or dev-vault `copilot-mcp` is in:
   - `backendMode=self_host`
   - `selfHostExecutionMode=exact_backend_emulator`
   - `selfHostAdapter.runtimeLane=fork_dev` (for SSE testing) or `production_official` (buffered production parity)
5. One in-app prompt completes with:
   - emulator request capture under `v1/self-host/agent-turn`
   - one `obsidian_health` tool call
   - final AI response rendered in chat
6. Socket audit passes with exactly one listener each on:
   - `127.0.0.1:8789` emulator
   - `127.0.0.1:8798` MCP bridge
   - no legacy prompt-bridge process signatures

## Current Validation Note

The emulator still serves `POST /v1/self-host/agent-turn/stream`, but lane policy is hard-gated:
- `runtimeLane=production_official` and `runtimeLane=raycast` are forced to buffered mode (`stream=false`).
- `runtimeLane=fork_dev` may use SSE when `responseStyle.stream=true`.
- Pre-flight vault intent detection can call `miyo_search_context` and inject compact context before final answer generation.

## 2026-03-24 Exact-Mode Repair Note

The exact backend emulator lane was repaired for the installed `copilot` plugin in `My Digital Garden`.

What changed:

- `repos/obsidian-copilot-mcp/src/LLMProviders/chainRunner/SelfHostEmulatorChainRunner.ts`
  - `resolveProviderApiKey()` now handles `"copilot-plus"` by decrypting `plusLicenseKey` for emulator-bound turns.
- `backend/copilot-backend-emulator/src/services/SelfHostExecutionEngine.ts`
  - exact-mode turns now throw a descriptive error if the final model response text is empty instead of returning a fake success with only the hidden `<!--AGENT_REASONING...-->` marker.

Why it mattered:

- before this fix, an exact-mode turn using `copilot-plus-flash|copilot-plus` could reach `/v1/self-host/agent-turn` successfully but still render as a blank bubble because the Brevilabs model request had no usable API key
- after this fix, the plugin forwards the decrypted `plusLicenseKey` to the emulator model request, and missing/invalid auth now surfaces as an explicit error

Current stable in-app behavior:

- `runtimeLane=production_official`
- buffered `/v1/self-host/agent-turn`
- `copilot-plus` model requests include the decrypted Brevilabs license key when exact mode is selected
- blank-bubble failure mode is replaced by an actionable error message

Useful live prompt for exact-mode validation:

- `Search my vault for notes about leadership and summarize what you find`

That prompt exercises:

- exact-mode in-chat send from the plugin UI
- emulator preflight and planning
- bridge/MCP tool execution
- Miyo-backed semantic context when relevant
- final model response assembly back into the chat UI
