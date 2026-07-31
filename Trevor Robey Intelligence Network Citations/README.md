# Trevor Robey Inc Agents — citation-traced biomedical due diligence engine

> *Every claim, sourced. Every risk, named. In days, not weeks.*

The runtime engine behind **Trevor Robey, INC.** — citation-traced biomedical due diligence for biotech investors and pharma BD. Powered by OpenClaw (open-source agent framework). Local-first, governed, manual-only external actions.

> *Trevor Robey, INC. is the wordmark of **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company (filed 2026-05-06). INC = Intelligence Network Citations.*

A single command (`node scripts/run-workflow.js --template <id>`) runs one of seven biomedical workflows that feed concrete commercial offerings: **Investor Pre-Mortem** (primary, $9,950–$19,950) and **Failed Trial Archaeology** (flanking, $14,950) drive premium revenue; **Conference Synthesis Brief**, **Trial Design Benchmark Pack**, **Cross-Silo Connector Report**, **Plain-Language Patient Brief**, and **Pharmacovigilance Pack** serve tactical demand.

Workflows pull live evidence from ToolUniverse (~2,116 tools, Apache-2.0, Harvard MIMS / Zitnik Lab) plus seven project MCP servers (ChEMBL, ClinicalTrials.gov, PubMed, HuggingFace Hub, NPI Registry, ICD-10, Owkin), and produce ZIP release bundles whose citation-index CSV has a real PMID / NCT / ChEMBL CID / DOI in **every** row — verified at quality-gate time, not flagged as a warning. Every cited identifier in an assembled report is additionally checked against the source records **actually retrieved at runtime** (a report-level grounding gate) and every cited DOI is retraction-screened against Crossref before the report can ship — see [Citation Integrity Layer](#citation-integrity-layer) below.

### What this is

- **A regulated-buyer-grade due-diligence engine.** Citation traceability is enforced as a gate. Refund-backed citation-audit SLA on every deliverable. Every release ships with a deterministic provenance manifest plus cryptographically chained post-export evidence ledgers (Phase 22 submission evidence, Phase 28 delivery evidence). Buyers in pharma, biotech, life-science VC, biotech/pharma quant funds, and big-pharma + CRO data teams get audit-ready chain of custody.
- **Local-first, operator-controlled.** Everything runs on your machine. The repo is the source of truth.
- **Powered by OpenClaw (open-source agent framework).** The `cleanRoomDerivative: true` flag and the `openclaw-bridge/` directory name are preserved as upstream attribution. See [NOTICE.md](NOTICE.md). OpenClaw is the open-source engine, not a brand owned by Trevor Robey Intelligence Network Citations LLC. Trevor Robey Inc Agents is **not affiliated with** the consumer "Personal AI assistant" product distributed at `openclaw.ai` (a different, unrelated product).

### What this isn't

- **Not a clinical decision-support system.** Outputs are research artifacts, not validated for prescribing, diagnostic, or regulatory submission use.
- **Not a publishing bot.** External publication, marketplace submission, customer delivery, login automation, and browser automation are manual-only by architectural design — a feature for regulated buyers, not a limitation.
- **Not a PHI processor.** All queried sources are public biomedical databases. The system does not host, transmit, or process Protected Health Information.

Concrete offerings, ICPs, and pricing live in [`OFFERINGS.md`](OFFERINGS.md) (canonical) and [REVENUE_PLAYBOOK.md](REVENUE_PLAYBOOK.md). Target buyers, posture, and full upstream attribution stack are in [TREVOR_ROBEY_INC_AGENTS_DOSSIER.md](TREVOR_ROBEY_INC_AGENTS_DOSSIER.md) and [NOTICE.md](NOTICE.md).

Runtime requirement:
- Node `22.13.1` is required and enforced through `engines`, `devEngines`, `.npmrc` `engine-strict=true`, and `scripts/verify-node-runtime.js`.

## Local Setup
```bash
nvm install 22.13.1
nvm use 22.13.1
node -v
git submodule update --init --recursive
npm ci
npm run phase20:verify
npm run phase21:verify
npm run phase22:verify
npm run phase25:verify
npm run phase26:verify
npm run phase28:verify
npm run monetization:verify
npm run build:verify
```

## Secret Scanning
```bash
bash scripts/install-ggshield.sh
export GITGUARDIAN_API_KEY='<load from your shell secret store>'
npm run secrets:verify
```

- `scripts/verify-secrets.sh` prefers authenticated `ggshield` scans and falls back to the legacy regex scan when a token is not configured yet.
- CI can enforce authenticated scanning by setting the `GITGUARDIAN_API_KEY` repository secret.
- Do not store GitGuardian API keys in `.gitguardian.yaml`, tracked `.env` files, or workflow YAML.

## Current Baseline
- Operator-initiated research tasks run through supervisor and governance approval.
- Phase 18 mission orchestration is already in place:
  - bounded concurrent dispatch
  - dependency-aware scheduling
  - deterministic orchestrator-owned synthesis
  - timeout, stall, resume, and checkpoint controls
  - bounded deterministic lane scaling
- Phase 19 adds:
  - deterministic dataset foundation under `workspace/datasets/`
  - deterministic monetization and release packaging under `workspace/releases/`
- Phase 20 adds deterministic dataset commercialization gates:
  - row validation and minimum completeness enforcement
  - exact dedupe with stable near-duplicate hook points
  - row-level and build-level provenance artifacts
  - deterministic quality scoring and threshold evaluation
  - fail-closed licensing classification with commercialization gating
- Phase 21 adds deterministic publisher adapter boundaries for submission-pack generation and release approval:
  - one adapter registry entry per configured platform target
  - deterministic per-target `adapter-manifest.json` contracts
  - fail-closed approval validation for adapter manifest/snapshot integrity
- Phase 22 adds deterministic post-export manual submission evidence governance:
  - authoritative append-only chain-hashed `export-events.json` and `ledger.json`
  - platform-target eligibility derived from export events (`ready_for_manual_submission` initialization)
  - operator-only submission outcome recording with idempotency and fail-closed transition validation
  - derived per-target snapshots and repo index rebuilt only from authoritative stores
- Phase 26A adds the minimal bridge/auth/principal prerequisite substrate for future integration work:
  - Streamable HTTP support at `/mcp` (with legacy compatibility routes retained)
  - shared token-to-principal resolution across MCP and jobs routes
  - explicit lane separation for `supervisor`, `operator`, and integration principals
- Phase 28 adds deterministic direct-delivery packaging and post-export delivery evidence governance:
  - explicit `direct_delivery_targets` contracts on offers and deterministic `delivery/<target>/...` artifacts
  - authoritative append-only chain-hashed `delivery-evidence/export-events.json` and `delivery-evidence/ledger.json`
  - operator-only manual delivery outcome recording with idempotency and fail-closed transition validation

## Governance Boundary
- Internal generation may be autonomous for research synthesis, dataset builds, Phase 20 validation/dedupe/provenance/scoring/license classification, packaging, store copy, and submission-pack preparation.
- Final release approval remains human-only.
- External publishing, uploads, marketplace submissions, customer delivery, login automation, and browser automation remain manual-only.
- Phase 19 release bundles are packaging artifacts, not proof of publication.
- Phase 22 evidence verification is separate from release bundle approval/hash validity; it governs post-export integrity only.
- Phase 28 delivery evidence verification is separate from release bundle approval/hash validity; it governs post-export delivery integrity only.

## Outer Operator Workflow (Cline-compatible)
- Cline (Plan/Act) is a recommended outer human-operated workflow for this repository.
- Use Plan mode first for repo assessment and architecture decisions, then switch to Act mode after review/approval.
- Use conservative Auto Approve settings for internal read/edit/safe local command work only.
- Do not use YOLO mode for governed workflows in this repository.
- Phase branch, PR, local hook, and CI-triage guardrails are documented in `docs/phase-git-workflow.md`.
- The repository remains tool-agnostic and local-first; no runtime dependency on Cline is required.
- Repo runtime authority remains in-repo through `supervisor-authority` plus governance pathways.
- Final release approval and all external submission/publication actions remain manual-only.

## Key Paths
- `workspace/research-output/` research task outputs and manifests
- `workspace/missions/` mission-local orchestration state
- `workspace/datasets/raw/<datasetId>/` raw dataset source snapshots
- `workspace/datasets/staged/<datasetId>/<buildId>/` deterministic staged dataset builds
- `workspace/datasets/index/datasets-index.json` canonical dataset/build index and latest-build lookup
- `workspace/releases/<offerId>/` deterministic release bundles
- `workspace/releases/<offerId>/submission-evidence/` authoritative post-export evidence stores
- `workspace/releases/<offerId>/delivery-evidence/` authoritative post-export direct-delivery evidence stores

## Dataset Identity
- `dataset_id` is the stable dataset identity.
- `build_id` is the specific deterministic dataset build identity.
- Latest-build lookup comes from `workspace/datasets/index/datasets-index.json`, not filesystem timestamps.

## Quick Start

1. Install dependencies:
```bash
npm ci --offline --ignore-scripts --cache ./.ci/npm-cache
```

2. Run a mock research task:
```bash
node scripts/run-research-task.js \
  --task "Summarize the sample input documents" \
  --type summarize \
  --input workspace/research-input/sample/ \
  --output workspace/research-output/ \
  --provider mock \
  --confirm
```

3. Build a dataset from an existing research task:
```bash
node scripts/build-dataset-from-task.js \
  --task-id task-EXAMPLE \
  --dataset-type instruction_qa \
  --confirm
```

4. Run a first `research_to_dataset` mission:
```bash
node scripts/run-workflow.js \
  --template general-research-pack \
  --inputs '{"topic":"AI governance"}' \
  --operator-approve \
  --confirm
```
> Arm the gate first — `operator-approve-gate arm` (YubiKey PIN + touch, 300s TTL, one-shot).
> `--confirm` alone is not authorization to spend model capacity; the mock research task in step 2
> above needs no ceremony.
>
> **`run-dataset-mission.js` is refused as of 2026-07-29.** It never threaded operator approval into
> the dispatch context, so `role-router` blocked it with `PHASE15_HUMAN_APPROVAL_REQUIRED`
> regardless of flags. It now says so immediately rather than consuming a YubiKey touch for a run
> that cannot complete. `run-workflow.js` is the mission lane that works.

5. Generate a release bundle from a completed mission:
```bash
node scripts/generate-offer.js \
  --source mission-EXAMPLE \
  --product-line research_packs \
  --tier standard \
  --targets datarade \
  --confirm
```

6. Generate a release bundle from a completed dataset:
```bash
node scripts/generate-offer.js \
  --source dataset-EXAMPLE \
  --product-line dataset_packs \
  --tier premium \
  --targets hugging_face,kaggle \
  --confirm
```

7. Approve the exact packaged bundle for export:
```bash
node scripts/approve-release.js \
  --offer-id offer-EXAMPLE \
  --operator-id operator-cli \
  --confirm
```

8. Export for manual upload or manual delivery:
```bash
node scripts/export-release.js \
  --offer-id offer-EXAMPLE \
  --format zip \
  --operator-id operator-cli \
  --confirm
```

9. Record platform submission outcome evidence (post-export):
```bash
node scripts/record-submission-outcome.js \
  --offer-id offer-EXAMPLE \
  --platform-target datarade \
  --operator-id operator-cli \
  --outcome-state submitted_pending_review \
  --idempotency-key phase22-demo-001 \
  --notes "Submitted manually in seller portal" \
  --confirm
```

10. Verify Phase 22 evidence integrity:
```bash
node scripts/verify-submission-evidence.js --offer-id offer-EXAMPLE --mode full
node scripts/verify-submission-evidence.js --offer-id offer-EXAMPLE --mode incremental
node scripts/verify-submission-evidence.js --mode rebuild
```

11. Record direct-delivery outcome evidence (post-export):
```bash
node scripts/record-delivery-outcome.js \
  --offer-id offer-EXAMPLE \
  --delivery-target manual_secure_transfer \
  --operator-id operator-cli \
  --outcome-state delivery_in_progress \
  --idempotency-key phase28-demo-001 \
  --notes "Manual customer handoff initiated" \
  --confirm
```

12. Verify Phase 28 delivery evidence integrity:
```bash
node scripts/verify-delivery-evidence.js --offer-id offer-EXAMPLE --mode full
node scripts/verify-delivery-evidence.js --offer-id offer-EXAMPLE --mode incremental
node scripts/verify-delivery-evidence.js --mode rebuild
```

## Dataset Foundation and Commercialization Gates

Supported Phase 19 dataset types:
- `instruction_qa`
- `retrieval_qa`
- `benchmark_eval`
- `classification`
- `knowledge_graph`

Dataset builds write deterministic artifacts:
- `dataset.jsonl`
- `metadata.json`
- `manifest.json`
- `schema.json`
- `build-report.json`
- `validation-report.json`
- `dedupe-report.json`
- `provenance.json`
- `quality-report.json`
- `license-report.json`

Dataset index records now distinguish:
- `latest_build_id`
- `latest_validated_build_id`
- `latest_commercialization_ready_build_id`
- `latest_review_required_build_id`

Deterministic dataset states:
- `allowed`
- `review_required`
- `blocked`

A dataset build is commercialization-ready only when:
- row validation passes
- build-quality thresholds pass
- provenance is present for produced rows
- license review resolves to `allowed`

Unknown rights state is fail-closed and never treated as `allowed`.

## Monetization and Release Packaging

Supported product lines:
- `research_retainers`
- `research_subscriptions`
- `research_packs`
- `dataset_samples`
- `dataset_packs`
- `dataset_subscriptions`
- `custom_dataset_services`
- `enterprise_private_delivery`
- `sponsorship_assets`

Supported tiers:
- `sample`
- `standard`
- `premium`
- `enterprise`

Release bundles write deterministic local artifacts:
- `offer.json`
- `metadata.json`
- `manifest.json`
- `checksums.txt`
- `release-notes.md`
- `deliverables/`
- `submission/<platform>/`
- `submission/<platform>/adapter-manifest.json`
- `release-approval.json` only after manual approval

Dataset-backed offer behavior:
- default dataset resolution uses the latest commercialization-ready build from `workspace/datasets/index/datasets-index.json`
- `review_required` builds require explicit `--build-id` selection and remain warning-bearing/manual-review artifacts
- `blocked` builds do not flow into normal dataset packaging
- external publication/submission remains manual-only even when a build is commercialization-ready

## Phase 21 Publisher Adapter Boundary

- Submission pack generation is adapter-driven with deterministic manifests:
  - `schema_version: phase21-publisher-adapter-manifest-v1`
  - `adapter_id` / `adapter_version`
  - `input_snapshot_hash`
  - `generated_files`
  - `generated_files_sha256`
  - `manual_only: true`
- Adapters are local artifact generators only:
  - no network calls
  - no login or browser automation
  - writes confined to `submission/<platform>/...`
- Runtime fails closed if adapter registry coverage does not match configured `platform_targets`.
- Phase 21 approvals are versioned (`phase21-release-approval-v1`) and validate adapter contracts before export.

Supported platform submission packs remain manual-only:
- `datarade`
- `aws_data_exchange`
- `google_cloud_marketplace_bigquery`
- `snowflake_marketplace`
- `hugging_face`
- `kaggle`
- `github_sponsors`

## Phase 22 Post-Export Manual Submission Evidence Ledger

- Scope is local-only, platform-only, post-export governance.
- Phase 22 does not add live publishing, browser automation, login automation, or outbound submission.
- Eligibility to record evidence for `platform_target = X` requires:
  - `validateApprovedRelease(offerId)` success
  - authoritative `submission-evidence/export-events.json` has `bundle_exported` covering `X`
- Authoritative per-offer stores:
  - `workspace/releases/<offerId>/submission-evidence/export-events.json`
  - `workspace/releases/<offerId>/submission-evidence/ledger.json`
- Derived artifacts:
  - `workspace/releases/<offerId>/submission-evidence/<platform>/submission-evidence.json`
  - `workspace/releases/index/submission-evidence-index.json`
- Initial state is derived only from export history:
  - first qualifying export event for a target initializes `ready_for_manual_submission`
  - no synthetic evidence event is created for initialization
- Submission states:
  - `ready_for_manual_submission`
  - `submitted_pending_review`
  - `published_confirmed`
  - `rejected`
  - `needs_revision`
  - `withdrawn`
- Terminal states:
  - `published_confirmed`
  - `withdrawn`
- Evidence events require non-empty operator payload:
  - at least one of attachment files, `external_ref`, or `notes`
- `approved_bundle_hash` is manager-resolved from `release-approval.json.hash_of_release_bundle` and is never operator-supplied.
- Evidence attachments are constrained by deterministic policy:
  - allowed extensions `.json,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.pdf`
  - max 25 MiB per file
  - max 20 files per event
  - deterministic stored names `<sequence>-<ordinal>-<sha16>.<ext>`
  - refs include `stored_path`, `original_filename`, `sha256`, `byte_size`, `file_type`
- Authoritative writes are append-only with per-offer file lock and atomic `temp + fsync + rename`.
- Corrections are new append-only events only; no in-place history rewrites.

## Phase 28 Direct-Delivery Evidence Ledger

- Scope is local-only, direct-delivery-only, post-export governance.
- Phase 28 does not add delivery automation, browser automation, login automation, or outbound execution.
- Offer-level direct-delivery targets are explicit via `direct_delivery_targets`.
- Deterministic delivery contracts are packaged under `delivery/<target>/...`.
- Authoritative per-offer stores:
  - `workspace/releases/<offerId>/delivery-evidence/export-events.json`
  - `workspace/releases/<offerId>/delivery-evidence/ledger.json`
- Derived artifacts:
  - `workspace/releases/<offerId>/delivery-evidence/<target>/delivery-evidence.json`
  - `workspace/releases/index/delivery-evidence-index.json`
- Eligibility to record evidence for `delivery_target = X` requires:
  - `validateApprovedRelease(offerId)` success
  - authoritative `delivery-evidence/export-events.json` has `bundle_exported` covering `X`
- Delivery states:
  - `ready_for_manual_delivery`
  - `delivery_in_progress`
  - `delivery_completed`
  - `delivery_failed`
  - `needs_redelivery`
  - `withdrawn`
- Terminal states:
  - `delivery_completed`
  - `withdrawn`
- Authoritative writes are append-only with per-offer file lock and atomic `temp + fsync + rename`.
- Phase 28 verification integrity status is separate from release approval validity and release bundle hash validity.

## Citation Integrity Layer

A zero-fabrication citation-integrity layer enforces that every identifier cited in an assembled report is **grounded in the source records actually retrieved at runtime** and that no cited DOI is retracted. Per the never-hallucinate doctrine (operator ruling 2026-07-10), a run that fetched **zero** runtime evidence no longer silently passes — it is recorded as an honest-zero and **blocks**.

- **Runtime-grounding capture.** `agent-engine` persists the citation identifiers actually retrieved at runtime by tool-prefetch (`fetched_citation_ids`) plus a per-task `citation_verification` block into research-output metadata. The `buildPrompt` system prompt carries an ABSOLUTE-RULE "ZERO FABRICATION" clause: never invent a PMID / NCT / DOI; say `[no verifiable citation found]` instead.
- **Report-level citation gate.** `workflow-engine.executeMissionStep` runs `verifyReportCitations` (`openclaw-bridge/core/citation-gate.js`), cross-checking every identifier cited in the assembled report against the union of runtime-fetched ids. A cited id is **grounded** if it was present in fetched evidence, otherwise **ungrounded** (likely model-introduced). The gate returns a **multi-state verdict** — not a silent pass/boolean: **PASS** (grounded ratio ≥ `minGroundedCitationRatio` — the only shippable state), **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED` — ratio below the floor), **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — **zero** runtime evidence was fetched, a recorded honest-zero that now **blocks**, closing the doctrine hole where zero-evidence runs silently auto-passed), and **NO_CITATIONS** (`PHASE30_CITATION_NONE` — evidence fetched but the report cited nothing). `minGroundedCitationRatio` is a required value in `config/agent-config.json` = `0.75` (the B-grade floor), read fail-closed (missing/invalid → strict `0.75` default + warning). It writes `citation-verification.json` and `report-annotated.md` to the workflow dir; any surviving ungrounded cites are annotated inline `[UNVERIFIED]`.
- **DOI retraction screen.** `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js` checks each cited DOI against Crossref `/works/{DOI}` (`relation.is-retracted-by` or an `update-to` of type `retraction`). A report citing any retracted paper hard-stops with error code `PHASE30_CITATION_RETRACTED`. Fail-soft: a Crossref error yields no retractions, so a network blip can never wrongly block a report.
- **DOI extraction.** `openclaw-bridge/core/citation-extractor.js` stops DOI capture at non-DOI terminators and strips trailing sentence punctuation, so markdown/prose punctuation is no longer captured into (or duplicated across) DOIs.

> Honesty note: citations are grounded in the source records actually retrieved at runtime and DOI retraction-screened against Crossref. They are **not** independently re-resolved against each citation's live external source database — that per-citation external resolver is still future work (see Future Roadmap).

### Stop-reason archaeology (terminated/withdrawn/suspended trials)

`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js` is a local fetcher (not ToolUniverse) that searches ClinicalTrials.gov API v2 for `TERMINATED` / `WITHDRAWN` / `SUSPENDED` trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules). It has a session cache and is routed into role prefetch through a local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`, tool name `ctgov_stopped_trials`); each record is NCT-traced (a grounded cite).

### Cost-avoidance deliverables

On a gate-passing mission, two additional deliverables are sealed into the release bundle (registered in `manifest.json` and `checksums.txt`), both rendered deterministically (no LLM) from fetched records so every claim is verifiable:

- `deliverables/citation-integrity.md` — a graded provenance ledger (`openclaw-bridge/monetization/integrity-rating.js`, `buildIntegrityReport`): grade A/B/C/D from the grounded ratio; F + `BLOCKED` if any retraction; N/A if nothing is cited. This is the report's audit-trail spine.
- `deliverables/graveyard-memo.md` — a memo of prior terminated/withdrawn/suspended programs in the indication (`openclaw-bridge/monetization/graveyard-memo.js`, `buildGraveyardMemo`), each NCT-traced with the sponsor's stated stop reason (or an explicit `(none stated by sponsor)` — never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link. `buildAmendmentRisk` renders a protocol amendment-risk band (LOW/MODERATE/HIGH) from the change-history median/max version count and most-amended modules.

Both memos are fully fail-soft and bounded: an absent fetcher, empty indication, or fetch error simply omits them and never blocks a passing report. `deliverable-packager` ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`.

## Architecture

Core research runtime:
- `scripts/run-research-task.js`
- `scripts/_research-runtime.js`
- `openclaw-bridge/core/agent-engine.js`
- `openclaw-bridge/core/research-output-manager.js`
- `openclaw-bridge/core/mission-envelope-schema.js`
- `openclaw-bridge/core/agent-spawner.js`
- `openclaw-bridge/core/spawn-planner.js`
- `openclaw-bridge/core/spawn-orchestrator.js`
- `openclaw-bridge/core/citation-gate.js`
- `openclaw-bridge/core/citation-extractor.js`
- `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`
- `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js`

Phase 19/20 dataset runtime:
- `openclaw-bridge/dataset/schema-engine.js`
- `openclaw-bridge/dataset/dataset-builder.js`
- `openclaw-bridge/dataset/dataset-output-manager.js`
- `openclaw-bridge/dataset/provenance-tracker.js`
- `openclaw-bridge/dataset/dataset-validator.js`
- `openclaw-bridge/dataset/dataset-deduper.js`
- `openclaw-bridge/dataset/dataset-scorer.js`
- `openclaw-bridge/dataset/license-review.js`
- `scripts/build-dataset-from-task.js`
- `scripts/run-dataset-mission.js`

Phase 19 monetization runtime:
- `scripts/_monetization-runtime.js`
- `openclaw-bridge/monetization/offer-schema.js`
- `openclaw-bridge/monetization/offer-builder.js`
- `openclaw-bridge/monetization/deliverable-packager.js`
- `openclaw-bridge/monetization/submission-pack-generator.js`
- `openclaw-bridge/monetization/release-approval-manager.js`
- `openclaw-bridge/monetization/submission-evidence-schema.js`
- `openclaw-bridge/monetization/manual-fulfillment-state-machine.js`
- `openclaw-bridge/monetization/submission-evidence-ledger.js`
- `openclaw-bridge/monetization/submission-evidence-manager.js`
- `openclaw-bridge/monetization/delivery-evidence-schema.js`
- `openclaw-bridge/monetization/manual-delivery-state-machine.js`
- `openclaw-bridge/monetization/delivery-evidence-ledger.js`
- `openclaw-bridge/monetization/delivery-evidence-manager.js`
- `openclaw-bridge/monetization/integrity-rating.js`
- `openclaw-bridge/monetization/graveyard-memo.js`

## Validation Commands
```bash
npm run phase2:gates
bash scripts/verify-phase-workflow-policy.sh
bash scripts/verify-phase18-policy.sh
bash scripts/verify-monetization-policy.sh
bash scripts/verify-phase19-policy.sh
bash scripts/verify-phase20-policy.sh
bash scripts/verify-phase21-policy.sh
bash scripts/verify-phase22-policy.sh
bash scripts/verify-phase25-policy.sh
bash scripts/verify-phase28-policy.sh
npm run monetization:verify
npm run phase25:verify
npm run phase19:verify
npm run phase20:verify
npm run phase21:verify
npm run phase22:verify
npm run phase28:verify
node --test tests/**/*.test.js
npm run build:verify
```

## CI Enforcement (Primary)
GitHub Actions is the primary enforcement path for this public repository, using standard GitHub-hosted runners.

Workflow:
- `trevor-robey-inc-agents-CI` (`.github/workflows/ci-enforcement.yml`)

Recommended branch ruleset:
- `ORA Branch Protection` on `main` with pull request required.
- Do not commit directly to `main`; phase work lives on `codex/phaseNN-slug` branches until merged.
- Self-approval is not required for your own work unless explicitly needed.
- Auto-merge may be used after the required checks pass.

Required status check names for branch protection/rulesets:
- `trevor-robey-inc-agents-CI / policy-and-tests`
- `trevor-robey-inc-agents-CI / deterministic-build-verify`

Local hooks are optional developer convenience only and are not the canonical enforcement boundary.
- To opt into the local `main` commit guard for this clone, run `bash scripts/setup-git-hooks.sh`.
- The beginner-facing branch/PR/CI workflow is documented in `docs/phase-git-workflow.md`.

### Optional Local Hook Cleanup
If this clone still points `core.hooksPath` at repo-managed hooks, inspect or unset it locally:
```bash
git config --local --get core.hooksPath
git config --local --unset core.hooksPath
```

## Phase Status

| Phase | Focus | Status |
|---|---|---|
| 2-13 | Governance and security foundation | Complete |
| 14 | Core research execution | Implemented |
| 15 | Multi-agent topology and comms | Implemented |
| 16 | MCP ingestion and normalization | Implemented |
| 17 | Runtime hardening and resume | Implemented |
| 18 | Mission orchestration | Implemented |
| 19A | Monetization and release packaging | Implemented |
| 19B | Dataset foundation | Implemented |
| 20 | Quality, provenance, and licensing commercialization gates | Implemented |
| 21 | Publisher adapter boundaries and release approval/export validation | Implemented |
| 22 | Post-export manual submission evidence ledger and verification | Implemented |
| 23 | Portfolio intelligence and commercialization decision support | Implemented |
| 26A | Bridge streamable/auth principal prerequisite slice | Implemented |
| 28 | Direct-delivery contracts and post-export delivery evidence governance | Implemented |
| 29 | Harvard ToolUniverse biomedical MCP (2,116 tools) | Implemented — active, 58/58 tests |
| 30 | Single-command workflow engine (6 templates, 6 roles) | Implemented |
| 31 | Enterprise delivery: Research REST API + scheduled workflows + usage metering | Implemented + locally tested (34/34) — **not externally deployed** |
| 33 | Claude Code MCP provider (default LLM; `claude -p` stdin pipe) + stateful multi-agent per-role routing | Implemented |

> **Routing update (2026-06-11):** the engine now runs a **stateful multi-agent routing layer** (built + verified 2026-06-11), superseding the earlier "Claude Code runs all roles" framing. Per-role backend selection is driven by `config/role-provider-map.json` (`roles[role]` → template `provider_preference` → `default` = claude-code), and each role keeps persistent identity + memory under `config/agents/<role>/{SOUL.md,AGENTS.md,sessions/}`. Current routing:
> **Updated 2026-06-22:** scout, analyst, and synthesizer now all run on **Claude Opus 4.8** via `claude-code` (`claude-opus-4-8`, 1M context by default — no `[1m]` suffix). As of 2026-07-16 (Option B) the engine is **100% Claude** — the OSS helper pre-passes and per-role local fallbacks were **removed** (removed-but-restorable). Every role's `fallback` is empty (`""`), so a primary `claude-code` failure surfaces the real error instead of chasing a local backend.
> - **scout → claude-code / Opus 4.8.** No engine fallback — `fallback` is empty. (Ollama `qwen2.5:7b-instruct` at :11434 via the :11435 TLS proxy is retained for the **Obsidian side only** — Copilot + vault-zettelkasten — not as an engine fallback/helper.)
> - **analyst → claude-code / Opus 4.8.** No engine fallback — `fallback` is empty (LM Studio was decommissioned 2026-07-16).
> - **synthesizer → claude-code / Opus 4.8.** No engine fallback — `fallback` is empty (LM Studio was decommissioned 2026-07-16).
> - **unmapped / default → claude-code** (`claude-sonnet-4-6`); as of Option B (2026-07-16) all engine roles run on claude-code, so there are no non-claude routes and every role's `fallback` is empty.
> As of 2026-07-16 (Option B) **LM Studio is decommissioned** — its TLS proxy (:1235), its launchd unit (`com.trevorrobey.lm-studio-tls-proxy`), the `lm-studio` provider entry, and every engine route to it were removed, and the app + `~/.lmstudio` were moved to Trash; the live TLS-proxy count is now 3 (Ollama :11435, Miyo :8743, Qdrant :6433). The local-helper capability is removed-but-restorable. `--operator-approve` is YubiKey-gated (`operator-approve-gate arm` = PIN + touch); `scripts/run-workflow.sh` sets `NODE_EXTRA_CA_CERTS` to the mkcert CA, and the Obsidian Command Center plugin spawns `--operator-approve` with that CA env. Claude Code billing is the Claude Max 20× subscription (flat, not per-token).

> **Phase-status correction (2026-06-10):** this table previously stopped at Phase 28 and the roadmap called Phase 31 "planned." Per `CLAUDE.md`, Phases 1–33 are implemented. Phase 31 code and tests exist (`openclaw-bridge/bridge/research-api.js`, `tests/core/phase31-*.test.js`) but **no hosted instance serves customers** — "implemented" ≠ "deployed." Phases 24/25 are implemented but **disabled** in the research flow. See `SYSTEM-REALITY.md` for running-state ground truth.

## Future Roadmap

> **Correction (2026-06-10):** the "post-Phase 22" framing below is historical. The implementation wave through Phase 33 is done (see the table above and `CLAUDE.md`). What remains genuinely un-built / un-deployed: external deployment of the Phase 31 API, enabling the disabled Phase 24/25 connectors, full Phase 26 container consolidation, and the citation **resolver** gap in `SYSTEM-REALITY.md` §3.

Phase tracking notes are in `future openclaw research agents phases to be implemented.` at the repository root.

Implemented but **disabled / not deployed** (do not assume these are live features):
- Phase 24: operator sync and briefing MCP activation — implemented, disabled in the research flow
- Phase 25: credential broker and delegated session governance — implemented, not active by default
- Phase 31: enterprise Research REST API — implemented + tested, not externally deployed

Genuinely future:
- Phase 26 (full): bridge runtime and execution-router consolidation (container governance is scaffold-only today)
- Per-citation external **resolver**/validator (PMID/NCT/ChEMBL/DOI → live re-resolved links + Reproducibility Manifest). The runtime-grounding gate and Crossref DOI retraction screen ship today (see [Citation Integrity Layer](#citation-integrity-layer)); independent external re-resolution of each citation against its live source database is the remaining gap — grounded is not the same as re-resolved.

Implemented and active:
- Phase 23: portfolio intelligence and commercialization decision support
- Phase 26A: minimal bridge/auth/principal prerequisite slice
- Phase 28: direct-delivery channels and post-export delivery evidence governance
- Phase 29/30/33: ToolUniverse, workflow engine, Claude Code provider + stateful multi-agent per-role routing (scout/analyst/synthesizer → claude-code/Opus 4.8 (no OSS helpers/fallbacks — Option B is 100% Claude); default → claude-code/Sonnet; see the routing update above)

Phase 23 reads approved release state together with Phase 22 submission evidence and Phase 28 delivery evidence to generate deterministic commercialization reports under `audit/evidence/phase23/` without introducing any new network, browser, or mutation paths.
Phase 24 remains constrained to operator-only Notion/newsletter `prepare`/`commit`/`retry`/`reconcile` flows with deterministic local briefing artifacts under `audit/evidence/phase24/`; it does not enable those providers in `research.search` or `research.getPaper`.
Phase 25 keeps credential handles local-only and in-memory, and binds delegated connector sessions to operator-approved scopes plus underlying token validity; it does not add browser automation, login automation, OAuth, or external secret managers.
Phase 26A remains a minimal prerequisite subset of Phase 26 and does not represent full Phase 26 consolidation.
