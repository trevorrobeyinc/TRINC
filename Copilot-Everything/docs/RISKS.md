# Risks

## Open Risks

### 1. Exact mode currently exposes MCP tools only

The emulator owns the whole turn, but the canonical request currently sends MCP bindings only. If future self-host-visible fork logic depends on additional built-in tools, exact mode will need a validated server-side representation for them.

### 2. Official plugin runtime coverage is broader, but not yet exhaustive

The official plugin's open Miyo routes for health, search, related-search, and parse-doc are now aliased and validated. The remaining open risk is route breadth, not basic compatibility:

- `/v0/index/*` is implemented as pass-through alias coverage but not yet re-tested from the official runtime
- related-search has been validated on the real downstream `404` path, not yet on a populated success-path note
- `miyoVaultName` source-ID override is confirmed, but a full re-index and search success-path under a custom vault ID has not been run yet

### 3. Scripted Obsidian eval automation can still be timing-sensitive

Long-running `runChain(...)` automation can stall or lag even after the visible chat turn is complete. Validation scripts should continue to trust chat-state and console evidence over promise timing alone.

### 4. In-app exact mode is currently validated through the canonical non-stream route

The emulator implements both streaming and non-stream routes, and streaming is fixture-tested, but the current Obsidian-safe transport path uses buffered `requestUrl`. The dev-vault in-app proof therefore uses `POST /v1/self-host/agent-turn` rather than live incremental SSE.

### 5. MCP transport support remains HTTP-first

Both the preserved direct path and the exact emulator path currently assume HTTP MCP transport for the active local bridge.

## Lower-Risk Notes

- The canonical fork-owned contract is now versioned and fixture-locked under `v1/self-host/*`.
- The official plugin's open Miyo `/v0/*` surface is now a validated secondary alias path.
- Hosted mode remains isolated and unchanged.
- The bridge-backed direct plugin MCP path remains preserved for comparison and debugging.
