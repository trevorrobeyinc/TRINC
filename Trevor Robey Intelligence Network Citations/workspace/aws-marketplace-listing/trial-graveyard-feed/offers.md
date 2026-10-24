# Trial Graveyard Feed — Offers

Offer mechanics below are from the AWS Data Exchange User Guide, read 2026-10-21 ("Creating an
offer", "Creating public offers", "Subscription verification for providers").

## Price: [DECIDE] — on hold by the operator's call (2026-10-21)

The operator set the tier prices on 2026-10-20 (`../../../product-strategy/tier-ladder-DRAFT-2026-10-20.md`)
and on 2026-10-21 said to hold writing them into the offers until later. Nothing on this page sets
a price, and no price may be taken from `private-offer-tiers.md`, `setup-guide.md` or the dossier
ladder: those belong to the bespoke reports, not this self-serve feed. (The any-field business-research
tiers were priced on 2026-10-23 in `OFFERINGS.md`, booking gated on the first live business run; they are
services, never feed offers.)

## Decided

- **Subscription agreement: AWS's standard Data Subscription Agreement.** In the offer wizard's
  "Configure legal terms and offer documents" step, choose the Data Exchange default. This removes
  the counsel dependency. The custom DSA (`../../../03-platforms/aws-data-exchange/data-subscription-agreement.md`)
  stays parked, stamped "do not publish until counsel has reviewed".
- **Subscription verification is on, and cannot be turned off.** AWS enables it on every public
  offer (since 2025-04-08, DOJ Rule): the wizard asks you to acknowledge it. Each subscriber
  submits a form (contact, company, use case, AWS account ID, and a Country of Concern / Covered
  Person answer). You approve or decline it under **Data Products → Subscription requests**
  within **45 days**, or it expires. AWS does not check the answers; you do.
- **Channel:** public offers on AWS Data Exchange. The bespoke dossiers and an all-area bundle can
  follow later as private offers to named AWS accounts.

## Open — the operator decides in the wizard (immutable or hard to change)

| Choice | AWS rule | Recommendation |
|---|---|---|
| **Auto-renewal** | Set once at offer creation and **never changeable** afterwards | On: it only *offers* subscribers automatic renewal; each buyer opts in |
| **Durations** | 1 to 36 months, up to 5 durations per public offer, a price for each, USD only, paid up front. Discontinuing a duration later cancels auto-renewal for those subscribers | 1 month at launch; add 12 months once you set an annual price |
| **US sales tax** | Collected only where you set tax nexus in the Marketplace portal | Your accountant's call, not a listing question |
| **Refund policy** | Required text in every offer. AWS processes only refunds you authorize (refund approval form in the Marketplace portal) | The statement below |

## Refund statement (for the offer's refund field; accept or edit)

Free Sample:

> Free product: no charges, no refunds.

Paid tiers:

> Refunds are not provided except where required by law or the AWS Marketplace terms. If a
> revision contains a row that does not match its ClinicalTrials.gov record as of the stated
> `as_of` date, email support@trevorobeyinc.com within 30 days and we will publish a corrected
> revision.

The older `../../../03-platforms/aws-data-exchange/refund-policy.md` was written for the report-PDF
product and does not fit this feed.

## Per-tier offers

`[DECIDE]` which products are submitted first. Each tier is its own product with one public offer
(tier ladder, 2026-10-20). A data set can sit in several products, so Essentials and Professional
share the six original area data sets.

| Product | Data sets | Offer | Price |
|---|---|---|---|
| Free Sample | 1 (all samples) | public, free | $0 |
| Essentials | 6 areas | public, monthly | [DECIDE] |
| Professional | 11 or 12 areas (breast cancer `[DECIDE]`) | public, monthly | [DECIDE] |
| Enterprise | not submitted until Parquet exists | — | [DECIDE] |
