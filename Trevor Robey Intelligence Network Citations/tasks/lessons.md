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

---

## LRN-20260612-001 citation_grounding_not_blind_trust

**Logged**: 2026-06-12T00:00:00Z
**Priority**: high
**Status**: resolved
**Area**: backend

### Summary
The zero-fabrication brand requires that report citations be checked against the source records actually retrieved at runtime — not trusted because the model emitted them. A report-level citation gate was added on top of the per-task agent-engine controls.

### Details
The post-research engine added a CITATION-INTEGRITY layer:
- `agent-engine.js` now persists `fetched_citation_ids` (the identifiers actually retrieved at runtime by tool-prefetch) plus a per-task `citation_verification` block into research-output metadata; `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI — say "[no verifiable citation found]" instead).
- `workflow-engine.executeMissionStep` runs a REPORT-LEVEL gate (`verifyReportCitations` in `core/citation-gate.js`): every identifier cited in the assembled report is cross-checked against the UNION of runtime-fetched ids. A cited id is "grounded" if it was present in fetched evidence, else "ungrounded" (likely model-introduced). Per the never-hallucinate doctrine (operator ruling 2026-07-10) the gate now returns a MULTI-STATE verdict, not a silent pass: **PASS** (grounded ratio ≥ `minGroundedCitationRatio` — the ONLY shippable state); **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`, ratio below the floor); **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — ZERO runtime evidence was fetched, a recorded honest-zero that now BLOCKS, closing the hole where zero-evidence runs silently auto-passed); **NO_CITATIONS** (`PHASE30_CITATION_NONE` — evidence fetched but the report cited nothing). The floor `minGroundedCitationRatio` is now a required value in `config/agent-config.json` = 0.75 (the B-grade floor), read fail-closed (missing/invalid → strict 0.75 default + warning; exported as `DEFAULT_MIN_GROUNDED_RATIO`, replacing the old hardcoded 0.34). It writes `citation-verification.json` + `report-annotated.md` (surviving ungrounded cites annotated inline `[UNVERIFIED]`). A zero-evidence run no longer auto-passes — "cannot verify" is itself a non-shippable verdict.
- A retraction screen (`mcp/crossref-retraction/crossref-retraction.js`) checks each cited DOI against Crossref `/works/{DOI}`; a report citing any retracted paper HARD-STOPS (`PHASE30_CITATION_RETRACTED`). Fail-soft: a Crossref network blip yields no retractions and can never wrongly block a report.

HONESTY NOTE: citations are "grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)". They are NOT independently re-resolved/verified against each citation's live source database — that per-citation external re-resolution is not built yet (grounded != re-resolved).

### Suggested Action
Treat the report-level grounded ratio as the shippable integrity signal, and keep the ABSOLUTE-RULE clause in `buildPrompt` intact. When raising `minGroundedCitationRatio`, validate against a live armed run before promoting.

### Metadata
- Source: conversation
- Related Files: openclaw-bridge/core/citation-gate.js, openclaw-bridge/core/agent-engine.js, openclaw-bridge/core/workflow-engine.js, openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js
- Tags: citations, zero-fabrication, citation-gate, retraction, error-codes

---

## LRN-20260612-002 doi_regex_overcapture_deflated_grounding

**Logged**: 2026-06-12T00:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
A DOI regex that over-captured trailing punctuation deflated the grounded ratio and duplicated DOIs.

### Details
In `core/citation-extractor.js` the DOI regex was capturing trailing markdown/prose terminators (e.g. `]]`, `;`, `.`), which produced malformed and duplicated DOIs that no longer matched the fetched ground truth — deflating the grounded ratio. DOIs contain internal dots, so `.` can't be excluded in-pattern; the fix stops the pattern at non-DOI terminators and strips trailing sentence punctuation after capture (a DOI never ends in `. , ; :`). Confirmed live: the same deliverable's integrity grade rose from C/0.69 to A/1.0.

### Suggested Action
When matching identifiers that legitimately contain punctuation, prefer terminator-aware patterns plus a post-capture trim over excluding the character in-pattern. Re-measure the grounded ratio after any extractor change.

### Metadata
- Source: error
- Related Files: openclaw-bridge/core/citation-extractor.js
- Tags: citations, doi, regex, grounded-ratio

---

## LRN-20260612-003 stopped_trial_corpus_and_deterministic_deliverables

**Logged**: 2026-06-12T00:00:00Z
**Priority**: medium
**Status**: resolved
**Area**: backend

### Summary
Stop-reason archaeology was added as a local fetcher, and two new mission-bundle deliverables are rendered deterministically from fetched records (no LLM) so every claim is verifiable.

### Details
- `mcp/ctgov-supplemental/ctgov-supplemental.js` is a LOCAL FETCHER (not ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules). It has a session cache and is routed into role prefetch through a new local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`, tool_name `ctgov_stopped_trials`). Each record is NCT-traced (grounded cite).
- `monetization/integrity-rating.js` `buildIntegrityReport(citation_verification)` renders a graded provenance ledger (grade A/B/C/D from the grounded ratio; F + "BLOCKED" on any retraction; N/A if nothing cited), shipped as `deliverables/citation-integrity.md` in every mission bundle (registered in `manifest.json` + sealed in `checksums.txt`).
- `monetization/graveyard-memo.js` renders `deliverables/graveyard-memo.md` (prior terminated/withdrawn/suspended programs in the indication, each NCT-traced, with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — never invented — protocol churn, and a resolvable clinicaltrials.gov link) and a protocol amendment-risk band (LOW/MODERATE/HIGH) from change-history median/max version count. Both are rendered DETERMINISTICALLY from fetched records (no LLM).
- Wiring: on a gate-PASSING mission, `workflow-engine.executeMissionStep` re-fetches the indication's stopped trials (a session-cache hit — no extra CT.gov call) and builds both memos fully fail-soft and bounded (an absent fetcher / empty indication / fetch error simply omits them and never blocks a passing report); `executeOfferStep` threads them into `source_context`; the deliverable-packager ships `graveyard-memo.md` and registers the artifact refs. `_workflow-runtime` exposes the `ctgovSupplemental` + `crossrefRetraction` instances on `researchRuntime`.

This was live-verified on an armed heart-failure run (workflow 6/6 steps, grounded ratio 1.0, 8 stopped trials retrieved, integrity grade A, both new deliverables sealed in the release bundle) — which also addresses the integration-path concern raised in LRN-20260331-001 (the gate and deliverables run on the real runtime path, not mocked).

### Suggested Action
Keep deterministic deliverables LLM-free so their claims stay verifiable. Local fetchers belong on the `localFetchers` seam, not ToolUniverse. Preserve the fail-soft/bounded wiring so a missing corpus never blocks an otherwise-passing report.

### Metadata
- Source: conversation
- Related Files: openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js, openclaw-bridge/core/tool-prefetch.js, openclaw-bridge/monetization/integrity-rating.js, openclaw-bridge/monetization/graveyard-memo.js, openclaw-bridge/core/workflow-engine.js
- Tags: clinicaltrials, stopped-trials, deliverables, deterministic, monetization
