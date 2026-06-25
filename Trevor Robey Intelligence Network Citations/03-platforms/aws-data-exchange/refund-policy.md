# Refund Policy — Service Credits
## Trevor Robey Intelligence Network Citations LLC (AWS Data Exchange)

> **DRAFT — review by counsel.** This document is a working draft prepared for review by qualified legal counsel before publication or use in any AWS Data Exchange offer. The service-credit framework below is modeled on the structure and intent of the Common Paper Service Credits standard, adapted to a citation-traced biomedical-intelligence data subscription sold on AWS Data Exchange. Nothing here is legal advice, and no term is effective until reviewed, approved, and incorporated into the applicable offer by Provider's counsel.

---

**Provider:** Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed at the California Secretary of State 2026-05-06; Entity / receipt No. B20260217250), doing business under the wordmark "Trevor Robey, INC." (where INC = Intelligence Network Citations) ("Provider," "we," "us").

**Applies to:** Paid subscriptions to Provider's AWS Data Exchange data product(s) — the single Files-type data set bundling citation-traced biomedical due-diligence report PDFs together with structured CSV / Parquet data ("the Product"). A separate free sample tier (the Pharmacovigilance Sample Pack) carries no fee and is therefore outside the scope of this policy.

**Channel:** AWS Data Exchange. This policy is the refund policy Provider specifies in the "Specify refund policy" step of each AWS Data Exchange public and private offer. Refunds are authorized by Provider and processed by AWS on Provider's behalf; see Section 6.

**Effective:** On the date this policy is incorporated into an AWS Data Exchange offer accepted by a Subscriber. **DRAFT — review by counsel.**

---

## 1. Overview and intent

Provider's core promise is citation integrity: every substantive claim in a Product deliverable resolves to a verifiable public-domain source identifier — a PubMed PMID, a ClinicalTrials.gov NCT number, a ChEMBL identifier, or a DOI — that was grounded in the source records actually retrieved at the time the deliverable was produced, and DOI-bearing citations are retraction-screened (Crossref) at a report-level gate. This is the "citation-audit SLA" that backs the Product.

This Refund Policy gives that promise a concrete, predictable remedy. Rather than discretionary cash refunds, the primary remedy for a qualifying failure is a **Service Credit** — a credit against current or future Product subscription fees — measured as a percentage of the fees paid for the affected subscription period. Service Credits are Subscriber's **sole and exclusive remedy** for the failures described in this policy, except where a cash refund is expressly provided in Section 5 or required by applicable law or by the AWS Data Exchange / AWS Marketplace terms. **DRAFT — review by counsel.**

## 2. Definitions

- **"Deliverable"** — a report PDF and its accompanying structured data (CSV / Parquet) delivered to Subscriber under the subscription.
- **"Citation Defect"** — a substantive, factual claim in a Deliverable that is presented as supported by a cited identifier (PMID / NCT / ChEMBL / DOI) where (a) the cited identifier does not exist or does not resolve in the named public source database, (b) the cited identifier resolves but does not support the claim it is attached to (the claim is not grounded in that source), or (c) the cited DOI corresponds to a record that was retracted on or before the deliverable date and was not flagged as such. A citation that resolves and supports its claim is **not** a Citation Defect merely because Subscriber disagrees with Provider's analysis or interpretation.
- **"Material Citation Defect"** — a Citation Defect that materially affects a headline finding, risk rating, or recommendation in the Deliverable.
- **"Delivery Failure"** — Provider's failure to make the Product data set or a contracted Deliverable available to Subscriber through AWS Data Exchange within the delivery window stated in the applicable offer or order, where the failure is not excused under Section 7.
- **"Subscription Period"** — the contract duration the Subscriber selected and paid for upfront through the AWS Data Exchange offer (durations are set per offer; AWS Data Exchange supports 1–36 month durations).
- **"Fees Paid"** — the amounts actually paid by Subscriber to AWS for the affected Subscription Period for the Product, net of any taxes collected and remitted and net of AWS fees.
- **"Service Credit"** — a credit, denominated in U.S. dollars and calculated as a percentage of Fees Paid, applied against current or future Product subscription fees as described in Section 4.

## 3. What qualifies for a remedy

A claim qualifies for a Service Credit (or, where Section 5 applies, a cash refund) only if **all** of the following are true:

1. The subscription is a **paid** Product subscription purchased through AWS Data Exchange (the free sample tier does not qualify).
2. The issue is a **Citation Defect**, a **Material Citation Defect**, or a **Delivery Failure** as defined in Section 2 — not a disagreement with analysis, methodology, scope, or conclusions, and not a request driven solely by changed business needs.
3. Subscriber submits a valid claim within the window in Section 8 and provides the supporting detail required there.
4. The issue is **not** excluded under Section 7.

Qualifying triggers, in summary:

| Trigger | Definition reference | Remedy track |
|---|---|---|
| Citation Defect (non-material) | §2 | Service Credit, §4 |
| Material Citation Defect | §2 | Enhanced Service Credit, §4; cash-refund eligibility, §5 |
| Delivery Failure | §2 | Service Credit, §4 |

## 4. The Service Credit remedy

Service Credits are calculated against the Fees Paid for the affected Subscription Period and are Subscriber's primary remedy:

| Qualifying event in a Subscription Period | Service Credit (% of Fees Paid for that period) |
|---|---|
| One or more non-material Citation Defects, corrected by Provider within 5 business days of validation | 10% |
| One or more non-material Citation Defects not corrected within 5 business days | 25% |
| One Material Citation Defect | 50% |
| Two or more Material Citation Defects in the same Deliverable | 100% |
| Delivery Failure (per affected Deliverable / data-set availability) | 25%, increasing by an additional 25% for each additional full 5 business days of continued unavailability, up to 100% |

Service Credit terms:

- **Cap.** The aggregate Service Credits issued for any single Subscription Period will not exceed 100% of the Fees Paid for that Subscription Period.
- **Form and application.** Service Credits are applied against current or future Product subscription fees through an AWS Data Exchange private offer or renewal at the next opportunity. Service Credits have no independent cash value except where converted to a cash refund under Section 5.
- **Correction first.** Where the qualifying event is a Citation Defect, Provider will first attempt to correct the defect by reissuing the affected portion of the Deliverable with a corrected, verifiable citation. A timely correction reduces the Service Credit to the "corrected" tier above; it does not eliminate Subscriber's right to the corrected-tier credit.
- **Sole and exclusive remedy.** Except as stated in Section 5 and subject to the limitation of liability in the Data Subscription Agreement, Service Credits are Subscriber's sole and exclusive remedy for Citation Defects, Material Citation Defects, and Delivery Failures.

**DRAFT — review by counsel.** The percentages, tiers, and caps above are placeholders proposed to mirror a graduated Service Credits schedule and must be confirmed against Provider's pricing ladder, margin model, and counsel's guidance before publication. They are intentionally expressed as percentages of Fees Paid rather than fixed dollar amounts so they scale across Provider's published single-deliverable SKU price points without restating any price here.

## 5. When a cash refund is available

A cash refund (rather than a Service Credit) is available only in these limited cases:

1. **No remaining subscription to credit.** If Subscriber's subscription has ended or will not renew, so that a Service Credit could not reasonably be applied against future fees, the qualifying Service Credit amount is paid as a cash refund instead.
2. **Total failure.** If a Deliverable contains two or more Material Citation Defects, or a Delivery Failure renders the data set entirely unavailable for the full Subscription Period, Subscriber may elect a 100% cash refund of Fees Paid for that period in lieu of a Service Credit.
3. **Where required.** Where a cash refund is required by applicable law or by the AWS Customer Agreement, the AWS Marketplace seller terms, or the AWS Data Exchange terms.

All cash refunds are subject to Section 6 (how AWS processes refunds) and to the limitation of liability and governing-law terms of the Data Subscription Agreement. Refund amounts are net of taxes and AWS fees and do not exceed the Fees Paid for the affected Subscription Period. **DRAFT — review by counsel.**

## 6. How to request a remedy

1. **Submit a claim** to Provider at **trevor@trevorobeyinc.com** with the subject line "ADX Refund / Service-Credit Request," including:
   - the AWS Data Exchange Product name and Subscriber's AWS account ID;
   - the affected Deliverable and Subscription Period;
   - for a Citation Defect: the specific claim, the cited identifier (PMID / NCT / ChEMBL / DOI), and a short statement of why the citation does not exist, does not resolve, does not support the claim, or references a retracted record;
   - for a Delivery Failure: the contracted delivery window and the dates of unavailability.
2. **Acknowledgement and review.** Provider will acknowledge the claim within 1 business day (consistent with Provider's support SLA) and complete its validation review within 10 business days. Provider may request reasonable additional detail; the review clock pauses until Subscriber responds.
3. **Determination.** Provider will notify Subscriber whether the claim qualifies and, if so, the remedy track and amount under Sections 4 and 5.
4. **AWS processing of authorized refunds.** AWS Data Exchange does not require Provider to offer refunds, and AWS processes only refunds that Provider authorizes. For any cash refund Provider authorizes under Section 5, Provider will submit a refund approval form to AWS Support through the AWS Marketplace Management Portal; AWS then issues the refund to Subscriber and records it in Provider's monthly billed-revenue report. Service Credits under Section 4 are administered by Provider directly through a private offer or renewal credit, not through the AWS refund-approval form.

## 7. Exclusions

This policy does **not** provide a Service Credit or refund for, and the qualifying triggers in Section 3 expressly exclude, the following:

- **Interpretation and analysis.** Disagreement with Provider's analysis, risk ratings, recommendations, scope, methodology, or conclusions where the underlying citations resolve and support the factual claims.
- **Buyer's remorse / changed needs.** Cancellation requests driven by a change in Subscriber's business needs, budget, or strategy, rather than a qualifying event.
- **Upstream source changes.** Subsequent retraction, correction, withdrawal, paywalling, relocation, or unavailability of an upstream public source record that occurs **after** the deliverable date and was correctly cited and (for DOIs) retraction-screened as of that date. Citations are grounded as of the deliverable date; the public databases (NLM/PubMed, ClinicalTrials.gov, EMBL-EBI/ChEMBL, Crossref/DOI registrants, and others) are maintained by third parties and are outside Provider's control.
- **Misuse.** Use of a Deliverable as the sole basis for any clinical, prescribing, regulatory, or other professional medical decision; the Product is research and competitive-intelligence material, is **not** validated for clinical decision support, and contains no Protected Health Information (PHI). PHI handling remains solely Subscriber's responsibility, and Provider is not a HIPAA Business Associate with respect to the Product.
- **Subscriber-side and platform factors.** Failures caused by Subscriber's AWS configuration, Subscriber's analytics environment, AWS service outages or AWS Data Exchange platform issues, or other factors outside Provider's reasonable control (force majeure).
- **Free tier.** The free Pharmacovigilance Sample Pack and any other no-fee asset, which carry $0 in fees and no warranty.
- **AWS-side amounts.** Taxes collected and remitted through the AWS Marketplace Tax Calculation Service and AWS platform fees, which are not Provider revenue and are not refundable by Provider.

## 8. Claim window and survival

- **Window.** A claim must be submitted within **30 days** after the earlier of (a) delivery of the affected Deliverable or (b) the end of the delivery window for a Delivery Failure. Claims submitted after this window are not eligible.
- **No double recovery.** A given qualifying event yields one remedy — a Service Credit or a cash refund, not both — calculated once against the Fees Paid for the affected Subscription Period.
- **Relationship to the DSA.** This policy supplements the Product's Data Subscription Agreement ("DSA"). In the event of a conflict, the DSA's limitation-of-liability and governing-law provisions control. This policy does not expand Provider's aggregate liability beyond the cap stated in the DSA.

## 9. Governing law

This Refund Policy is governed by the laws of the State of California, USA, without regard to conflict-of-laws principles, consistent with the Product's Data Subscription Agreement. Disputes are subject to the dispute-resolution and jurisdiction terms of the DSA.

## 10. Changes to this policy

Provider may update this policy for future offers and Subscription Periods. The refund policy that applies to a given subscription is the policy specified in the AWS Data Exchange offer at the time Subscriber subscribed; changes do not retroactively reduce remedies for an already-active Subscription Period.

## 11. Contact

Questions about this Refund Policy, or to submit a claim: **trevor@trevorobeyinc.com** · https://trevorobeyinc.com

---

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company. INC = Intelligence Network Citations.*

**DRAFT — review by counsel.** All legal text in this document is a draft for counsel review and is not effective until approved and incorporated into the applicable AWS Data Exchange offer.
