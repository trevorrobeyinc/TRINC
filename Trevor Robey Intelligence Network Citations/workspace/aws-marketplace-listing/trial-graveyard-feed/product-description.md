# Trial Graveyard Feed — Glioblastoma (launch TA)

## Short description (<= 200 chars)
Citation-traced register of terminated/withdrawn/suspended glioblastoma trials with sponsor stop-reasons and a per-trial protocol-amendment-risk band. Public-domain, no PHI, refreshed monthly.

## Long description
The Trial Graveyard Feed is a monthly, citation-traced dataset of every terminated, withdrawn, or suspended ClinicalTrials.gov trial in a therapeutic area. For each trial it includes the sponsor's stated stop reason (verbatim, or an explicit "(none stated by sponsor)"), protocol churn (version count + the most-amended protocol modules), and a LOW / MODERATE / HIGH protocol-amendment-risk band. Every row resolves to a public ClinicalTrials.gov record (NCT) via an included citation index. The feed is rendered **deterministically** from public records — no model-generated content. Use it to avoid re-funding a path others have already abandoned, and to anticipate where a fresh protocol is most likely to need a costly amendment.

## What's included
- `register.csv` — one row per stopped trial: `nct_id, title, overall_status, phase, why_stopped, protocol_versions, most_amended_modules, amendment_risk_band, history_first, history_last, study_url, indication, as_of`
- `citation-index.csv` — the NCT provenance trail (every register row appears here)
- `data-dictionary.md`

**Free sample:** the first 5 trials, identical schema, so you can evaluate quality and format.
**Paid subscription:** the complete therapeutic-area feed, refreshed monthly as new revisions.

## Categories
Healthcare, Life Sciences. *(AWS Data Exchange allows a maximum of two — pick these two.)*

## Data eligibility
Sourced exclusively from public-domain ClinicalTrials.gov records (NIH/NLM). Trial-level facts only. **No PHI**, no individually identifiable patient data. Maps to AWS's permitted "aggregated or anonymized research findings" example and the Publicly Available Information category.

## Disclaimer (research-use-only)
Research and informational use only. Not clinical decision support; not for the diagnosis, treatment, cure, or prevention of any disease, or for any patient-care or clinical decision. Each row reflects a public registry record as of the stated `as_of` date; the registry may update or withdraw records thereafter.

> Provider: Trevor Robey, INC. (wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company). Contact: trevor@trevorobeyinc.com · https://trevorobeyinc.com
