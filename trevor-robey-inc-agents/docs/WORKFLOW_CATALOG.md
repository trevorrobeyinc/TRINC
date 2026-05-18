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
