# Trevor Robey Inc Agents — Pharmacovigilance Intelligence Sample

**Immune Checkpoint Inhibitor Adverse Event Signal Synthesis**

---

## What This Is

An autonomous multi-agent pharmacovigilance engine that synthesizes adverse event signals from FDA registries, peer-reviewed literature, and pharmacological databases into a prioritized, citation-backed signal register.

**41 verified citations | 7 identifier types | 3 agent sections | 48 pages**

## Methodology

- **Scout**: Systematic scan of OpenFDA AEMS (formerly AEMS, migrated to daily real-time updates Mar 11, 2026), DailyMed SPL, and RxNorm with cross-reference normalization
- **Analyst**: Quantitative signal analysis with AEMS disproportionality metrics (ROR, PRR) and drug interaction profiling
- **Synthesizer**: Cross-validated signal hierarchy with confidence tiers and clinical action items

Every claim maps to a verifiable identifier. Claims without citations are excluded.

## Top 3 Critical Signals

**C-1: ICI Combination Myocarditis**
Nivolumab (RxNorm: 1597876) + ipilimumab (RxNorm: 950399) -- fatality rate ~46% in fulminant cases, AEMS ROR ~4.5x monotherapy baseline, median onset 34 days. Mechanism: dual PD-1/CTLA-4 blockade drives autoreactive T-cell expansion against cardiac troponin epitopes.
PMID: 30232222 | doi: 10.1056/NEJMoa1716078

**C-2: Valproic Acid Myelosuppression with Temozolomide**
Valproic acid (RxNorm: 11118) + TMZ (RxNorm: 10396) -- Grade 3-4 thrombocytopenia 18% vs 8% TMZ alone. CYP2C9 (UniProt: P11712) inhibition increases TMZ exposure.
NCT00302159 | PMID: 20823420

**C-3: Chloroquine QTc Prolongation in GBM Patients**
Chloroquine (RxNorm: 2393; PubChem CID: 2719) -- additive hERG block (UniProt: Q12809) plus dexamethasone-induced hypokalemia creates torsades risk.

[+4 additional high/moderate priority signals in full report]

---

## Verification

Every identifier is independently verifiable:

| Citation Type | Identifier | Verification |
|---------------|------------|-------------|
| PMID | 30232222 | pubmed.ncbi.nlm.nih.gov/30232222 -- ICI myocarditis systematic review, JACC 2018 |
| PMID | 28552849 | pubmed.ncbi.nlm.nih.gov/28552849 -- ICI irAE disproportionality analysis |
| NCT | NCT00302159 | clinicaltrials.gov -- Valproic acid + TMZ in GBM |
| RxNorm | 1597876 | rxnav.nlm.nih.gov/REST/rxcui/1597876 -- Nivolumab pharmacology |
| DOI | 10.1056/NEJMoa1716078 | doi.org/10.1056/NEJMoa1716078 -- NEJM ICI cardiac events |

Check any identifier above in its source database. It resolves.

## Additional Intelligence Products

| Product | Citations per Report | Data Sources |
|---------|---------------------|-------------|
| Drug Discovery Intelligence Pack | 200+ | PubChem, ChEMBL, RxNorm, UniProt |
| Clinical Trial Landscape Analysis | 180+ | ClinicalTrials.gov, PubMed, WHO ICTRP |
| Target Validation Dossier | 289+ | OpenTargets, UniProt, HPA, ChEMBL |
| Rare Disease Research Brief | 150+ | GARD, Orphanet, PubMed, ClinicalTrials.gov |

## Pricing

| Engagement | Price | Delivery |
|-----------|-------|----------|
| Research Intelligence Pack (Standard) | $2,500 - $4,950 per report | Single-topic report, citations (count varies by topic), 72-hour secure email delivery |
| Premium Intelligence Pack | $4,950 - $14,950 per report | Standard + appendix, methodology statement, schema definition, enhanced QA, longer SLA |
| Custom Intelligence Mission | $15,000 - $35,000 per project | Bespoke build with private delivery (Snowflake / AWS / BigQuery / secure transfer) + provenance package |
| Enterprise Subscription | $60,000 - $120,000+ ARR | Recurring delivery, native cloud integration, usage metering, SLA |

## Next Steps

Request the full 48-page sample deliverable or initiate a custom intelligence mission on a topic relevant to your pipeline.

**Contact**: trevor@trevorobeyinc.com
**Web**: https://trevorobeyinc.com

---

*Produced using AI-assisted research synthesis with human editorial oversight. All citations independently verifiable.*
*Trevor Robey Inc. | Biomedical Research Intelligence*

---

## Source License Register

| Source | License | Notes |
|---|---|---|
| AEMS (formerly FAERS) | US Government work — public domain | Daily real-time updates since Aug 2025; migration completed Mar 11, 2026. |
| ClinicalTrials.gov | US Government work — public domain | NLM attribution preserved. |
| PubMed | Citation metadata + abstracts free | Full-text quoting limited to PMC Open Access Subset. |
| PubChem | Public domain | NIH/NLM attribution preserved. |
| ChEMBL | CC BY-SA 3.0 | Derived analyses with version cited (e.g., ChEMBL_36, Sept 2025). Raw rows not redistributed. |
| RxNorm | Public domain (US federal data) | Drug identifiers via RxNav (rxnav.nlm.nih.gov). |
| OpenFDA | Public domain (FDA) | Application/SPL identifiers. |
| UniProt | CC BY 4.0 | Attribution string included. |
| DrugBank | NOT INCLUDED | Excluded under DrugBank commercial-use ToS. Commercial DrugBank pack available under separate license — contact trevor@trevorobeyinc.com. |
