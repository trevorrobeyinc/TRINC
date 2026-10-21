# Trial Graveyard Feed — first-listing draft (2026-10-20)

Working draft for the first AWS Data Exchange listing. It supersedes nothing yet: once the
refresh below is reviewed, this copy replaces `product-description.md` and `offers.md`.
Prices are left as `[DECIDE]` — the operator sets them.

## What changed since the 2026-07-30 package

1. **The data is three months old.** The listing promises monthly revisions, so it ships with a
   fresh pull: `scripts/refresh-graveyard-feeds.sh` rebuilds every area into
   `refresh-<date>/` (never over `data/`), then gets reviewed and promoted.
2. **The amendment-risk band can no longer be produced.** Since 2026-10-08 the ClinicalTrials.gov
   change-history endpoint answers HTTP 403 to the fetcher (`ctgov-supplemental.js:52`). A fresh
   build will carry the churn columns empty. Even in July they covered only 40 rows per area
   (240 of 1,921). The copy below therefore sells the **stop-reason register**, and describes the
   churn columns as "populated where ClinicalTrials.gov history was available."
3. **One product, not one per area.** A single product holding one data set per therapeutic area
   means one AWS review, one price, and one page for buyers. Per-area private offers stay possible.
4. **Six new areas** are added to the refresh: non-small cell lung cancer, breast cancer, prostate
   cancer, Parkinson disease, multiple sclerosis, nonalcoholic steatohepatitis.

## Product listing copy

**Name:** Trial Graveyard Feed — Stopped Clinical Trials with Sponsor Stop Reasons

**Short description:** A citation-traced register of terminated, withdrawn and suspended clinical
trials across [N] therapeutic areas, with each sponsor's own stated reason for stopping. Every row
links to its public ClinicalTrials.gov record. No PHI. Refreshed monthly.

**Long description:**
The Trial Graveyard Feed lists every terminated, withdrawn or suspended trial that
ClinicalTrials.gov returns for each covered therapeutic area, one data set per area. For each
trial it gives the sponsor's stated stop reason, quoted verbatim, or an explicit
"(none stated by sponsor)" — a reason is never inferred or invented. Rows carry the NCT ID,
title, status, phase and a resolvable study link, and an included citation index ties every row
to its public record.

The feed is rendered deterministically from public registry data, with no model-generated
content. Use it to see which development paths others have already abandoned and why, before you
fund, license or design a program in the same space.

**Coverage ([as of date]):** [table of area → rows, filled from the refresh summary]

**What's included (per area):**
- `register.csv` — one row per stopped trial: `nct_id, title, overall_status, phase, why_stopped,
  protocol_versions, most_amended_modules, amendment_risk_band, history_first, history_last,
  study_url, indication, as_of` (the protocol-history columns are populated where
  ClinicalTrials.gov history was available and are otherwise empty)
- `citation-index.csv` — the NCT provenance trail
- `data-dictionary.md`

**Completeness:** complete for the condition term queried. Condition search is term-based, so a
different name for the same indication can return a different set.

**Categories:** Healthcare · Life Sciences

**Data eligibility:** public-domain ClinicalTrials.gov records (NIH/NLM); trial-level facts only;
no PHI or patient-level data.

**Disclaimer:** research and informational use only. Not clinical decision support. Each row
reflects the public registry record as of the stated `as_of` date.

> Provider: Trevor Robey, INC. (wordmark of Trevor Robey Intelligence Network Citations LLC, a
> California limited liability company) · trevor@trevorobeyinc.com · https://trevorobeyinc.com

## Offers

Superseded 2026-10-20 by the operator's tier decision: one ADX product per tier (Free Sample,
Essentials $99/mo, Professional $249/mo, Enterprise $499/mo). Full table:
[`../../../product-strategy/tier-ladder-DRAFT-2026-10-20.md`](../../../product-strategy/tier-ladder-DRAFT-2026-10-20.md).

**Subscription agreement:** use AWS's standard Data Subscription Agreement (selectable in the
offer). The custom DSA in `03-platforms/aws-data-exchange/` stays parked until counsel reviews it.

**Refund policy:** the existing draft (`03-platforms/aws-data-exchange/refund-policy.md`) was
written for the report-PDF product and doesn't fit this feed. A short statement for the offer's
refund field, for the operator to accept or edit:

> Refunds are not provided except where required by law or the AWS Marketplace terms. If a
> revision contains a row that does not match its ClinicalTrials.gov record as of the stated
> `as_of` date, email trevor@trevorobeyinc.com within 30 days and we will publish a corrected
> revision.

## Operator steps, in order

1. ~~**AWS root email off the school address.**~~ ✅ **DONE 2026-10-21** — root email is now
   `aws@trevorobeyinc.com` (a Workspace group that delivers to trevor@), so listing-review outcomes
   reach Gmail. Record: `03-platforms/aws-data-exchange/account-access.md` → "Root email → aws@ runbook".
2. **Run the refresh** (command in the thread) and let Claude review the staging folder.
3. **Pick the annual discount** (monthly prices are set: $99 / $249 / $499).
4. **Upload + publish** per `UPLOAD-RUNBOOK.md`: one data set per area (paid) and one sample data
   set, then the product, then the FREE offer, then the PAID offer. AWS reviews a first listing
   in about 5–7 business days.
