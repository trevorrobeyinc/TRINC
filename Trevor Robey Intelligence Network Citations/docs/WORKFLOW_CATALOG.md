# Workflow Template Catalog

Phase 30 provides 6 workflow templates for single-command research orchestration via `scripts/run-workflow.js`.

## Usage

```bash
node scripts/run-workflow.js --template <template-id> --inputs '<json>' --confirm
```

## Templates

### general-research-pack

General-purpose research pack using LLM-only pipeline (no ToolUniverse).

```bash
node scripts/run-workflow.js --template general-research-pack \
  --inputs '{"topic":"AI governance"}' --confirm
```

| Field | Value |
|-------|-------|
| Pipeline | mission → dataset → offer → approve → export |
| Steps | 5 |
| Quality gate | None |
| Required inputs | `topic` (string) |
| Optional inputs | `input_dir` (default: `workspace/research-input/sample/`) |
| Agent roles | scout → analyst → synthesizer |
| Model tier | Standard (7B local) |

### drug-discovery-full

End-to-end drug discovery intelligence with quality verification.

```bash
node scripts/run-workflow.js --template drug-discovery-full \
  --inputs '{"compound_name":"aspirin","indication":"pain"}' --confirm
```

| Field | Value |
|-------|-------|
| Pipeline | mission → quality_audit → dataset → offer → approve → export |
| Steps | 6 |
| Quality gate | 0.7 confidence threshold |
| Required inputs | `compound_name`, `indication` |
| Optional inputs | `input_dir` (default: `workspace/research-input/biomedical/`) |
| Agent roles | scout → analyst → synthesizer + quality_auditor |
| ToolUniverse categories | PubChem, OpenTargets, ChEMBL, ADMETai |
| Model tier | Premium/Enterprise (Claude required for quality gate) |

### pharmacovigilance-report

Post-marketing safety signal detection and adverse event analysis.

```bash
node scripts/run-workflow.js --template pharmacovigilance-report \
  --inputs '{"drug_class":"NSAID"}' --confirm
```

| Field | Value |
|-------|-------|
| Pipeline | mission → quality_audit → dataset → offer → approve → export |
| Steps | 6 |
| Quality gate | 0.6 confidence threshold |
| Required inputs | `drug_class` |
| Optional inputs | `input_dir` (default: `workspace/research-input/biomedical/`) |
| Agent roles | scout → analyst → synthesizer + quality_auditor |
| ToolUniverse categories | FAERS, DailyMed, RxNorm, OpenFDA |
| Model tier | Premium/Enterprise (Claude required for quality gate) |

### clinical-trial-landscape

Clinical trial pipeline landscape mapping and competitive intelligence.

```bash
node scripts/run-workflow.js --template clinical-trial-landscape \
  --inputs '{"therapeutic_area":"oncology"}' --confirm
```

| Field | Value |
|-------|-------|
| Pipeline | mission → quality_audit → dataset → offer → approve → export |
| Steps | 6 |
| Quality gate | 0.6 confidence threshold |
| Required inputs | `therapeutic_area` |
| Optional inputs | `input_dir` (default: `workspace/research-input/biomedical/`) |
| Agent roles | scout → analyst → synthesizer + quality_auditor |
| ToolUniverse categories | ClinicalTrials.gov, EuropePMC, PubMed |
| Model tier | Premium/Enterprise (Claude required for quality gate) |

### target-validation-pack

Therapeutic target validation with molecular profiling.

```bash
node scripts/run-workflow.js --template target-validation-pack \
  --inputs '{"target_gene":"BRAF","disease":"melanoma"}' --confirm
```

| Field | Value |
|-------|-------|
| Pipeline | mission → quality_audit → dataset → offer → approve → export |
| Steps | 6 |
| Quality gate | 0.7 confidence threshold |
| Required inputs | `target_gene`, `disease` |
| Optional inputs | `input_dir` (default: `workspace/research-input/biomedical/`) |
| Agent roles | scout → analyst → synthesizer + quality_auditor |
| ToolUniverse categories | OpenTargets, UniProt, HPA, InterPro |
| Model tier | Premium/Enterprise (Claude required for quality gate) |

### rare-disease-brief

Rare disease landscape briefing with orphan drug analysis.

```bash
node scripts/run-workflow.js --template rare-disease-brief \
  --inputs '{"disease_name":"Dravet syndrome"}' --confirm
```

| Field | Value |
|-------|-------|
| Pipeline | mission → quality_audit → dataset → offer → approve → export |
| Steps | 6 |
| Quality gate | 0.6 confidence threshold |
| Required inputs | `disease_name` |
| Optional inputs | `input_dir` (default: `workspace/research-input/biomedical/`) |
| Agent roles | scout → analyst → synthesizer + quality_auditor |
| ToolUniverse categories | Monarch, OMIM, OrphaNet, GDC |
| Model tier | Premium/Enterprise (Claude required for quality gate) |

## Citation Integrity Layer (Phase 30 post-research engine, 2026-06-12)

Every mission now runs a zero-fabrication citation-integrity layer on top of the pipeline above. Citations are **grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)**, and — since the post-research integrity layer (validated 2026-07-10) — **re-resolved per identifier against the issuing public registry at delivery** (PMID → NCBI, NCT → ClinicalTrials.gov v2, DOI → Crossref; VERIFIED / UNRESOLVED / UNCHECKED in the reproducibility manifest; any UNRESOLVED id blocks delivery). Ground truth: `SYSTEM-REALITY.md` → "GAP CLOSED".

- **Citation gate (report-level).** `agent-engine` persists the citation identifiers actually retrieved at runtime (`fetched_citation_ids`) plus a per-task `citation_verification` block, and `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI; emit `[no verifiable citation found]` instead). `workflow-engine.executeMissionStep` runs `verifyReportCitations` (`openclaw-bridge/core/citation-gate.js`), cross-checking every identifier cited in the assembled report against the union of runtime-fetched ids: a cite is **grounded** if present in fetched evidence, else **ungrounded** (likely model-introduced). Per the never-hallucinate doctrine (operator ruling 2026-07-10) the gate returns a **multi-state verdict**, not a silent pass/boolean — and only PASS ships: **PASS** (grounded ratio ≥ `minGroundedCitationRatio`, the ONLY shippable state); **UNVERIFIED** (ratio below the floor, `PHASE30_CITATION_UNVERIFIED`); **INSUFFICIENT_EVIDENCE** (ZERO runtime evidence was fetched, `PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — a recorded honest-zero that now BLOCKS, closing the doctrine hole where zero-evidence runs silently auto-passed); **NO_CITATIONS** (evidence fetched but the report cited nothing, `PHASE30_CITATION_NONE`). The floor `minGroundedCitationRatio` is a REQUIRED value in `config/agent-config.json` = **`0.75`** (the B-grade floor), read fail-closed (missing/invalid → strict `0.75` default + warning) via the exported `DEFAULT_MIN_GROUNDED_RATIO`, replacing the old hardcoded `0.34`. It writes `citation-verification.json` + `report-annotated.md` to the workflow dir, annotating surviving ungrounded cites inline as `[UNVERIFIED]`.
- **Retraction screen.** Each cited DOI is checked against Crossref (`is-retracted-by` / update-to type `retraction`). A report citing any retracted paper HARD-STOPS (`PHASE30_CITATION_RETRACTED`). Fail-soft: a Crossref error yields no retractions, so a network blip can never wrongly block a report.
- **Stop-reason corpora ingestion.** A local fetcher (`tool_name` `ctgov_stopped_trials`, routed through the tool-prefetch local-fetcher seam) queries ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules). Each record is NCT-traced.

### New mission-bundle deliverables

| Deliverable | Source | Contents |
|-------------|--------|----------|
| `deliverables/citation-integrity.md` | `integrity-rating.js` | Graded provenance ledger (grade A/B/C/D from grounded ratio; F + "BLOCKED" on any retraction; N/A if nothing cited). The report's audit-trail spine. |
| `deliverables/graveyard-memo.md` | `graveyard-memo.js` | Prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link; plus a protocol amendment-risk band (LOW/MODERATE/HIGH). Rendered deterministically from fetched records (no LLM). |

Both are registered in `manifest.json` and sealed in `checksums.txt`. The graveyard memo / amendment-risk build runs on a gate-PASSING mission and is fully fail-soft + bounded — an absent fetcher, empty indication, or fetch error simply omits it and never blocks a passing report. One exception to "simply omits": when protocol version history was requested and the registry returned none (HTTP 403 as of 2026-10-08), the amendment-risk part ships as an explicit "Not available for this run" section instead of vanishing.

**New error codes:** `PHASE30_CITATION_UNVERIFIED`, `PHASE30_CITATION_INSUFFICIENT_EVIDENCE`, `PHASE30_CITATION_NONE`, `PHASE30_CITATION_RETRACTED`.

## Model Quality Matrix

| Template | 7B Local (qwen2.5-coder) | Claude Code (claude-sonnet-4-6) | Notes |
|----------|--------------------------|-------------------------------|-------|
| general-research-pack | Full pipeline pass | **Full pipeline pass + ZIP** | No quality gate |
| drug-discovery-full | Quality fail (0.19/0.7) | **Quality PASS (0.727/0.7)** | 37 verified citations |
| pharmacovigilance-report | Quality fail (0.04/0.6) | Quality fail (0.484/0.6) | 25 citations; close — prompt tuning needed |
| clinical-trial-landscape | Quality fail (0.05/0.6) | Blocked (chain integrity) | Pre-existing PHASE14 bug |
| target-validation-pack | Quality fail (0.00/0.7) | Quality fail (0.167/0.7) | 8 citations; needs prompt improvement |
| rare-disease-brief | Quality fail (0.08/0.6) | Blocked (scout timeout) | Needs prompt size reduction |

### Phase 33 Validation Summary (2026-03-31)

Claude Code (`claude -p --allowedTools ""`) using parametric knowledge only (no ToolUniverse tool use):
- **1/5 biomedical templates pass quality gate** (drug-discovery-full)
- **Average confidence improved 538%** over 7B model across scored templates
- All citations are real and verifiable (vs fabricated by 7B model)
- Pharmacovigilance-report is closest to passing (0.484/0.6) — prompt tuning recommended
- See `workspace/audit/phase33-live-validation-report.md` for full analysis

The quality auditor uses a citation density formula: `min(1.0, (verified_citations / total_lines) * 10)` with a minimum of 5 verified citations. The 7B local model produces hallucinated citations that fail verification. Claude Code produces real, verifiable identifiers from parametric knowledge.

## Research API

Templates can also be submitted via the Phase 31 REST API:

```bash
curl -X POST --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:4100/api/v1/research \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"template_id": "general-research-pack", "inputs": {"topic": "AI governance"}}'
```

See `openclaw-bridge/bridge/research-api.js` for full endpoint documentation.
