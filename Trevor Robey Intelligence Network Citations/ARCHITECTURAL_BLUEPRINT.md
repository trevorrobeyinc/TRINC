# Architectural Blueprint (Implemented Scaffold)

This repository now contains the implemented architecture baseline for trevor-robey-inc-agents (renamed from `OpenClaw-Research-Agents` on 2026-04-27 — see [TREVOR_ROBEY_INC_AGENTS_DOSSIER.md](TREVOR_ROBEY_INC_AGENTS_DOSSIER.md) for the current product story) through Phase 23, plus the Phase 26A, Phase 27, and Phase 28 monetization-adjacent milestones.

Planned post-Phase 22 expansion work is tracked in `future openclaw research agents phases to be implemented.` at the repository root.
The current dependency-ordered lock is PR 1 docs/roadmap, PR 2 Phase 26A minimal prerequisite slice, PR 3 Phase 27 integration, and PR 4 Phase 28 direct-delivery.
Phase 24 is constrained to operator-gated Notion/newsletter sync briefing artifacts and does not expand research-search, browser, or session surfaces.
Phase 25 formalizes local-only credential brokering plus approval-scoped delegated connector sessions without introducing external secret managers, OAuth, or login automation.

Core outcomes:
- Clean-room derivative controls recorded.
- Research-only control-plane skeleton initialized.
- Offensive/security execution identities removed from active runtime surfaces.
- Deterministic state file, file-based comms, and memory hydration scaffolding created.
- Container policy files rewritten for research-only tool identities.
- MCP replacement contracts scaffolded with strict validation expectations and stub gating.
- Preflight payload validation checks implemented to catch oversized/abusive outbound requests early.
- Comprehensive workload integrity controls enforced (SBOM, digest matching, runtime policy scanning).
- Internal RLHF workflow automation explicitly bounded to deterministic draft generation, compliance linting, and manual packaging.
- Deterministic Outcome Intelligence integrated for operator-entered feedback loops, trajectory scoring, calibration, and portfolio planning.
- Internal Experiment Governance enables deterministic assignment, internal-only analysis, and pre-registration locked decision ledgers without external autonomous side-effects.
- Deterministic internal compliance governance allows configuration of runtime attestation, evidence bundled generation, and operator-governed release gating.
- Governance automation adds continuous read-only monitor workflows, policy drift detection, and guaranteed Immutable operator override ledgers.
- Operational Resilience integrates deterministic observability, advisory alerting, operator-gated runbook orchestration, and incident escalation controls.
- Recovery Assurance capabilities added including fail-closed checkpoints, strict human-gated restore pipelines, and read-only continuity drill automation.
- Deterministic Supply Chain Security enables internal SBOM generation, dependency integrity verification, and operator-gated dependency patching bounds.
- Deterministic Access Control and Identity Governance enforces local-only canonical RBAC policies, operator-gated token lifecycle, and fail-closed permission boundaries.
- Core Research Agent Engine (Phase 14) implements supervisor-gated research tasks, deterministic mock LLM execution, and writes deterministic output artifacts.
- Multi-Agent Topology (Phase 15) integrates deterministic lane queues, communication buses, and multi-actor interaction logging.
- MCP Research Ingestion (Phase 16) normalizes external knowledge ingestion via structured, strict local integration pathways.
- Runtime Hardening and Resume Orchestration (Phase 17) guarantees deterministic persistent state resumption across execution boundaries and component failures.
- Live LLM & MCP Verification tools execute continuous endpoint probing and track live operational states in deterministic audit maps.
- Agent Spawner & Mission Orchestrator (Phase 18) introduces dynamic mission planning, spawn orchestration, and localized blackboard management while strictly isolating capabilities away from live autonomous execution.
- Deterministic Dataset Foundation & Monetization Packaging (Phase 19) structures raw inputs into staged dataset builds and local deterministically-packaged release bundles ensuring compliant preparation offline.
- Commercialization Gatekeeping & Dataset Provenance (Phase 20) evaluates license compatibility, enforces dataset quality scoring, purges duplicates, and constructs verifiable provenance trackers ahead of monetization packaging.
- Deterministic Publisher Adapter Boundary (Phase 21) manages deterministic offline generation of final platform-specific submission packs through validated schemas avoiding live network submission.
- Post-Export Manual Evidence Ledger (Phase 22) enforces an authoritative append-only cryptographic ledger and strict operator outcome recording for external deployments.
- Portfolio Intelligence and Commercialization Decision Support (Phase 23) deterministically aggregates approved release state with Phase 22 submission evidence and Phase 28 delivery evidence to produce read-only operator reports under `audit/evidence/phase23/`.
- Phase 24 Operator Sync and Briefing keeps newsletter/notion research surfaces disabled while attaching deterministic local operator briefing artifacts to governed `prepare`, `commit`, `retry`, and `reconcile` mutation flows.
- Phase 25 Credential Broker and Delegated Session Governance keeps brokered secrets in memory only, issues approval-scoped delegated connector sessions, and invalidates those sessions when the underlying approval token is revoked or expires.
- GitHub Actions CI enforcement integrates test verification and governance execution directly into pull requests on the main branch.
- Citation Integrity layer enforces zero-fabrication grounding across the research pipeline. The agent engine persists the citation identifiers actually retrieved at runtime by tool-prefetch plus a per-task citation_verification block into research-output metadata, and buildPrompt carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI; say "[no verifiable citation found]" instead). `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`) that cross-checks every identifier cited in the assembled report against the union of runtime-fetched ids: a cited id is "grounded" if it appeared in fetched evidence, else "ungrounded". Per the never-hallucinate doctrine (operator ruling 2026-07-10) the gate returns a multi-state verdict — not a silent pass: **PASS** (grounded ratio ≥ `minGroundedCitationRatio`, the ONLY shippable state); **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`, ratio below the floor); **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — ZERO runtime evidence was fetched, a recorded honest-zero that now BLOCKS, closing the prior hole where zero-evidence runs silently auto-passed); and **NO_CITATIONS** (`PHASE30_CITATION_NONE` — evidence fetched but the report cited nothing). `minGroundedCitationRatio` is a required value in `config/agent-config.json` = 0.75 (the B-grade floor), read fail-closed (missing/invalid config → strict 0.75 default + a warning), replacing the old hardcoded 0.34. The gate writes `citation-verification.json` + `report-annotated.md` to the workflow dir, and annotates surviving ungrounded cites inline `[UNVERIFIED]`. Cited claims are grounded in the source records actually retrieved at runtime, not independently re-resolved against a live external database.
- DOI Retraction Screen (`openclaw-bridge/mcp/crossref-retraction`) checks each cited DOI against Crossref `/works/{DOI}` (relation.is-retracted-by or update-to type "retraction") and hard-stops any report citing a retracted paper (error code `PHASE30_CITATION_RETRACTED`); it is fail-soft, so a Crossref network error yields no retractions and can never wrongly block a report. The DOI extractor (`openclaw-bridge/core/citation-extractor.js`) stops capture at non-DOI terminators and strips trailing sentence punctuation, preventing deflated grounded ratios and duplicated DOIs.
- Stop-Reason Archaeology corpora ingestion (`openclaw-bridge/mcp/ctgov-supplemental`) is a local fetcher (not ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition and returns each trial's whyStopped stop-reason text plus protocol change-history (version count + most-amended modules) from the internal history endpoint, with a session cache. It is routed into role prefetch through a new local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` options.localFetchers, tool_name `ctgov_stopped_trials`); each record is NCT-traced.
- Citation Integrity Ledger (`openclaw-bridge/monetization/integrity-rating.js`, `buildIntegrityReport`) renders a graded provenance ledger (grade A/B/C/D from the grounded ratio; F + "BLOCKED" on any retraction; N/A when nothing is cited) and ships as `deliverables/citation-integrity.md` in every mission bundle, registered in `manifest.json` and sealed in `checksums.txt`.
- Graveyard Memo and Amendment-Risk deliverables (`openclaw-bridge/monetization/graveyard-memo.js`) render `deliverables/graveyard-memo.md` deterministically from the fetched stopped-trial records (no LLM): a memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)", never invented), protocol churn, and a resolvable clinicaltrials.gov/study/<NCT> link, plus a LOW/MODERATE/HIGH protocol amendment-risk band from change-history version counts. On a gate-passing mission `executeMissionStep` re-fetches the indication's stopped trials (session-cache hit), builds both memos fully fail-soft and bounded (an absent fetcher, empty indication, or fetch error simply omits them and never blocks a passing report), the deliverable-packager ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`, and `_workflow-runtime` exposes the shared ctgovSupplemental and crossrefRetraction instances on researchRuntime.
- Audit, threat-model, and governance documentation scaffolded for formal review.

See:
- `audit/`
- `openclaw-bridge/docs/`
- `openclaw-bridge/security/`
- `workspace/`
