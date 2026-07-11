# Phase 14 Agent Engine

## Overview
Phase 14 introduces the functional core research engine while keeping governance and supervisor controls as hard requirements.

Execution flow:
1. Operator submits a task through `scripts/run-research-task.js`.
2. Supervisor authority decides approval/denial.
3. Governance approval runs after supervisor approval.
4. Agent engine executes prompt construction and LLM completion.
5. Output manager persists output, metadata, and manifests.
6. Governance bridge records execution and emits RLHF dual-write artifacts.

## Core Modules
- `openclaw-bridge/core/agent-engine.js`
- `openclaw-bridge/core/governance-bridge.js`
- `openclaw-bridge/core/supervisor-authority.js`
- `openclaw-bridge/core/llm-adapter.js`
- `openclaw-bridge/core/interaction-log.js`
- `openclaw-bridge/core/task-definition-schema.js`
- `openclaw-bridge/core/research-output-manager.js`
- `openclaw-bridge/core/citation-gate.js`
- `openclaw-bridge/core/citation-extractor.js`

Citation-integrity layer (post-research engine):
- `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`
- `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`
- `openclaw-bridge/monetization/integrity-rating.js`
- `openclaw-bridge/monetization/graveyard-memo.js`

## LLM Provider Configuration
Committed template:
- `config/llm-providers.json`

Local override (gitignored):
- `config/llm-providers.local.json`

Supported providers:
- `mock` (default, deterministic)
- `local` (Ollama)
- `openai`
- `anthropic`
- `openrouter`

Network calls are isolated to `openclaw-bridge/core/llm-adapter.js`.

## Task Definition Reference
Schema version:
- `phase14-task-definition-v1`

Task types:
- `summarize`
- `extract`
- `analyze`
- `synthesize`
- `freeform`

Required fields:
- `type`
- `description`
- `outputFormat` (`markdown`, `json`, `text`)

Task ID is deterministic from canonicalized `{type, description, inputs_hash, created_at}`.

## Output Format Specification
Per task directory:
- `workspace/research-output/<task_id>/output.md|output.json|output.txt`
- `workspace/research-output/<task_id>/metadata.json`
- `workspace/research-output/<task_id>/manifest.json`

Global output index:
- `workspace/research-output/tasks-index.json`

Output catalog hash manifest:
- `workspace/research-output/hash-manifest.json`

## Governance Integration Map
Supervisor and governance checkpoints:
- `requestSupervisorApproval(taskDefinition, context)`
- `requestTaskApproval(taskDefinition, context)`
- `recordTaskExecution(taskId, result, context)`
- `generateRLHFEntry(taskId, interaction, context)`

RLHF mode:
- Pipeline-integrated
- Dual-write:
  - Global governance transaction state
  - Task-local mirror `rlhf-entry.json`

## Cline Supervisor Authority Enforcement
- Supervisor authority composes:
  - `openclaw-bridge/supervisor/supervisor-v1.js`
  - `openclaw-bridge/supervisor/request-queue.js`
  - `openclaw-bridge/supervisor/circuit-breaker.js`
  - `openclaw-bridge/supervisor/supervisor-registry.json`
- Engine execution requires `context.supervisorDecision.approved === true`.
- Missing receipt fails closed with `SUPERVISOR_APPROVAL_REQUIRED`.
- Denied supervisor path terminates before LLM execution.

## Citation Integrity (Post-Research Engine)
The post-research engine adds a zero-fabrication citation-integrity layer. Citations in a
shipped report are grounded in the source records actually retrieved at runtime, plus a
DOI retraction screen against Crossref. (Citations are NOT independently re-resolved against
their live source databases — grounded is not the same as re-resolved.)

Runtime persistence:
- `agent-engine.js` persists `fetched_citation_ids` (the identifiers actually retrieved at
  runtime by tool-prefetch) plus a per-task `citation_verification` block into research-output
  metadata.
- `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause: never invent a PMID/NCT/DOI;
  emit `[no verifiable citation found]` instead.

Report-level citation gate (`workflow-engine.executeMissionStep` → `verifyReportCitations`):
- Cross-checks every identifier cited in the assembled report against the UNION of
  runtime-fetched ids. A cited id is "grounded" if present in fetched evidence, else
  "ungrounded" (likely model-introduced).
- Returns a MULTI-STATE verdict (never a silent pass) — only PASS ships (per the never-hallucinate
  doctrine, operator ruling 2026-07-10): **PASS** (grounded ratio ≥ `minGroundedCitationRatio`, a
  REQUIRED value in `config/agent-config.json` = `0.75`, the B-grade floor, read fail-closed —
  missing/invalid → strict `0.75` default + warning via the exported `DEFAULT_MIN_GROUNDED_RATIO`);
  **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`, ratio below the floor); **INSUFFICIENT_EVIDENCE**
  (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — ZERO runtime evidence was fetched, an honest-zero that
  now BLOCKS instead of auto-passing); **NO_CITATIONS** (`PHASE30_CITATION_NONE` — evidence fetched
  but the report cited nothing).
- Writes `citation-verification.json` and `report-annotated.md` to the workflow dir; surviving
  ungrounded cites are annotated inline `[UNVERIFIED]`.

Retraction screen (`crossref-retraction.js`, wired via `researchRuntime`):
- Checks each cited DOI against Crossref `/works/{DOI}` (`relation.is-retracted-by` or
  `update-to` type `retraction`). A report citing ANY retracted paper HARD-STOPS
  (`PHASE30_CITATION_RETRACTED`). Fail-soft: Crossref errors yield no retractions, so a network
  blip can never wrongly block a report.

DOI extraction (`citation-extractor.js`):
- The DOI regex stops at non-DOI terminators (markdown/prose punctuation) and strips trailing
  sentence punctuation after capture (a DOI never ends in `.` `,` `;` `:`). This prevents
  trailing `]]` / `;` / `.` from being captured, which had deflated the grounded ratio and
  duplicated DOIs.

## Corpora Ingestion (Stop-Reason Archaeology)
- `ctgov-supplemental.js` is a LOCAL FETCHER (not ToolUniverse) that searches
  ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning
  each trial's `whyStopped` text plus protocol change-history (version count + most-amended
  modules) from the internal history endpoint. Has a session cache.
- Routed into role prefetch through the local-fetcher seam in `tool-prefetch.js`
  (`createToolPrefetch` `options.localFetchers`), tool name `ctgov_stopped_trials`. Each record
  is NCT-traced (grounded cite).

## Mission Bundle Deliverables
Every mission bundle now ships, in addition to the report, a citation-integrity audit trail and
a cost-avoidance graveyard memo. Both are registered in `manifest.json` and sealed in
`checksums.txt`.

- `deliverables/citation-integrity.md` — `integrity-rating.js` `buildIntegrityReport(citation_verification)`
  renders a graded provenance ledger (grade A/B/C/D from the grounded ratio; F + "BLOCKED" if any
  retraction; N/A if nothing cited). It is the report's audit-trail spine.
- `deliverables/graveyard-memo.md` — `graveyard-memo.js` `buildGraveyardMemo(stoppedTrials, {indication})`
  renders a memo of prior terminated/withdrawn/suspended programs in the indication, each
  NCT-traced, with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" —
  never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link.
  `buildAmendmentRisk(stoppedTrials)` renders a protocol amendment-risk band (LOW/MODERATE/HIGH)
  from the change-history median/max version count + most-amended modules. Both are rendered
  DETERMINISTICALLY from the fetched records (no LLM), so every claim is verifiable.

Wiring: on a gate-PASSING mission, `executeMissionStep` re-fetches the indication's stopped trials
(a session-cache hit — no extra CT.gov call), builds both memos (fully fail-soft + bounded — an
absent fetcher/empty indication/fetch error simply omits them and never blocks a passing report),
persists `graveyard-memo.md` to the workflow dir, and attaches them to the result; `executeOfferStep`
threads them into `source_context`; the deliverable packager ships `graveyard-memo.md` and registers
`artifactRefs.graveyard_memo`; `state.artifacts.graveyard` records the summary. `_workflow-runtime`
exposes the same `ctgovSupplemental` + `crossrefRetraction` instances on `researchRuntime`.

## Error Codes
- `SUPERVISOR_APPROVAL_REQUIRED` — engine execution requires a supervisor approval receipt.
- `PHASE30_CITATION_UNVERIFIED` — grounded citation ratio below `minGroundedCitationRatio`.
- `PHASE30_CITATION_RETRACTED` — report cites a Crossref-flagged retracted DOI.

## Quick Start (Mock Provider)
```bash
node scripts/run-research-task.js \
  --task "Summarize the sample input documents" \
  --type summarize \
  --input workspace/research-input/sample/ \
  --output workspace/research-output/ \
  --provider mock \
  --confirm
```

Inspect artifacts:
```bash
node scripts/list-research-tasks.js
node scripts/view-interaction-log.js
```
