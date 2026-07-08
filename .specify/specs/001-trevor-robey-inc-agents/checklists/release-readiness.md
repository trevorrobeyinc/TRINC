# Release-Readiness Checklist: trevor-robey-inc-agents (Commercial Deliverable Gate)

**Purpose**: Pre-delivery operational gate. Every item is verifiable by an operator before signing off on a billable customer deliverable (Investor Pre-Mortem, Failed Trial Archaeology, or any tactical SKU). Not a requirements-quality meta-test — this is the actual ship-readiness sign-off.
**Created**: 2026-05-13
**Feature**: [`spec.md`](../spec.md) | [`plan.md`](../plan.md)

> **Marker semantics** (per the v1.1.0 constitution amendment, also being staged this session):
> - `[NEEDS CLARIFICATION]` = ambiguity that blocks implementation; resolve before building.
> - `[DEFERRED]` = explicit operator decision to leave open; engineering may proceed against the documented current state.
>
> **How to use this file**: tick each box as the operator confirms the condition is met. A deliverable does NOT ship until every item in **Pre-Dispatch**, **Workflow Execution**, **Citation & Provenance**, **Posture & Compliance**, **SKU↔Template Mapping (MUST RESOLVE)**, and **Customer Deliverable Sign-Off** is `[x]`. **DEFERRED-Item Tripwires** are guard rails for contributors; the operator does NOT tick them per delivery but they govern what code changes are permissible. **Brand-Guardian Routing** items are tick-when-consulted, not blocking.

## Pre-Dispatch (Engineering Gate)

- [ ] CHK001 — mkcert root CA installed in macOS System Keychain. `$HOME/Library/Application Support/mkcert/rootCA.pem` exists and is trusted. [Const Tech Constraints]
- [ ] CHK002 — mkcert pair at `~/.local/share/mkcert/localhost.pem` + `localhost-key.pem` valid (not expired; next expiry 2028-07-07). [Const Tech Constraints; Spec §FR-004; Plan Constraints]
- [ ] CHK003 — `NODE_EXTRA_CA_CERTS` set in every Node process environment (engine subprocess, Obsidian plugin host, launchd units). Verified via `node -e 'console.log(process.env.NODE_EXTRA_CA_CERTS)'` from a workflow-spawned subprocess. [Spec §FR-010; Plan Constraints]
- [ ] CHK004 — `bash /Users/trevorrobey/TrevClaw-Obsidianodus/scripts/lint-transport-monorepo.sh --strict` exits 0 against current HEAD. [Spec §SC-005; Const Principle I; Const Quality Gates]
- [ ] CHK005 — `npm run lint:transport` exits 0 in `Copilot-Everything/bridges/obsidian-copilot-bridge/` and `Claude/obsidian-openclaw-command-center/`. [Const Quality Gates; Spec §FR-004]
- [ ] CHK006 — All 906 tests in `trevor-robey-inc-agents/tests/{core,integration}/` pass on current HEAD. New phases extend, not regress. [Spec §SC-004; Const Quality Gates]
- [ ] CHK007 — `bash /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents/scripts/verify-phase29-policy.sh` exits 0. [Spec §SC-006; Const Quality Gates]
- [ ] CHK008 — ToolUniverse submodule pinned at SHA prefix `3833b0e` (v1.1.10). Verify: `cd trevor-robey-inc-agents/vendor/tooluniverse && git rev-parse HEAD`. [Const Tech Constraints; Spec §FR-007]
- [ ] CHK009 — `config/llm-providers.json` has four slots in the expected state: `claude-code` (primary, enabled), `lm-studio` (fallback, enabled), `mock` (CI, enabled), `ollama` (configured, **disabled**). [Spec §FR-001]
- [ ] CHK010 — Canonical bridge healthcheck returns 200: `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz` with Obsidian open. [Spec §FR-004; Const Principle I]
- [ ] CHK011 — All four HTTPS TLS proxies healthy on `:8743` (Miyo), `:6433` (Qdrant), `:1235` (LM Studio), `:11435` (Ollama). [Const Principle I; Plan External Integrations]
- [ ] CHK012 — `ExtraCurricular` volume mounted (Obsidian vault root accessible at `/Volumes/ExtraCurricular/My Digital Garden`). [Spec Edge Cases; Plan Data Model]
- [ ] CHK051 — `bash /Users/trevorrobey/TrevClaw-Obsidianodus/scripts/lint-transport-monorepo.sh --strict` exits 0 with the **extended outbound-HTTPS pattern set** applied (not just the listener patterns). No unmarked outbound violations; no direct references to `:8742`, `:6333`, `:1234`, or `:11434` in monorepo-owned source. [Const Principle I v2.0.0; Spec §FR-012]

## Workflow Execution (Runtime Gate)

- [ ] CHK013 — Workflow dispatched via the Command Center plugin (`:8799`) spawning `scripts/run-workflow.js` — NOT via direct CLI invocation. Manual triggering by the operator is preserved (Principle IV). [Spec §FR-006; Const Principle IV]
- [ ] CHK014 — Stdout emits `{"type":"workflow_created","workflow_id":"...","template_id":"..."}` within 2 seconds of spawn. [Spec §FR-003; Spec User Story 1 Acceptance Scenario 1]
- [ ] CHK015 — Stdout emits `{"type":"workflow_result",...}` at completion. `status: completed` (not `failed`). stderr was NOT parsed for workflow state. [Spec §FR-003]
- [ ] CHK016 — Workflow steps executed in parallel within each topological dependency level (`Promise.allSettled()` per Phase-35 baseline). No serial-only regression. [Spec §FR-002; Plan Architecture]
- [ ] CHK017 — All 8 project MCP servers under `openclaw-bridge/mcp/` were reachable for the steps that needed them (ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub metadata-only, NPI, ICD-10, Owkin, Google Drive). Per-step trace in `workspace/audit/{workflow_id}/`. [Spec §FR-007]
- [ ] CHK018 — Restricted-globals rule held during the run: zero `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` calls inside `openclaw-bridge/`. Verify via `grep -rn "Date\.now()\|new Date()\|Math\.random()\|randomUUID()" trevor-robey-inc-agents/openclaw-bridge/ --include='*.{js,ts}'` → zero hits. [Spec §FR-008; Const Tech Constraints]
- [ ] CHK019 — Per-workflow audit artifacts written to `trevor-robey-inc-agents/workspace/audit/{workflow_id}/` and reviewable by the operator. [Spec §FR-009]
- [ ] CHK020 — Six interlinked markdown vault notes generated under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/`. [Spec User Story 1 Acceptance Scenario 1; Plan Data Model]
- [ ] CHK055 — **Stop-reason archaeology ingestion** (when the run's indication calls for it): the `ctgov_stopped_trials` local fetcher (`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`, routed via the local-fetcher seam in `tool-prefetch.js` — `createToolPrefetch` `options.localFetchers`) retrieved TERMINATED/WITHDRAWN/SUSPENDED trials from ClinicalTrials.gov API v2, each NCT-traced with its `whyStopped` text and protocol change-history. This is a LOCAL fetcher, not a ToolUniverse tool. [Spec §FR-007 by extension]

## Citation & Provenance (Brand-Promise Gate)

- [ ] CHK021 — **Every row in every citation index carries a real PMID, NCT, ChEMBL CID, or DOI.** Verified by inspecting `workspace/audit/{workflow_id}/citation-index.json` — every row has a non-null `pmid` / `nct` / `chembl_cid` / `doi` field. [Spec §FR-005; Spec §SC-002; Const Principle II]
- [ ] CHK022 — `quality_auditor` agent ran and produced zero unresolved rejected rows. Any row it rejected was either fixed or pulled from the deliverable — none silently passed through. [Spec §FR-005; Spec Edge Cases]
- [ ] CHK023 — Spot-check at least 5 random citations in the deliverable by resolving each identifier against its source (PMID → PubMed; NCT → ClinicalTrials.gov; ChEMBL CID → ChEMBL; DOI → publisher). Every link resolves to the claimed claim. [Spec §SC-002; Spec §SC-003; Const Principle II]
- [ ] CHK024 — Refund-backed **Citation-Audit SLA** is invoked or invocable on this deliverable. Customer-facing copy (delivery email / cover letter) names the SLA and how the refund is triggered. [Spec §SC-003; Const Principle II]
- [ ] CHK025 — **Public Hallucination Audit v1** methodology was applied to LLM-generated text — zero hallucinations on customer-facing rows. Cross-checked against the 100-question / 5-system methodology. [Spec §SC-003; Const Principle II]
- [ ] CHK026 — **Speed SLA** met or being communicated: Investor Pre-Mortem within 5–10 business days of intake (written guarantee). If at-risk, customer notified before deadline, not after. [Spec §SC-001; Const Principle II references]
- [ ] CHK052 — **Runtime citation gate passed** — `workflow-engine.executeMissionStep` ran the report-level gate (`verifyReportCitations`, `openclaw-bridge/core/citation-gate.js`): every identifier cited in the assembled report was cross-checked against the UNION of the ids actually retrieved at runtime by tool-prefetch (`fetched_citation_ids` persisted in research-output metadata). Grounded ratio ≥ `minGroundedCitationRatio` (agent-config default 0.34); otherwise the run HARD-FAILS with `PHASE30_CITATION_UNVERIFIED` and does NOT ship. Surviving ungrounded cites are annotated inline `[UNVERIFIED]`. `citation-verification.json` + `report-annotated.md` present in the workflow dir. **Note: this is grounding against retrieved source records, NOT independent per-citation re-resolution against a live external database.** [Const Principle II]
- [ ] CHK053 — **DOI retraction screen passed** — each cited DOI was checked against Crossref (`/works/{DOI}`, `relation.is-retracted-by` / update-type "retraction"; `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`). No retracted paper cited; a retraction HARD-STOPS with `PHASE30_CITATION_RETRACTED`. Fail-soft: a Crossref network error yields no retractions and never wrongly blocks a report. [Const Principle II]
- [ ] CHK054 — **Citation Integrity & Provenance ledger present** — `deliverables/citation-integrity.md` (built by `buildIntegrityReport`, `openclaw-bridge/monetization/integrity-rating.js`) is in the mission bundle, registered in `manifest.json`, and sealed in `checksums.txt`. Graded A/B/C/D from the grounded ratio (F + "BLOCKED" on any retraction; N/A if nothing cited). [Const Principle II]

## Posture & Compliance (Constitution Gate)

- [ ] CHK027 — **No PHI** in the deliverable, in the audit artifacts, or in any intermediate workflow output. Sources used were public biomedical databases only (PubMed, ClinicalTrials.gov, ChEMBL, OpenTargets, NPI, ICD-10, plus the 8 project MCP servers). [Const Principle III; Spec Assumptions]
- [ ] CHK028 — Deliverable carries the **research-artifacts-only disclaimer** — explicit statement that outputs are research artifacts, NOT validated for clinical decision support. Full disclaimers per `trevor-robey-inc/NOTICE.md`. [Const Principle III]
- [ ] CHK029 — **Manual-only external actions**: no autonomous publishing, posting, login, or transaction occurred during this workflow. Marketplace submissions, outbound emails, and contract signing are operator-confirmed only. [Const Principle IV; Spec §FR-006]
- [ ] CHK030 — Customer-facing copy on the deliverable matches the canonical brand language. Wordmark "Trevor Robey, INC." present; LLC disclosure pairing present where the entity is invoked; engine credit "Powered by OpenClaw" present and disambiguated from the retired `openclaw.ai` consumer product. **Defers to the `trevor-robey-inc-brand-guardian` skill on copy correctness.** [Const Governance; Spec §SC-003]

## SKU↔Template Mapping — MUST RESOLVE Before Customer Dispatch

> The Round-1 I1 remediation surfaced five `[NEEDS CLARIFICATION]` markers in spec 001's Key Entities mapping table. These are **shipment blockers** for any customer deliverable that depends on the mapping — not "future work." A deliverable cannot bill until its SKU↔template_id mapping is operator-decided and codified in `trevor-robey-inc-agents/config/workflow-templates/*.json` (via a `customer_sku` field) or in a `config/sku-template-mapping.json` lookup. Brand-guardian skill consults on customer-visible naming.

- [ ] CHK031 — **Investor Pre-Mortem** SKU mapped to a concrete template_id (currently provisional `general-research-pack`). Operator + brand-guardian decision recorded in `config/workflow-templates/<template>.json` `customer_sku` field. Until resolved, MAY NOT ship as a billable Investor Pre-Mortem deliverable. [Spec §Key Entities mapping table; Spec §NEEDS CLARIFICATION; Const Governance]
- [ ] CHK032 — **Failed Trial Archaeology** SKU mapped to a concrete template_id (currently provisional `clinical-trial-landscape`). Same constraint as CHK031. [Spec §Key Entities mapping table]
- [ ] CHK033 — **Trial Design Benchmark Pack** SKU mapped to a concrete template_id (currently provisional `clinical-trial-landscape`). Same constraint as CHK031. [Spec §Key Entities mapping table]
- [ ] CHK034 — **Cross-Silo Connector Report** SKU mapped to a concrete template_id (currently provisional `general-research-pack`, alternate `target-validation-pack`). Same constraint as CHK031. [Spec §Key Entities mapping table]
- [ ] CHK035 — **Conference Synthesis Brief** SKU resolved: either a new template_id created (e.g., `conference-synthesis-brief.json`) OR an explicit decision recorded that an existing template covers it. Same constraint as CHK031. [Spec §Key Entities mapping table]
- [ ] CHK036 — **Plain-Language Patient Brief** SKU resolved (regulatory PLS at 8th-grade health-literacy level, EU CTR 536/2014). Same constraint as CHK031. Brand-guardian must approve PLS copy template. [Spec §Key Entities mapping table; Spec User Story 3]

## DEFERRED-Item Tripwires (Contributor Guard Rails)

> These are NOT per-delivery tickboxes — they are **standing constraints on code changes**. Tick once per delivery only if a contributor's change attempts to violate one; otherwise leave unticked. Re-verify with the operator if a proposal would cross any of these lines.

- [ ] CHK037 — **Customer intake automation guard** — Did any change in this delivery's lineage add autonomous customer-facing intake automation (intake form → SOW → dispatch)? If yes, halt and re-verify with operator. Current de-facto state is founder-direct (email + manual SOW + manual Command Center dispatch). [Plan §Open Questions §DEFERRED; Const Principle IV]
- [ ] CHK038 — **Coverage tooling guard** — Did any change add `nyc`, `c8`, `jest --coverage` thresholds, or any coverage % gate to the build pipeline? If yes, halt and re-verify with operator. Gate stays binary (tests pass / fail) until policy is set. [Plan §Open Questions §DEFERRED; Spec §SC-004]
- [ ] CHK039 — **Prometheus sidecar guard** — Did any change remove the Docker Compose observability sidecar files OR add a speculative `/metrics` endpoint to any process? If yes, halt and re-verify with operator. Sidecar is documented-but-dormant until restoration plan is decided. [Plan §Open Questions §DEFERRED]

## Brand-Guardian Routing (Consult-When-Reached)

> These items are decisions owned by the `trevor-robey-inc-brand-guardian` skill, not by `/speckit-clarify` or the engineering plan. Tick when the skill has been consulted and its decision recorded.

- [ ] CHK040 — `OpenClaw/{template}/{date}/` vault folder naming is acceptable for customer-visible exposure when notes are shared. Brand-guardian has weighed in on: (a) rename to `trevor-robey-inc-agents/`, (b) keep engine-internal naming, OR (c) add export-time wrapper that renames in deliverables. Decision recorded. [Round-1 L1; Plan §Open Questions if applicable]
- [ ] CHK041 — Spec 004 SC-004 "engine credit appears on the **relevant assets**" — Brand-guardian has enumerated the canonical asset list (landing page, marketplace listings, sample deliverables, outbound email signatures, etc.) and the enumeration is recorded in `trevor-robey-inc/01-brand-system/` or in the skill's canon. [Round-1 U2; Spec 004 §SC-004]
- [ ] CHK042 — All five SKU↔template_id mapping decisions from CHK031-CHK036 above have been routed through brand-guardian for customer-visible naming approval BEFORE being codified in the template JSON files. [Round-1 I1; Const Governance]

## Customer Deliverable Sign-Off

- [ ] CHK043 — Vault notes reviewed by operator (six per workflow). Wikilinks resolve. YAML frontmatter present and well-formed. Tags applied per the template conventions. [Plan §Data Model]
- [ ] CHK044 — Deliverable assembled from vault notes (not auto-published) per Principle IV. Operator-controlled export. [Const Principle IV]
- [ ] CHK045 — Customer-facing copy on the deliverable (cover letter, executive summary) does NOT contain stale product names ("OpenClaw Research Intelligence", "OpenClaw Pipeline", or retired tier names "Standard / Premium / Custom / Enterprise"). [Spec 004 §SC-001 by reference; Const Governance]
- [ ] CHK046 — Three brand commitments visible on the deliverable surface: Citation-Audit SLA (refund-backed), Public Hallucination Audit v1, Speed SLA (5–10 business days for Investor Pre-Mortem). [Spec 004 §FR-008 by reference; Const Principle II]
- [ ] CHK047 — Posture statements present on the deliverable: research-artifacts-only, no PHI, manual-only external actions, citation traceability quality gate. [Spec 004 §FR-009 by reference; Const Principle III]
- [ ] CHK048 — Stripe invoice / ACH instruction (or Bonsai equivalent per `trevor-robey-inc/11-financial-ops/`) sent to customer. Payment terms match the SOW. [Spec 004 references]
- [ ] CHK049 — Audit artifacts archived (`workspace/audit/{workflow_id}/`) for the Citation-Audit SLA refund-trigger evidence chain. Retain for the SLA period. [Spec §SC-003; Spec §FR-009]
- [ ] CHK056 — **Graveyard Memo deliverable** (when the indication has prior stopped programs): `deliverables/graveyard-memo.md` (built by `buildGraveyardMemo`, `openclaw-bridge/monetization/graveyard-memo.js`) is in the bundle and registered (`artifactRefs.graveyard_memo` via `deliverable-packager`). Each prior terminated/withdrawn/suspended program is NCT-traced with the sponsor's stated stop reason — or an explicit "(none stated by sponsor)", NEVER invented — protocol churn, a resolvable `clinicaltrials.gov/study/<NCT>` link, and a protocol amendment-risk band (LOW/MODERATE/HIGH via `buildAmendmentRisk`). Rendered DETERMINISTICALLY from the fetched records (no LLM); fully fail-soft (omitted, never blocking, if there is no fetcher / empty indication / fetch error). [Const Principle II]
- [ ] CHK050 — Final sign-off by operator: "I have verified every blocking item above and accept responsibility for this deliverable." Date + signature/initials inline below. [Const Principle IV — Manual-Only External Actions]

## Notes

- Check items off as completed: `[x]`.
- Add comments or findings inline below the box.
- Items CHK001–CHK030, CHK043–CHK050, CHK052–CHK056 are **per-delivery blocking** (CHK055/CHK056 only when the run's indication has stopped-trial ground truth). Items CHK031–CHK036 are **shipment blockers until mapping is codified**. Items CHK037–CHK039 are **contributor guard rails** (tick only if violated). Items CHK040–CHK042 are **consult-when-reached routing** to the brand-guardian skill.
- Traceability coverage: ≥80% of items reference at least one source (`Spec §X`, `Const Principle X`, `Plan §X`, `Round-1 X`). The remainder are operator process items where the source is the checklist itself.
- This checklist is a release-readiness gate, NOT a "unit test for English" requirements-quality validator (which is the standard `/speckit-checklist` output). Operator chose to repurpose the slot for operational sign-off. If a separate requirements-quality checklist is later wanted, generate it under a different filename (e.g., `requirements-quality.md`) in this same directory.
