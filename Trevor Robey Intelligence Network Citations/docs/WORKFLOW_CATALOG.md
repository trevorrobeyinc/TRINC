# Workflow Template Catalog

The ten workflow templates in `config/workflow-templates/`, as defined on 2026-10-23. Regenerate this page
from those JSON files whenever a template changes; the files are the source of truth. (The previous
version, with its March 2026 7B-model quality matrix, is `git show 2077e79:"Trevor Robey Intelligence Network Citations/docs/WORKFLOW_CATALOG.md"`.)

## Running one

```bash
operator-approve-gate arm      # YubiKey PIN + touch; one run, 300 s
node scripts/run-workflow.js --template <template-id> --inputs '<json>' --operator-approve --confirm
```

Every template run is real: `run-workflow.js` has no `--provider` flag and the role map pins the research
roles to `claude-code`, so each run needs the armed token. The free practice lane is
`scripts/run-research-task.js --provider mock`, which never reaches the citation gate. From Claude Code,
start runs through the `openclaw-obsidian` door (`obsidian_openclaw_run_workflow`) so the Command Center
post-run chain also runs; `dry_run: true` checks a template and its inputs without spending the token.

## What every template shares

- **One pipeline**: `research` (mission) → `quality_check` (quality audit) → `build_dataset` →
  `package` (offer) → `approve` → `export` (ZIP).
- **100% Claude**: scout, analyst and synthesizer on `claude-opus-4-8`, every other role on
  `claude-sonnet-4-6` (`config/role-provider-map.json`); each template sets `provider_preference` to
  `claude-code`.
- **Live evidence first**: before each role writes, the prefetch layer pulls records from ToolUniverse and the
  project adapters (`config/tool-prefetch-map.json`; the business lane uses
  `config/tool-prefetch-map.business.json`).
- **The citation gates**: grounding (floor 0.75, fail-closed), the Crossref + PubMed retraction screen, and
  re-resolution of every PMID/NCT/DOI at delivery. Only `PASS` ships; `UNVERIFIED`, `INSUFFICIENT_EVIDENCE`
  and `NO_CITATIONS` block. Detail: the engine `CLAUDE.md` → "Citation Integrity Layer".
- **The bundle** carries the deterministic `citation-integrity.md`, `graveyard-memo.md`,
  `search-coverage.md` and reproducibility manifest alongside the report. Detail: the root
  `ARCHITECTURE.md` §3.5.

## Biomedical templates

| Template | What it produces | Required inputs | Optional inputs |
|---|---|---|---|
| `drug-discovery-full` | Compound profiling, ADMET, target-compound mapping | `compound_name`, `indication` | — |
| `pharmacovigilance-report` | Adverse-event signals and drug interactions (FAERS, DailyMed, RxNorm) | `drug_class` | `time_window` |
| `clinical-trial-landscape` | Trial landscape, endpoint analysis, competitor tracking | `therapeutic_area` | `phase_filter` |
| `target-validation-pack` | Target validation, pathways, protein-interaction networks | `target_gene` | `disease_context` |
| `rare-disease-brief` | Orphan-drug mapping and genetic profiling | `disease_name` | `focus_area` |
| `general-research-pack` | One biomedical question at fixed depth; sold as the Scoped Research Pack. A topic with no groundable biomedical evidence is blocked, not shipped. | `topic` | — |
| `trial-design-benchmark` | Phase 3 trial-structure benchmark against the comparable-program cohort (allocation, masking, model, arms, enrollment, endpoints, sponsor class), reported as N of M and never padded; ships `design-benchmark.{md,csv}` | `indication` | `drug_class`, `benchmark_cohort_size` (default 20, capped at 50) |

Examples:

```bash
node scripts/run-workflow.js --template drug-discovery-full --inputs '{"compound_name":"aspirin","indication":"pain"}' --operator-approve --confirm
node scripts/run-workflow.js --template trial-design-benchmark --inputs '{"indication":"non-small cell lung cancer"}' --operator-approve --confirm
```

## Business templates (`research_profile: business`)

Built and unit-tested, **never run live**. Priced in `OFFERINGS.md` (approved 2026-10-23); booking opens after
the first live run passes the gate. Same pipeline and gate, with
business evidence: `WEB:` snapshots of pages read, `SEC:` filings, `WB:` World Bank indicators, `BLS:` /
`EUROSTAT:` statistics (`CENSUS:` / `EIA:` dormant until their free keys exist) and OpenAlex DOIs. The scout's
model call is replaced by a deterministic Evidence Brief. Design and the recommended first run:
`docs/business-research-lane.md`.

| Template | What it produces | Required | Optional (default) |
|---|---|---|---|
| `business-research-pack` | One agreed business question at fixed depth (Standard Report tier) | `topic` | `company`, `industry`, `focus` ("report data analysis"), `analysis_focus` ("benchmark data"), `country` ("US") |
| `cost-reduction-analysis` | Where a named cost can be cut, what comparable organisations pay, the options with evidence (Deep-Dive tier) | `topic` | `company`, `industry`, `focus` ("cost benchmark average cost per"), `analysis_focus` ("cost reduction case study savings"), `country` ("US") |
| `market-landscape` | Size, growth, competitors and pricing in one market (Deep-Dive tier) | `topic` | `industry`, `competitors` (one company name triggers SEC filings), `focus` ("market size growth forecast"), `analysis_focus` ("competitors pricing market share"), `country` ("US") |

## Not available

The Phase 31 Research REST API, scheduled workflows and usage metering exist as code and tests but are **not
deployed**; nothing listens for them. Every run starts from `run-workflow.js` or the door above.
