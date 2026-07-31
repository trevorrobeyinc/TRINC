# Workspace Raycast + Obsidian CLI Integration Guide

This is the living integration contract for the workspace package under [`bridges/raycast-obsidian-extension/`](./). The package identity lives in [`bridges/raycast-obsidian-extension/package.json`](./package.json) as `obsidian-bridge-fork` / `Obsidian Bridge Fork`.

Important workspace note:
- The workspace package is the source-of-truth.
- Deployment is `npm run build` (`npx ray build -e dist`), which builds straight into the live Raycast install dir at `~/.config/raycast/extensions/obsidian-bridge-fork/` — build IS deploy, with no separate sync step. That local install target is an implementation detail, not the contract.
- The Obsidian Local REST API (`:27124`) is part of the active production path twice over: it is the bridge's sole backend (REST-only since 2026-05-09), and the video pipeline dispatches its headless Copilot summarize against it directly (`src/utils/restApiClient.ts`).

Current runtime lanes for this workspace:

1. Raycast extension command UX
2. MCP Bridge (`127.0.0.1:8798`) for REST-backed note/command execution (bridge → Obsidian Local REST API `:27124`; REST-only since 2026-05-09)
3. Obsidian Local REST API (`127.0.0.1:27124`) directly, for the video pipeline's background Copilot summarize dispatch (`/open` + command execute, pinned-cert TLS with verification on)
4. Obsidian CLI on macOS (the `aiSummarizeCommand` active-note exception)
5. Local media/AI toolchain: Downie 4 / `yt-dlp` / Whisper for video, `pdftotext`/`mutool` + OCR for PDF, Raycast AI / Anthropic API for extension-side summaries

> The Backend Emulator (`127.0.0.1:8789`) lane was retired 2026-04-11 and deleted from the monorepo 2026-05-08. Its Raycast client survives only as a throw-only stub (`src/api/backend-emulator/backendEmulator.service.ts`) kept so legacy call sites compile; every emulator code path now falls through to the local lanes described below.

## Current architecture

```text
Raycast note CRUD + prompt refresh/run
  -> hybrid MCP client / backend planner
    -> MCP Bridge /mcp/tool
      -> REST API backend (Obsidian Local REST API :27124)

Raycast active-note summarize
  -> restore Obsidian focus or open explicit target note
    -> direct local Obsidian CLI command
      -> live Copilot command candidates (with refresh fallback)

Raycast PDF summarize
  -> local text extraction (pdftotext | mutool; OCR fallback: pdftoppm + tesseract)
  -> Raycast AI template summary
  -> hybrid MCP create flow
    -> MCP Bridge /mcp/tool
      -> REST API backend (Obsidian Local REST API :27124)

Raycast video pipeline
  -> Downie 4 download (direct, or UGE for login-gated hosts)
    -> yt-dlp + YubiKey-sealed cookies as last resort
  -> subtitle sidecars, else Whisper (whisper-ctranslate2) transcription
  -> source note via MCP Bridge create_note (:8798)
  -> headless Copilot summarize (copilot:summarize-to-note)
    -> dispatched via Obsidian Local REST API :27124 (/open + command execute)
    -> fallback: extension-side template summary (Anthropic API if key set, else Raycast AI)
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

- Extracts text locally: `pdftotext`/`mutool` candidates, then an OCR fallback (`pdftoppm` + `tesseract`) when output is sparse. The emulator `parseDoc` attempt at the top of the flow is a throw-only stub and always falls through to local extraction.
- Writes source and summary notes through MCP `create_note`.
- Summarizes with Raycast AI (`AI.ask`) via the template prompt; the emulator `runAgentTurn` branch is the same throw-only stub, so `usedBackend` is always false.
- Uses non-REST app-open behavior where note focus is needed.

### `videoTranscribeRunnerCommand.tsx`

- Downloads via Downie 4 first (zero-click direct, or one-click UGE for login-gated hosts like LinkedIn Learning); `yt-dlp` — unsealing the YubiKey-GPG cookies jar when configured — survives only as the last resort. A local file / `file://` input skips download entirely.
- Transcribes from subtitle sidecars when present, else Whisper (`whisper-ctranslate2`).
- Writes the source note through the bridge (`raycastObsidianCreateNote` → `:8798`).
- Summarizes primarily by dispatching the Copilot fork's headless `copilot:summarize-to-note` command over the Local REST API (`/open` + command execute — background, no focus change), then renames the note Copilot writes into the pipeline's summary path.
- Falls back to the extension-side template summarizer: Anthropic API (`anthropicApiKey`, default `claude-sonnet-4-6`) when a key is set, else Raycast AI.
- Cleans up every per-run artifact after the summary lands (toggle: `cleanupAfterSummary`), leaving only the summary note.

## Key source files

- `package.json`
- `src/api/copilot/commandIds.ts`
- `src/api/mcp/backendPlanner.service.ts`
- `src/api/mcp/hybridObsidian.service.ts`
- `src/api/mcp/raycastObsidianMcp.ts`
- `src/api/mcp/pathMapping.ts`
- `src/utils/restApiClient.ts`
- `src/tools/aiSummarizeCommandFlow.ts`
- `src/tools/aiSummarizeFlow.ts`
- `src/tools/pdfSummarizeFlow.ts`
- `src/tools/videoTranscribeFlow.ts`
- `src/copilotPromptsCommand.tsx`
- `src/aiSummarizeCommand.tsx`
- `src/pdfSummarizeCommand.tsx`
- `src/videoTranscribeRunnerCommand.tsx`
- `scripts/seal-yt-cookies.sh`
- `../obsidian-copilot-bridge/src/backends/restApiBackend.ts`
- `../obsidian-copilot-bridge/src/server/tools/obsidianHealth.ts`
- `src/api/backend-emulator/backendEmulator.service.ts` (throw-only retirement stub; kept so legacy call sites compile)

## Required preferences

- `mcpEnabled`
- `mcpTransport`
- `mcpHttpEndpoint`
- `mcpConfigPath`
- `mcpAuthToken`
- `mcpRequestTimeoutMs`
- `vaultPath`
- `configFileName`

The four `backendEmulatorUrl` / `backendEmulatorApiKey` / `backendRequestTimeoutMs` / `backendRuntimeLane` preferences were removed with the emulator; `package.json` no longer declares them.

Optional preferences cover the Local REST API lane (`obsidianRestApiKey`, `obsidianRestApiBaseUrl` — the key auto-discovers from the plugin's `data.json` when blank), extension-side summaries (`anthropicApiKey`, `anthropicModel`), the video pipeline (`ytDlp*`, `downieDownloadFolder`, `videoDownloadFolder`, `cleanupAfterSummary`, plus `whisperPath`/`whisperModel` and the `raycastObsidianMcp*` overrides on the Video Pipeline Runner command), and PDF extraction (`pdfTextExtractorPath`, `pdfDownloadFolder`, `pdfOcr*`).

## Validation and operations

Live health checks (the three legacy gate scripts are all retired — see below):

```bash
curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz
```

```bash
curl -k -H "Authorization: Bearer $OBSIDIAN_REST_API_KEY" https://127.0.0.1:27124/
```

Deeper probe: the `obsidian_health` tool via `../obsidian-stdio-adapter`.

`cli-stability-gate.sh` and `direct-cli-stability-gate.sh` were retired 2026-05-09 with the emulator + CLI backend, and `bridge-health-check.sh` followed 2026-07-31 (it probed the deleted CLI backend under PM2). All three remain on disk only as tombstone stubs that print their retirement notice and exit non-zero; each stub's header documents the replacement checks.

## Notes

- The REST-backed bridge lane (`RestApiBackend` → Obsidian Local REST API `:27124`; REST-only since 2026-05-09) is the current stable execution contract for note/command operations in this workspace.
- The raw-direct-CLI stability gates were retired 2026-05-09 along with the CLI backend; the two gate scripts survive only as tombstone stubs (see Validation and operations).
- `aiSummarizeCommand` is the deliberate direct-local-CLI exception inside the Raycast layer because active-note rewrite behavior depends on the current Obsidian editor state.
- The old `src/api/obsidian-rest/` compatibility client is deleted; the extension's only direct Local REST API touchpoint is `src/utils/restApiClient.ts`, which serves the video pipeline's background Copilot summarize dispatch with certificate verification on (mkcert root CA plus the plugin's pinned listener cert).
- The Backend Emulator is retired (2026-04-11) and deleted from the monorepo (2026-05-08). PDF summarization is a fully local lane (local extraction + Raycast AI); video summarization is Copilot-plugin-first over the Local REST API with an Anthropic-API/Raycast-AI fallback. "Bridge-backed" still means note and command execution only.
