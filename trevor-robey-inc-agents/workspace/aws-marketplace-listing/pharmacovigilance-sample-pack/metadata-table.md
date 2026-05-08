# Listing metadata — Pharmacovigilance Sample Pack

> Paste these values into the AWS Data Exchange listing wizard's metadata fields.

---

## Standard AWS Data Exchange metadata

| AWS Field | Value |
|---|---|
| **Product type** | Files data set (CSV) |
| **Pricing model** | Free |
| **Update frequency** | Static (one-time sample); paid subscribers receive on-demand updates per mission |
| **Time period coverage** | Adverse-event reporting through 2024-Q4; literature citations span 2008-2024 |
| **Geographic coverage** | Global (FDA AEMS is US-centric; literature and ClinicalTrials.gov are global) |
| **Data format** | CSV (RFC 4180, UTF-8, ASCII content) |
| **File count** | 2 (signal-register.csv, citation-index.csv) |
| **Total size** | < 10 KB combined (sample tier) |
| **Row count** | 10 signals + 29 citations = 39 rows total |
| **Anonymization** | Not applicable - no personal data; all citations are public-database identifiers |
| **PHI status** | No PHI handled or transmitted |
| **HIPAA status** | Not applicable - no protected health information |
| **De-identification method** | Not applicable - sources are public databases |
| **Original publisher** | Trevor Robey Intelligence Network Citations LLC, a California limited liability company; wordmark "Trevor Robey, INC." (INC = Intelligence Network Citations) |
| **Source databases** | FDA AEMS / OpenFDA, DailyMed, RxNorm, PubMed, ClinicalTrials.gov, ChEMBL, UniProt, PubChem, MedDRA |
| **License (compiled product)** | Research-use-only, no redistribution (see DSA) |
| **License (upstream sources)** | Mixed - mostly US Government public domain; ChEMBL CC-BY-SA 3.0; see Source License Register in companion deliverable |

---

## Key fields reference (for buyer search and filtering)

### signal-register.csv key fields

- `signal_id` (e.g., C-1, C-2, I-1) - stable signal identifier
- `compound_1_rxnorm` / `compound_2_rxnorm` - drug normalization for cross-source joins
- `meddra_pt_code` - MedDRA Preferred Term code for AE classification
- `aems_metric` / `aems_metric_value` - disproportionality measure type and value
- `severity_tier` - Critical / High / Moderate prioritization
- `primary_pmid` / `primary_doi` / `primary_nct` - canonical citation identifier

### citation-index.csv key fields

- `identifier_type` - PMID / NCT / DOI / RxNorm / ChEMBL / PubChem CID / UniProt / MedDRA PT / DailyMed SPL
- `identifier` - the citation value (resolves in source_database)
- `source_database` - canonical database URL stem
- `signal_id` - foreign key to signal-register.csv

---

## Taxonomy and categorization

- **Primary AWS Data Exchange category**: Healthcare & Life Sciences
- **Therapeutic area**: Oncology (immuno-oncology focus), Neurology (GBM repurposing)
- **Drug classes covered**: Anti-PD-1, Anti-PD-L1, Anti-CTLA-4, alkylating agents, antimalarials, anticonvulsants
- **Use case fit**: Pharmacovigilance, drug safety surveillance, due-diligence, investor research, BD/licensing diligence
- **Buyer persona fit**: Biotech investors, hedge fund analysts, pharma BD, pharma CI, patient advocacy groups
