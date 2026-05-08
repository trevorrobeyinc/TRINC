# Workspace Raycast + Obsidian CLI Integration Guide

This is the living integration contract for the workspace package under [`bridges/raycast-obsidian-extension/`](./). The package identity lives in [`bridges/raycast-obsidian-extension/package.json`](./package.json) as `obsidian-bridge-fork` / `Obsidian Bridge Fork`.

Important workspace note:
- The workspace package is the source-of-truth.
- The helper sync script currently defaults to `~/.config/raycast/extensions/obsidian`, but that local install target is an implementation detail, not the contract.
- Local REST is not part of the active production path.

Current runtime lanes for this workspace:

1. Raycast extension command UX
2. Backend Emulator (`127.0.0.1:8789`) for backend-first parse/summarize flows
3. MCP Bridge (`127.0.0.1:8798`) for CLI-backed note/command execution
4. Obsidian CLI on macOS

## Current architecture

```text
Raycast note CRUD + prompt refresh/run
  -> hybrid MCP client / backend planner
    -> MCP Bridge /mcp/tool
      -> Obsidian CLI backend

Raycast active-note summarize
  -> restore Obsidian focus or open explicit target note
    -> direct local Obsidian CLI command
      -> live Copilot command candidates (with refresh fallback)

Raycast PDF/video summarize
  -> BackendEmulatorService
    -> /v0/parse-doc (PDF only)
    -> /v1/self-host/agent-turn
    -> local Raycast AI fallback if backend summary fails
  -> hybrid MCP create/open flow
    -> MCP Bridge /mcp/tool
      -> Obsidian CLI backend
```

## Active command flows

### `copilotPromptsCommand.tsx`

- Prompt files are discovered from `copilot/copilot-custom-prompts`.
- Prompt refresh and prompt execution use `obsidian_execute_command` through MCP.
- Prompt command IDs follow the Copilot/plugin command contract implemented in:
  - `src/api/copilot/commandIds.ts`
  - `repos/obsidian-copilot-mcp/src/commands/commandId.ts`
- Existing prompt files open through the standard `obsidian://open?path=` app-open path.

### `aiSummarizeCommand.tsx`

- Uses MCP `read_note` only when a concrete `notePath` is provided.
- Opens the target note with `obsidian://open?path=` when a concrete `notePath` is provided.
- Restores focus to the live Obsidian editor when no `notePath` is provided, so the current active note stays authoritative.
- Triggers summarize through direct local Obsidian CLI command execution (`copilot:summarize` candidates), not through MCP, because this workflow depends on the currently focused editor state.
- If summarize candidates are missing, it tries refresh-prompt-registry command candidates locally and retries summarize.
- Uses a longer focus/open settle delay than the generic MCP note operations because the whole-note rewrite behavior is sensitive to timing.

### `pdfSummarizeCommand.tsx`

- Uses backend parsing first via `/v0/parse-doc`, with local extractor/OCR fallback.
- Writes source and summary notes through MCP `create_note`.
- Uses backend-first summarize flow via `/v1/self-host/agent-turn`.
- Falls back to local Raycast AI summarization if backend summary generation fails.
- Uses non-REST app-open behavior where note focus is needed.

### `videoTranscribeCommand.tsx`

- Keeps local media acquisition/transcription (`yt-dlp`, subtitles, Whisper fallback).
- Writes source and summary notes through MCP `create_note`.
- Uses backend-first summarize flow via `/v1/self-host/agent-turn`.
- Falls back to local Raycast AI summarization if backend summary generation fails.
- Uses non-REST app-open behavior where note focus is needed.

## Key source files

- `package.json`
- `src/api/backend-emulator/backendEmulator.service.ts`
- `src/api/copilot/commandIds.ts`
- `src/api/mcp/backendPlanner.service.ts`
- `src/api/mcp/hybridObsidian.service.ts`
- `src/api/mcp/pathMapping.ts`
- `src/tools/aiSummarizeCommandFlow.ts`
- `src/tools/aiSummarizeFlow.ts`
- `src/copilotPromptsCommand.tsx`
- `src/aiSummarizeCommand.tsx`
- `src/pdfSummarizeCommand.tsx`
- `src/videoTranscribeCommand.tsx`
- `scripts/codex/sync-config.sh`
- `mcp-server/src/backends/cliBackend.ts`
- `mcp-server/src/server/tools/obsidianHealth.ts`

## Required preferences

- `mcpEnabled`
- `mcpTransport`
- `mcpHttpEndpoint`
- `mcpConfigPath`
- `mcpAuthToken`
- `mcpRequestTimeoutMs`
- `backendEmulatorUrl`
- `backendEmulatorApiKey`
- `backendRequestTimeoutMs`
- `backendRuntimeLane`
- `vaultPath`
- `configFileName`

Optional command-specific preferences remain for PDF/video extraction and model tooling.

## Validation and operations

From workspace root:

```bash
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-health-check.sh
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/cli-stability-gate.sh
/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/direct-cli-stability-gate.sh
```

## Notes

- The bridge-backed CLI lane is the current stable execution contract for note/command operations in this workspace.
- Raw direct CLI is validated separately and now has its own repeated cold/warm gate.
- `aiSummarizeCommand` is the deliberate direct-local-CLI exception inside the Raycast layer because active-note rewrite behavior depends on the current Obsidian editor state.
- `src/api/obsidian-rest/obsidian-rest.service.ts` remains only as deprecated compatibility code and is not part of the active production flows.
- Backend-first PDF/video summarization is part of the active workspace contract; "CLI-backed" here means note and command execution, not that every command bypasses the backend emulator.
