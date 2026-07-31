# Trial Graveyard Feed - Data Dictionary

Indication / therapeutic area: Alzheimer disease - as of 2026-07-30

Citation-traced register of terminated, withdrawn, or suspended ClinicalTrials.gov trials.
Rendered deterministically from public CT.gov records (no LLM). Every row resolves to
https://clinicaltrials.gov/study/<nct_id>. Public-domain source; no PHI.

## register.csv
| Column | Description |
|---|---|
| nct_id | ClinicalTrials.gov identifier (the provenance key). |
| title | Brief title of the trial. |
| overall_status | TERMINATED / WITHDRAWN / SUSPENDED. |
| phase | Trial phase(s). |
| why_stopped | Sponsor-stated stop reason, verbatim; '(none stated by sponsor)' when absent. |
| protocol_versions | Number of protocol versions in the change history (blank if not retrieved). |
| most_amended_modules | Protocol modules amended most often (semicolon-separated). |
| amendment_risk_band | HIGH (>=10 versions) / MODERATE (>=5) / LOW (<5) / UNKNOWN (no history). |
| history_first / history_last | First/last change-history dates. |
| study_url | Resolvable ClinicalTrials.gov study URL. |
| indication | The therapeutic area this feed covers. |
| as_of | The feed revision date. |

## citation-index.csv
| Column | Description |
|---|---|
| identifier_type | Always NCT for this feed. |
| identifier | The NCT id. |
| source_database | ClinicalTrials.gov. |
| nct_id | Foreign key back to register.csv. |
| context | Status + stop reason snippet. |

Cross-file integrity: every nct_id in register.csv appears exactly once in citation-index.csv.