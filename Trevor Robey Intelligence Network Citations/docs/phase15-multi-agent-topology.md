# Phase 15 Multi-Agent Topology

## Objective
Phase 15 adds deterministic multi-agent topology and file-based communications while preserving supervisor authority and governance-first execution.

## Topology Components
- `openclaw-bridge/core/agent-registry.js`
- `openclaw-bridge/core/role-router.js`
- `openclaw-bridge/core/lane-queue.js`
- `openclaw-bridge/core/comms-bus.js`
- `openclaw-bridge/core/autonomy-ladder.js`
- `openclaw-bridge/core/heartbeat-state.js`

Role model:
- `supervisor`
- `scout`
- `analyst`
- `synthesizer`
- `operator`

## Deterministic Queues and Comms
Lane queue persistence:
- `workspace/comms/events/lane-queue.json`

Comms directories:
- `workspace/comms/inbox/`
- `workspace/comms/outbox/`
- `workspace/comms/blackboard/`
- `workspace/comms/events/`

Comms behavior:
- Atomic writes (`tmp` + rename)
- Ordered sequence allocation
- Envelope hash recording
- Blackboard chain hash linking
- Tamper detection via `detectTamper()`

## Supervisor Authority Enforcement
- `role-router.dispatch()` rejects missing supervisor receipt.
- Supervisor-approved context remains mandatory before role execution.
- Autonomy ladder gates role/action pairs and optional human-approval escalation.

## Citation-Integrity Layer Wiring (post-research engine)
The post-research citation-integrity layer attaches to this topology at the mission/role
execution path; the topology primitives above are unchanged.
- Role prefetch gained a local-fetcher seam: `tool-prefetch.js` (`createToolPrefetch`
  `options.localFetchers`) routes a local fetcher (`tool_name` `ctgov_stopped_trials`,
  `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`) into role prefetch alongside
  the existing tools. It retrieves TERMINATED/WITHDRAWN/SUSPENDED ClinicalTrials.gov v2 trials
  (each NCT-traced) with stop reasons and protocol change-history.
- `agent-engine` persists `fetched_citation_ids` (identifiers actually retrieved at runtime by
  tool-prefetch) plus a per-task `citation_verification` block into research-output metadata;
  `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause.
- `workflow-engine.executeMissionStep` runs a REPORT-LEVEL gate (`verifyReportCitations`) that
  cross-checks every cited identifier against the union of runtime-fetched ids. Citations are
  grounded in the source records actually retrieved at runtime and cited DOIs are
  retraction-screened against Crossref (`crossref-retraction.js`); citations are NOT
  independently re-resolved against their live source databases. The gate HARD-FAILS below the
  configured grounded ratio (`minGroundedCitationRatio`, default `0.34`) and on any retracted DOI.
- On a gate-passing mission the step builds two deliverables deterministically (no LLM) from the
  fetched records and ships them in the mission bundle: `deliverables/citation-integrity.md`
  (graded provenance ledger) and `deliverables/graveyard-memo.md` (prior stopped programs +
  protocol amendment-risk). Both are fail-soft and never block a passing report.

New error codes: `PHASE30_CITATION_UNVERIFIED`, `PHASE30_CITATION_RETRACTED`.

## Config
- `config/agent-topology.json`
- `config/autonomy-ladder.json`
- `minGroundedCitationRatio` (agent-config; default `0.34`)

## Verification
```bash
bash scripts/verify-phase15-policy.sh
node --test tests/core/phase15-lane-queue.test.js
node --test tests/security/phase15-policy-gate.test.js
```
