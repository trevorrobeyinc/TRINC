# Phase 26: Bridge Runtime and Execution Router Consolidation

Phase 26 completes the bridge runtime, state-store, and execution-router consolidation that Phase 26A intentionally stopped short of.

Phase 26A remains the prerequisite slice (bridge auth, principal resolution, route/lane separation, MCP Streamable HTTP). Phase 26 builds on top of 26A without changing the external `/jobs` API contract.

## Phase 26A (Prerequisite — Already Implemented)

- MCP Streamable HTTP support at `/mcp` (GET/POST).
- Shared bearer-token principal resolution for all authenticated routes.
- `/health` remains unauthenticated.
- Principal lane separation: `supervisor`, `operator`, `integration_hatchify`.
- Legacy MCP route auth coverage enforced.

## Phase 26 (Full Consolidation)

### Scope

- Wire bridge principal/role context from bridge-auth into job creation.
- Carry `JobExecutionContext` (principal, role, token_id, source) on every `JobRecord`.
- Make `worker.ts` route jobs through `execution-router.ts` instead of no-op completion.
- Record deterministic `JobExecutionResult` (outcome, router_role, tool_count) on every completed job.
- Upgrade `execution-router.ts` metadata from Phase 1 scaffold stubs to Phase 26 bridge-node values.
- Add Phase 26 counters to execution router metrics (phase26_jobs_routed, phase26_jobs_denied, phase26_jobs_stub).
- Fail-closed when execution context is missing or execution router is unavailable.

### Files Modified

- `openclaw-bridge/bridge/types.ts` — Added `BridgePrincipalKind`, `ExecutionOutcome`, `JobExecutionContext`, `JobExecutionResult`.
- `openclaw-bridge/bridge/state-store.ts` — `createJob` accepts optional `JobExecutionContext`; added `setExecutionResult`.
- `openclaw-bridge/bridge/server.ts` — Captures principal context at job creation; creates and passes execution router to worker.
- `openclaw-bridge/bridge/worker.ts` — Routes through execution router; fail-closed on missing context/router.
- `openclaw-bridge/src/core/execution-router.ts` — Phase 26 metadata, counters, and boundary comments.

### Invariants

- The external `/jobs` API contract is stable. New fields (`execution_context`, `execution_result`) are optional additions.
- Direct external tool execution remains blocked at the bridge boundary.
- The manual-only external-action boundary is preserved.
- Supervisor role cannot execute tools directly (execution router enforces this).
- Anonymous and integration_hatchify principals are fail-closed for job execution.

### Stop Condition

- Jobs created via `/jobs` carry principal/role execution context from bridge auth.
- Worker routes every job through the execution router.
- Missing execution context or missing router produces a deterministic denied outcome (fail-closed).
- Execution result is persisted on the job record.
- Phase 26A invariants remain enforced.
- All Phase 26 policy gate checks pass.

## Non-goals

- No Sider export/re-entry implementation (Phase 27 only).
- No browser automation.
- No login automation.
- No background sync.
- No direct external tool execution.
- No capability expansion beyond runtime/execution-router consolidation.
