# Tasks

---

## Operational Readiness Report

Audited 2026-03-30. Every pipeline was tested with real commands. Nothing was fixed — observe and report only.

### System Status

| Pipeline | Status | Evidence | Blockers |
|----------|--------|----------|----------|
| **Research tasks** | ⚠️ PARTIALLY WORKING | `run-research-task.js` with mock provider succeeds, produces `task-*` output with manifest + metadata + output.md | Mock output is a deterministic hash — not real research. Live LLM not configured. |
| **Dataset missions** | ❌ BROKEN | `run-dataset-mission.js` exits with `PHASE18_DISABLED` | Phase 18 governance gate: `agent-spawner.json` has `enabled: false`. Requires live LLM + live MCP evidence to unlock. |
| **Monetization pipeline** | ❌ BROKEN | `generate-offer.js` rejects `task-*` IDs — requires `mission-*` or `dataset-*` source | Can't test until dataset missions work. Research tasks produce `task-*` IDs that monetization doesn't accept. |
| **Bridge runtime** | ⚠️ PARTIALLY WORKING | Code complete. Starts on localhost:18789. 8 endpoints. Auth, MCP, job queue all wired. | All tokens in `security/token-store.json` are expired and revoked. No valid auth tokens exist. |
| **ToolUniverse** | 🔵 CODE EXISTS, NOT ACTIVATED | All 4 MCP adapter files present. Submodule initialized at v1.1.10. Config/schemas/templates/RBAC all in place. | Startup integrity check not hooked into init chain. Feature flag is `true` but wiring incomplete. |

### Blocking Issues (ranked by revenue impact)

| # | Issue | Blocks | Effort | Description |
|---|-------|--------|--------|-------------|
| 1 | **No live LLM provider configured** | Everything | 30 min | All 4 providers (local, openai, anthropic, openrouter) disabled. No API keys set. `audit/evidence/live-llm/summary-latest.json` shows all blocked/failed. |
| 2 | **MCP live evidence fails** | Dataset missions | 1-3 hrs | Both arxiv and semantic-scholar fail with `ERR_INVALID_IP_ADDRESS` in MCP service path. Direct client path for arxiv succeeded (850ms) but MCP service path is broken. Phase 18 gate requires `mcp_service_live.status: "success"`. |
| 3 | **Phase 18 disabled** | Dataset missions, monetization | 5 min (config flip) | `config/agent-spawner.json` has `enabled: false`. Can't flip until blockers #1 and #2 are resolved — policy script enforces evidence. |
| 4 | **Research tasks → monetization gap** | Revenue from research-only tasks | Unknown | `generate-offer.js` requires `mission-*` or `dataset-*` IDs. Research tasks produce `task-*` IDs. No bridge between the two. Either the offer builder needs to accept task sources, or all monetizable work must go through missions. |
| 5 | **Bridge has no valid auth tokens** | Bridge API, MCP over HTTP | 15 min | `security/token-store.json` has 2 tokens, both revoked and expired (2026-03-06). Need to generate fresh tokens for operator and integration roles. |

### ToolUniverse Re-Integration Assessment

**Current state**: The "deferral" was a documentation change — all Phase 29 code is still in the repo.
- `openclaw-bridge/mcp/tooluniverse-mcp/` — 4 complete modules (20.6 KB total)
- `vendor/tooluniverse/` — submodule initialized, pinned to v1.1.10
- `config/dataset-schemas.json` — 5 biomedical schemas present
- `config/mission-templates.json` — 6 biomedical templates present
- `security/rbac-policy.json` — `integration_tooluniverse` role defined
- `openclaw.json` — `ENABLE_TOOLUNIVERSE_MCP: true`
- Tests: 3 test files (514 lines total), all wired into npm scripts

**What's missing**: `verifyPhase29StartupIntegrity` is not imported/called in the MCP service init chain. That's the only wiring gap.

**Effort estimate**: 1.5-2 hours
- Hook startup integrity into init chain (15 min)
- Run `scripts/setup-tooluniverse.sh` to verify Python environment (10-30 min)
- Run `npm run phase29:verify` (5 min)
- Integration test with actual tool calls (30-60 min)
- CLAUDE.md status update (10 min)

**Dependencies**: Python 3.12 + uv must be installed. Upstream Harvard ToolUniverse API must be stable.

### LLM Provider Readiness

**Supported providers**: Anthropic (Claude 3.5 Sonnet), OpenAI (GPT-4.1-mini), OpenRouter (GPT-4o-mini), Local (Ollama/llama3.1)

**To enable live mode**:
1. Set `ANTHROPIC_API_KEY` env var (or create `config/llm-providers.local.json`)
2. Run `node scripts/test-llm-connection.js --provider anthropic`
3. Run `node scripts/run-live-llm-verification.js --providers anthropic`
4. Evidence lands in `audit/evidence/live-llm/summary-latest.json`

**Effort**: 30 minutes including verification. Provider abstraction is production-ready.

---

## Phase 30-31 Validation Audit Findings (2026-03-31)

Full report: `workspace/audit/phase30-31-validation-report.md`

### Blocking Issues

- [ ] **FIX: `buildSubtaskInputs` in `spawn-orchestrator.js`** — Scout output not chained to analyst input. Causes PHASE14_TASK_INPUT_REQUIRED for ALL 6 workflow templates. (4-8 hrs)
- [x] **FIX: Autonomy ladder missing `discover_tools`/`execute_tools`** — Added locally, needs commit. (5 min)
- [ ] **WIRE: Mount Research API in `bridge-server.js`** — Routes defined, auth wired, but server never imports `research-api.js`. (2-4 hrs)
- [ ] **WIRE: Create scheduler entrypoint** — `workflow-scheduler.js` is a library nothing calls. Need `scripts/run-scheduler.js`. (2-3 hrs)
- [ ] **WIRE: Usage meter has no callers** — Add `recordUsage()` calls in workflow engine and API. (1-2 hrs)

### Quality / Architecture Gaps

- [ ] **ToolUniverse tools not invoked during missions** — LLM adapter does plain text completion. No function-calling protocol. Roles get prompts mentioning tools but can't call them. (2-4 weeks)
- [ ] **7B model insufficient for Premium tier** — Generic output, no real citations, no database IDs. Need Claude/GPT-4 for Premium/Enterprise. (30 min config + API key)
- [ ] **Create WORKFLOW_CATALOG.md** — Referenced in plan but never created. (1 hr)

---

## Post-Research Engine — Citation Integrity Layer (SHIPPED 2026-06-12)

Zero-fabrication citation-integrity layer + cost-avoidance deliverables. All shipped and
unit-tested (316/316), and live-verified on an armed heart-failure run (workflow 6/6 steps,
grounded ratio 1.0, 8 stopped trials retrieved, integrity grade A, both new deliverables
sealed in the release bundle). Citations are **grounded in the source records actually
retrieved at runtime + DOI retraction-screened (Crossref)** — they are NOT independently
re-resolved against a live external database (per-citation external re-resolution is not built).

### Shipped

- [x] **Citation gate** — `openclaw-bridge/core/citation-gate.js` + `agent-engine.js` +
  `workflow-engine.js`. agent-engine persists `fetched_citation_ids` (identifiers actually
  retrieved at runtime by tool-prefetch) + a per-task `citation_verification` block into
  research-output metadata; `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause
  (never invent a PMID/NCT/DOI; emit `[no verifiable citation found]` instead).
  `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`)
  that cross-checks every cited identifier against the union of runtime-fetched ids: a cited
  id is "grounded" if present in fetched evidence, else "ungrounded" (likely model-introduced).
  Hard-fails (`PHASE30_CITATION_UNVERIFIED`) when the grounded ratio is below
  `minGroundedCitationRatio` (agent-config default 0.34); engages only when there is fetched
  ground truth. Writes `citation-verification.json` + `report-annotated.md` to the workflow
  dir; surviving ungrounded cites are annotated inline `[UNVERIFIED]`.
- [x] **Retraction screen** — `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`.
  Checks each cited DOI against Crossref `/works/{DOI}` (`relation.is-retracted-by` or
  update-to type "retraction"). A report citing any retracted paper hard-stops
  (`PHASE30_CITATION_RETRACTED`). Fail-soft: Crossref errors yield no retractions, so a
  network blip can never wrongly block a report. Wired into the gate via `researchRuntime`.
- [x] **Corpora ingestion: stop-reason archaeology + change-history** —
  `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`, a local fetcher (not
  ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED
  trials in a condition, returning each trial's `whyStopped` text plus protocol change-history
  (version count + most-amended modules) from the internal history endpoint. Has a session
  cache. Routed into role prefetch via a new local-fetcher seam in `tool-prefetch.js`
  (`createToolPrefetch` `options.localFetchers`), tool_name `ctgov_stopped_trials`. Each record
  is NCT-traced (grounded cite).
- [x] **Citation Integrity ledger deliverable** — `openclaw-bridge/monetization/integrity-rating.js`.
  `buildIntegrityReport(citation_verification)` renders a graded provenance ledger (grade
  A/B/C/D from the grounded ratio; F + "BLOCKED" if any retraction; N/A if nothing cited),
  shipped as `deliverables/citation-integrity.md` in every mission bundle (registered in
  `manifest.json` + sealed in `checksums.txt`).
- [x] **Graveyard memo + amendment-risk deliverable** —
  `openclaw-bridge/monetization/graveyard-memo.js`. `buildGraveyardMemo(stoppedTrials,{indication})`
  renders `deliverables/graveyard-memo.md`: prior terminated/withdrawn/suspended programs in the
  indication, each NCT-traced, with the sponsor's stated stop reason (or explicit
  "(none stated by sponsor)" — never invented), protocol churn, and a resolvable
  `clinicaltrials.gov/study/<NCT>` link. `buildAmendmentRisk(stoppedTrials)` renders a protocol
  amendment-risk band (LOW/MODERATE/HIGH) from change-history median/max version count +
  most-amended modules. Rendered deterministically from fetched records (no LLM). Wiring:
  `executeMissionStep` re-fetches the indication's stopped trials (session-cache hit) on a
  gate-passing mission, builds both memos (fail-soft + bounded — absent fetcher/empty
  indication/fetch error simply omits them and never blocks a passing report), persists
  `graveyard-memo.md`, threads them through `executeOfferStep` source_context; the
  deliverable-packager ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`.
- [x] **DOI extraction fix** — `openclaw-bridge/core/citation-extractor.js`. The DOI regex now
  stops at non-DOI terminators and strips trailing sentence punctuation after capture, so
  trailing `]]` / `;` / `.` is no longer captured (had deflated the grounded ratio and
  duplicated DOIs). Live: raised the same deliverable's integrity grade from C/0.69 to A/1.0.

### New error codes / config / deliverables

- New error codes: `PHASE30_CITATION_UNVERIFIED`, `PHASE30_CITATION_RETRACTED`.
- New config: `minGroundedCitationRatio` (agent-config; default 0.34).
- New mission-bundle deliverables: `deliverables/citation-integrity.md`,
  `deliverables/graveyard-memo.md`.
- Tests (316/316): `tests/core/{citation-extractor,citation-gate,ctgov-supplemental,crossref-retraction,integrity-rating,graveyard-memo,phase19-deliverable-packager}.test.js`.

> Note on quality gap #80 ("no real citations, no database IDs"): citations cited in an
> assembled report are now gated against runtime-fetched ground truth and DOI
> retraction-screened, and stopped-trial corpora records are NCT-traced. This does not by
> itself supply a live LLM (gap #1) — the gate engages only when there IS fetched ground truth.

---

## Revenue Path Plan

### Critical path: Research → Dataset → Package → Export

This is the minimum sequence to generate a sellable artifact. Ordered by dependency chain, optimized for fastest time-to-first-revenue.

### Phase A: Unblock the pipeline (Day 1 — ~4 hours)

- [ ] **A1. Configure live LLM provider** (30 min)
  - Set `ANTHROPIC_API_KEY` environment variable
  - Create `config/llm-providers.local.json` with anthropic config
  - Run `node scripts/test-llm-connection.js --provider anthropic`
  - Run `node scripts/run-live-llm-verification.js --providers anthropic`
  - _Enables_: Real research output from all pipelines
  - _Depends on_: Anthropic API account with credits

- [ ] **A2. Fix MCP live evidence** (1-3 hrs)
  - Debug `ERR_INVALID_IP_ADDRESS` in MCP service path for arxiv/semantic-scholar
  - The direct client path for arxiv works (850ms success) — issue is in MCP service routing, likely DNS or egress policy
  - Run `node scripts/run-live-mcp-verification.js` until `mcp_service_live.status: "success"`
  - _Enables_: Phase 18 unlock
  - _Depends on_: A1 (LLM evidence is also required for Phase 18)

- [ ] **A3. Enable Phase 18 mission mode** (5 min)
  - Set `enabled: true` in `config/agent-spawner.json`
  - Run `bash scripts/verify-phase18-policy.sh` to confirm gate passes
  - _Enables_: Dataset missions, monetization pipeline
  - _Depends on_: A1, A2

- [ ] **A4. Run first live dataset mission** (30 min)
  - `node scripts/run-dataset-mission.js --task "biomedical AI applications" --dataset-type retrieval_qa --input workspace/research-input/sample/ --confirm`
  - Verify mission produces `mission-*` ID and dataset artifacts
  - _Enables_: Monetization pipeline testing
  - _Depends on_: A3

### Phase B: First sellable artifact (Day 1-2 — ~3 hours)

- [ ] **B1. Test full monetization flow** (1 hr)
  - `node scripts/generate-offer.js --source mission-XXX --product-line research_packs --tier standard --targets gumroad --confirm`
  - `node scripts/approve-release.js --offer-id offer-XXX --confirm`
  - `node scripts/export-release.js --offer-id offer-XXX --format zip --confirm`
  - Verify: zip artifact exists, contains research output, manifest, metadata
  - _Enables_: Manual upload to Gumroad or direct delivery
  - _Depends on_: A4

- [ ] **B2. Assess research-task-to-offer gap** (1 hr)
  - Determine if `task-*` outputs should also be monetizable (without going through mission orchestration)
  - If yes: extend offer-builder to accept `task-*` sources
  - If no: document that all monetizable work must go through missions
  - _Enables_: Simpler monetization path for single research tasks
  - _Depends on_: B1

- [ ] **B3. Generate and review first real research pack** (1 hr)
  - Run a topical research task with live LLM on a high-value subject
  - Package as Gumroad-ready zip
  - Trevor reviews quality and decides: ship it or iterate
  - _Enables_: First revenue
  - _Depends on_: B1

### Phase C: ToolUniverse activation (Day 2-3 — ~4 hours)

- [ ] **C1. Verify Python/uv environment** (30 min)
  - Run `scripts/setup-tooluniverse.sh`
  - Ensure Python 3.12 and uv are installed
  - Verify `vendor/tooluniverse/` submodule is healthy
  - _Enables_: ToolUniverse MCP
  - _Depends on_: None (can start in parallel with Phase A)

- [ ] **C2. Hook Phase 29 startup integrity** (15 min)
  - Import `verifyPhase29StartupIntegrity` in MCP service init chain
  - _Enables_: ToolUniverse activation on bridge startup
  - _Depends on_: C1

- [ ] **C3. Run Phase 29 verification** (30 min)
  - `npm run phase29:verify`
  - Fix any failures
  - _Enables_: Confidence that ToolUniverse integration is sound
  - _Depends on_: C2

- [ ] **C4. Integration test with live ToolUniverse** (1-2 hrs)
  - Test `research_findTool`, `research_listTools`, `research_getToolInfo` via MCP
  - Test `research_executeTool` with operator role (requires live API)
  - Verify biomedical mission templates work end-to-end
  - _Enables_: Premium biomedical research products
  - _Depends on_: C3, A3

- [ ] **C5. First biomedical research pack** (1 hr)
  - Run a drug discovery or clinical trial intelligence mission using ToolUniverse
  - Package and export as premium research pack
  - _Enables_: Premium-tier revenue (differentiated from commodity research)
  - _Depends on_: C4, B1

### Phase D: Monetization channels (Day 3-5 — ~4 hours)

- [ ] **D1. Document all monetization channels** (2 hrs)
  - Research packs on Gumroad (already supported — 10 publisher adapters exist)
  - Dataset licensing (retrieval_qa, classification, benchmark_eval formats ready)
  - Custom research-as-a-service (run missions on client topics, deliver via export)
  - Consulting deliverables (use system as backend for Trevor Robey Inc. engagements)
  - ToolUniverse-powered premium tier (biomedical/scientific research at higher price point)
  - Subscription model via recurring mission schedules
  - _Enables_: Multi-channel revenue strategy
  - _Depends on_: B3, C5

- [ ] **D2. Set pricing for first products** (1 hr)
  - Standard research pack: suggested price based on market research
  - Premium biomedical pack: higher tier
  - Dataset license: per-dataset or bundle pricing
  - _Enables_: Actual listings
  - _Depends on_: D1

- [ ] **D3. Create first Gumroad listing** (1 hr, manual)
  - Trevor manually uploads the export zip from B3 or C5
  - Sets pricing, description, preview
  - _Enables_: First revenue
  - _Depends on_: D2, B3 or C5

### Phase E: Stability (backlog — prioritize after first revenue)

- [ ] **E1. Fix Phase 29 schema drift test** (30 min) — NON-BLOCKING (keep biomedical types, update test expectations)
- [ ] **E2. Fix missing `rg` binary tests** (30 min) — NON-BLOCKING (rewrite policy scripts to use `grep -rn`)
- [ ] **E3. Fix roadmap assertion tests** (30 min) — NON-BLOCKING (update roadmap file with current phase status)
- [ ] **E4. Generate fresh bridge auth tokens** (15 min) — BLOCKING only if bridge API is needed before Gumroad
- [ ] **E5. Update CLAUDE.md after Phase 29 re-activation** (10 min) — NON-BLOCKING

---

## Estimated Timeline

| Milestone | Effort | Calendar Target |
|-----------|--------|----------------|
| Pipeline unblocked (A1-A3) | ~4 hrs | Day 1 |
| First sellable artifact (B1-B3) | ~3 hrs | Day 1-2 |
| ToolUniverse live (C1-C4) | ~4 hrs | Day 2-3 |
| First premium biomedical pack (C5) | ~1 hr | Day 3 |
| Monetization strategy documented (D1-D2) | ~3 hrs | Day 3-5 |
| First Gumroad listing (D3) | ~1 hr manual | Day 5 |
| **Total to first revenue** | **~16 hrs** | **~5 working days** |

---

## Pre-existing test failures (9 tests, 3 categories)

Logged 2026-03-30. Categorized as BLOCKING / NON-BLOCKING for revenue path.

- [ ] **Phase 29 schema drift** — NON-BLOCKING. `phase19-schema-engine.test.js` expects base dataset types but code registers Phase 29 types (`clinical_trial_record`, `genomic_variant`). Keep the types (needed for ToolUniverse), update test expectations.
- [ ] **Missing `rg` binary** — NON-BLOCKING. `mutation-policy-gate.test.js` and `cleanroom-purge-policy-gate.test.js` fail because `verify-mutation-policy.sh` calls `rg`. Rewrite to use `grep -rn`.
- [ ] **Roadmap assertions** — NON-BLOCKING. `phase23/24/25-policy-gate.test.js` assert roadmap file records phases as implemented. Update roadmap file.
