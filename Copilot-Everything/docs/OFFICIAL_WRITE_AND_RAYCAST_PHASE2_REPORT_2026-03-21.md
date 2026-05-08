# Official Plugin Writes + Raycast Prompt MCP Report

Date: 2026-03-21

Historical snapshot captured before the final CLI-only cutover for this workspace. Do not use this report as the current runtime contract.

## Outcome

Phase 2 is implemented in the agreed order:

- official Obsidian `copilot` now supports controlled MCP writes with `prompt_on_writes`
- the shared HTTP MCP bridge on `https://127.0.0.1:8798` is writable and validated
- Raycast prompt execution is aligned to the shared MCP `execute_command` tool, with Local REST fallback
- Raycast PDF/video summaries remain on Raycast AI for now

## Official Plugin Writes

Implemented:

- runtime confirmation support for mutating MCP tools in `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/mcp/McpToolProvider.ts`
- write-enable cutover script in `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-enable-write-mcp.sh`
- bridge restart helper in `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-restart.sh`
- official-plugin write smoke test in `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-write-check.sh`

Bridge compatibility fixes applied during debugging:

- nested `create_note` now uses the basename for CLI `name=`
- parent folders are created before CLI note creation
- CLI `append_note` and `read_note` now send a derived `file=` alongside `path=`
- append marker reconciliation now retries briefly before declaring ambiguity

Validation:

- hosted direct-MCP sanity check passed in [/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-direct-chat-status.json](/Users/trevorrobey/THE%20Copilot%20in%20Obsidian%20Everything/configs/validation/official-plugin-direct-chat-status.json)
- write create/append/readback passed in [/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-write-check-status.json](/Users/trevorrobey/THE%20Copilot%20in%20Obsidian%20Everything/configs/validation/official-plugin-write-check-status.json)
- console trace for the successful write run is in [/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/official-plugin-write-check-console.txt](/Users/trevorrobey/THE%20Copilot%20in%20Obsidian%20Everything/configs/validation/official-plugin-write-check-console.txt)
- validation artifact note was created at [/Volumes/ExtraCurricular/My Digital Garden/copilot-mcp/validation/phase-2-write-check-20260321-132428.md](/Volumes/ExtraCurricular/My%20Digital%20Garden/copilot-mcp/validation/phase-2-write-check-20260321-132428.md)

## Raycast

Prompt execution changes:

- workspace fork prompt command now uses direct MCP command execution in [/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/copilotPromptsCommand.tsx](/Users/trevorrobey/THE%20Copilot%20in%20Obsidian%20Everything/bridges/raycast-obsidian-extension/src/copilotPromptsCommand.tsx)
- live installed extension uses the same direct MCP path in [/Users/trevorrobey/.config/raycast/extensions/obsidian/src/copilotPromptsCommand.tsx](/Users/trevorrobey/.config/raycast/extensions/obsidian/src/copilotPromptsCommand.tsx)
- both copies now include MCP config discovery in their `mcpClient.service.ts`
- live extension package prefs now expose direct MCP settings in [/Users/trevorrobey/.config/raycast/extensions/obsidian/package.json](/Users/trevorrobey/.config/raycast/extensions/obsidian/package.json)

Build validation:

- workspace Raycast fork build passed via `npm run build`
- live installed Raycast extension build passed via `npm run build`

Summary-lane decision:

- keep PDF and video summaries on Raycast AI for now
- confirmed from live code in [/Users/trevorrobey/.config/raycast/extensions/obsidian/src/tools/aiSummarizeFlow.ts](/Users/trevorrobey/.config/raycast/extensions/obsidian/src/tools/aiSummarizeFlow.ts)
- prompt execution and summarization are now intentionally split:
  - prompts: shared MCP bridge
  - summaries: Raycast AI + Local REST writeback

## Follow-Up

Recommended next steps:

- run one manual Raycast prompt command from the UI to confirm the installed extension is using the new shared MCP path in practice
- decide later whether Raycast summaries should move off Raycast AI onto the hosted/Miyo stack
- if the marketplace Raycast extension or official Obsidian plugin updates over local changes, rebuild/redeploy the affected copy before debugging behavior
