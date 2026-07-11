# Phase 18 Agent Spawner

Phase 18 adds mission orchestration on top of the validated Phase 14-17 baseline.

## Guardrails
- `state/runtime/state.json` remains the single global runtime index.
- `workspace/missions/<missionId>/...` is the mission-local durable record.
- `agent-spawner` and `spawn-orchestrator` may plan, register, dispatch, aggregate, persist, and resume.
- They may not directly invoke MCP tools, shell execution, container execution, browser automation, or external HTTP requests.
- Phase 18 is disabled by default until live LLM and live MCP evidence is upgraded from partial verification to passing proof.
- Final mission synthesis ownership is explicit: `finalSynthesisMode = orchestrator_aggregation`.

## Mission Layout
- `workspace/missions/<missionId>/mission.json`
- `workspace/missions/<missionId>/spawn-plan.json`
- `workspace/missions/<missionId>/blackboard.md`
- `workspace/missions/<missionId>/agents/<agentId>/inbox.jsonl`
- `workspace/missions/<missionId>/agents/<agentId>/outbox.jsonl`
- `workspace/missions/<missionId>/artifacts/`
- `workspace/missions/<missionId>/status.json`

`status.json` keeps the current state and an append-only `status_history` for lifecycle transitions, including `supervisor_approved`.

## Execution Model
- Subtasks are dispatched through bounded concurrency using lane and concurrency-key inflight counters (`max_inflight` from the spawn plan).
- Scheduling is dependency-aware and deterministic by queue order.
- Mission execution adds timeout and stall guards (`mission_max_runtime_ms`, `default_subtask_timeout_ms`, `stall_interval_ms`) and preserves open-loop state for resumable partial progress.
- Optional checkpoint synthesis writes deterministic intermediate summaries under `workspace/missions/<missionId>/artifacts/checkpoints/` from completed subtask outputs only.
- Lane scaling is deterministic and bounded (`min_inflight`..`max_inflight`), with every scaling decision projected into mission blackboard/status metadata.
- All side effects remain in worker paths routed through `role-router -> agent-engine -> existing execution boundaries`.

## Enabled Template Classes
- `research_only`
- `draft_artifact`

`external_action` templates exist only as disabled stubs in Phase 18.

## Phase 19 Compatibility
- New Phase 19 templates continue to use the existing mission runtime shape:
  - `research_pack`
  - `dataset_sample`
  - `subscription_refresh`
- Allowed task types remain bounded to the existing validated set:
  - `extract`
  - `analyze`
  - `synthesize`
  - `freeform`
- Dataset building and monetization packaging happen after mission completion through dedicated Phase 19 scripts and modules.
- Internal packaging autonomy is expanded for local artifact preparation only.
- External publishing, upload, marketplace submission, and delivery remain manual-only and outside the Phase 18 mission runtime.

## Post-Research Engine Compatibility (Citation Integrity + Cost-Avoidance Deliverables)
- Later post-research-engine slices extend the same mission runtime shape; they do not change Phase 18 guardrails or the `orchestrator_aggregation` synthesis ownership.
- A report-level citation gate runs in `workflow-engine.executeMissionStep` (`verifyReportCitations`): every identifier cited in the assembled report is cross-checked against the union of identifiers actually fetched at runtime by tool-prefetch. A cited id is "grounded" if it was present in fetched evidence, otherwise "ungrounded" (likely model-introduced). Per the never-hallucinate doctrine (operator ruling 2026-07-10) the gate returns a **multi-state verdict**, not a silent pass: **PASS** (grounded ratio ≥ `minGroundedCitationRatio` — the only shippable state); **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`, ratio below the floor); **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — ZERO runtime evidence was fetched, a recorded honest-zero that now BLOCKS, closing the doctrine hole where zero-evidence runs silently auto-passed); and **NO_CITATIONS** (`PHASE30_CITATION_NONE` — evidence fetched but the report cited nothing). Only PASS ships. `minGroundedCitationRatio` is `0.75` (`config/agent-config.json`; required, fail-closed — a missing/invalid config falls back to the strict `0.75` default plus a warning, never a laxer floor). It writes `citation-verification.json` + `report-annotated.md` to the workflow dir and annotates surviving ungrounded cites inline as `[UNVERIFIED]`. Citations are grounded in the source records actually retrieved at runtime; they are not independently re-resolved against a live external database.
- A retraction screen checks each cited DOI against Crossref `/works/{DOI}`; a report citing any retracted paper hard-stops (error code `PHASE30_CITATION_RETRACTED`). It is fail-soft, so a Crossref network blip cannot wrongly block a report.
- Corpora ingestion adds a local fetcher (`ctgov-supplemental`, tool name `ctgov_stopped_trials`) routed into role prefetch through a local-fetcher seam in `tool-prefetch.js`; it returns TERMINATED/WITHDRAWN/SUSPENDED trials for a condition with each sponsor's stated stop reason and protocol change-history, NCT-traced.
- New mission-bundle deliverables are produced and sealed in the release bundle alongside existing Phase 19 artifacts:
  - `deliverables/citation-integrity.md` — a graded (A/B/C/D, or F/BLOCKED on any retraction, N/A if nothing cited) provenance ledger rendered from the citation-verification metadata.
  - `deliverables/graveyard-memo.md` — a deterministically rendered (no LLM) memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)", never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link; it carries a LOW/MODERATE/HIGH protocol amendment-risk band. Both memos are fail-soft and bounded, so an absent fetcher or empty indication simply omits them and never blocks a passing report.

## Outer Operator Workflow Compatibility
- Phase 18 runtime authority remains in-repo (`supervisor-authority` + governance path).
- Cline is a recommended outer operator shell for planning/review and approved implementation work.
- The mission runtime remains tool-agnostic and does not depend on Cline programmatically.
- GitHub Actions is the primary enforcement path for policy/test gates in this public repo.
