# Copilot In Obsidian Everything Claude Handoff

Updated: 2026-03-24

> **SUPERSEDED — historical snapshot (banner added 2026-07-31).** This handoff predates
> the bridge consolidation: since **2026-05-09** the shared bridge is **REST-only** —
> `RestApiBackend` → Obsidian Local REST API (`:27124`) — and `src/backends/cliBackend.ts`
> plus the "CLI-backed" lane described throughout no longer exist. The backend emulator
> was retired 2026-04-11 and deleted 2026-05-08. Treat CLI-backed and emulator statements
> below as past state; the current architecture lives in `Copilot-Everything/CLAUDE.md`.

## Purpose

This document is the repo-local handoff for the workspace at:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything`

It is meant to give Claude a clean, current, workspace-first understanding of:

- what this workspace actually is
- which components are active
- which runtime contracts matter
- which docs and code paths are the source of truth
- what recent session history changed
- which project-specific skills Claude should create with `skill-creator`

This handoff is intentionally scoped to this workspace and its active implementation.

## Scope Reviewed

Reviewed the major active parts of this workspace:

- `docs/`
- `configs/validation/`
- `backend/copilot-backend-emulator/`
- `bridges/raycast-obsidian-extension/`
- `repos/obsidian-copilot-mcp/`
- `scripts/`
- `.learnings/`

Reviewed recent session context from:

- `019d0b44-25ae-7260-8d08-bdd00c89ff89`
- `019d134c-b05e-7913-b05e-6cc32f7599f1`
- `019d14dc-f2f1-7cd0-9a9b-34b486d00e56`
- `019d180e-a66c-7381-adef-f174e20557e2`
- `019d1d0d-2653-71a3-9b30-beb2f7ec94ae`

The emphasis here is current behavior, current contracts, and current implementation reality.

## Executive Summary

- This workspace is the operational control center for a local AI-enabled Obsidian stack.
- It combines four important layers:
  - an Obsidian plugin fork
  - a shared MCP bridge
  - a backend emulator for exact self-host and compatibility flows
  - a Miyo retrieval/index/search backend
- The official plugin path is currently documented as:
  - hosted model behavior
  - direct plugin MCP tool execution
  - native Miyo retrieval/search
- The Raycast path is currently documented as:
  - shared CLI-backed MCP bridge for note and command operations
- The backend emulator remains the canonical exact self-host orchestration layer for:
  - `/v1/self-host/*`
  - `/v0/*` compatibility behavior
  - document-oriented and advanced orchestrated flows
- The exact backend emulator lane in the plugin UI is working again for `copilot-plus` models after the 2026-03-24 repair:
  - the plugin now forwards decrypted `plusLicenseKey` for exact-mode `copilot-plus` turns
  - the emulator now throws a real error when the model returns empty text instead of rendering a blank chat bubble
- The workspace is not speculative. It is already working, with remaining effort focused on hardening, compatibility coverage, and operational cleanup.

## Architecture Snapshot

### High-level model

```text
Raycast
  -> shared MCP bridge
  -> Obsidian CLI-backed note/command operations
  -> live vault

Official Obsidian plugin
  -> hosted chat/agent behavior
  -> direct plugin MCP
  -> native Miyo retrieval/search

Exact self-host plugin mode and advanced compatibility flows
  -> backend emulator
  -> model planning + tool orchestration
  -> shared MCP bridge and Miyo-compatible services
```

### Main components

| Component | Role | Canonical location | Notes |
| --- | --- | --- | --- |
| Workspace root | Coordination layer | `/Users/trevorrobey/THE Copilot in Obsidian Everything` | Owns docs, scripts, configs, and local implementation |
| Backend emulator | Self-host-compatible orchestration layer | `backend/copilot-backend-emulator` | Owns canonical self-host contract and compatibility aliases |
| Shared MCP bridge | Stable tool execution layer | `bridges/obsidian-copilot-bridge` | CLI-backed, signed HTTP transport, replay protection |
| Obsidian plugin fork | Plugin runtime and self-host mode selector | `repos/obsidian-copilot-mcp` | Exposes `direct_plugin_mcp` and `exact_backend_emulator` |
| Raycast workspace fork | Workflow and command surface | `bridges/raycast-obsidian-extension` | Uses bridge and backend emulator depending on flow |
| Miyo runtime | Retrieval/index/search layer | external service via HTTPS proxy at `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`) | Used by official plugin runtime and compatibility paths |

### Service endpoints

| Service | Endpoint |
| --- | --- |
| Backend emulator | RETIRED 2026-04-11 (was `https://127.0.0.1:8789`); ZettelkastenService now runs in-process inside the vault-zettelkasten plugin |
| Shared MCP bridge | `https://127.0.0.1:8798` |
| Native Miyo via TLS proxy | `https://127.0.0.1:8743` (upstream `http://127.0.0.1:8742`) |
| Ollama when used locally via TLS proxy | `https://127.0.0.1:11435` (upstream `http://127.0.0.1:11434`) |

### Runtime mode split that Claude must preserve

Inside the plugin fork, there are two distinct self-host execution modes:

- `direct_plugin_mcp`
- `exact_backend_emulator`

They are not interchangeable.

- `direct_plugin_mcp` means the plugin itself remains in charge of the turn and talks to configured MCP servers directly.
- `exact_backend_emulator` means the plugin sends a canonical request to the backend emulator and the emulator owns orchestration, compatibility behavior, tool planning, and final response shaping.

## Current Production Contracts

### 1. Shared CLI-backed MCP bridge

This is the stable production note and command execution contract.

Core production operations:

- `open_vault`
- `create_note`
- `append_note`
- `read_note`
- `search_notes`
- `execute_command`

Primary implementation:

- `bridges/obsidian-copilot-bridge/src/backends/cliBackend.ts`

Key properties:

- CLI-backed
- bridge-mediated
- replay-protected HTTP transport
- explicit health/diagnostic support

### 2. Official plugin runtime

This is the documented current production runtime for the official plugin path.

Current shape:

- hosted model behavior
- direct MCP tool execution
- native Miyo retrieval/search

Primary docs:

- `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
- `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`

Important nuance:

- the intended official-plugin target remains direct MCP plus native Miyo
- the installed plugin can also be put into a working `exact_backend_emulator` configuration when validation or rollback work requires it
- at the time of this update, the installed `copilot` plugin in `My Digital Garden` is currently configured in `self_host` + `exact_backend_emulator` + `production_official` for active validation

### 3. Backend emulator

This is the exact self-host and compatibility orchestration layer.

Owns:

- `GET /healthz`
- `POST /v1/self-host/agent-turn`
- `POST /v1/self-host/agent-turn/stream`
- compatibility aliases under `/v0/*`

Primary docs:

- `docs/SELF_HOST_CONTRACT.md`
- `docs/BACKEND_EMULATOR_ARCHITECTURE.md`
- `docs/BACKEND_EMULATOR_RUNBOOK.md`

Current exact-mode repair note:

- `copilot-plus` exact-mode requests now carry decrypted `plusLicenseKey` to the model endpoint
- empty final model text now fails closed with an actionable error instead of returning a blank response bubble

### 4. Miyo retrieval layer

Miyo is the semantic retrieval/index/search backend.

Current role:

- native retrieval layer for official plugin behavior
- compatibility target for Miyo-shaped routes exposed by the backend emulator

Primary docs:

- `docs/OFFICIAL_MIYO_CONTRACT.md`
- `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`

## What Is Working

Based on docs, runtime scripts, validation artifacts, and recent session history:

- the bridge-backed CLI lane is the stable production path for note and command operations
- the official plugin runtime is documented around direct MCP plus native Miyo
- the backend emulator is implemented as the exact self-host compatibility layer
- the installed plugin exact-emulator lane can now complete buffered `copilot-plus` chat turns without the former blank-bubble failure mode
- replay-protected MCP HTTP calls are implemented
- the plugin exposes explicit execution-mode controls in the UI
- the stale ghost chat view cleanup exists in code
- the functional sweep recorded `21/21` passing checks on 2026-03-20
- docs were refreshed recently to match the current runtime rather than old assumptions

## Known Gaps And Ongoing Hardening Areas

The main remaining work is not “build from zero.” It is hardening and edge-case coverage:

- `/v0/index/*` runtime exercise coverage
- related-note populated-note compatibility coverage
- direct plugin versus exact emulator edge-case differences
- transport and streaming confidence
- continued Miyo compatibility verification
- continued docs/runtime/validation synchronization

Exact-mode note:

- exact emulator is now usable again, but it remains a separate lane from the direct-MCP target runtime and should be documented that way

## Most Important Source-Of-Truth Files

If Claude only reads a limited subset first, use this order:

1. `docs/COPILOT_WORKSPACE_CLAUDE_HANDOFF_2026-03-24.md`
2. `docs/OBSIDIAN_CLI_STACK_HANDOFF.md`
3. `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`
4. `docs/SELF_HOST_CONTRACT.md`
5. `docs/BACKEND_EMULATOR_ARCHITECTURE.md`
6. `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`
7. `docs/FUNCTIONAL_TEST_REPORT_2026-03-20.md`
8. `docs/RISKS.md`
9. `docs/NEXT_STEPS.md`

Then read the core code:

1. `backend/copilot-backend-emulator/src/services/SelfHostExecutionEngine.ts`
2. `backend/copilot-backend-emulator/src/services/McpOrchestrator.ts`
3. `backend/copilot-backend-emulator/src/services/ToolRouter.ts`
4. `backend/copilot-backend-emulator/src/services/ModelGateway.ts`
5. `backend/copilot-backend-emulator/src/routes/selfHostContract.ts`
6. `repos/obsidian-copilot-mcp/src/backend/BackendSelector.ts`
7. `repos/obsidian-copilot-mcp/src/backend/SelfHostAdapter.ts`
8. `repos/obsidian-copilot-mcp/src/LLMProviders/chainRunner/SelfHostEmulatorChainRunner.ts`
9. `repos/obsidian-copilot-mcp/src/components/chat-components/ChatInput.tsx`
10. `repos/obsidian-copilot-mcp/src/settings/v2/components/CopilotPlusSettings.tsx`
11. `bridges/obsidian-copilot-bridge/src/backends/cliBackend.ts`
12. `bridges/obsidian-copilot-bridge/src/server/httpTransport.ts`
13. `bridges/obsidian-copilot-bridge/src/server/replayGuard.ts`

## Recent Decision Timeline

### 2026-03-20

Session: `019d0b44-25ae-7260-8d08-bdd00c89ff89`

- official plugin runtime was pushed toward hosted behavior plus direct MCP plus native Miyo
- shared MCP bridge on `8798` and native Miyo on `8742` were treated as the target runtime
- backend emulator stayed installed as an alternate lane rather than the primary official-plugin path
- the functional sweep was created and run successfully with `21/21` passing checks
- Ollama model registration support improved, but model registration was explicitly distinguished from a proven stable direct-chat path

### 2026-03-21

Session: `019d134c-b05e-7913-b05e-6cc32f7599f1`

- bridge-backed CLI was clarified as the production note/command contract
- raw direct CLI was clarified as experimental or exception-oriented
- Local REST was recognized as removable from core flows, but not removable everywhere until migrations were finished
- exact backend emulator mode requirements were made explicit
- self-host secrets moved into Keychain-backed handling and encrypted-at-rest settings
- the ghost-tab issue was isolated to the stale `copilot-mcp-chat-view`

### 2026-03-22

Session: `019d14dc-f2f1-7cd0-9a9b-34b486d00e56`

- ghost-tab cleanup and execution-mode-switcher work were planned and then reflected in the current codebase
- the implemented direction favored simple cleanup plus explicit mode selection over fragile view migration

### 2026-03-22

Session: `019d180e-a66c-7381-adef-f174e20557e2`

- multiple docs were refreshed to match the live runtime
- this documentation refresh is one reason the current docs are relatively trustworthy

### 2026-03-23

Session: `019d1d0d-2653-71a3-9b30-beb2f7ec94ae`

- the workspace was summarized plainly as the control center for making Obsidian a reliable AI workspace
- the working mental model was:
  - Raycast and Obsidian are the front doors
  - the MCP bridge is the hands
  - the backend emulator is the brain for advanced flows
  - Miyo is the memory/search layer
- the overall state should be read as “already working, now hardening”

## What Claude Should Preserve

- preserve the distinction between `direct_plugin_mcp` and `exact_backend_emulator`
- preserve the distinction between bridge-backed CLI production lanes and direct local CLI exception flows
- preserve the difference between official plugin runtime, Raycast runtime, and backend-emulator runtime
- preserve the distinction between the intended direct-MCP target runtime and the separately working exact-emulator alternate lane
- preserve replay protection and signed MCP transport assumptions
- preserve the idea that docs and validation artifacts are part of the contract, not optional commentary
- preserve the current workspace and vault assumptions:
  - workspace root: `/Users/trevorrobey/THE Copilot in Obsidian Everything`
  - target vault: `/Volumes/ExtraCurricular/My Digital Garden`

## Skill-Creator Guidance For Claude

Claude should use its `skill-creator` skill here.

Default rule:

- create project-specific skills first
- only create a global skill if the workflow is clearly reusable outside this workspace without depending on these exact paths, ports, runtime assumptions, or repo structure

### Keep a skill project-specific if it depends on:

- the exact workspace path
- the exact vault path
- ports `8789`, `8798`, `8742`, or `11434`
- the split between official plugin, Raycast bridge, backend emulator, and Miyo
- the exact `direct_plugin_mcp` vs `exact_backend_emulator` contract
- the exact scripts and docs in this workspace

### Only consider a skill global if all of these are true:

- it can be described without this workspace’s paths
- it can be described without this workspace’s ports
- it would still help in an unrelated repo
- it is grounded in a genuinely reusable pattern rather than a local runbook

## Strong Project-Specific Skill Candidates

1. `workspace-architecture-map`
   - Purpose: explain the relationship between the plugin fork, bridge, backend emulator, Miyo, Raycast flows, and live vault.
   - Primary sources: this handoff, `docs/OBSIDIAN_CLI_STACK_HANDOFF.md`, `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`.

2. `official-plugin-runtime-ops`
   - Purpose: safely reason about and modify the official plugin runtime, especially `direct_plugin_mcp`, execution-mode UI, and Miyo/MCP assumptions.
   - Primary sources: `repos/obsidian-copilot-mcp/src/backend/*`, `src/components/chat-components/ChatInput.tsx`, `src/settings/v2/components/CopilotPlusSettings.tsx`, `docs/OFFICIAL_PLUGIN_COMPATIBILITY.md`.

3. `backend-emulator-contract-maintainer`
   - Purpose: work on `/v1/self-host/*`, `/v0/*`, planning/tool orchestration, reasoning markers, and lane policy without breaking compatibility.
   - Primary sources: `backend/copilot-backend-emulator/src/services/*`, `src/routes/*`, `docs/SELF_HOST_CONTRACT.md`, `docs/BACKEND_EMULATOR_ARCHITECTURE.md`.

4. `bridge-cli-runtime-ops`
   - Purpose: work on the shared bridge, CLI backend, replay protection, health checks, and direct-vs-bridge execution boundaries.
   - Primary sources: `bridges/obsidian-copilot-bridge/src/*`, `mcp-server/README.md`, `docs/MCP_SECURITY.md`.

5. `miyo-compat-and-indexing`
   - Purpose: reason about native Miyo usage, compatibility aliases, retrieval/indexing contracts, and official-plugin expectations.
   - Primary sources: `docs/OFFICIAL_MIYO_CONTRACT.md`, `docs/OFFICIAL_DIRECT_MCP_MIYO_RUNTIME.md`, backend compatibility services.

6. `workspace-docs-validation-sync`
   - Purpose: keep docs, scripts, validation artifacts, and runtime behavior synchronized.
   - Primary sources: `docs/`, `configs/validation/`, `scripts/full-functional-sweep.sh`, `scripts/official-plugin-*.sh`.

7. `raycast-flow-runtime-ops`
   - Purpose: reason about which Raycast flows use the bridge directly, which use the backend emulator, and where the direct local CLI exception exists.
   - Primary sources: `bridges/raycast-obsidian-extension/README.md`, `INTEGRATION_README.md`, flow files under `src/tools/`.

## Possible Global Skills Only If They Truly Generalize

1. `mcp-http-replay-protection`
   - Focus: signed body hashes, timestamps, nonces, and replay guards for local tool bridges.

2. `self-host-compat-route-design`
   - Focus: maintaining a canonical API while exposing compatibility aliases for legacy clients.

3. `obsidian-plugin-runtime-validation`
   - Focus: validating plugin runtime modes, self-host toggles, and compatibility coverage repeatably.

If Claude cannot make these genuinely reusable, they should remain project-specific instead.

## What Each Created Skill Should Contain

Each created skill should be:

- short
- operational
- grounded in actual source files
- explicit about triggers
- explicit about boundaries
- explicit about what not to assume

Each skill should include:

- a narrow purpose
- when to use it
- the minimum docs or code paths to read first
- preferred scripts or commands to reuse
- known traps
- a short verification checklist

Prefer several small composable skills over one giant omnibus skill.

## Ready-To-Paste Prompt For Claude

```text
Read `/Users/trevorrobey/THE Copilot in Obsidian Everything/docs/COPILOT_WORKSPACE_CLAUDE_HANDOFF_2026-03-24.md` first.

Use your `skill-creator` skill to create new skills for this workspace.

Rules:

1. Default to project-specific skills for this workspace only.
2. Only create a global skill if you can explicitly justify that it is reusable outside this workspace without depending on:
   - `/Users/trevorrobey/THE Copilot in Obsidian Everything`
   - `/Volumes/ExtraCurricular/My Digital Garden`
   - ports `8789`, `8798`, `8742`, `11434`
   - the exact `direct_plugin_mcp` vs `exact_backend_emulator` split
   - the exact bridge + backend emulator + Miyo architecture here
3. Preserve the distinction between:
   - official plugin runtime
   - Raycast bridge runtime
   - backend emulator runtime
4. Prefer small, composable skills over one large omnibus skill.
5. Ground every skill in the actual docs, scripts, and code paths in this workspace.
6. For each proposed skill, explicitly list:
   - scope
   - why it should be project-only or global
   - the first files it should read
   - what mistakes it should help avoid

Start by drafting project-specific skills for:

- workspace architecture mapping
- official plugin runtime operations
- backend emulator contract maintenance
- bridge/CLI runtime operations
- Miyo compatibility and indexing
- docs/validation synchronization
- Raycast flow runtime operations

If you later find a genuinely reusable pattern, propose it separately as a global skill with a short justification.
```

## Bottom Line

This workspace already has a real working architecture.

Claude should:

- treat this repo as the implementation truth
- preserve the runtime splits that already exist
- read docs and validation artifacts as part of the contract
- create project-specific skills first
- only promote a skill to global if it clearly survives outside this stack
