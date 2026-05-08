# Phase 30-31 Validation Audit Report

**Date**: 2026-03-31
**Auditor**: Claude Opus 4.6 (automated validation)
**Scope**: Phase 30 (Workflow Engine) + Phase 31 (Enterprise Delivery Layer)
**Verdict**: PARTIALLY WORKING — tests pass, but end-to-end execution fails for all 6 workflow templates

---

## 1. System Status

| Component | Status | Details |
|-----------|--------|---------|
| **Workflow Engine** (`workflow-engine.js`) | ⚠️ PARTIALLY WORKING | Schema validation, pipeline parsing, and DAG resolution work. `executeWorkflow()` fails at the mission step for all templates due to downstream PHASE14_TASK_INPUT_REQUIRED. |
| **Workflow Schema** (`workflow-schema.js`) | ✅ WORKING | Validates templates, detects circular deps, enforces required fields. |
| **Workflow Templates** (6 JSON files) | ✅ VALID SCHEMAS | All 6 pass schema validation. All 6 fail at runtime — see blocking issues. |
| **Specialized Agent Roles** (6 roles) | ⚠️ PARTIALLY WORKING | Registered in autonomy ladder (after fix). Roles resolve correctly. But roles are LLM prompt prefixes only — no tool-calling wired. |
| **Quality Auditor** | ❌ NOT FUNCTIONAL | Self-verification pipeline exists in code but never runs — mission step fails before quality_audit step is reached. |
| **`run-workflow.js` CLI** | ⚠️ PARTIALLY WORKING | Parses args, resolves templates, invokes workflow engine. Fails at mission execution. |
| **Research REST API** (`research-api.js`) | ❌ NOT WIRED | Route definitions, auth (`api_client` principal), rate limiter all exist. But `bridge-server.js` does not import or mount these routes. No HTTP endpoint is reachable. |
| **Workflow Scheduler** (`workflow-scheduler.js`) | ❌ NOT WIRED | Cron parser works, tick logic is sound, schedule config exists. But no CLI script, no daemon, no startup integration calls it. It's a library nothing invokes. |
| **Usage Meter** (`usage-meter.js`) | ❌ NOT WIRED | Append-only JSONL writer exists. No caller in the workflow engine or API records usage events. |
| **Phase 30 Tests** | ✅ PASSING (26/26) | Unit tests with mocks all pass. |
| **Phase 31 Tests** | ✅ PASSING (34/34) | Unit tests with mocks all pass. |
| **Phase 30 Policy Verification** | ✅ PASSING | `verify-phase30-policy.sh` succeeds. |
| **Phase 31 Policy Verification** | ✅ PASSING | `verify-phase31-policy.sh` succeeds. |

---

## 2. Blocking Issues (ranked by severity)

### CRITICAL — All Workflow Templates Fail

**Issue**: `PHASE14_TASK_INPUT_REQUIRED` — analyst step receives empty inputs

**Root Cause**: `spawn-orchestrator.js` → `buildSubtaskInputs()` does not propagate scout output as filesystem inputs to the analyst step. The scout completes and writes output, but the analyst's input array is empty because the orchestrator doesn't chain step outputs → next step inputs.

**Affects**: All 6 workflow templates. Every template's pipeline begins with a `mission` step that uses multi-agent orchestration (scout → analyst → synthesizer). The scout succeeds, but the analyst fails.

**Effort**: 4-8 hours. Requires modifying `buildSubtaskInputs` in `spawn-orchestrator.js` to read the previous step's output directory and pass file paths as inputs to the next step.

**Workaround**: `run-research-task.js` (single-agent, no orchestration) works with LM Studio. But this bypasses the workflow engine entirely.

### CRITICAL — Research API Not Mounted

**Issue**: `research-api.js` defines route handlers and auth middleware, but `bridge-server.js` never imports or registers them.

**Evidence**:
- `bridge-routing.js` has route patterns for `/api/v1/research`
- `bridge-auth.js` has `api_client` principal type
- `bridge-server.js` does not reference `research-api.js` anywhere
- `curl http://localhost:18789/api/v1/research` returns 404

**Effort**: 2-4 hours. Mount routes in bridge server, add integration tests with real HTTP requests.

### HIGH — Workflow Scheduler Has No Entrypoint

**Issue**: `workflow-scheduler.js` is a well-implemented library (cron parser, tick loop, run history) but nothing calls `createWorkflowScheduler()` or starts the tick interval.

**Evidence**:
- No CLI script like `run-scheduler.js` exists
- No `scripts/start-scheduler.sh`
- Bridge server does not import it
- `config/scheduled-workflows.json` exists but is never loaded at runtime

**Effort**: 2-3 hours. Create `scripts/run-scheduler.js`, add graceful shutdown, add to PM2/systemd config.

### HIGH — Usage Meter Has No Callers

**Issue**: `usage-meter.js` exports `recordUsage()` and `getUsage()` but neither the workflow engine nor the Research API calls them.

**Evidence**: `grep -r "usage-meter" openclaw-bridge/` returns only the file itself and tests.

**Effort**: 1-2 hours. Add `recordUsage()` calls in workflow engine completion handler and API response middleware.

---

## 3. Autonomy Ladder Fix (Applied, Not Committed)

**Issue found during audit**: Phase 29 biomedical mission templates use `action_type: "discover_tools"` and `action_type: "execute_tools"`, but these were never added to `config/autonomy-ladder.json`.

**Fix applied locally**:
- Added `discover_tools` to `scout.allowedActions`
- Added `execute_tools` to `analyst`, `safety_signal_detector`, `molecular_profiler`, `competitive_intel_analyst`, `quality_auditor` allowedActions

**Status**: Modified in working tree, not committed. This fix resolves the first error in the chain but the PHASE14_TASK_INPUT_REQUIRED error occurs immediately after.

---

## 4. Integration Gaps

### ToolUniverse Tools Are Not Actually Called

**Finding**: Specialized roles (molecular_profiler, safety_signal_detector, etc.) have system prompts that mention ToolUniverse tool names (e.g., "Use PubChem compound search to..."). But the LLM adapter (`lm-studio-adapter.js`) does plain text chat completion — there is no tool-use/function-calling protocol.

**Impact**: The 7B local model generates text about using tools rather than actually invoking them. Research output cites tool names but contains no real tool-derived data.

**What's needed**:
1. LLM adapter must support tool-use protocol (function calling)
2. ToolUniverse MCP tools must be injected as available functions in the LLM context
3. Tool call results must be fed back into the LLM conversation
4. This is a fundamental architecture gap — estimated 2-4 weeks of work

### Mission Output Quality (7B Model)

**Finding**: When missions succeed (via `run-research-task.js` single-agent path), the `qwen2.5-coder-7b-instruct` model produces:
- Generic summaries that read like textbook introductions
- No real citations (mentions "studies show" without specific papers)
- No compound IDs, NCT numbers, or database-specific identifiers
- Reasonable structure but shallow content

**Assessment**: Acceptable for Standard tier at best. Premium/Enterprise tier requires Claude Sonnet/Opus or GPT-4 class model. The quality auditor role would help if it could actually run, but it can't because missions fail before reaching it.

### Interaction Log Chain Hash Corruption

**Finding**: `security/interaction-log.json` had broken chain hashes. Moved to `security/interaction-log.corrupted.json` during audit. The log recreates cleanly when missing.

**Root cause**: Likely a previous session wrote entries with a different hash algorithm or missed an entry in the chain.

---

## 5. What Works Well

1. **Schema validation is solid** — workflow templates, mission envelopes, dataset schemas all validate correctly
2. **Autonomy ladder RBAC is enforced** — role/action gating is fail-closed and catches real misconfigurations
3. **Test coverage is genuine** — 60/60 tests pass and test real logic (not just "file exists" assertions)
4. **Policy verification scripts are thorough** — catch structural issues before CI
5. **Workflow engine DAG resolution** — dependency ordering, variable interpolation, and state persistence all work in unit tests
6. **Cron parser** — 5-field parser with correct edge case handling, no external deps
7. **Single-agent research tasks** — `run-research-task.js` works end-to-end with LM Studio

---

## 6. REVENUE_PLAYBOOK.md Assessment

The revenue playbook exists and outlines pricing tiers (Standard, Premium, Enterprise), target buyers (pharma R&D, biotech, CROs), and channels (Gumroad, direct delivery, subscription). Assessment:

- **Realistic for Standard tier**: Single-agent research tasks work today. Package as research packs on Gumroad.
- **Premature for Premium/Enterprise**: Requires working multi-agent orchestration, ToolUniverse tool-calling, and Claude-class model quality.
- **Pricing tiers make sense** but the system cannot currently produce Premium or Enterprise quality output.

---

## 7. WORKFLOW_CATALOG.md

**Status**: Does not exist. Referenced in plan but never created.

**Impact**: Low — this is documentation, not functionality. But it would help users discover available templates.

---

## 8. Recommended Next Steps (Priority Order)

### Tier 1: Fix Broken (must fix before any workflow runs end-to-end)

1. **Fix `buildSubtaskInputs` in `spawn-orchestrator.js`** — Chain scout output to analyst input. This unblocks ALL 6 workflow templates. (4-8 hrs)

2. **Commit autonomy ladder fix** — `discover_tools` and `execute_tools` already added locally. (5 min)

### Tier 2: Wire Disconnected (components exist but aren't connected)

3. **Mount Research API in bridge server** — Import `research-api.js`, register routes. (2-4 hrs)

4. **Create scheduler entrypoint** — `scripts/run-scheduler.js` that calls `createWorkflowScheduler()`. (2-3 hrs)

5. **Wire usage meter** — Add `recordUsage()` calls in workflow engine and API. (1-2 hrs)

### Tier 3: Improve Quality (system works but output is weak)

6. **Add Claude/GPT-4 as LLM provider** — Configure API key, update `llm-providers.json`. (30 min)

7. **Wire ToolUniverse into mission execution** — Function-calling protocol in LLM adapter. (2-4 weeks)

8. **Enable quality auditor pipeline** — Requires working missions first (depends on #1). (1-2 days)

### Tier 4: Build Sales Collateral

9. **Create WORKFLOW_CATALOG.md** — Document all 6 templates with input schemas and example commands. (1 hr)

10. **Generate sample research packs** — Run all templates with Claude, package outputs as demo artifacts. (4-8 hrs)

---

## 9. Summary

Phase 30-31 is **architecturally complete but operationally disconnected**. The individual components (workflow engine, scheduler, API, usage meter) are well-implemented and well-tested in isolation. But:

- The workflow engine can't execute because mission orchestration has a subtask input chaining bug
- The Research API exists but isn't mounted in the HTTP server
- The scheduler exists but nothing starts it
- The usage meter exists but nothing calls it
- ToolUniverse tools are referenced in prompts but never actually invoked

The honest assessment: **60/60 tests pass, 0/6 workflows complete end-to-end.** The gap between "tests pass" and "system works" is the integration wiring. Fix the subtask input chaining bug (#1 above) and the system becomes immediately useful for Standard-tier research packs via single-command workflow execution.
