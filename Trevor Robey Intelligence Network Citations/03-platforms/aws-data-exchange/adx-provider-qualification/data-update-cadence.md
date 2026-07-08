# Trevor Robey, INC. — Data Set Update Policy

_Satisfies the ADX provider criterion: a means to keep data regularly updated._

- **Refresh cadence:** Each published data product is refreshed on a defined schedule from
  its public-domain sources. Standard cadence is **quarterly**; high-velocity products
  (e.g., pharmacovigilance signals from openFDA / ClinicalTrials.gov) are refreshed
  **monthly**. The cadence for each product is stated in its listing description.
- **Event-driven (out-of-cycle) updates:** We publish an interim revision when (a) a cited
  primary source is retracted or corrected (detected by our automated Crossref retraction
  screen), (b) a material upstream source correction is published, or (c) a subscriber
  reports a verified error.
- **Versioning & changelog:** Every refresh is published as a new AWS Data Exchange
  **revision** with a changelog (records added / updated / removed, source-version changes).
  Prior revisions remain available per ADX revision history.
- **Subscriber notification:** Subscribers are notified of new revisions via AWS Data
  Exchange's native revision mechanism.
- **Source set (all public-domain / open, no PHI):** PubMed (NLM), ClinicalTrials.gov (NIH),
  openFDA, RxNorm, PubChem, ChEMBL (EMBL-EBI), UniProt. DrugBank is excluded pending a
  commercial license.
