# Trial Graveyard Feed — AWS Data Exchange Product Package

Upload-ready package for the **Trial Graveyard Feed**: a citation-traced register of terminated /
withdrawn / suspended clinical trials by therapeutic area, with each trial's sponsor-stated stop
reason and a per-trial protocol-amendment-risk band. **Launch TA: glioblastoma** (`data/glioblastoma/`).

## What this is
- **Deterministic** (no LLM) render of **public-domain ClinicalTrials.gov** stopped-trial records.
- Every row resolves to `https://clinicaltrials.gov/study/<NCT>`. **No PHI. No DrugBank. ChEMBL not used.**
- An AWS Data Exchange **Files** data set — ONE product, two offers (free sample + paid full feed).

## Free / paid split (carved)
| | Free offer (evaluation) | Paid offer (subscription) |
|---|---|---|
| Rows | first 5 (sample) | **ALL** stopped trials for the TA |
| Schema | identical | identical |
| Refresh | one-time sample | **monthly** revisions |
| Files | `free/register-sample.csv` (+ citation-index, data-dictionary, SAMPLE-NOTICE) | `paid/register.csv` (+ citation-index, data-dictionary) |

**Rationale:** the raw public facts are re-scrapable from CT.gov, so value capture = **completeness + monthly currency** (and Parquet on paid). The free sample proves schema/quality and seeds the funnel; the paid feed sells the whole, current TA. The high-ticket bespoke dossiers stay as **private offers**, not here.

## Launch TA snapshot (glioblastoma, generated live)
12 stopped trials · amendment-risk **5 HIGH / 3 MODERATE / 4 LOW** · every row NCT-resolvable.

## Reproduce / extend
Regenerate or refresh a TA:
```
node scripts/build-graveyard-feed.js --condition "<TA>" \
  --out workspace/aws-marketplace-listing/trial-graveyard-feed/data/<slug> \
  --asOf <YYYY-MM-DD> --pageSize 25 --teaserRows 5
```
- **#1 More TAs:** run the generator per TA (NSCLC, pancreatic cancer, ALS, NASH — high-churn = biggest monthly deltas).
- **#2 Monthly refresh:** re-run with a new `--asOf` → upload as a new ADX revision.
- **#3 Parquet (paid):** TODO — add a CSV→Parquet step for the paid assets (documented in UPLOAD-RUNBOOK).

## Files in this package
- `product-description.md` — ADX listing copy
- `offers.md` — free + paid offer terms (price **[DECIDE]**)
- `UPLOAD-RUNBOOK.md` — ADX upload steps + monthly refresh + add-a-TA + Parquet
- `NOTICE.md` — sources / license / no-PHI
- `data/<TA>/{free,paid}/` — the generated assets
- DSA: [`../../../03-platforms/aws-data-exchange/data-subscription-agreement.md`](../../../03-platforms/aws-data-exchange/data-subscription-agreement.md) (DRAFT — counsel)
