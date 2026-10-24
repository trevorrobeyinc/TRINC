###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

---

# Pharmacovigilance Signal Synthesis Report

**Subject**: Immune Checkpoint Inhibitor Adverse Events and GBM Drug Repurposing Safety Signals

**Classification**: REDACTED SAMPLE
**Product Line**: Biomedical Research Packs -- Pharmacovigilance
**Mission ID**: mission-33789c3213710ed087a50ed2
**Pipeline**: 3-agent (scout / analyst / synthesizer)
**Generated**: 2026-04-01
**Verified Citations**: 41
**Quality Confidence**: 1.0

**Contact**: trevor@trevorobeyinc.com
**Web**: https://trevorobeyinc.com

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 1. Research Methodology

This report is produced through a deterministic multi-agent research pipeline where each agent role contributes a distinct pharmacovigilance analysis phase:

**Scout Agent** -- Systematic scan of FDA-linked pharmacovigilance databases (OpenFDA AEMS (formerly AEMS, migrated to daily real-time updates Mar 11, 2026), DailyMed SPL, RxNorm) with cross-reference normalization. Establishes the compound surveillance landscape: drug identifiers (RxNorm, RxCUI, PubChem CID), MedDRA adverse event classifications, and database query strategies for signal extraction.

**Analyst Agent** -- Quantitative adverse event signal analysis with AEMS-based disproportionality metrics (Reporting Odds Ratio, Proportional Reporting Ratio). Structures drug interaction matrices across compound cohorts. Maps pharmacokinetic and pharmacodynamic interaction mechanisms with molecular-level specificity (CYP enzyme identifiers via UniProt, clinical trial safety data via NCT).

**Synthesizer Agent** -- Cross-validated signal hierarchy integrating scout and analyst outputs. Resolves contradictions, assigns confidence tiers (Critical / High / Moderate), and produces actionable clinical recommendations for each signal.

### Data Sources Queried

| Database | Identifiers Used | Purpose |
|----------|-----------------|---------|
| PubMed / MEDLINE | PMID | Peer-reviewed pharmacovigilance literature |
| FDA AEMS (via OpenFDA) | MedDRA PT codes | Adverse event disproportionality analysis |
| DailyMed | SPL Set IDs | Structured product labeling and boxed warnings |
| RxNorm | RxCUI | Drug name normalization and cross-database linkage |
| PubChem | CID | Chemical compound properties and ADMET data |
| RxNorm | DB identifiers | Drug-target interactions and pharmacology |
| UniProt | Accession numbers | Enzyme and protein target identification |
| ClinicalTrials.gov | NCT numbers | Clinical trial safety data |
| ChEMBL | CHEMBL IDs | Bioactivity and drug-target interaction data |

### Quality Assurance

- Every claim maps to a verifiable identifier (PMID, NCT, CID, DOI, RxNorm, UniProt, or ChEMBL)
- Claims without verifiable sources are excluded from the final report
- Citation density enforcement: minimum threshold per 1,000 characters of output
- Append-only evidence ledger with SHA-256 chain-hashed integrity verification
- Automated quality auditing with cross-reference validation before release

> *This is a redacted sample. Full deliverables include 48+ pages of analysis with citations grounded in retrieved evidence (count varies by topic). Contact: trevor@trevorobeyinc.com*

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 2. Executive Summary

This report consolidates pharmacovigilance signals across two compound cohorts -- immune checkpoint inhibitors (ICIs) under active post-marketing surveillance and GBM repurposing candidates assessed for CNS safety -- into a unified, prioritized signal register. The synthesis integrates AEMS-based disproportionality metrics, structured product labeling (SPL) status, mechanistic pharmacology, and clinical trial safety data to produce an actionable signal hierarchy.

**Three signals warrant immediate clinical attention**:

**Signal C-1: ICI Combination Myocarditis** -- nivolumab (RxNorm: 1597876) + ipilimumab (RxNorm: 950399) -- fatality rate ~46% in fulminant cases (PMID: 30232222), AEMS ROR approximately 4.5x anti-PD-1 monotherapy baseline, median onset 34 days in combination therapy.

**Signal C-2: Valproic Acid Myelosuppression Amplification** -- valproic acid (RxNorm: 11118) + temozolomide (RxNorm: 10396) -- Grade 3-4 thrombocytopenia documented at 18% versus 8% with TMZ alone in NCT00302159 (PMID: 20823420), driven by CYP2C9 (UniProt: P11712) inhibition increasing TMZ exposure.

**Signal C-3: Chloroquine QTc Prolongation** -- chloroquine (RxNorm: 2393; PubChem CID: 2719) in GBM patients co-administered dexamethasone -- additive hERG block (KCNH2; UniProt: Q12809) plus dexamethasone-induced hypokalemia creates torsades risk requiring baseline and on-treatment ECG monitoring.

### Integrated Priority Matrix

| Priority | Signal | Compounds | Key Metric | Action |
|----------|--------|-----------|------------|--------|
| 1 (Critical) | ICI myocarditis, combination | 1597876 + 950399 | ~46% fatality, ROR 4.5x | Troponin/ECG monitoring |
| 2 (High) | VPA myelosuppression + TMZ | 11118 + 10396 | 18% vs 8% G3/4 thrombocytopenia | CBC monitoring per NCT00302159 |
| 3 (High) | Disulfiram CYP2E1 + proteasome stress | 3008 + 10396 | CYP2E1 inhibition, P-gp effects | NCT03363659 safety review |
| 4 (Moderate) | Chloroquine QTc + dexamethasone | 2393 + dexamethasone | hERG block + hypokalemia | Baseline/on-treatment ECG |
| 5 (Moderate) | Pembrolizumab pneumonitis | 1547545 | PRR 6.4 (95% CI: 4.8-8.5) | DailyMed SPL verification |
| [+2 additional signals in full report] | | | | |

> *This is a redacted sample. Full deliverables include 48+ pages of analysis with citations grounded in retrieved evidence (count varies by topic). Contact: trevor@trevorobeyinc.com*

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 3. Signal Deep-Dive: ICI Combination Myocarditis (C-1)

**Compounds**: Nivolumab (RxNorm: 1597876; PubChem CID: 16654980; RxCUI: 1597874) + Ipilimumab (RxNorm: 950399; PubChem CID: 5311272; RxCUI: 1168653)

**MedDRA PT**: Myocarditis (10028606) | **SOC**: Cardiac disorders

**Signal Metric**: Combination AEMS ROR ~4.5x nivolumab monotherapy baseline; nivolumab monotherapy incidence 0.06%, combination 0.27% (PMID: 30232222)

**Mechanism**: Dual PD-1 + CTLA-4 blockade generates synergistic autoreactive T-cell expansion against cardiac troponin epitopes; CTLA-4 pathway (ipilimumab target) promotes Treg depletion while PD-1 pathway (nivolumab target) sustains effector T-cell persistence in cardiac tissue (doi: 10.1056/NEJMoa1716078)

**Time-to-Onset**: Bimodal -- early peak median 34 days (combination); late peak median 131 days (monotherapy) (PMID: 30232222). Fulminant myocarditis events cluster within the first 3 treatment cycles in ~75% of cases.

**Fatality Context**: ~46% case-fatality rate in fulminant myocarditis; ~75% of fulminant cases cluster within first 3 treatment cycles

**Genetic Risk Modifier**: HLA-DQB1*03:01 associated with pembrolizumab-related myocarditis; likely applicable across anti-PD-1/PD-L1 class (PMID: 30232222)

**DailyMed SPL Surveillance**: Nivolumab SPL Set ID f570b9ef-2882-4c63-8ce6-7df3e42d4d6c -- label history endpoint should be queried for post-2018 cardiac warning updates relative to doi: 10.1056/NEJMoa1716078

**Clinical Action**: Baseline troponin-I and 12-lead ECG prior to cycle 1; repeat at weeks 3, 6, and 12; immediate cardiology referral for any troponin elevation above ULN

### irAE Signal Summary (All ICI Compounds)

| Drug | RxNorm | Primary irAE | MedDRA PT | Estimated AEMS ROR | Key Reference |
|------|----------|-------------|-----------|---------------------|---------------|
| Ipilimumab | 950399 | Colitis | 10009888 | 8.3 (95% CI: 6.1-11.3) | PMID: 28552849 |
| Ipilimumab | 950399 | Myocarditis | 10028606 | 4.1 (95% CI: 2.2-7.6) | PMID: 30232222 |
| Pembrolizumab | 1547545 | Pneumonitis | 10035742 | 6.4 (95% CI: 4.8-8.5) | PMID: 28552849 |
| Nivolumab | 1597876 | Hepatitis | 10019663 | 3.7 (95% CI: 2.6-5.2) | doi: 10.1056/NEJMoa1716078 |
| Atezolizumab | 1792776 | Hepatitis | 10019663 | 2.9 (95% CI: 1.8-4.7) | PMID: 29768166 |
| Durvalumab | 1922380 | Pneumonitis | 10035742 | 4.2 (95% CI: 2.9-6.1) | PMID: 29768166 |
| Nivo + Ipi | 1597876 + 950399 | Myocarditis | 10028606 | ~4.5x monotherapy | PMID: 30232222 |

[Full report includes 4 additional detailed signal analyses: VPA myelosuppression, disulfiram CYP2E1, chloroquine QTc, pembrolizumab pneumonitis, metformin lactic acidosis, and mebendazole hepatotoxicity]

> *This is a redacted sample. Full deliverables include 48+ pages of analysis with citations grounded in retrieved evidence (count varies by topic). Contact: trevor@trevorobeyinc.com*

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 4. Citation Summary

**Total Verified Citations**: 41

| Citation Type | Count | Source Database |
|---------------|-------|-----------------|
| RxNorm | 12 | rxnav.nlm.nih.gov |
| PubChem CID | 9 | pubchem.ncbi.nlm.nih.gov |
| PMID | 8 | pubmed.ncbi.nlm.nih.gov |
| UniProt | 7 | uniprot.org |
| NCT | 3 | clinicaltrials.gov |
| DOI | 1 | doi.org |
| ChEMBL | 1 | ebi.ac.uk/chembl |

Every identifier in this report is independently verifiable in its source database. For example: PMID: 30232222 resolves to the ICI-associated myocarditis systematic review in the Journal of the American College of Cardiology (2018).

> *This is a redacted sample. Full deliverables include 48+ pages of analysis with citations grounded in retrieved evidence (count varies by topic). Contact: trevor@trevorobeyinc.com*

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 5. Sample Citation Index

10 representative rows from the full 42-row citation index:

| Citation Type | Identifier | Context |
|---------------|------------|---------|
| PMID | 30232222 | Cardiac irAE time-to-onset temporal pattern analysis; ~46% fatality rate in fulminant ICI myocarditis |
| PMID | 28552849 | Pembrolizumab pneumonitis PRR: 6.4; ipilimumab colitis ROR: 8.3 |
| PMID | 20823420 | VPA + TMZ Grade 3-4 thrombocytopenia 18% versus 8% TMZ alone (NCT00302159) |
| RxNorm | 1597876 | Nivolumab (Opdivo) -- anti-PD-1; combination myocarditis signal with ipilimumab |
| RxNorm | 950399 | Ipilimumab (Yervoy) -- anti-CTLA-4; highest per-drug irAE burden as monotherapy |
| NCT | NCT00302159 | Valproic acid + temozolomide in GBM/anaplastic glioma; myelosuppression data |
| PubChem CID | 16654980 | Nivolumab compound identifier; cross-linked to RxNorm 1597876 and RxCUI 1597874 |
| UniProt | P11712 | CYP2C9 enzyme -- valproic acid inhibits, reducing TMZ clearance |
| DOI | 10.1056/NEJMoa1716078 | NEJM: ICI cardiac adverse events mechanism and surveillance recommendations |
| ChEMBL | CHEMBL2907643 | Pembrolizumab bioactivity identifier; cross-linked to RxNorm 1547545 |

Full deliverable contains 42 citation rows across 7 identifier types with source task attribution and context snippets.

> *This is a redacted sample. Full deliverables include 48+ pages of analysis with citations grounded in retrieved evidence (count varies by topic). Contact: trevor@trevorobeyinc.com*

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 6. Schema Definition

### Citation Index Schema (CSV)

| Column | Type | Description | Nullable |
|--------|------|-------------|----------|
| citation_type | string | Identifier type (PMID, NCT, CID, DOI, UniProt, ChEMBL, RxNorm) | No |
| identifier | string | The citation identifier value | No |
| source_task | string | Agent task ID that produced this citation | No |
| context_snippet | string | Surrounding text context (80 chars) | Yes |

### Enterprise Delivery Schema (Snowflake / AWS Data Exchange)

| Column | Type | Description |
|--------|------|-------------|
| TARGET_ID | VARCHAR | Unique alphanumeric identifier (e.g., Ensembl ID) |
| DISEASE_INDICATION | VARCHAR | ICD-10 or SNOMED CT classification |
| EVIDENCE_SCORE | FLOAT | Deterministic association score (0.0-1.0) |
| CITATION_DENSITY | INTEGER | Count of unique primary literature sources |
| PRIMARY_PMID_ARRAY | VARIANT | JSON array of PubMed IDs for immediate auditability |
| PHARMACO_MODULATION | VARCHAR | Mechanism of action classification |
| PROVENANCE_HASH | VARCHAR | SHA-256 hash from chain-hashed evidence ledger |

Dynamic data masking enforced on EVIDENCE_SCORE and PRIMARY_PMID_ARRAY for non-entitled viewers. Evidence scores deterministically computed from citation density + study quality weighting + replication count.

### Delivery Options

| Format | Platform | Tier |
|--------|----------|------|
| Markdown + CSV | Manual secure transfer | Standard / Premium |
| JSON / CSV via cloud | Snowflake Secure Data Sharing | Enterprise |
| JSON / CSV via cloud | AWS Data Exchange | Enterprise |
| JSON / CSV via cloud | Google Cloud BigQuery | Enterprise |
| Structured JSON API | POST /api/v1/research | Enterprise Subscription |
| JSONL export | Webhook delivery | Enterprise Subscription |

> *This is a redacted sample. Full deliverables include 48+ pages of analysis with citations grounded in retrieved evidence (count varies by topic). Contact: trevor@trevorobeyinc.com*

---

###### SAMPLE DELIVERABLE -- Trevor Robey Inc Agents | Biomedical Research Intelligence

## 7. Engagement Options

This sample corresponds to the **Pharmacovigilance Pack**. The full offering ladder:

| Tier | SKU | Description | ICP | Price |
|---|---|---|---|---|
| **Primary** | **Investor Pre-Mortem** | Per-asset risk dossier — trial design + comparable failures + KOL sentiment + IP runway. Every claim PMID/NCT/ChEMBL-traced. 5–10 business days, written Speed SLA. | Biotech hedge funds, biotech-specialist VC, pharma BD/licensing | **$9,950 / $14,950 / $19,950 (+ KOL primary)** |
| **Flanking primary** | **Failed Trial Archaeology** | Structured post-mortem of Phase 2/3 terminations in a single mechanism. NCT-indexed failure pattern matrix. | Pharma R&D CI, biotech VC diligence | **$14,950** |
| Tactical | Conference Synthesis Brief | 500+ ASCO/ESMO/AACR abstracts synthesized in 24–48 hours. | Pharma R&D, investors, BD | **$4,950 / conference** |
| Tactical | Trial Design Benchmark Pack | Comparative Phase 3 structure analysis vs **up to 20** comparable programs — allocation, masking, intervention model, arms, enrollment, primary endpoints, sponsor class. Cohort is reported as **N of M eligible** under a stated selection rule; where an indication has fewer than 20 eligible programs the pack covers the **entire** eligible population and says so. | Biotech R&D, pharma CI | **$4,950** |
| Tactical | **Scoped Research Pack** | One agreed **biomedical** research question, scoped in writing before the run and answered through the **full citation-integrity gate** — same guarantee as every other gated SKU. Bounded to a **single question at fixed depth**; the bound is what makes a flat price honest. If the evidence does not exist, the bundle ships the **search-coverage ledger documenting exactly that**, never a padded report. | Medical-startup founders (SBIR/STTR Phase I), investors with a question outside the standard SKUs | **$4,950** |
| Tactical | Cross-Silo Connector Report | Hidden mechanistic links across ChEMBL/PubMed/CT.gov as repurposing opportunities. | Pharma R&D, biotech partnerships | **$9,950 – $24,950** |
| Tactical | Plain-Language Patient Brief | Regulatory-compliant PLS at 8th-grade health-literacy level (EU CTR 536/2014). | Patient Advocacy Groups, trial sponsors | **$2,500** |
| Tactical (demoted) | Pharmacovigilance Pack | Safety-signal + AEMS/FAERS analysis with a graded citation-integrity ledger. Existing marketplace listings preserved. | Mid-market pharma safety teams | $2,500 – $4,950 |

Research artifacts only — not validated for clinical decision support. No PHI is hosted, transmitted, or processed.

---

**Contact**: trevor@trevorobeyinc.com
**Web**: https://trevorobeyinc.com

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*

*This report was produced using AI-assisted research synthesis with human editorial oversight. All citations are independently verifiable in their respective source databases.*

*This is a redacted sample. Full deliverables include 48+ pages of original analysis, complete citation indices, evidence provenance appendices, and chain-hashed integrity verification. Contact trevor@trevorobeyinc.com to request the full deliverable or to scope an engagement from the ladder above.*

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
