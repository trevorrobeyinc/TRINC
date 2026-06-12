# Runtime Core Architecture

## Control-plane responsibilities
- Gateway ingress and transport multiplexing.
- Bridge route normalization.
- Lane Queue sequencing.
- Deterministic state persistence and hydration.

## Queue model
- Per-session FIFO lane semantics.
- State persisted on enqueue/dequeue transitions.
- Restart reinjection from unresolved open loops.

## Failure recovery
- Circuit breaker gates repeated failures.
- Unresolved work remains in `openLoops`.
- Hydration reconstructs context from state + memory logs.

## Preflight validation
- Payload sizes and structures are enforced ahead of execution.
- Prevents egress policy violations by rejecting out-of-bounds requests before the mutation queue.

## RLHF Review Pipeline
- Automates internal draft preparation, formatting, and compliance linting.
- Output explicitly constrained to deterministic manual-handoff packaging; absolutely no automated external submission.

## Outcome Intelligence Pipeline
- Computes deterministic quality scoring and calibration from operator-entered feedback.
- Generates weekly/monthly intelligence artifacts without autonomous external side effects.

## Experiment Governance Pipeline
- Internal deterministic assignment engine, rollout controls, and analysis snapshot generation.
- Validates pre-registration hash locks and applies startup integrity checks before processing requests.

## Compliance and Release Gating
- Attestation logic evaluates evidence bundle generation requirements continuously.
- Applies pre-flight check verifications against compliance chain before handling requests.

## Governance Automation
- Executes deterministic read-only compliance sweeps preventing silent drift.
- Formalizes tamper-evident ledger patterns for override resolution tracking.

## Operational Resilience Pipeline
- Exposes deterministic telemetry and advisory SLO alerting channels.
- Orchestrates operator-gated runbook execution and blocks automated remediation.

## Recovery Assurance Pipeline
- Automatically generates deterministic backup manifests and verifies artifact chain integrity.
- Provides read-only continuity drill validation while enforcing strict operator-only lockouts on actual restore procedures.

## Supply Chain Security
- Validates known-good dependencies and constructs SLSA-compatible build provenance logic.
- Maintains purely advisory vulnerability reports and mandates operator action for any updates.

## Access Control & Identity Governance
- Implements deterministic, local-only access control across all operator-gated workflows using canonical RBAC.
- Governs session state and fail-closed permission boundaries without autonomous external Identity Provider mechanisms.

## Research Agent Execution Engine (Phase 14-15)
- Orchestrates multi-agent topologies utilizing deterministic queue lanes and explicit comms buses.
- Constrains direct task execution behind the Supervisor mandatory approval gate (`supervisorDecision.approved`).

## Runtime Hardening & Data Normalization (Phase 16-17)
- Unifies structured MCP retrieval schemas into the deterministic internal logic pipeline.
- Enforces resilient resume mechanisms orchestrating local session state checkpoints through runtime failures.

## Corpora Ingestion: Stop-Reason Archaeology & Change-History
- A local fetcher (`mcp/ctgov-supplemental/ctgov-supplemental.js`, not ToolUniverse) searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules) from the internal history endpoint. It keeps a session cache.
- Routed into role prefetch through a local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` options.localFetchers), tool_name `ctgov_stopped_trials`. Each record is NCT-traced so it lands as a grounded citation.

## Live Verification & Readiness Pipeline
- Synthesizes read-only health checks orchestrating live LLM endpoints and active MCP components.
- Commits timestamped evidence maps proving current configuration execution safely without breaking determinism rules.

## Mission Orchestration (Phase 18)
- Coordinates multiple spawn lifecycles mapped under a unified blackboard with dependency-aware, deterministic scheduling.
- Routes deterministic agent configurations and registers dynamically generated local dependencies using bounded concurrency limits.
- Incorporates mission execution timeout flags, stall guards, and optional artifact checkpoint synthesis from completed subtask aggregates.

## Citation Integrity Gate (Phase 30)
- `agent-engine` persists `fetched_citation_ids` (the identifiers actually retrieved at runtime by tool-prefetch) plus a per-task `citation_verification` block into research-output metadata; `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI; emit `[no verifiable citation found]` instead).
- `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`, `core/citation-gate.js`): every identifier cited in the assembled report is cross-checked against the union of runtime-fetched ids. A cited id is "grounded" if it was present in fetched evidence, else "ungrounded" (likely model-introduced). The gate engages only when there is fetched ground truth, and hard-fails (`PHASE30_CITATION_UNVERIFIED`) when the grounded ratio is below `minGroundedCitationRatio` (agent-config default 0.34). It writes `citation-verification.json` + `report-annotated.md` to the workflow dir; surviving ungrounded cites are annotated inline `[UNVERIFIED]`.
- Retraction screen (`mcp/crossref-retraction/crossref-retraction.js`): each cited DOI is checked against Crossref `/works/{DOI}` (`relation.is-retracted-by` or update-to type "retraction"). A report citing any retracted paper hard-stops (`PHASE30_CITATION_RETRACTED`). Fail-soft — Crossref errors yield no retractions, so a network blip can never wrongly block a report. Wired into the gate via `researchRuntime`.
- The `citation-extractor.js` DOI regex stops at non-DOI terminators and strips trailing sentence punctuation after capture (a DOI never ends in `.` `,` `;` `:`), preventing trailing markdown/prose characters from being captured and deflating the grounded ratio.
- Citations are grounded in the source records actually retrieved at runtime plus DOI retraction-screened (Crossref); they are not independently re-resolved against a live external source database.

## Dataset Foundation & Monetization (Phase 19-20)
- Orchestrates reproducible offline conversion from distinct research missions into deterministic staged dataset builds mapping defined metadata, manifests, and strict typing.
- Enforces dataset QA mechanisms including computational deduplication, license review restrictions, and deterministic quality scoring metrics prior to staging.
- Packagers compile internal content logic, bundles, deliverables, provenance trackers, and release-ready staging items under deterministic checksum definitions without autonomously invoking marketplace web interfaces.
- Two new mission-bundle deliverables ship per release bundle (registered in `manifest.json`, sealed in `checksums.txt`):
  - `deliverables/citation-integrity.md` — `monetization/integrity-rating.js` `buildIntegrityReport(citation_verification)` renders a graded provenance ledger (grade A/B/C/D from the grounded ratio; F + "BLOCKED" on any retraction; N/A if nothing cited). It is the report's audit-trail spine.
  - `deliverables/graveyard-memo.md` — `monetization/graveyard-memo.js` `buildGraveyardMemo(stoppedTrials,{indication})` renders a memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced, with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link; `buildAmendmentRisk(stoppedTrials)` renders a protocol amendment-risk band (LOW/MODERATE/HIGH) from change-history median/max version count + most-amended modules. Both are rendered deterministically from the fetched records (no LLM), so every claim is verifiable.
- On a gate-passing mission, `workflow-engine.executeMissionStep` re-fetches the indication's stopped trials (session-cache hit, no extra CT.gov call) and builds both memos fail-soft and bounded — an absent fetcher, empty indication, or fetch error simply omits them and never blocks a passing report. `executeOfferStep` threads them into `source_context`; the deliverable-packager ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`; `state.artifacts.graveyard` records the summary. `_workflow-runtime` exposes the `ctgovSupplemental` + `crossrefRetraction` instances on `researchRuntime`.

## Publisher Integration & Evidence Governance (Phase 21-22)
- Implements deterministic Publisher Adapters (Phase 21) ensuring release packs generate solely as local offline assets securely tailored for explicitly authorized downstream target platforms.
- Authoritative execution of submission transactions maps exclusively to the Manual Evidence Ledger (Phase 22), relying solely on operator-provided append-only transaction verifications without relying on direct third-party deployments.
