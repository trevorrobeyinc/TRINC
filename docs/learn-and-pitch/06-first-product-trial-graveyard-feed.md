# 06 — The first product: Trial Graveyard Feed

> **Not for sale yet.** Nothing is uploaded to AWS and nothing is listed. Its prices are on hold. It belongs on
> the learning deck; **never offer it in a pitch.** [src: `ENGINE/workspace/aws-marketplace-listing/trial-graveyard-feed/README.md`; `STATUS.md`]

## What it is

A register of **terminated, withdrawn and suspended clinical trials**, one data set per therapeutic area. Each
row carries the sponsor's own stated stop reason, quoted as written (or "(none stated by sponsor)" — a reason
is never inferred), and a link to `https://clinicaltrials.gov/study/<NCT>`.

It is built **by code from public registry data**: no language model, no patient data, and no data from
sources the business holds no licence to redistribute. It is a data product for AWS Data Exchange, not a
report. [src: feed `README.md`, opening]

## The staged refresh (2026-10-21, reviewed, 0 problems)

| Area | Paid rows | Census |
|---|---|---|
| Alzheimer disease | 435 | complete |
| amyotrophic lateral sclerosis | 116 | complete |
| breast cancer | 2,000 of 2,034 | **partial** (a 2,000-record safety cap) |
| glioblastoma | 389 | complete |
| idiopathic pulmonary fibrosis | 78 | complete |
| multiple sclerosis | 393 | complete |
| non-small cell lung cancer | 1,417 | complete |
| nonalcoholic steatohepatitis | 154 | complete |
| pancreatic cancer | 745 | complete |
| Parkinson disease | 415 | complete |
| prostate cancer | 1,051 | complete |
| sickle cell disease | 180 | complete |
| **Total** | **7,373 rows, 6,937 distinct trials** | 11 of 12 complete |

About **89.8%** of rows (6,623) carry a sponsor-stated reason. [src: feed `README.md` → Coverage]

## The honest caveats (each one must survive into any listing copy)

- **Breast cancer is not a complete census.** Never call it "all" or "complete".
- **The protocol-churn columns are empty** on every row, because ClinicalTrials.gov refuses the
  change-history endpoint (HTTP 403 since 2026-10-08). The amendment-risk band is UNKNOWN throughout.
- **326 trials appear in two or more areas.** `nct_id` is unique within an area, not across areas.
- **Rows change between pulls** (glioblastoma gained 5 trials and lost 6 between July and October). Never
  promise reproducible month-over-month diffs.

[src: feed `README.md`]

## Free and paid

| | Free Sample | Paid tiers |
|---|---|---|
| Rows | first 5 per area | every stopped trial the registry returns for the area's condition query, stated as N of M |
| Schema | identical | identical |
| Refresh | one-time | monthly revisions |

[src: feed `README.md` → Free / paid split]

## What is left before it can be listed (Trevor's decisions)

Which areas launch first (and whether breast cancer is in version 1), promoting the refresh into the
shipped `data/` folder, the price, and the AWS console steps. All were **deferred by Trevor on 2026-10-21**
until the business-engine work is set up. [src: `STATUS.md`, queue item 3]

Trevor set draft feed prices on 2026-10-20 (Free Sample, Essentials, Professional, Enterprise) and put them
back **on hold** on 2026-10-21. They must not appear on any slide. [src: `ENGINE/product-strategy/tier-ladder-DRAFT-2026-10-20.md`, Section A]
