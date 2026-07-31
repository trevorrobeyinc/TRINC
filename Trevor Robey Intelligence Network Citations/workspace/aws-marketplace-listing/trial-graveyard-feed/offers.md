# Trial Graveyard Feed — Offers

## Public FREE offer (evaluation / establishment)
- **Asset:** `data/<TA>/free/register-sample.csv` (first 5 trials) + `citation-index-sample.csv` + `data-dictionary.md` + `SAMPLE-NOTICE.md`.
- **Price:** $0. **Subscription verification:** enable (mandatory on all public offers since 2025-04-08).
- **Purpose:** first ADX transaction record + funnel — every free subscriber is an entitled, contactable AWS account. Can publish **before** disbursement is set up.

## Public PAID offer (subscription)
- **Asset:** `data/<TA>/paid/register.csv` (the complete register for the ClinicalTrials.gov condition query, stated as N of M in `SAMPLE-NOTICE.md`; protocol-churn columns on a bounded 40-row sample) + `citation-index.csv` + `data-dictionary.md`; **monthly** revisions. All six TAs regenerated 2026-07-30 under the census fetch, every one `censusComplete=true` — **1,921 paid rows, up from 300 under the clamp** (see the resolved box in [`README.md`](README.md)). Completeness is for the **term queried**: condition search is term-based, so a different name for the same indication returns a different set.
- **Duration:** offer 1 / 3 / 12-month terms; **auto-renew is locked at offer creation** (AWS), so set it deliberately.
- **Price: [DECIDE] — not set here (no invented numbers).** Considerations: this is a **low-ticket, self-serve monthly data feed** (distinct from the high-ticket bespoke dossiers, which stay as private offers). Position it **low to win the first transactions and build the establishment record** that re-opens the gated channels. AWS requires a concrete price at offer creation.
- **Refund:** per [`../../../03-platforms/aws-data-exchange/refund-policy.md`](../../../03-platforms/aws-data-exchange/refund-policy.md) (DRAFT — counsel review).

## PRIVATE offers (later, once verified)
- An **all-TA bundle** (multiple feeds) and the bespoke **Investor Pre-Mortem / Failed Trial Archaeology** dossiers, issued per buyer AWS account — target the warmest free-sample subscribers + existing direct-sale relationships.

## DSA
[`../../../03-platforms/aws-data-exchange/data-subscription-agreement.md`](../../../03-platforms/aws-data-exchange/data-subscription-agreement.md) (DRAFT — counsel review).
