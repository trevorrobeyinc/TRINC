# Obsidian CLI Stack Handoff

Updated: 2026-03-24

> **SUPERSEDED — historical snapshot (banner added 2026-07-31).** This handoff describes
> the CLI-backed stack as of 2026-03-24. The bridge has been **REST-only since
> 2026-05-09**: `RestApiBackend` → Obsidian **Local REST API** plugin (`:27124`) is the
> sole backend, and `src/backends/cliBackend.ts` no longer exists. Note that later history
> *inverted* the "What has been removed" list below — the Local REST API came **back** as
> the bridge's only backend. The backend emulator (retired 2026-04-11, deleted 2026-05-08),
> the PM2 bridge lane, and the Ollama/LM Studio proxies named here are also gone, and the
> listed validation scripts are tombstoned or stale. Current architecture:
> `Copilot-Everything/CLAUDE.md`.

## Purpose

This document is the handoff summary for the current `My Digital Garden` Obsidian runtime and the `THE Copilot in Obsidian Everything` workspace.

Use it when another workspace project needs to understand:

- what the current production architecture is
- which parts are CLI-backed
- where the forked MCP server fits
- where Miyo fits
- what legacy setup has already been removed
- which files inside this workspace are the source-of-truth

## Short answer

Yes, the live Obsidian CLI setup is operationally tied to the local workspace at:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything`

That workspace owns the scripts, PM2 definitions, local config files, backend emulator, Raycast workspace fork, and the forked MCP bridge used by the current stack.

For workspace documentation purposes, the source-of-truth Raycast package is:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension`

Do not treat a locally synced Raycast install directory as the contract. The bundled sync helper currently defaults to:

- `~/.config/raycast/extensions/obsidian`

but that target can be overridden and should be considered environment-specific.

Important nuance:

- the runtime is tied to the workspace path, config files, ports, scripts, and vault naming
- the UUID `019d134c-b05e-7913-b05e-6cc32f7599f1` does not appear in the local runtime/config files and should be treated as external workspace metadata, not as a direct runtime dependency

## Live targets

- Workspace root: `/Users/trevorrobey/THE Copilot in Obsidian Everything`
- Target vault: `/Volumes/ExtraCurricular/My Digital Garden`
- Raycast workspace fork: `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension`
- Raycast workspace manifest: `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/package.json`
- Raycast default local sync target: `~/.config/raycast/extensions/obsidian`
- Forked MCP server: `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge`
- Copilot plugin repo: `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp`
- Live vault plugin: `/Volumes/ExtraCurricular/My Digital Garden/.obsidian/plugins/copilot`

## Main services and ports

- Backend Emulator: RETIRED 2026-04-11 (was `https://127.0.0.1:8789`); ZettelkastenService now in-process inside vault-zettelkasten plugin
- MCP Bridge: `https://127.0.0.1:8798`
- Native Miyo via TLS proxy: `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`)
- Ollama via TLS proxy: `https://127.0.0.1:11435` (upstream `http://127.0.0.1:11434`)
- LM Studio via TLS proxy: `https://127.0.0.1:1235` (upstream `http://127.0.0.1:1234`)
- Qdrant via TLS proxy: `https://127.0.0.1:6433` (upstream `http://127.0.0.1:6333`)

The workspace PM2/service definitions live under:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/ecosystem.config.js`

## Current production contracts

### 1. Obsidian CLI

Obsidian CLI is now the note/command execution foundation for this macOS stack.

Stable production note/command backend operations are implemented in the forked MCP bridge:

- `open_vault`
- `create_note`
- `append_note`
- `read_note`
- `search_notes`
- `execute_command`

Primary implementation:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/src/backends/cliBackend.ts`

### 2. Forked MCP Bridge

The forked MCP bridge is the stable production bridge for the six note/command operations above.

Primary behavior:

- receives tool calls over HTTP/UDS/pipe
- runs Obsidian CLI preflight and readiness checks
- exposes `obsidian_health`
- routes supported operations to the CLI backend

Primary docs:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/README.md`

### 3. Backend Emulator

The backend emulator is the orchestration layer for self-host-compatible chat, deterministic tool calling, and compatibility routes.

It owns:

- `GET /healthz`
- `POST /v1/self-host/agent-turn`
- `POST /v1/self-host/tool-call`
- compatibility aliases under `/v0/*`

Primary docs:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/SELF_HOST_CONTRACT.md`

### 4. Miyo backend

Miyo is the semantic retrieval/indexing layer.

Current role:

- native retrieval backend for official plugin/runtime search
- compatibility target for `/v0/*` Miyo-shaped routes exposed by the backend emulator

Primary docs:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/SELF_HOST_CONTRACT.md`

## How the active flows work

### Raycast prompt refresh/run

Flow:

1. Raycast discovers prompt markdown files from the vault
2. Raycast resolves command ids using the Copilot/plugin command-id contract
3. Raycast calls the MCP bridge
4. MCP bridge runs `execute_command` through Obsidian CLI
5. The live Copilot plugin executes the prompt command inside Obsidian

Key files:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/copilotPromptsCommand.tsx`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/api/copilot/commandIds.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/commands/commandId.ts`

### Raycast active-note summarize

This is the important exception.

Flow:

1. Raycast restores focus to the live Obsidian editor, or opens the explicit note path first if one is passed
2. Raycast invokes the local Obsidian CLI command id directly
3. If summarize command candidates are missing, Raycast tries local refresh-prompt-registry command candidates and retries summarize
4. The live Copilot plugin handles `copilot:summarize`
5. The plugin rewrites the whole active note

Why it is different:

- this workflow depends on the actual currently focused Obsidian editor state
- bridge-routed execution could launch but still leave the note unchanged
- direct local CLI execution proved reliable for whole-note rewrite behavior

Key files:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/tools/aiSummarizeCommandFlow.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/commands/customCommandRegister.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/commands/CustomCommandChatModal.tsx`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/repos/obsidian-copilot-mcp/src/commands/commandBehavior.ts`

### Raycast PDF summarize

Flow:

1. Raycast parses the document via backend emulator `/v0/parse-doc` with local fallback
2. Raycast gets summary/chat output through `/v1/self-host/agent-turn`
3. If backend summary generation fails, Raycast falls back to local Raycast AI summarization
4. Note writes happen through the MCP bridge to Obsidian CLI

Key files:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/pdfSummarizeCommand.tsx`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/tools/pdfSummarizeFlow.ts`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/api/backend-emulator/backendEmulator.service.ts`

### Raycast video transcribe

Flow:

1. Raycast handles local media acquisition/transcription
2. Summary/chat generation uses `/v1/self-host/agent-turn`
3. If backend summary generation fails, Raycast falls back to local Raycast AI summarization
4. Note writes happen through the MCP bridge to Obsidian CLI

Key files:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/videoTranscribeCommand.tsx`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/src/tools/videoTranscribeFlow.ts`

### Official Copilot plugin

The official plugin now uses direct MCP plus Miyo for the current production runtime.

Current shape:

- hosted/Copilot model behavior for chat/agent turns
- shared MCP bridge for tool execution
- native Miyo backend for retrieval/search

Primary doc:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`

### Exact backend emulator mode in the plugin UI

The installed `copilot` plugin also has a working alternate lane through the in-chat
`Execution Mode` selector:

- `backendMode=self_host`
- `selfHostExecutionMode=exact_backend_emulator`
- `selfHostAdapter.runtimeLane=production_official` for the current stable buffered path

Current exact-mode behavior:

- the plugin sends a canonical buffered request to `POST /v1/self-host/agent-turn`
- the emulator plans tools, calls the shared MCP bridge, and returns the final chat response
- `copilot-plus` exact-mode requests now decrypt and forward `plusLicenseKey` correctly to the Brevilabs model endpoint
- if the model returns empty text, the emulator now raises a descriptive error instead of returning a blank chat bubble with only hidden reasoning markup

Important nuance:

- this exact-emulator lane is working again and is useful for validation, rollback, and architecture-proof testing
- it is still separate from the intended official-plugin target runtime, which remains direct MCP plus native Miyo

## Claude Desktop and Claude Code integration

Claude connects to the workspace through a stdio MCP adapter at
`bridges/obsidian-stdio-adapter/index.mjs` (consolidated 2026-05-09; replaces the
former `bridges/obsidian-copilot-bridge/claude-adapter/index.mjs`).

The adapter is a transport shim. It translates standard MCP JSON-RPC (stdin/stdout)
into the bridge's custom HTTP protocol (`POST /mcp/tool` with auth and replay headers).
Claude tool calls go through the same bridge, auth, and queueing as Raycast tool calls.

Config files:
- Claude Code: `.mcp.json` in workspace root
- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json`

Both point to the adapter, which reads bridge config from
`mcp-server/config/obsidian-cli-mcp.local.json`.

What Claude accesses directly as MCP tools:
- The 6 note/command operations (via bridge)
- `obsidian_health` (via bridge)
- `miyo_search_context` (via bridge, which proxies to Miyo at 8742)

What is NOT directly exposed as MCP:
- Backend emulator at 8789 — companion orchestration service
- Miyo at 8742 — companion retrieval service (accessed via `miyo_search_context` through the bridge)

## Current live nuance

The intended official-plugin architecture remains:

- hosted model behavior
- direct plugin MCP
- native Miyo

But the currently installed plugin can also be placed into a working exact-emulator configuration for validation work. When reading bug reports or transcripts, distinguish:

- the intended direct-MCP production target
- the currently selected plugin settings in the installed vault
- the separately available exact backend emulator lane

At the time of this update, the installed `copilot` plugin in `My Digital Garden` is configured for active exact-emulator validation with:

- `backendMode=self_host`
- `selfHostExecutionMode=exact_backend_emulator`
- `selfHostAdapter.runtimeLane=production_official`

## What has been removed

These are not part of active production anymore:

- Obsidian Local REST API as a production dependency
- silent Local REST fallback in the MCP server
- Local REST preferences in the active Raycast extension
- CPBH runtime as an active production layer
- old `dev-vault`-centered runtime assumptions

If another workspace project still depends on any of those, it is on the old setup.

## What is still allowed to be different

- active-note summarize is allowed to be direct local CLI from Raycast
- prompt refresh/run and note CRUD still use the shared CLI-backed MCP bridge
- PDF/video flows still use backend-emulator summarize paths and MCP-backed note writes

This is expected and not a contradiction.

## Validation scripts

Core production checks:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/bridge-health-check.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/cli-stability-gate.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/direct-cli-stability-gate.sh`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/scripts/official-plugin-miyo-check.sh`

Reference checklist:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/FUNCTIONAL_TEST_CHECKLIST.md`

## What another workspace project should check first

If you hand this off to another workspace project, verify these exact questions:

1. Is it still trying to use Local REST anywhere?
2. Is it still referencing CPBH or a legacy prompt-bridge extension/runtime?
3. Is it pointing at the same workspace-rooted MCP config file?
4. Is it expecting Raycast active-note summarize to go through MCP instead of direct local CLI?
5. Is it targeting the same vault name and path?
6. Is it expecting Miyo through the emulator aliases only, or through the native service too?

## Source-of-truth docs

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/raycast-obsidian-extension/INTEGRATION_README.md`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/bridges/obsidian-copilot-bridge/README.md`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/SELF_HOST_CONTRACT.md`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/FUNCTIONAL_TEST_CHECKLIST.md`
