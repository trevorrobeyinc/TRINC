## [LRN-20260319-001] correction

**Logged**: 2026-03-19T12:31:00Z
**Priority**: medium
**Status**: pending
**Area**: docs

### Summary
When mapping Miyo compatibility in this workspace, start from `src/search/RetrieverFactory.ts`, the `src/search/miyo/` subtree, and whatever local Miyo helper abstractions actually exist instead of assuming a single client file path.

### Details
The user corrected an earlier too-specific prompt assumption around `src/search/MiyoClient.ts`. In this repo shape, the Miyo integration is split across retriever selection, `src/search/miyo/`, `src/miyo/`, related-note scoring, and PDF parsing. Future mapping and contract prompts should reference the actual subtree and local abstractions present.

### Suggested Action
Keep future prompt guidance anchored to:
- `src/search/RetrieverFactory.ts`
- `src/search/miyo/*`
- `src/miyo/*`
- any local Miyo client/helper abstractions that are actually present

### Metadata
- Source: user_feedback
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_MIYO_CONTRACT.md
- Tags: miyo, contract-mapping, prompt-correction

---

## [LRN-20260320-002] best_practice

**Logged**: 2026-03-20T19:30:19-07:00
**Priority**: high
**Status**: pending
**Area**: testing

### Summary
Production official-plugin compatibility checks must target `My Digital Garden` and the real official plugin directory, not legacy `dev-vault` paths.

### Details
During the full verification sweep, `scripts/official-plugin-miyo-check.sh` still mixed production-vault intent with `dev-vault` file paths and reload behavior. The live setup is now centered on `/Volumes/ExtraCurricular/My Digital Garden`, so official-plugin harnesses need to use `OFFICIAL_PLUGIN_DIR`, the production vault name, and production-scoped `MIYO_TEST_VAULT` values consistently.

### Suggested Action
When a script validates the official plugin, default it to:
- `OFFICIAL_PLUGIN_DIR`
- `PRODUCTION_VAULT`
- explicit vault-aware reload helpers instead of hidden `dev-vault` assumptions

### Metadata
- Source: error
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-miyo-check.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/plugin-reload.sh
- Tags: official-plugin, production-vault, harness, miyo

---

## [LRN-20260320-003] best_practice

**Logged**: 2026-03-20T19:30:19-07:00
**Priority**: medium
**Status**: pending
**Area**: tests

### Summary
Direct MCP bridge HTTP probes must include replay-protection headers, and repo tests should avoid hardcoding legacy frontmatter keys or outdated user-facing strings.

### Details
The direct `/mcp/tool` probe failed until it sent `X-MCP-Timestamp`, `X-MCP-Nonce`, and `X-MCP-Body-SHA256` alongside the auth token. Separately, three `repos/obsidian-copilot-mcp` tests were false negatives because they still asserted pre-rename frontmatter keys (`copilot-*` instead of `copilot-mcp-*`) and the old Plus-tool error wording. The live code was behaving consistently; the harnesses and tests were stale.

### Suggested Action
Prefer shared constants or helper builders in tests for:
- MCP HTTP request headers
- frontmatter property names
- user-visible error strings that now depend on display names

### Metadata
- Source: error
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/full-functional-sweep.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/mcp-server/src/server/httpCommon.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/mcp-server/src/server/replayGuard.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/commands/customCommandUtils.test.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/system-prompts/systemPromptUtils.test.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/LLMProviders/chainRunner/utils/toolExecution.test.ts
- Tags: mcp-bridge, replay-protection, tests, frontmatter, plus-tools

---

## [LRN-20260321-001] best_practice

**Logged**: 2026-03-21T08:55:06Z
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
For the official Obsidian Copilot plugin, prefer `obsidian eval` with `plugin.loadData()` and `plugin.saveData()` to mutate settings, then reload the plugin, instead of treating `data.json` edits as the primary write path.

### Details
While adding an Ollama chat model to the official `copilot` plugin in `My Digital Garden`, the live CLI exposed the running plugin instance through `app.plugins.plugins["copilot"]` and supported async `loadData()` / `saveData()` calls. That made it possible to update `activeModels` from the app layer, preserve the plugin's own persistence behavior, and then confirm the change via both the saved `data.json` and a fresh `loadData()` read after `plugin:reload`.

### Suggested Action
For future official-plugin settings automation:
- use `obsidian eval` as the primary mutation interface
- keep a filesystem backup of `.obsidian/plugins/copilot/data.json`
- reload `copilot` after saving
- verify through both `jq` and a follow-up `loadData()` check

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-add-ollama-model.sh, /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/data.json
- Tags: obsidian-cli, copilot, settings, ollama, loadData, saveData

---

## [LRN-20260321-002] correction

**Logged**: 2026-03-21T09:11:24Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Programmatically registering an Ollama model in the official Obsidian Copilot plugin is not the same as having a usable chat path; the user-visible failure is a dead-looking chat pane, and the current official plugin setup stalls local Ollama models in agentic chat mode.

### Details
I initially treated successful `activeModels` mutation plus plugin reload as evidence that the setup was effectively working. The user's correction was more precise: after programmatic insertion, selecting the model in chat results in no visible processing. Live debugging confirmed that direct Ollama fetches and `chatModelManager.ping()` succeed, but chat turns in the official plugin's `copilot_plus` + `enableAutonomousAgent` configuration enter `[Agent] Using native tool calling with ReAct pattern` and then stall before producing visible chat output. Even `llama3-groq-tool-use:latest` showed the same broad issue in this agentic path.

### Suggested Action
For future guidance, distinguish clearly between:
- settings-level registration (`activeModels`)
- runtime model selection
- actual chat usability in the current chain mode

When validating Ollama in the official plugin, test an end-to-end chat turn in the intended chain mode before calling the setup working.

### Metadata
- Source: user_feedback
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-add-ollama-model.sh, /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/data.json
- Tags: correction, official-plugin, ollama, chat-mode, autonomous-agent

---

## [LRN-20260321-003] best_practice

**Logged**: 2026-03-21T09:47:01Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Official-plugin Ollama model entries should default to `capabilities: []`, and edits to `.obsidian/plugins/copilot/data.json` must be applied sequentially, not in parallel.

### Details
The official plugin threw a user-facing error that `llama3.1:8b does not support thinking`. The root cause was that the local Ollama entries in `activeModels` had inherited built-in capabilities including `reasoning`, which causes the plugin to send Ollama thinking-mode parameters. Separately, attempting to sanitize two Ollama entries in parallel caused one save to overwrite the other because both commands loaded and wrote the same settings file concurrently.

### Suggested Action
For future official-plugin Ollama automation:
- initialize local Ollama entries with `capabilities: []`
- do not mark a local model as `reasoning` unless the specific Ollama model is known to support that path
- serialize writes to the official plugin settings file or `loadData()` / `saveData()` path

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-add-ollama-model.sh, /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/data.json
- Tags: ollama, reasoning, thinking, config, serialization

---

## [LRN-20260321-004] correction

**Logged**: 2026-03-21T10:05:25Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Ollama can still be used through the exact backend emulator path; the unreliable path was direct-plugin `copilot_plus` behavior, not backend-emulator Ollama support itself.

### Details
I had framed the situation too broadly after observing stalled chat behavior with direct Ollama selection in the official plugin. The code path for exact backend emulator mode is different: `SelfHostEmulatorChainRunner` builds a self-host request with `model: await this.resolveModelSpec()`, and the backend `ModelGateway` explicitly routes `provider === "ollama"` to `OllamaAdapter`. That means Ollama remains a valid backend model choice for emulator-backed `copilot_plus` turns with MCP tooling and Miyo, as long as the plugin is configured to use `exact_backend_emulator` rather than falling back to `direct_plugin_mcp`.

### Suggested Action
When explaining Ollama support in the future, separate these two lanes clearly:
- direct official-plugin Ollama selection
- emulator-backed `copilot_plus` using an Ollama model spec sent to the backend

Call out that missing or invalid `selfHostExecutionMode` defaults to `direct_plugin_mcp`, which can make the setup appear broken even when emulator-side Ollama support exists.

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/LLMProviders/chainRunner/SelfHostEmulatorChainRunner.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator/src/services/ModelGateway.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator/src/adapters/OllamaAdapter.ts
- Tags: ollama, backend-emulator, correction, self-host, copilot-plus, mcp

---

## [LRN-20260321-005] best_practice

**Logged**: 2026-03-21T11:22:00Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
For the official plugin in `direct_plugin_mcp` mode, configuring `mcp.servers[]` is not enough when `enableAutonomousAgent` is on; the matching runtime `mcp_*` tool ids also must be present in `autonomousAgentEnabledToolIds`.

### Details
After the direct MCP + Miyo cutover, the stable plugin still answered that `mcp_shared-obsidian-mcp_obsidian_health` was unavailable during a hosted `copilot_plus` turn. The saved MCP server config, allowlist, and health checks were all correct. The missing piece was agent enablement: `AutonomousAgentChainRunner` filters available tools through `settings.autonomousAgentEnabledToolIds`, and the new runtime MCP tool ids were never added there. Once the tool ids are treated as part of the cutover contract, hosted agent turns can actually call the shared MCP server.

### Suggested Action
Whenever direct MCP servers are added to the official plugin and `enableAutonomousAgent` is enabled:
- derive the runtime tool ids as `mcp_<server-id>_<tool-name>`
- append them to `autonomousAgentEnabledToolIds`
- validate with a real hosted `copilot_plus` turn, not just health/config checks

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-direct-mcp-cutover.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-direct-chat-check.sh, /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/data.json
- Tags: official-plugin, direct-mcp, autonomous-agent, tool-registry, validation

---

## [LRN-20260321-006] knowledge_gap

**Logged**: 2026-03-21T12:00:00Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
The marketplace-installed official `copilot` build can lag behind the local MCP-capable fork enough that MCP settings persist but no MCP tools are registered at runtime.

### Details
The live official plugin accepted direct-MCP configuration in `data.json`, but the active runner still exposed only built-in tools. String probes against `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/main.js` showed that the installed build did not contain direct MCP strings like `obsidian_health`, `read_only_only`, or `direct_plugin_mcp`, while the local fork build in `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/main.js` did. Overlaying the fork runtime into the official plugin slot and replacing `copilot-mcp` with `copilot` made the shared MCP tools appear immediately.

### Suggested Action
When debugging “settings saved but tools never appear” in the official slot:
- verify the installed runtime actually contains the expected feature strings
- do not assume the marketplace build matches the local source repo
- be prepared to deploy the MCP-capable runtime into the official slot if the installed build is behind

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/deploy-mcp-runtime-to-official-plugin.sh, /Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot/main.js, /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/main.js
- Tags: official-plugin, build-drift, mcp, deployment, runtime

---

## [LRN-20260321-007] best_practice

**Logged**: 2026-03-21T12:02:00Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
After the MCP runtime overlay, Miyo indexing stats must be queried with the backend `sourceId`, which can be the vault root path instead of the human-readable vault name.

### Details
The overlaid official runtime reported `sourceId: "/Volumes/ExtraCurricular/My Digital Garden"` from `miyoBackend.getSourceId()`. The old reindex monitor still queried `/v0/index/stats?vault=My%20Digital%20Garden`, which tracked the wrong key and made a healthy rebuild look broken. The backend rebuild was real and completed successfully, but the monitoring script timed out and captured misleading `after.json` totals because it watched the display name rather than the active Miyo source id.

### Suggested Action
For future Miyo monitoring and validation:
- resolve `sourceId` from the live runtime before reading `/v0/index/stats`
- use that exact value as the `vault` query parameter
- allow a longer polling window for full vault overwrite runs

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-force-reindex.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-miyo-runtime.json
- Tags: miyo, source-id, reindex, monitoring, validation

---

## [LRN-20260321-008] best_practice

**Logged**: 2026-03-21T19:36:24Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
When driving Obsidian from shell automation on macOS, launch the app through `open -a Obsidian` before sending CLI commands; otherwise short-lived shell-owned launches can make the app open and then quit when the shell exits.

### Details
During the official plugin direct-MCP work, Obsidian appeared to “keep opening and exiting.” There were no crash reports in `~/Library/Logs/DiagnosticReports`, and unified logs only showed plain `proc_exit` termination for `Obsidian`. Timed reproductions showed the main process stayed alive for the lifetime of the shell command and then died right as the command finished, which matched a parent-shell launch/termination pattern rather than an app crash. Launching via `open -a Obsidian --args "vault=My Digital Garden"` detached the app under LaunchServices (`ppid=1`) and kept it running, while direct shell-owned launches made the behavior look unstable.

### Suggested Action
For automation that uses the `obsidian` CLI:
- ensure Obsidian is already running through a detached LaunchServices launch
- only then issue `obsidian "vault=..." ...` commands
- centralize that guard in `scripts/lib.sh` so validation scripts stop causing visible open/close churn

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/lib.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/plugin-reload.sh, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-direct-chat-check.sh
- Tags: obsidian, macos, launchservices, cli, automation, stability

---

## [LRN-20260321-009] correction

**Logged**: 2026-03-21T20:30:00Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
The official plugin MCP setting `prompt_on_writes` existed in the UI, but the runtime still hid all mutating MCP tools unless the policy was `allow_without_prompt`.

### Details
While implementing controlled writes for the official `copilot` slot, the plugin settings already exposed `read_only_only`, `prompt_on_writes`, and `allow_without_prompt`, which made it look like prompt-gated write support already worked. In practice, `McpToolProvider` still skipped every mutating tool unless the policy was `allow_without_prompt`, so setting `prompt_on_writes` left the write tools invisible and unusable. The fix was to register mutating tools under `prompt_on_writes` and gate execution with `ConfirmModal` at runtime instead of treating the policy as read-only.

### Suggested Action
When a UI setting advertises a mode like `prompt_on_writes`, verify the runtime registration path actually honors it before assuming the feature is complete.

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/mcp/McpToolProvider.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/settings/v2/components/McpSettings.tsx
- Tags: mcp, prompt-on-writes, official-plugin, runtime, confirmation

---

## [LRN-20260321-010] best_practice

**Logged**: 2026-03-21T20:31:00Z
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
The current Obsidian CLI integration is more reliable for bridge `read_note` and `append_note` when the command includes both a derived `file=` basename and the exact `path=`, and nested `create_note` must send a basename-only `name=`.

### Details
During the phase-2 write rollout, direct CLI reproduction showed that `create` at the vault root succeeded, but `read path=Phase2CliAppendCheck.md` failed immediately while `read file=Phase2CliAppendCheck.md` worked. The shared bridge had also been sending the full nested relative path as the CLI `name=` argument for `create_note`, which only happened to work for root-level notes. The stable fix was:
- create parent folders before `create_note`
- send a basename-only `name=` for CLI create
- derive and send `file=<basename>` alongside exact `path=` for CLI append/read

### Suggested Action
When a bridge depends on the Obsidian CLI for write/read parity, validate the actual command-line surface on the installed CLI version instead of assuming `path=` alone is sufficient.

### Metadata
- Source: conversation
- Related Files: /Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/mcp-server/src/server/tools/createNote.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/mcp-server/src/cli/buildArgs.ts, /Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-write-check.sh
- Tags: obsidian-cli, mcp-bridge, create-note, append-note, read-note, compatibility

---
