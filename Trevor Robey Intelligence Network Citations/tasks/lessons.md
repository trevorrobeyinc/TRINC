# Lessons Learned — OpenClaw Research Agents Activation

## LRN-20260330-001 architecture_misunderstanding

**Logged**: 2026-03-30T21:00:00Z
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
Audit wrongly concluded the system "has never talked to a real LLM" and needed external API keys.

### Details
The initial operational audit assumed the system required Anthropic/OpenAI API keys configured in `config/llm-providers.json`. In reality, the architecture uses:
- **Claude Code** as the primary LLM (via MCP bridge, planned)
- **LM Studio** as the secondary LLM (local OpenAI-compatible API on localhost:1234)
- No external API keys required for either path

The `openai` provider entry in llm-providers.json was a red herring — it requires an API key (throws before request) and uses the wrong request format for LM Studio.

### Suggested Action
Always verify provider architecture by reading the actual adapter code (`llm-adapter.js`) before making claims about what's configured vs. what works. The config file alone doesn't tell the full story.

### Metadata
- Source: user_feedback
- Related Files: openclaw-bridge/core/llm-adapter.js, config/llm-providers.json
- Tags: architecture, providers, LM Studio

---

## LRN-20260330-002 node22_dns_lookup_api

**Logged**: 2026-03-30T21:15:00Z
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Node.js 22 changed the DNS lookup callback API, breaking egress policy DNS pinning.

### Details
In Node.js 22, custom `lookup` functions passed to `http.request` receive `{all: true}` in the options parameter. When `options.all` is true, the callback must return an array of `{address, family}` objects, not scalar `(null, ip, family)`. The `createPinnedLookup` function in `egress-policy.js` only returned scalar format, causing `ERR_INVALID_IP_ADDRESS`.

### Suggested Action
When writing custom DNS lookup functions, always check `options.all` and return the appropriate format. This is a breaking change from Node.js 18/20 to 22.

### Metadata
- Source: error
- Related Files: openclaw-bridge/execution/egress-policy.js
- Tags: node22, dns, breaking-change

---

## LRN-20260330-003 interaction_log_sequence_zero

**Logged**: 2026-03-30T21:20:00Z
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Interaction log `next_sequence` must be 0 (not 1) for a fresh start.

### Details
The interaction log chain integrity code computes `sequence = Number(state.next_sequence) + 1`. If `next_sequence` is 1, the first entry gets sequence 2, which fails validation expecting sequence 1 (`sequence_non_contiguous`). Setting `next_sequence: 0` ensures the first entry gets sequence 1.

### Suggested Action
When resetting `security/interaction-log.json`, always use `next_sequence: 0`.

### Metadata
- Source: error
- Related Files: security/interaction-log.json
- Tags: interaction-log, chain-integrity, off-by-one

---

## LRN-20260330-004 monetization_requires_mission_ids

**Logged**: 2026-03-30T21:25:00Z
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
`generate-offer.js` only accepts `mission-*` or `dataset-*` source IDs, not `task-*`.

### Details
Research tasks produce `task-*` IDs, but the monetization pipeline (generate-offer → approve-release → export-release) requires `mission-*` or `dataset-*` prefixed IDs. Always use mission orchestration (`run-dataset-mission.js`) for work intended to be monetized, not `run-research-task.js`.

### Suggested Action
Document this in the Revenue Playbook. For monetizable work, always start with `run-dataset-mission.js`.

### Metadata
- Source: error
- Related Files: scripts/generate-offer.js, scripts/run-dataset-mission.js
- Tags: monetization, pipeline, id-format

---

## LRN-20260330-005 phase29_warn_not_block

**Logged**: 2026-03-30T21:50:00Z
**Priority**: low
**Status**: resolved
**Area**: backend

### Summary
Phase 29 startup integrity should warn on failure, not block MCP service initialization.

### Details
Phase 29 (ToolUniverse) is a newer integration in re-integration status. Making it a hard failure in the MCP init chain would block all MCP service operations (including non-ToolUniverse research) if any Phase 29 prerequisite is missing. Implemented as `logger.warn` instead of `throw`.

### Suggested Action
When Phase 29 is fully stable and promoted from deferred status, consider making it a hard failure like phases 7-14.

### Metadata
- Source: conversation
- Related Files: openclaw-bridge/mcp/mcp-service.js, security/phase29-startup-integrity.js
- Tags: phase29, tooluniverse, governance

---

## LRN-20260331-001 tests_pass_system_broken

**Logged**: 2026-03-31T00:00:00Z
**Priority**: critical
**Status**: pending
**Area**: tests

### Summary
60/60 Phase 30-31 tests pass but 0/6 workflows complete end-to-end. Unit tests with mocks don't catch integration failures.

### Details
All Phase 30-31 tests mock the research runtime and mission orchestrator. They verify schema validation, pipeline parsing, DAG resolution, route parsing, cron matching — all correctly. But none test the actual integration path: workflow engine → mission spawner → spawn-orchestrator → agent execution. The `buildSubtaskInputs` bug (scout output not chained to analyst input) is invisible to unit tests because the mock runtime returns synthetic success.

### Suggested Action
For any new phase, add at least one integration test that exercises the real runtime path (even if it uses mock LLM). Unit tests with fully-mocked dependencies prove the component works in isolation but say nothing about wiring.

### Metadata
- Source: conversation
- Related Files: tests/core/phase30-workflow-engine.test.js, openclaw-bridge/core/spawn-orchestrator.js
- Tags: testing, integration, false-confidence

---

## LRN-20260331-002 autonomy_ladder_action_types

**Logged**: 2026-03-31T00:00:00Z
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
New mission templates with new `action_type` values must have those action types added to `config/autonomy-ladder.json`.

### Details
Phase 29 biomedical mission templates introduced `discover_tools` and `execute_tools` action types but never added them to the autonomy ladder. The RBAC check in `role-router.js` (`autonomyLadder.canRolePerform(role, actionType)`) correctly denied these actions, causing `PHASE15_ROLE_ACTION_DENIED`. This was invisible in CI because Phase 29 tests mock the autonomy ladder.

### Suggested Action
When adding new `actionType` values to mission templates or step definitions, always add the corresponding entry to `config/autonomy-ladder.json` in the same commit. Add a policy check for this.

### Metadata
- Source: error
- Related Files: config/autonomy-ladder.json, config/mission-templates.json, openclaw-bridge/core/role-router.js
- Tags: rbac, autonomy-ladder, governance
