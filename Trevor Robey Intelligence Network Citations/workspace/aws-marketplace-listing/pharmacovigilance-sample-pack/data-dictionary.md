# Data Dictionary — Pharmacovigilance Sample Pack

Schema documentation for the two CSV files in this sample pack.

---

## File 1: signal-register.csv

**Description**: One row per pharmacovigilance signal. Each row represents a discrete adverse-event association between a drug (or drug combination) and a clinical effect, derived from FDA AEMS disproportionality analysis and peer-reviewed literature.

**Encoding**: UTF-8, RFC 4180 CSV, ASCII content only.
**Header row**: Yes (row 1).
**Row count**: 10 signals.

### Schema

| Column | Type | Required | Allowed Values / Format | Description |
|---|---|---|---|---|
| `signal_id` | string | Yes | Format: `[CIH]-[0-9]+`. Primary "C" series for combination/critical signals; "I" series for individual-drug signals derived from the irAE class summary. | Stable identifier for the signal across both CSVs. Foreign key in citation-index.csv. |
| `signal_label` | string | Yes | Free text, ASCII | Human-readable signal name |
| `compound_1` | string | Yes | Drug INN / generic name | Primary drug in the signal |
| `compound_1_rxnorm` | integer | Yes | RxNorm RxCUI | RxNorm normalized identifier for compound_1; resolves at https://rxnav.nlm.nih.gov/REST/rxcui/{value}.json |
| `compound_2` | string | No | Drug INN / generic name OR empty | Second drug if signal is for a combination; empty if monotherapy signal |
| `compound_2_rxnorm` | integer | No | RxNorm RxCUI OR empty | Same format as compound_1_rxnorm |
| `meddra_pt` | string | No | MedDRA Preferred Term in lowercase | Adverse event preferred term |
| `meddra_pt_code` | integer | No | MedDRA PT numeric code, 8 digits | MedDRA preferred term code; resolves at meddra.org |
| `soc` | string | No | MedDRA System Organ Class | High-level organ-system classification |
| `aems_metric` | string | No | One of: AEMS ROR, AEMS PRR, Combination AEMS ROR, qualitative-mechanism descriptor | Disproportionality measure type or qualitative metric description |
| `aems_metric_value` | string | No | Free text including the value, units, confidence interval, and comparison context | Quantitative or contextualized result |
| `severity_tier` | string | Yes | One of: Critical, High, Moderate | Provider-assigned prioritization for the signal |
| `primary_pmid` | string | No | PubMed ID, integer string OR empty | Primary peer-reviewed reference; resolves at pubmed.ncbi.nlm.nih.gov |
| `primary_doi` | string | No | DOI string OR empty | Alternative primary reference if no PMID |
| `primary_nct` | string | No | NCT##### format OR empty | Primary clinical trial reference if applicable |
| `recommended_action` | string | No | Free text | Clinical action protocol summary |

### Example row

```
C-1,"ICI Combination Myocarditis",Nivolumab,1597876,Ipilimumab,950399,Myocarditis,10028606,Cardiac disorders,Combination AEMS ROR,4.5x monotherapy baseline,Critical,30232222,10.1056/NEJMoa1716078,,Baseline troponin-I and 12-lead ECG prior to cycle 1; repeat at weeks 3 6 and 12; immediate cardiology referral for any troponin elevation above ULN
```

---

## File 2: citation-index.csv

**Description**: One row per cited identifier. Provides the auditable provenance trail for every signal in signal-register.csv. Each row maps a single public-database identifier to the signal(s) that cite it.

**Encoding**: UTF-8, RFC 4180 CSV, ASCII content only.
**Header row**: Yes (row 1).
**Row count**: 29 citations.

### Schema

| Column | Type | Required | Allowed Values / Format | Description |
|---|---|---|---|---|
| `identifier_type` | string | Yes | One of: PMID, NCT, DOI, RxNorm, ChEMBL, "PubChem CID", UniProt, "MedDRA PT", "DailyMed SPL" | Identifier system / source database type |
| `identifier` | string | Yes | Format depends on identifier_type. PMID = integer; NCT = `NCT[0-9]{8}`; DOI = `10.[0-9]+/.+`; RxNorm = integer; ChEMBL = `CHEMBL[0-9]+`; PubChem CID = integer; UniProt = 6-10 char accession; MedDRA PT = 8-digit integer; DailyMed SPL = UUID. | The citation value |
| `source_database` | string | Yes | Canonical database hostname (e.g., pubmed.ncbi.nlm.nih.gov) | Where the identifier resolves |
| `signal_id` | string | Yes | Format: `[CIH]-[0-9]+`. Foreign key referencing signal-register.csv. | Which signal this citation supports |
| `context` | string | No | Free text, ASCII | Brief context describing why this citation supports this signal |

### Example row

```
PMID,30232222,pubmed.ncbi.nlm.nih.gov,C-1,Cardiac irAE time-to-onset temporal pattern analysis; ~46% fatality rate in fulminant ICI myocarditis; HLA-DQB1*03:01 genetic risk modifier
```

### Identifier resolution URLs

| identifier_type | Resolution URL pattern |
|---|---|
| PMID | https://pubmed.ncbi.nlm.nih.gov/{identifier}/ |
| NCT | https://clinicaltrials.gov/study/{identifier} |
| DOI | https://doi.org/{identifier} |
| RxNorm | https://rxnav.nlm.nih.gov/REST/rxcui/{identifier}.json |
| ChEMBL | https://www.ebi.ac.uk/chembl/compound_report_card/{identifier}/ |
| PubChem CID | https://pubchem.ncbi.nlm.nih.gov/compound/{identifier} |
| UniProt | https://www.uniprot.org/uniprotkb/{identifier} |
| MedDRA PT | (paid licensee access via meddra.org; identifier is the PT code) |
| DailyMed SPL | https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={identifier} |

---

## Cross-file integrity

Every `signal_id` value in signal-register.csv MUST appear at least once in citation-index.csv. Conversely, every `signal_id` in citation-index.csv MUST exist in signal-register.csv.

Provider validates this invariant on every release; the included sample is verified at publication time.

## Versioning

This sample pack is versioned by AWS Data Exchange revision. Schema changes will be communicated via the listing's "What's New" entry and a versioned data-dictionary update.
