# Feature Specification: trevor-robey-inc-agents (Biomedical Due Diligence Engine)

**Feature Branch**: `001-trevor-robey-inc-agents`
**Created**: 2026-05-13
**Status**: Draft (reverse-engineered from existing Phase-35 implementation)

**Input**: Existing monorepo workspace at `trevor-robey-inc-agents/`, with prior context from `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, and `trevor-robey-inc/OFFERINGS.md`.

## User Scenarios & Testing

### User Story 1 — Investor Pre-Mortem Delivery (Priority: P1)

A biotech hedge-fund PM or biotech-specialist VC partner submits an asset name. The system runs a six-agent workflow over 5–10 business days and delivers a citation-traced risk dossier covering trial design + comparable failures + KOL sentiment + IP runway. Tiered at $9,950 / $14,950 / $19,950 (top tier adds KOL primary research). Every claim traces to a PMID, NCT, ChEMBL CID, or DOI. Source: `trevor-robey-inc/OFFERINGS.md` row "Investor Pre-Mortem".

**Why P1**: Primary revenue driver. Anchor SKU. Refund-backed Speed SLA. Drives the brand's "Every claim, sourced. Every risk, named. In days, not weeks." promise.

**Independent Test**: Given an asset input, when `node trevor-robey-inc-agents/scripts/run-workflow.js --template <name> --topic "..."` is spawned by the Command Center plugin, then stdout emits `{"type":"workflow_created","workflow_id":"...","template_id":"..."}` immediately and `{"type":"workflow_result",...}` at completion, six interlinked vault notes are generated under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/`, and every cited claim carries a real PMID/NCT/ChEMBL CID/DOI.

**Acceptance Scenarios**:
1. **Given** a valid asset input and a healthy environment (mkcert root CA in keychain, ExtraCurricular mounted, Obsidian open), **When** the Command Center plugin spawns `scripts/run-workflow.js` with `--template general-research-pack` (the provisional template_id for Investor Pre-Mortem per the Key Entities mapping table — to be confirmed when SKU↔template mapping is codified), **Then** stdout emits `workflow_created` within 2 seconds, the workflow runs to `status: completed`, and six vault notes are written under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/general-research-pack/{date}/`.
2. **Given** a citation that lacks a PMID/NCT/ChEMBL CID/DOI, **When** the quality_auditor agent runs, **Then** the row is rejected and surfaced as a quality-gate failure (no silent passthrough).
3. **Given** TLS cert files missing or unreadable, **When** any bridge tries to listen, **Then** the bridge throws and refuses to start (HTTPS-only invariant — Principle I).
4. **Given** an assembled report and the union of identifiers actually fetched at runtime, **When** `workflow-engine.executeMissionStep` runs the report-level citation gate (`verifyReportCitations`), **Then** the grounded ratio must meet `minGroundedCitationRatio` (default 0.34) or the report HARD-FAILS with `PHASE30_CITATION_UNVERIFIED`; surviving ungrounded cites are annotated inline `[UNVERIFIED]` and `citation-verification.json` + `report-annotated.md` are written to the workflow dir.
5. **Given** a report that cites a DOI flagged retracted by Crossref (`relation.is-retracted-by` or an `update-to` of type "retraction"), **When** the gate runs the retraction screen, **Then** the report HARD-STOPS with `PHASE30_CITATION_RETRACTED` (fail-soft: a Crossref network error yields no retractions and never wrongly blocks a report).

### User Story 2 — Failed Trial Archaeology (Priority: P2)

A pharma R&D CI lead or biotech VC partner submits a mechanism. System delivers an NCT-indexed failure-pattern matrix of Phase 2/3 terminations in that mechanism. $14,950. Same engine, different template (`failed-trial-archaeology`).

**Why P2**: Flanking primary. Reuses the entire workflow infrastructure with a different template; high margin, focused scope.

**Independent Test**: Given a mechanism input, when `--template failed-trial-archaeology` is run, then the deliverable includes an NCT-indexed matrix of Phase 2/3 terminations with per-trial failure-mode classification, every entry citation-traced.

**Shipped deliverables (engine-wide, all missions)**: Every mission bundle now ships a **Citation Integrity & Provenance ledger** (`deliverables/citation-integrity.md`) grading how grounded the report's citations are in the source records actually retrieved at runtime (plus DOI retraction-screening via Crossref). Gate-passing missions that retrieved prior stopped trials in the indication also ship a **Graveyard Memo** (`deliverables/graveyard-memo.md`) — NCT-traced prior terminated/withdrawn/suspended programs with each sponsor's stated stop reason (or an explicit "(none stated by sponsor)") and a resolvable `clinicaltrials.gov/study/<NCT>` link — plus a deterministically derived protocol **Amendment-Risk** band (LOW/MODERATE/HIGH). These are rendered without an LLM, so every claim is verifiable.

### User Story 3 — Tactical SKUs (Priority: P3)

The engine also serves five tactical offerings under the same architecture:
- **Conference Synthesis Brief** — $4,950 / conference; 500+ ASCO/ESMO/AACR abstracts synthesized in 24–48 hours.
- **Trial Design Benchmark Pack** — $4,950; comparative Phase 3 structure analysis vs 10–20 comparable programs.
- **Cross-Silo Connector Report** — $9,950–$24,950; hidden mechanistic links across ChEMBL/PubMed/CT.gov.
- **Plain-Language Patient Brief** — $2,500; regulatory-compliant PLS at 8th-grade health-literacy level (EU CTR 536/2014).
- **Pharmacovigilance Pack** — tactical (demoted); existing marketplace listings preserved.

**Why P3**: Tactical demand. Smaller engagements. Same workflow runtime; differs only in template + agent role mix.

### Edge Cases

- mkcert root CA missing or revoked → all HTTPS bridges refuse to listen (Principle I). Workflow cannot dispatch. Surface: clear error pointing operator to `mkcert -install && mkcert localhost 127.0.0.1`.
- ExtraCurricular volume unmounted → vault writes fail. Surface to operator immediately; do NOT silently buffer.
- Both Claude Code CLI and LM Studio offline → halt the workflow with explicit error. The `mock` provider is for CI / deterministic tests only and MUST NOT be used as a production fallback (per `config/llm-providers.json`).
- Obsidian closed during workflow → `:8798` and `:8799` bridges die; in-flight workflow fails. Accepted trade-off: this stack assumes Obsidian is the always-open driver.
- A workflow step emits a citation without PMID/NCT/ChEMBL CID/DOI → `quality_auditor` rejects the row. The deliverable is not signed off until 100% of rows pass the gate.
- An assembled report cites an identifier that was never in the runtime-fetched evidence (likely model-introduced) → the report-level citation gate marks it "ungrounded"; if the grounded ratio falls below `minGroundedCitationRatio` (default 0.34) the report HARD-FAILS with `PHASE30_CITATION_UNVERIFIED`. The gate engages only when there IS fetched ground truth.
- An assembled report cites a DOI that Crossref flags as retracted → HARD-STOP with `PHASE30_CITATION_RETRACTED`. Fail-soft on Crossref errors (a network blip never wrongly blocks a report).

## Requirements

### Functional Requirements

- **FR-001**: System MUST route LLM calls by agent role per `roleProviderMap` in `trevor-robey-inc-agents/config/agent-config.json` — Claude Code (`claude-sonnet-4-6`) primary, LM Studio (`qwen2.5-coder-7b-instruct`, alt `mistral-nemo-12b`) fallback on `https://127.0.0.1:1235`, mock for CI, Ollama configured but DISABLED.
- **FR-002**: System MUST execute workflow steps in parallel within each topological dependency level via `Promise.allSettled()` (Phase 35 parallel execution). Steps with dependencies execute level-by-level.
- **FR-003**: System MUST emit structured JSON events on stdout (`{"type":"workflow_created",...}` immediately, `{"type":"workflow_result",...}` at completion). stderr is reserved for log noise and MUST NOT be parsed for workflow state.
- **FR-004**: System MUST refuse to listen on any TCP port if TLS certs fail to load (HTTPS-only invariant — Principle I). No plaintext fallback path.
- **FR-005**: System MUST enforce citation provenance — every output row carries a real PMID, NCT, ChEMBL CID, or DOI. The `quality_auditor` role MUST reject rows that don't.
- **FR-006**: System MUST run as on-demand subprocess only; no persistent gateway service. The previous `:18789` launchd entry was retired 2026-04-27 — that was an unrelated homebrew `openclaw.ai` consumer "Personal AI assistant", NOT this engine.
- **FR-007**: System MUST use the 8 project MCP servers under `trevor-robey-inc-agents/openclaw-bridge/mcp/` (ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub metadata-only — no model weights downloaded, NPI Registry, ICD-10, Owkin pathology, Google Drive) plus the ToolUniverse subprocess (`vendor/tooluniverse`, ~2,116 biomedical tools, pinned at v1.1.10, Apache-2.0 from MIMS-Harvard / Zitnik Lab).
- **FR-008**: System MUST honor the restricted-globals rule inside `openclaw-bridge/` — no `Date.now()`, no `new Date()`, no `Math.random()`, no `randomUUID()`. Use the injected `timeProvider` and `entropyProvider` exclusively. This is enforced for deterministic-test reproducibility.
- **FR-009**: System MUST log per-workflow audit artifacts to `trevor-robey-inc-agents/workspace/audit/`.
- **FR-010**: System MUST run with `NODE_EXTRA_CA_CERTS` pointing at `~/Library/Application Support/mkcert/rootCA.pem` in every spawned Node subprocess.
- **FR-011**: System MUST persist, per task, the `fetched_citation_ids` (identifiers ACTUALLY retrieved at runtime by tool-prefetch) and a `citation_verification` block into research-output metadata (`agent-engine.js`). `buildPrompt` MUST carry an ABSOLUTE-RULE "ZERO FABRICATION" clause — never invent a PMID/NCT/DOI; say `[no verifiable citation found]` instead.
- **FR-012**: System MUST run a REPORT-LEVEL citation gate (`workflow-engine.executeMissionStep` → `verifyReportCitations`, `openclaw-bridge/core/citation-gate.js`) that cross-checks every identifier cited in the assembled report against the UNION of runtime-fetched ids. A cited id is "grounded" if it was present in fetched evidence, else "ungrounded". The gate MUST hard-fail with `PHASE30_CITATION_UNVERIFIED` when the grounded ratio is below `minGroundedCitationRatio` (`config/agent-config.json`, default 0.34), write `citation-verification.json` + `report-annotated.md` to the workflow dir, and annotate surviving ungrounded cites inline `[UNVERIFIED]`. The gate engages only when there IS fetched ground truth. NOTE: this verifies that each citation is grounded in the source records actually retrieved at runtime — it does NOT independently re-resolve each citation against its live source database.
- **FR-013**: System MUST screen every cited DOI for retraction via Crossref `/works/{DOI}` (`openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`, wired into the gate via `researchRuntime`), checking `relation.is-retracted-by` or an `update-to` entry of type "retraction". A report citing ANY retracted paper MUST hard-stop with `PHASE30_CITATION_RETRACTED`. The screen MUST be fail-soft: Crossref errors yield no retractions, so a network blip can never wrongly block a report.
- **FR-014**: System MAY ingest STOP-REASON ARCHAEOLOGY via a local fetcher (`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`, NOT ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition and returns each trial's `whyStopped` text plus protocol CHANGE-HISTORY (version count + most-amended modules) from the internal history endpoint, with a session cache. It is routed into role prefetch through a local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`, tool_name `ctgov_stopped_trials`); each record is NCT-traced (grounded cite).
- **FR-015**: System MUST ship a graded CITATION INTEGRITY ledger as `deliverables/citation-integrity.md` in every mission bundle (`openclaw-bridge/monetization/integrity-rating.js` → `buildIntegrityReport(citation_verification)`; grade A/B/C/D from the grounded ratio, F + "BLOCKED" if any retraction, N/A if nothing cited), registered in `manifest.json` and sealed in `checksums.txt`. It is the report's audit-trail spine.
- **FR-016**: On a gate-PASSING mission, System SHOULD render two cost-avoidance deliverables DETERMINISTICALLY (NO LLM) from the fetched stopped-trial records (`openclaw-bridge/monetization/graveyard-memo.js`): `deliverables/graveyard-memo.md` (`buildGraveyardMemo` — prior terminated/withdrawn/suspended programs in the indication, each NCT-traced, with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — NEVER invented — protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link) and a protocol amendment-risk band (`buildAmendmentRisk` — LOW/MODERATE/HIGH from change-history median/max version count + most-amended modules). Wiring is fully fail-soft and bounded: an absent fetcher, empty indication, or fetch error simply omits the memos and never blocks a passing report; the indication re-fetch is a session-cache hit (no extra CT.gov call); `deliverable-packager` ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`.

### Error Codes

- **PHASE30_CITATION_UNVERIFIED** — report-level citation gate failure: grounded ratio below `minGroundedCitationRatio`.
- **PHASE30_CITATION_RETRACTED** — a cited DOI is flagged retracted by the Crossref retraction screen.

### Key Entities

- **Workflow**: `workflow_id` (uuid), `template_id`, `status` (one of `running`, `completed`, `failed`), workspace directory path, structured stdout-event log.
- **Workflow Template**: one of six JSON definitions under `trevor-robey-inc-agents/config/workflow-templates/*.json`. Each customer-facing SKU maps onto exactly one engine template (templates are flexible — one template can serve multiple SKUs via prompt/role variation). The six templates and their canonical SKU mappings:

  | template_id | Engine template name | Customer-facing SKU mapping | Notes |
  |---|---|---|---|
  | `general-research-pack` | General Research Pack | **Investor Pre-Mortem** (provisional, [NEEDS CLARIFICATION]); **Cross-Silo Connector Report** (provisional, [NEEDS CLARIFICATION]) | LLM-only (no ToolUniverse). Flexible asset/topic input — best fit for Investor Pre-Mortem's asset-name-driven flow, but the explicit mapping is undocumented in `config/agent-config.json` |
  | `drug-discovery-full` | Drug Discovery Full Pipeline | [NEEDS CLARIFICATION] — no SKU in `OFFERINGS.md` currently maps here | End-to-end compound profiling, ADMET, target-compound. Could power a future Drug-Discovery SKU; not in the six-SKU offering ladder |
  | `pharmacovigilance-report` | Pharmacovigilance Safety Report | **Pharmacovigilance Pack** (canonical 1:1 match) | FAERS, DailyMed, RxNorm, DrugSafetyAnalyzer |
  | `target-validation-pack` | Target Validation Intelligence Pack | [NEEDS CLARIFICATION] — no clear SKU mapping | Gene/protein-target input. Could power Cross-Silo Connector for PPI work; not explicitly mapped |
  | `clinical-trial-landscape` | Clinical Trial Landscape Intelligence | **Failed Trial Archaeology** (provisional, [NEEDS CLARIFICATION]); **Trial Design Benchmark Pack** (provisional, [NEEDS CLARIFICATION]) | Trial landscape mapping + endpoint analysis via ClinicalTrials.gov + EuropePMC + PubMed. Best fit for trial-focused SKUs but mapping is undocumented |
  | `rare-disease-brief` | Rare Disease Landscape Brief | [NEEDS CLARIFICATION] — no SKU in `OFFERINGS.md` currently maps here | Orphan-drug, OMIM, OrphaNet. Could power a future Rare-Disease SKU; not in the offering ladder |

  Out-of-mapping SKUs (no obvious template fit, [NEEDS CLARIFICATION]):
  - **Conference Synthesis Brief** — abstract-synthesis format; none of the six templates is conference-abstract-shaped
  - **Plain-Language Patient Brief** — regulatory PLS output format; no format-specific template exists

  All `[NEEDS CLARIFICATION]` mappings above should be resolved by adding a `customer_sku` (or equivalent) field to each `config/workflow-templates/*.json` file, OR by adding a `config/sku-template-mapping.json` lookup. Codifying the mapping ends the spec/code drift.
- **Agent Role**: one of six — `literature_reviewer`, `safety_signal_detector`, `molecular_profiler`, `competitive_intel_analyst`, `quality_auditor`, `report_generator`. Each role has a `roleProviderMap` entry selecting its LLM backend.
- **Citation**: identifier (one of `PMID` | `NCT` | `ChEMBL CID` | `DOI`), source database, retrieval timestamp, raw query trace. At report level a citation is "grounded" (present in the runtime-fetched evidence) or "ungrounded" (likely model-introduced); grounded means traceable to the source records actually retrieved at runtime + DOI retraction-screened (Crossref), NOT independently re-resolved against a live external database.
- **Mission-Bundle Deliverable**: an artifact sealed into the release bundle (registered in `manifest.json` + `checksums.txt`). Includes the new `deliverables/citation-integrity.md` (graded provenance ledger) and, on gate-passing stopped-trial-bearing missions, `deliverables/graveyard-memo.md` (NCT-traced prior-program graveyard memo + protocol amendment-risk band).
- **Vault Note**: Obsidian markdown file with YAML frontmatter + wikilinks + tags; deployed under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/`. Six notes generated per workflow.
- **LLM Provider Slot**: `claude-code` (primary), `lm-studio` (fallback on `:1235`), `mock` (CI only), `ollama` (configured, DISABLED). Per `config/llm-providers.json`.

## Success Criteria

- **SC-001**: Investor Pre-Mortem deliverable arrives within 5–10 business days of intake (written Speed SLA in OFFERINGS.md).
- **SC-002**: 100% citation provenance on customer-facing rows — zero rows without a real PMID/NCT/ChEMBL CID/DOI.
- **SC-003**: Refund-backed Citation-Audit SLA satisfied — zero hallucinations on customer-facing deliverables (Public Hallucination Audit v1 methodology applied).
- **SC-004**: 906 tests in `trevor-robey-inc-agents` pass (Phase 35 baseline). New phases must extend, not regress.
- **SC-005**: `bash scripts/lint-transport-monorepo.sh --strict` exits 0 in CI on every commit touching transport code.
- **SC-006**: `bash trevor-robey-inc-agents/scripts/verify-phase29-policy.sh` exits 0 — Phase 29 ToolUniverse pre-fetch policy intact.

## Assumptions

- Obsidian is open during workflow dispatch. `:8798` (canonical bridge) and `:8799` (Command Center additive bridge) are both owned by Obsidian plugins and die when Obsidian quits. Accepted trade-off for this stack.
- The ExtraCurricular volume is mounted (Obsidian vault root). If unmounted, vault writes fail.
- mkcert root CA is installed in macOS System Keychain. Cert at `~/.local/share/mkcert/localhost.pem` valid through 2028-07-07.
- `NODE_EXTRA_CA_CERTS` is set in every Node process environment (including Obsidian's plugin host).
- Customer engagements are manually triggered (intake, SOW, dispatch). No autonomous publishing or invoicing (Principle IV).
- The `trevor-robey-inc-brand-guardian` skill governs customer-facing copy and pricing; engineering changes here do not override brand authority.
