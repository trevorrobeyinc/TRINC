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
| Rows | first 5 (sample) | the **complete register for the condition query** — every stopped trial the registry counts, stated as N of M |
| Schema | identical | identical |
| Refresh | one-time sample | **monthly** revisions |
| Files | `free/register-sample.csv` (+ citation-index, data-dictionary, SAMPLE-NOTICE) | `paid/register.csv` (+ citation-index, data-dictionary) |

**Rationale:** the raw public facts are re-scrapable from CT.gov, so value capture = **completeness + monthly currency** (and Parquet on paid). The free sample proves schema/quality and seeds the funnel; the paid feed sells the complete, current register for the query. The high-ticket bespoke dossiers stay as **private offers**, not here.

> ### ✅ RESOLVED 2026-07-30 — the clamp is gone and every TA has been regenerated
> Until 2026-07-30 `scripts/build-graveyard-feed.js` applied a `--pageSize` default of 20 with a hard cap
> of 50, on top of the fetcher's own 50-row cap. The **double clamp's fingerprint was visible in the
> committed data: six different diseases all landed on exactly 50 rows.** Meanwhile this file said "ALL
> stopped trials for the TA", `offers.md` said "(complete TA)" as an offer term, and the generated
> `SAMPLE-NOTICE.md` said "the complete feed (all N …)" where **N was the clamped number**. The claim and
> the artifact disagreed. Nothing had been published (price is still `[DECIDE]`), so this was caught
> before any sale.
>
> The generator now walks the full result set. **All six TAs regenerated 2026-07-30, every one
> `censusComplete=true`:**
>
> | Therapeutic area | Was (clamped) | Now (census) |
> |---|---|---|
> | pancreatic cancer | 50 | **734** |
> | Alzheimer disease | 50 | **428** |
> | glioblastoma | 50 | **390** |
> | sickle cell disease | 50 | **179** |
> | amyotrophic lateral sclerosis | 50 | **114** |
> | idiopathic pulmonary fibrosis | 50 | **76** |
> | **total paid rows** | **300** | **1,921** |
>
> `citation-index.csv` scales 1:1 with the register (verified: 390/390 and 734/734).
>
> **Protocol-churn coverage is deliberately a subset, and this is NOT a defect to fix by raising the
> number.** Change-history is one HTTP call per trial against an undocumented ClinicalTrials.gov
> endpoint, so it is sampled at 40 — the largest sweep measured end-to-end (concurrency 3, 400 ms
> inter-batch pauses, 6.85 s, 0 non-200). Rows outside the sample carry the trial and its stop reason
> with churn columns empty, which is why glioblastoma reports 350 `UNKNOWN` bands out of 390.
> `SAMPLE-NOTICE.md` states the exact split per TA, and the amendment band carries its own sample-size,
> survivorship and threshold disclosures.

## Launch TA snapshot (glioblastoma, regenerated 2026-07-30 under the census fetch)
**390 of 390** stopped trials retrieved (`censusComplete=true`) · amendment-risk **21 HIGH / 11 MODERATE / 8 LOW / 350 UNKNOWN** (UNKNOWN = outside the 40-row churn sample) · every row NCT-resolvable.
*(The previous line here read "12 stopped trials · 5 HIGH / 3 MODERATE / 4 LOW", which matched neither the 50-row file on disk nor the 390-record population.)*

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
