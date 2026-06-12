---
language:
- en
license: cc-by-nc-4.0
pretty_name: "Pharmacovigilance Signal Synthesis — ICI & Repurposing Adverse Events (Citation-Traced Sample)"
size_categories:
- n<1K
task_categories:
- text-generation
- question-answering
- table-question-answering
tags:
- biomedical
- pharmacovigilance
- drug-safety
- adverse-events
- immune-checkpoint-inhibitors
- verified-citations
- research-intelligence
- citation-traced
configs:
- config_name: signal-register
  data_files: data/signal-register.csv
- config_name: citation-index
  data_files: data/citation-index.csv
extra_gated_prompt: >-
  This is a free evaluation sample from Trevor Robey, INC. (Trevor Robey
  Intelligence Network Citations LLC). Access is gated so we can tell you when
  the dataset is updated and understand who finds it useful. Your information is
  used only for that purpose and is never sold. By requesting access you agree
  the sample is provided for research and evaluation, with no warranty, and is
  not validated for clinical, prescribing, or regulatory use.
extra_gated_fields:
  Company or affiliation: text
  Country: country
  Work email: text
  Intended use:
    type: select
    options:
    - Investor / hedge-fund due diligence
    - Pharma / biotech competitive intelligence
    - Drug-safety / pharmacovigilance
    - Academic research
    - Other
  I agree this sample is research/evaluation only and not for clinical use: checkbox
extra_gated_button_content: Request access
---

# Pharmacovigilance Signal Synthesis — Citation-Traced Sample

> **Produced by Trevor Robey, INC. (Trevor Robey Intelligence Network Citations LLC) — https://trevorobeyinc.com.** *INC = Intelligence Network Citations.* Contact: trevor@trevorobeyinc.com

**Every claim in this dataset resolves to a public-domain identifier.** This is a free, citation-traced sample of the kind of pharmacovigilance signal synthesis we produce for biotech investors, pharma BD/CI, and drug-safety teams: each adverse-event signal is paired with the PubMed PMID, ClinicalTrials.gov NCT, DOI, RxNorm, and MedDRA identifiers that support it, so any analyst can independently replay the evidence.

*Tagline: Every claim, sourced. Every risk, named. In days, not weeks.*

## What's in the sample

| File | Rows | Description |
|---|---|---|
| `data/signal-register.csv` | 10 signals | One row per adverse-event signal: drug(s), RxNorm IDs, MedDRA preferred term, AEMS disproportionality metric (ROR/PRR), severity tier, primary citation, and a recommended clinical-monitoring action. |
| `data/citation-index.csv` | 29 citations | The auditable provenance trail — one row per cited identifier, mapped to the signal(s) it supports, with the resolving source database. |
| `data-dictionary.md` | — | Full schema, allowed values, and identifier-resolution URL patterns for both CSVs. |

**Focus:** immune-checkpoint-inhibitor (anti-PD-1 / anti-PD-L1 / anti-CTLA-4) adverse events plus selected drug-repurposing combination risks (e.g., valproic acid + temozolomide). Coverage: adverse-event reporting through 2024-Q4; literature 2008–2024.

## Why it's different

- **Citation traceability is enforced, not decorative.** Every `signal_id` in the register appears in the citation index; every identifier resolves in its named source database (PubMed, ClinicalTrials.gov, RxNorm, ChEMBL, DOI). Resolution URL patterns are in `data-dictionary.md`.
- **No PHI, no proprietary data.** All sources are public biomedical databases (FDA AEMS/OpenFDA, PubMed, ClinicalTrials.gov, RxNorm, MedDRA, ChEMBL, UniProt, PubChem, DailyMed). No personal or protected health information is handled or transmitted.
- **Research-artifact discipline.** Outputs are research intelligence, not clinical decision support.

## Sources & licensing

Mostly US-Government public-domain (FDA AEMS/OpenFDA, ClinicalTrials.gov, RxNorm, PubChem) plus PubMed metadata, ChEMBL (CC-BY-SA 3.0, cited by version), and UniProt (CC-BY-4.0). **DrugBank is not included.** This sample is released under **CC-BY-NC-4.0** for evaluation; full production deliverables are governed by a Data Subscription Agreement (research-use-only).

## Want the full version?

This sample is one redacted slice. Production deliverables (per-asset **Investor Pre-Mortem**, **Failed Trial Archaeology**, full **Pharmacovigilance Pack**) ship with hundreds of resolved citations and a per-delivery Reproducibility Manifest, in days. → **https://trevorobeyinc.com** · **trevor@trevorobeyinc.com**

---

*Disclaimer: Produced for informational and research purposes only. Not validated for clinical decision support and must not be used as the sole basis for prescribing, diagnostic, or regulatory decisions. The legal entity is Trevor Robey Intelligence Network Citations LLC, a California limited liability company, operating under the wordmark "Trevor Robey, INC."*
