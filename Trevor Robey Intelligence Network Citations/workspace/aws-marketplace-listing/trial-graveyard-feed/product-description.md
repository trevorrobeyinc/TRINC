# Trial Graveyard Feed — listing copy (paste-ready, 2026-10-21)

Final listing copy for the AWS Marketplace "Create data product" wizard, built from
`LISTING-DRAFT-2026-10-20.md` and the reviewed 2026-10-21 refresh. Every number on this page comes
from `refresh-2026-10-21/` (verified 2026-10-21: register and citation index 1:1 in all 12 areas,
every free sample an exact first-5 subset of its paid feed, 8 of 8 files per area, 0 problems).

**Still open, by the operator's call (2026-10-21, "we'll get to that later"):** which products go
into the first submission, whether breast cancer ships in v1, and the prices. Places that depend
on those are marked `[DECIDE]`. Nothing below sets a price.

The product-level fields are the same for every tier. Only the name suffix and the "What this tier
includes" block change.

---

## Product name

`Trial Graveyard Feed - Stopped Clinical Trials with Sponsor Stop Reasons` (72 characters)

If each tier is its own product (tier ladder, 2026-10-20), append the tier, e.g.
`Trial Graveyard Feed - Professional`. `[DECIDE]` launch scope.

## Short description (188 characters, plain ASCII)

```text
Stopped clinical trials (terminated, withdrawn, suspended) by therapeutic area, each with the sponsor's own stated stop reason and a link to its ClinicalTrials.gov record. No PHI. Monthly.
```

## Categories (AWS allows two)

Healthcare · Life Sciences

## Support contact

`support@trevorobeyinc.com`. AWS shows this address publicly and asks for a managed alias, not a
personal inbox. Send it one test message first to confirm it still lands in Gmail.

## Logo

`01-brand-system/logo-300x150-transparent-inc.png` (PNG, 300 x 150). AWS accepts .png, .jpg and
.jpeg.

## Sensitive information setting

**Option 1: "No personal data that is not otherwise publicly available, and no sensitive
categories of information."** Rows are trial-level registry facts. They contain no person: no
investigator, site staff or patient fields, only NCT IDs, titles, status, phase and the sponsor's
stop reason.

---

## Long description (Markdown; paste everything inside the fence)

```markdown
The Trial Graveyard Feed lists stopped clinical trials (terminated, withdrawn or suspended) from ClinicalTrials.gov, with one data set per therapeutic area. For each trial it gives the sponsor's own stated reason for stopping, quoted verbatim, or an explicit "(none stated by sponsor)". A reason is never inferred, summarized or invented. Every row carries the NCT ID, title, status, phase and a ClinicalTrials.gov study link, and an included citation index ties every row to its public record.

The feed is rendered deterministically from public registry data: no model writes any of it. Use it to see which development paths others have already abandoned, and why, before you fund, license or design a program in the same space.

### Coverage (revision of 2026-10-21)

| Therapeutic area (condition query) | Stopped trials | Census | With a sponsor-stated reason |
|---|---|---|---|
| Alzheimer disease | 435 | complete | 373 (86%) |
| amyotrophic lateral sclerosis | 116 | complete | 105 (91%) |
| glioblastoma | 389 | complete | 351 (90%) |
| idiopathic pulmonary fibrosis | 78 | complete | 71 (91%) |
| multiple sclerosis | 393 | complete | 336 (85%) |
| non-small cell lung cancer | 1,417 | complete | 1,267 (89%) |
| nonalcoholic steatohepatitis | 154 | complete | 141 (92%) |
| pancreatic cancer | 745 | complete | 691 (93%) |
| Parkinson disease | 415 | complete | 373 (90%) |
| prostate cancer | 1,051 | complete | 962 (92%) |
| sickle cell disease | 180 | complete | 173 (96%) |

"Complete" means every stopped trial ClinicalTrials.gov counted for that condition query on the revision date was retrieved.

### How rows are selected

Each area is the registry's answer to one condition query, shown in the table. The registry matches on condition terms, so an area includes multi-condition and basket trials that list the term, and a different name for the same disease can return a different set. A trial that matches more than one area appears in each of those areas' data sets; `nct_id` is unique within an area, so deduplicate on `nct_id` when you combine areas.

### What each area's data set contains

- `register.csv`: one row per stopped trial, with the columns `nct_id, title, overall_status, phase, why_stopped, protocol_versions, most_amended_modules, amendment_risk_band, history_first, history_last, study_url, indication, as_of`
- `citation-index.csv`: the NCT provenance trail; every `nct_id` in the register appears exactly once
- `data-dictionary.md`: column definitions

The protocol-history columns (`protocol_versions` through `history_last`) are empty in the current revision because ClinicalTrials.gov does not currently serve change history to this feed. They stay in the schema so a later revision can fill them without a schema change.

### Updates

A new revision is published monthly. Each revision is a full re-pull of every area, stamped with its `as_of` date: newly stopped trials are added, and trials whose registry records changed can drop out. Row order follows the registry's response order and is not stable between revisions, so key on `nct_id`, not on row position.

### Data source and use

Sourced only from public-domain ClinicalTrials.gov records (U.S. NIH / National Library of Medicine). Trial-level facts only: no PHI and no individually identifiable patient data.

Research and informational use only. Not clinical decision support; not for diagnosis, treatment or any patient-care decision. Each row reflects the public registry record as of its `as_of` date, and the registry may update or withdraw records afterwards.

Provider: Trevor Robey, INC., the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company. Contact: support@trevorobeyinc.com · https://trevorobeyinc.com
```

> **Breast cancer is not in the table above.** It hit the build's 2,000-record safety cap: 2,000 of
> the 2,034 stopped trials ClinicalTrials.gov counted, so it is not a complete census. `[DECIDE]`:
> hold it out of v1 (the table stays as is and Professional lists 11 areas), or ship it with this
> row added: `| breast cancer | 2,000 of 2,034 | partial | 1,780 (89%) |`.

---

## What this tier includes (one block per product, appended to the long description)

`[DECIDE]` which of these are submitted first. Row counts are paid rows; "distinct" removes trials
shared between areas.

**Free Sample.** The first 5 rows of every area in the paid tiers (identical schema), each area's
data dictionary and its sample notice. One-time sample, no monthly updates. 55 rows for 11 areas
(60 with breast cancer). For evaluating format and quality before subscribing.

**Essentials.** 6 areas: glioblastoma, pancreatic cancer, Alzheimer disease, amyotrophic lateral
sclerosis, sickle cell disease, idiopathic pulmonary fibrosis. 1,943 rows (1,928 distinct trials).
Monthly revisions.

**Professional.** Every covered area: 11 areas, 5,373 rows (5,160 distinct trials), or 12 areas,
7,373 rows (6,937 distinct), if breast cancer ships. Monthly revisions.

**Enterprise.** Not submitted until the Parquet files it promises exist (tier ladder, 2026-10-20).
No copy is written for it yet, so the listing never promises something that isn't built.

---

## Words this listing must not use

- **"All" or "complete" for an area without its census row.** Breast cancer is partial.
- **The amendment-risk band** as a feature. Selling it has been paused since 2026-10-08, and
  every row in this revision is UNKNOWN.
- **Parquet, Athena-ready or Snowflake-ready.** Not built.
- **"Reproducible month-over-month diffs."** Row selection follows the registry's own order, and
  each revision is a fresh full pull.
