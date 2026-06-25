# Trevor Robey, INC. — Data Quality, Integrity & Security Process

_Satisfies the ADX provider criterion: data free of vulnerabilities; integrity and quality._

- **Citation integrity (core control):** Every factual claim in our reports/datasets
  resolves to a real public primary-source identifier (PubMed PMID, ClinicalTrials.gov NCT,
  ChEMBL ID, or DOI). A runtime grounding gate rejects any unverifiable/ungrounded citation
  before release — we do not ship model-generated citations. A Crossref retraction screen
  flags retracted/withdrawn sources.
- **Provenance & licensing:** All data derives from public-domain / open sources. We honor
  each source license (e.g., ChEMBL CC-BY-SA attribution + ShareAlike; UniProt CC-BY),
  attest to our right to distribute, and exclude any source lacking an appropriate license
  (e.g., DrugBank).
- **No PHI / privacy:** Architectural zero-PHI — no protected health information or
  person-level identifying data is hosted or processed; products are aggregated/anonymized
  research findings. If any record contains publicly-available personal data (e.g., a
  ClinicalTrials.gov investigator name), we enable AWS Data Exchange **subscription
  verification** on that listing.
- **Data QA:** Automated schema validation, deduplication, and completeness checks run
  before each revision; failures block publication.
- **Delivery & vulnerability controls:** Data is delivered as files (PDF/CSV/Parquet) via
  Amazon S3 under AWS Data Exchange. Assets are malware-scanned and checksum-verified before
  publishing; access is least-privilege; credentials live in a secrets manager (never in
  data or code). The production pipeline never auto-publishes — every external release passes
  a manual approval gate.
- **Incident response:** On a discovered data defect or retracted source, we investigate
  ≤ 1 business day, publish a corrected revision, and notify affected subscribers; security
  issues follow the same triage, containment first.
