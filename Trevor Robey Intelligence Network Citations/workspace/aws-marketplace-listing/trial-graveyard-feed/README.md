# Trial Graveyard Feed — AWS Data Exchange product package

The business's first AWS Data Exchange product: a citation-traced register of terminated,
withdrawn and suspended ClinicalTrials.gov trials by therapeutic area, each with the sponsor's
stated stop reason. Deterministic render of public-domain registry data (no LLM, no PHI, no
DrugBank, ChEMBL not used). Every row carries `https://clinicaltrials.gov/study/<NCT>`.

**State, 2026-10-21:** nothing is uploaded to AWS. The account is cleared to publish paid and free
products. A 12-area refresh is staged and reviewed in `refresh-2026-10-21/`. The shipped `data/`
folder is still the 2026-07-30 build (6 areas) until the operator approves promotion.

## Coverage of the staged refresh (as of 2026-10-21)

| Area | Paid rows | Census | Sponsor-stated reason |
|---|---|---|---|
| Alzheimer disease | 435 | complete | 373 |
| amyotrophic lateral sclerosis | 116 | complete | 105 |
| breast cancer | 2,000 of 2,034 | **partial** (2,000-record cap) | 1,780 |
| glioblastoma | 389 | complete | 351 |
| idiopathic pulmonary fibrosis | 78 | complete | 71 |
| multiple sclerosis | 393 | complete | 336 |
| non-small cell lung cancer | 1,417 | complete | 1,267 |
| nonalcoholic steatohepatitis | 154 | complete | 141 |
| pancreatic cancer | 745 | complete | 691 |
| Parkinson disease | 415 | complete | 373 |
| prostate cancer | 1,051 | complete | 962 |
| sickle cell disease | 180 | complete | 173 |
| **Total** | **7,373 rows, 6,937 distinct trials** | 11 of 12 complete | **6,623 (89.8%)** |

- **Breast cancer is not a complete census.** `ctgov-supplemental.js` stops a census at
  `CENSUS_MAX_RECORDS_DEFAULT = 2000` (a runaway guard; the hard ceiling is 5,000), and
  `build-graveyard-feed.js` does not pass `maxRecords`. Its notice says PARTIAL. Never call it
  "all" or "complete".
- **Protocol-churn columns are empty on every row.** ClinicalTrials.gov has refused the
  change-history endpoint with HTTP 403 since 2026-10-08, so `amendment_risk_band` is UNKNOWN
  throughout. The feed does not spoof headers to get around this. Selling the band is paused.
- **326 trials appear in two or more areas** (for example `NCT04541875` is in idiopathic pulmonary
  fibrosis, pancreatic cancer and sickle cell disease, and `NCT02711137` is in five). `nct_id` is
  unique within an area, not across areas. Any multi-area tier states its distinct count, and the
  data dictionary tells buyers to deduplicate on `nct_id`.
- **Rows change between pulls.** From July to October, glioblastoma gained 5 trials and lost 6.
  The registry's response order also changes, so each free sample (the first 5 rows) differs from
  July's. Never promise reproducible month-over-month diffs.

The generated copy in all 12 areas was corrected on 2026-10-21 (marker
`<!-- copy corrected 2026-10-21 -->`). The free data dictionaries named `register.csv` and
`citation-index.csv`, files the free tier does not have. Both dictionaries now explain the empty
churn columns and the cross-area duplicates. The sample notices now give the 403 refusal as the
cause instead of "sampled deliberately". **The generator still writes the old text**, so re-apply
the fix after any rebuild until `scripts/build-graveyard-feed.js` is corrected.

## Free / paid split

| | Free Sample | Paid tiers |
|---|---|---|
| Rows | first 5 per area | every stopped trial the registry returns for each area's condition query (stated as N of M) |
| Schema | identical | identical |
| Refresh | one-time sample | monthly revisions |
| Files per area | `free/register-sample.csv`, `citation-index-sample.csv`, `data-dictionary.md`, `SAMPLE-NOTICE.md` | `paid/register.csv`, `citation-index.csv`, `data-dictionary.md` |

The raw facts can be re-scraped from ClinicalTrials.gov, so the value is breadth plus monthly
currency, ready to load. Tiers and prices: `../../../product-strategy/tier-ladder-DRAFT-2026-10-20.md`
(the prices are the operator's of 2026-10-20; writing them into `offers.md` is on hold by the
operator's call of 2026-10-21).

## Refresh / extend

Rebuild every area into a dated staging folder. This never overwrites `data/`:

```
bash "/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations/scripts/refresh-graveyard-feeds.sh"
```

- The generator runs a full census since 2026-07-30. `--pageSize` is accepted and ignored. The
  old "pageSize defaults to 20" warning (and the `trinc-engineering:feed-refresh` skill text that
  repeats it) is obsolete.
- Omitting `--out` on a single-area build writes to `workspace/distribution/graveyard-feed/`, a
  different tree that holds a stale June build. That tree is not the product.
- To add an area, add its condition term to `CONDITIONS` in `scripts/refresh-graveyard-feeds.sh`.
- Parquet for paid tiers is not built (Enterprise depends on it).

## Files in this package

- `product-description.md`: paste-ready listing copy, including the coverage table
- `offers.md`: offer terms (price **[DECIDE]**, on hold)
- `UPLOAD-RUNBOOK.md`: console walkthrough (data sets, product, offer, review, monthly revision)
- `LISTING-DRAFT-2026-10-20.md`: the draft these were built from (superseded)
- `NOTICE.md`: sources, licence, no-PHI
- `data/<area>/{free,paid}/`: shipped assets (2026-07-30 build, 6 areas)
- `refresh-2026-10-21/<area>/{free,paid}/`: reviewed refresh (12 areas), awaiting promotion
- Subscription agreement: AWS's standard DSA, selected in the offer. The custom
  `../../../03-platforms/aws-data-exchange/data-subscription-agreement.md` stays parked until
  counsel reviews it.
