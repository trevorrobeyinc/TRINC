> **DRAFT 2026-11-04 — prepared by Claude from Common Paper standard terms (where used); NOT reviewed by counsel. Operator decision 2026-11-04: counsel review deferred until funds allow; recommended before the first contract is signed.**
>
> Not legal advice. Nothing in this draft is binding until it is attached to an Order Form that both
> parties sign. Where Common Paper is used: this policy copies no Common Paper text; it is written to sit
> beside the Common Paper Professional Services Agreement, Version 1.1 Standard Terms
> (<https://commonpaper.com/standards/professional-services-agreement/1.1>, read 2026-11-04, free to use
> under CC BY 4.0), and Section 11 says how the two fit together.

> **Operator only, never sent.** What goes to the counterparty: everything above the operator and counsel
> notes, attached to the Order Form as Exhibit A. The notes never go. `[DECIDE: does the status box above
> go to the counterparty too? One rule for the NDA, Order Form, Refund Policy and Payment Terms.]` Do not
> send for signature until bizfile shows Entity No. B20260217250 as Active, the LLC-12 is filed and the FTB
> 3522 is paid.

# Refund Policy: the Citation-Audit SLA for research deliverables

**Exhibit A to the Order Form · Version 2026-11-04**

**Provider:** Trevor Robey Intelligence Network Citations LLC, a California limited liability company
(California Secretary of State Entity No. B20260217250), 8161 Oahu Dr, Fair Oaks, CA 95628-3745 ·
trevor@trevorobeyinc.com · trevorobeyinc.com ("**Provider**").

**Customer:** the party named as Customer on the Order Form ("**Customer**").

---

## 1. What this policy covers

1.1 **Covered.** This policy defines the refund-backed Citation-Audit SLA that Provider gives on every
research deliverable its engine generates and delivers under an Order Form. It applies whether Customer
pays Provider's invoice directly or, if an AWS Marketplace private offer is used for the order, through
AWS `[DECIDE: offer an AWS private-offer route for these services?]`. The services prepared for sale first
are the **Trial Design Benchmark Pack** and **Failed Trial Archaeology** (prices and payment terms: the
Order Form and Provider's Payment Terms).

1.2 **Not covered.** This policy does not apply to:

- the **Trial Graveyard Feed**, a separate AWS Data Exchange data product with its own refund statement
  in its AWS offer (draft: `workspace/aws-marketplace-listing/trial-graveyard-feed/offers.md`). That
  statement governs the feed, and this policy does not change it;
- the AWS Data Exchange **report subscription** product, which has its own counsel-pending draft policy
  with a service-credit remedy (`03-platforms/aws-data-exchange/refund-policy.md`). That draft governs
  that product only, and this policy does not change it;
- free samples, sample previews, drafts, and interim notes;
- any document Provider assembled by hand, outside the engine. A deliverable that did not pass through
  the engine's citation checks carries none of the commitments below unless its Order Form says so in
  writing.

## 2. Definitions

- **Order Form**: the signed order (statement of work) that names the service, the fee, the scheduled
  delivery date, Customer's Delivery Contact, and the Covered Identifier types.
- **Deliverable**: the single sealed ZIP bundle Provider delivers for one ordered service, containing the
  files the Order Form lists: the report and its audit-trail files.
- **Delivery Date**: the date (Pacific Time) on which Provider sends the Deliverable, or a download link
  to it, to Customer's Delivery Contact by email, with the Deliverable's SHA-256 checksum. The same
  definition applies to a redelivered Deliverable.
- **Scope Statement**: the statement in the Deliverable that names which sections and which identifier
  types fall within the Citation-Audit SLA. If the Deliverable carries no Scope Statement, the Covered
  Identifier types listed in the Order Form apply.
  `[PENDING: the engine's bundles do not yet print a Scope Statement; until the packager does, the Order Form's list governs]`
- **Covered Identifier**: an identifier cited in a covered section of the Deliverable, of a type the
  Scope Statement covers. The identifier types are PMID (PubMed), NCT (ClinicalTrials.gov), DOI, and the
  other types the Scope Statement names. **ChEMBL identifiers are excluded from paid deliverables** until
  Provider's counsel has answered whether the CC BY-SA 3.0 share-alike terms of the ChEMBL licence reach a
  paid report that cites them. Provider checks every paid Deliverable for ChEMBL identifiers before
  delivery and removes any it finds. A ChEMBL identifier is not a Covered Identifier.
- **Material Defect**: a Covered Identifier that, as of the Delivery Date, failed one of these three
  tests:
  - **(a) Ungrounded.** It is presented as fact but was not present in the evidence Provider's engine
    actually retrieved for that run, as recorded in the run's sealed records (the citation-integrity
    ledger and the evidence it was graded against). If those records do not show the identifier in the
    retrieved evidence, it is treated as ungrounded.
  - **(b) Retracted.** It identifies a publication for which a retraction notice had been published on or
    before the Delivery Date. A correction, an expression of concern, or a citation of the retraction
    notice itself is not a retraction under this test.
  - **(c) Did not resolve.** It is a PMID, NCT, or DOI that did not resolve to a real record in its
    issuing registry (PubMed, ClinicalTrials.gov, or the DOI system) as of the Delivery Date. This test
    applies whatever status the reproducibility manifest recorded: an identifier marked VERIFIED in error
    is still a Material Defect, and an identifier marked UNCHECKED is a Material Defect only if it did not
    in fact resolve.

  This is the only definition of Material Defect in the agreement; the Order Form refers to it.
  `[DECIDE: does a citation that resolves but does not support its claim (misattribution) count as a
  Material Defect? The ADX report-product draft §2(b) says yes; Section 9.4 here says no. And must a defect
  materially affect a finding? This definition has no materiality test. Write the answer here and in
  Section 9.4.]`
- **Delivery Failure**: (i) Provider has not delivered the Deliverable by the scheduled delivery date in
  the Order Form, or (ii) the delivered bundle cannot be opened, or is missing a file the Order Form lists
  as part of the Deliverable.
- **Fee**: the amount stated in the Order Form for the affected Deliverable, excluding taxes.
- **Business Day**: Monday through Friday, excluding U.S. federal public holidays.

## 3. The commitment

For each Deliverable, Provider commits to the following. This is the Citation-Audit SLA:

1. **Fix first.** If Customer reports a Material Defect within the claim window (Section 4), Provider
   corrects the Deliverable and redelivers it within **15 Business Days** after receiving a complete claim
   (Section 5).
2. **Refund if the fix fails.** If Provider does not redeliver within those 15 Business Days, or the
   redelivered Deliverable still contains a Material Defect that Customer reports under Section 4, Provider
   refunds the Fee paid for the affected Deliverable, as set out in Section 7.
3. **Delivery Failure.** If a Delivery Failure occurs, Customer may notify Provider at any time after the
   scheduled delivery date, and Provider delivers (or delivers the missing or unreadable files) within
   **15 Business Days** after the notice. If Provider does not, Customer may cancel the order for that
   Deliverable under Section 7.3.

## 4. Claim window: the exact trigger

4.1 **Material Defect.** Provider must receive the claim no later than **11:59 p.m. Pacific Time on the
30th calendar day after the Delivery Date**. The Delivery Date is day 0. The window is counted from the
Delivery Date, not from the invoice date, the payment date, or the date Customer opened the bundle.

4.2 **Redelivered Deliverable.** The 30-day window in 4.1 applies again from the redelivery's own Delivery
Date, for the corrected items and for anything the correction changed.

4.3 **Completing a timely claim.** If Provider asks for missing details, Customer may supply them after the
window closes, provided the claim itself arrived within the window.

4.4 **Late claims.** A Material Defect claim received after the window is not eligible under this policy.

## 5. How to claim

Email **trevor@trevorobeyinc.com** with the subject line **"Citation-Audit SLA claim — [Order Form
number]"**. Include:

1. the Order Form number, the service name, and the Delivery Date;
2. the Deliverable's file name or SHA-256 checksum, so both sides are looking at the same bundle;
3. for each identifier claimed:
   - the identifier exactly as cited, and where it appears (file, section, and table row or line);
   - which test it fails: ungrounded, retracted, or did not resolve;
   - the evidence you have: for a retraction, the retraction notice (its DOI or URL and its publication
     date); for an identifier that did not resolve, the registry address you checked, the date and time you
     checked it, and what the registry returned; for an ungrounded identifier, why you believe it is absent
     from the retrieved evidence (for example, it is not in the citation-integrity ledger);
4. for a Delivery Failure: the scheduled delivery date from the Order Form, and what is missing or cannot
   be opened;
5. for a purchase made through AWS: Customer's AWS account ID, and the AWS agreement or offer ID;
6. the name and email address Provider should reply to.

## 6. What Provider does with a claim

6.1 **Acknowledgement.** Provider acknowledges the claim within 1 Business Day, consistent with Provider's
documented support process (`03-platforms/aws-data-exchange/adx-provider-qualification/provider-support-process.md`),
and asks then for any detail the claim is missing. The 15-Business-Day period starts on the first Business
Day after Provider receives a complete claim.

6.2 **Review.** Provider checks each claimed identifier against the run's sealed records and against the
issuing registry, and sends Customer its findings in writing within the 15-Business-Day period.

6.3 **Correction and redelivery.** For each Material Defect Provider confirms, Provider removes or replaces
the identifier and any statement that depends on it, checks the corrected Deliverable with the same
citation checks as the original, and redelivers a new sealed bundle with an updated citation-integrity
ledger and a change note that lists every correction.

6.4 **Claims Provider does not accept.** If Provider concludes that a claimed identifier is not a Material
Defect, its written findings say why and show the records relied on. If Customer disagrees, Section 11.4
applies.

## 7. Refund and cancellation

7.1 **Amount.** When Section 3 entitles Customer to a refund, Provider refunds the Fee paid for the
affected Deliverable. The refund never exceeds that Fee.
`[DECIDE: is the refund always the full Fee for the affected Deliverable, or may it be partial, and if partial, how is it measured? Recommendation: the full Fee; each service is one Deliverable, and a fixed answer is what procurement will ask for.]`

7.2 **Fee not yet paid.** If the Fee for the affected Deliverable has not been paid when the refund becomes
due, Provider cancels the invoice for that Deliverable by issuing a credit note for the amount the refund
would have been, instead of paying a refund. Whether an open claim pauses that invoice's due date is set
in the Order Form.

7.3 **Delivery Failure not cured.** If Provider does not cure a Delivery Failure within the period in
Section 3, item 3, Customer may cancel the order for that Deliverable by email. A Deliverable that is never
delivered is never payable: under directly invoiced orders no invoice is issued before delivery, and for
an AWS purchase Provider refunds the amount charged for that Deliverable under Section 8.

7.4 **Payment method and timing.** A direct refund is paid by ACH or wire to the account Customer paid
from. `[DECIDE: how many Business Days after the cure period ends Provider pays a refund]`

## 8. Purchases billed through AWS (only if an AWS private offer is used)

This Section applies only to an order placed through an AWS Marketplace private offer
`[DECIDE: offer an AWS private-offer route for these services?]`.

8.1 **Who decides.** For a purchase made through an AWS Marketplace private offer, AWS processes only
refunds that Provider authorizes. AWS's seller guide states that all refunds for private offers must be
authorized by the seller before AWS can process them. Customer files the claim with Provider under
Section 5, not with AWS.

8.2 **How Provider refunds.** Provider applies a billing adjustment to the AWS agreement from the
Agreements page in AWS Partner Central (or the AWS Billing Adjustments API). AWS processes it once its
validation passes. On an unpaid AWS invoice, the adjustment reduces the amount due. On a paid invoice, it is
returned as a credit memo or a cash refund. The amount Provider enters is exclusive of tax, and AWS adjusts
any tax it collected under its own billing rules. Where the Agreements page cannot handle the request,
Provider files an AWS Support case instead.

8.3 **Amount.** The amount is the same as under Section 7, measured against what Customer was charged
through AWS for the affected Deliverable.

8.4 AWS's automatic full refund for a cancellation within 48 hours of purchase applies to non-private
offers. It does not apply to a private offer.

## 9. What the SLA does not cover

The Citation-Audit SLA tests identifiers. It does not cover:

1. **Sections outside the Guarantee's stated scope.** This includes any content built on evidence that
   carries none of the Covered Identifier types (patent evidence is one example), identifier types the
   Scope Statement does not list, and any section that says on its face that it is outside the Guarantee.
2. **Identifiers disclosed as unverified.** An identifier marked `[UNVERIFIED]`, or a place marked
   `[no verifiable citation found]`, at the point of citation is disclosed rather than presented as fact,
   and is not a Material Defect under test (a). An UNCHECKED status in the reproducibility manifest is
   not, by itself, a Material Defect.
3. **The scientific conclusions of cited sources**, and whether a source's findings are correct. A
   resolving identifier proves that the record exists. It does not prove the record's conclusions.
4. **Analysis and judgement.** This includes Provider's analysis, interpretation, risk characterisations
   and wording; how a statement characterises a source it correctly cites (unless the misattribution
   `[DECIDE]` in Section 2 makes that a Material Defect); and the methodology, selection rule, or cohort
   that the Deliverable states.
5. **Changes after the Delivery Date.** This includes a retraction, correction or withdrawal published
   after delivery, and a registry record, page or link that resolved on the Delivery Date and later
   changed, moved, went behind a paywall, or stopped resolving. Registries and publishers are run by third
   parties outside Provider's control.
6. **Customer-supplied inputs.** This covers documents or identifiers Customer supplied, as supplied, and
   statements that rest only on them.
7. **Altered bundles.** This covers any file whose SHA-256 checksum does not match the one sent on the
   Delivery Date.
8. **Use as advice.** Every Deliverable is a research artifact only. It is not medical, investment, legal
   or regulatory advice, and it is not validated for clinical decision support. A claim that rests on such
   use is outside this policy.

## 10. Sole and exclusive remedy

10.1 This policy is Customer's **sole and exclusive remedy**, and Provider's entire liability, for Material
Defects and Delivery Failures.

10.2 The most Provider pays under this policy for any one Deliverable is the Fee paid for that Deliverable.

10.3 One event gives one remedy. A refund under Section 7 and a refund under Section 8 are never both paid
for the same Deliverable.

## 11. How this policy fits the agreement

11.1 **Incorporation.** This policy applies to an order only when the Order Form incorporates it, as
Exhibit A, and attaches this version.

11.2 **Common Paper Professional Services Agreement v1.1, if used.** If the parties' agreement uses those
Standard Terms, the Order Form should say expressly that:

- this policy is an additional refund right, despite Section 4.1 of those terms, which makes Fees
  non-refundable except for a prorated refund on specific termination rights; and
- this policy, not the warranty remedy in Section 6.4 of those terms (reperformance within 45 days and a
  prorated refund of prepaid Fees), governs Material Defects and Delivery Failures.

Those Standard Terms contain no general order-of-precedence clause (read 2026-11-04), so the Order Form has
to state the precedence itself.

11.3 **Governing law.** California law governs, without regard to its conflict-of-laws rules (operator
decision 2026-11-04).

11.4 **Disputes.** Disputes go to the forum stated in the agreement's key terms.
`[DECIDE: venue / forum for disputes — on the counsel list]`

11.5 **Changes.** Provider may revise this policy for future orders. The version attached to a signed
Order Form governs that order.

## 12. Data posture

Provider processes no protected health information (PHI) to produce a Deliverable, and Customer must not
send any. Deliverables are research artifacts built from public sources.

## 13. Contact

trevor@trevorobeyinc.com · https://trevorobeyinc.com · Trevor Robey Intelligence Network Citations LLC,
8161 Oahu Dr, Fair Oaks, CA 95628-3745

---

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*

---

## Operator and counsel notes: REMOVE THIS PART BEFORE THE POLICY GOES TO A CUSTOMER

### Decisions this draft encodes (operator, 2026-11-04)

- **Fix first:** the claim window is 30 days from delivery, followed by correction and redelivery within
  15 business days. If the defect is still there, the refund is capped at the Fee paid for the affected
  Deliverable, as the sole and exclusive remedy.
- **Governing law: California.** No counsel yet; the document is marked accordingly.
- **Payment: Net 30 after delivery.** This lives in `payment-terms.md`, and it is why Section 7.2 exists:
  a buyer can raise a claim before paying.
- The Material Defect definition (ungrounded / retracted / did not resolve, as of delivery) matches root
  `STATUS.md` (2026-11-04 plan, step 3). It is now the **only** definition: the Order Form's section 5
  refers to it instead of defining its own (review of 2026-11-04). Whether to add misattribution (a
  citation that resolves but does not support its sentence; the ADX report-product draft §2(b) includes it)
  or a materiality test is an open `[DECIDE]` in Section 2; apply the answer in Section 2 and Section 9.4
  together. See counsel question 5.

### Open markers in this file

- `[DECIDE: does the status box go to the counterparty too? One rule for the NDA, Order Form, Refund Policy and Payment Terms.]`
- `[DECIDE: offer an AWS private-offer route for these services?]` (Section 1.1 and Section 8)
- `[PENDING: the engine's bundles do not yet print a Scope Statement; until the packager does, the Order Form's list governs]`
- `[DECIDE: misattribution and materiality in the Material Defect definition]` (Section 2, Section 9.4)
- `[DECIDE: is the refund always the full Fee for the affected Deliverable, or may it be partial ...]`
- `[DECIDE: how many Business Days after the cure period ends Provider pays a refund]`
- `[DECIDE: venue / forum for disputes — on the counsel list]`

### Questions for the counsel hour (flat fee, before the first signature)

Required:

1. **Governing law and venue.** California law is decided. Which forum, and should it be courts or
   arbitration? Does a pharma counterparty's usual demand for its own state's law change anything?
2. **Refund cap and sole remedy.** Is a sole and exclusive remedy capped at the Fee enforceable in
   California for B2B research services? Does California law require carve-outs (for example for fraud
   or wilful misconduct)? How should the cap sit with the master agreement's limitation of liability?
3. **ChEMBL CC BY-SA 3.0 share-alike.** Does citing ChEMBL identifiers, or including ChEMBL-derived
   values, make a paid report a share-alike adaptation? Until counsel answers, ChEMBL identifiers stay out
   of paid deliverables (Section 2).

If time allows:

4. The precedence wording against Common Paper PSA v1.1 §4.1 and §6.4 (Section 11.2).
5. Should the SLA also cover misattributed citations, as the ADX report-product draft does? And which of
   the two drafts should change so they agree?
6. Does the Customer keep its licence to a Deliverable after a full refund?
7. Is the `[UNVERIFIED]` exclusion (Section 9.2) disclosed clearly enough to hold?

### Implementation gaps found while drafting (not fixed in the engine)

- **No mechanical ChEMBL gate, and the exclusion has already been broken once.** The citation gate accepts
  `CHEMBL` identifiers, and no build check blocks them (unlike the unlicensed database, which has a regex
  gate); the Open Targets fetchers bound to the scout role return `chemblId` records. Two earlier NSCLC
  benchmark bundles (`workspace/releases/offer-3dec35098e8e47e2d0a72012/`, `offer-7e373eb2de36a7a2e73e7c1c/`)
  carry ChEMBL ids in `report.md` / `tables.csv`. Until a gate exists, search every customer ZIP for
  `CHEMBL` before delivery (Order Form operator notes, "Before every delivery"); Section 2 now promises that
  check, not an outcome.
- **No Scope Statement in bundles.** The shipped bundle checked (`workspace/releases/offer-2af242bc1548229c102fee55/deliverables/`)
  has a citation-integrity ledger and a reproducibility manifest but no statement of which sections and
  identifier types the Guarantee covers. The Order Form now carries the Covered Identifier types (PMID,
  NCT, DOI, with a `[DECIDE: confirm this list]`) until the packager prints one.
- **The manifest is fail-soft.** If the re-resolution pass itself fails, the engine can ship without a
  reproducibility manifest (`SYSTEM-REALITY.md`, "GAP CLOSED"). Under Section 2, a missing file that the
  Order Form lists is a Delivery Failure. The Order Form lists the manifest; whether to keep it on the list
  (and hold delivery until one exists) is a `[DECIDE]` in the Order Form's operator notes.
- **The memo and benchmark tables are not in the manifest.** In the benchmark bundle checked
  (`offer-2bc4ee4a8cfd54e0a788a0b0`), `graveyard-memo.md` cites 1,420 distinct NCT numbers and the manifest
  re-resolves none of them (it covers the 45 identifiers cited in `report.md`). They are still Covered
  Identifiers here, so test (c) applies to them; the Order Form's Additional Warranty is narrowed to
  `report.md` for this reason.
- **Retraction residual gap.** Test (b) asks whether a retraction notice had been published by the
  Delivery Date, not whether the engine's screen caught it. The engine's screen misses a retracted paper
  cited by DOI only that is not indexed in PubMed and has no Crossref retraction relation (engine
  `CLAUDE.md`, Citation Integrity Layer). Provider carries that risk under this wording, by design.
- **The ADX draft describes an older AWS refund path.** `03-platforms/aws-data-exchange/refund-policy.md`
  §6.4 describes a refund-approval form sent to AWS Support. Since 2026-03-31 AWS offers seller
  self-service billing adjustments on the Agreements page, and keeps the Support case as a fallback.
  "AWS processes only refunds the seller authorizes" is still true for private offers. That draft also
  lists ChEMBL among its core identifiers, which conflicts with the ChEMBL exclusion here until counsel
  answers.
- **Two contact addresses.** The feed's refund statement names `support@trevorobeyinc.com`; this policy
  and the ADX draft use `trevor@trevorobeyinc.com`. Both are as found, but confirm that support@ is a
  working mailbox before the feed's offer is published.

### Sources read 2026-11-04

- Common Paper, *Professional Services Agreement*, Version 1.1 (released 2023-12-12), Standard Terms §4.1,
  §6.4, and the absence of a general order-of-precedence clause:
  <https://commonpaper.com/standards/professional-services-agreement/1.1>. The current version and the
  CC BY 4.0 licence were confirmed on <https://commonpaper.com/standards/professional-services-agreement/>.
- AWS Marketplace Seller Guide, *Refunds and cancellations in AWS Marketplace* (private-offer refunds need
  seller authorization; billing adjustments; tax-exclusive amounts; 48-hour rule for non-private offers):
  <https://docs.aws.amazon.com/marketplace/latest/userguide/refunds.html>
- AWS What's New, *AWS Marketplace sellers can now self-serve refunds and agreement cancellations*
  (posted 2026-03-31): <https://aws.amazon.com/about-aws/whats-new/2026/03/aws-marketplace-seller-self-service-refund-cancel>
- ChEMBL interface documentation, *About* (data licensed CC BY-SA 3.0 Unported):
  <https://chembl.gitbook.io/chembl-interface-documentation/about>
- Repo canon: `OFFERINGS.md` (Brand Commitments and their scope paragraph), `SYSTEM-REALITY.md`
  ("GAP CLOSED"), `03-platforms/aws-data-exchange/refund-policy.md`,
  `workspace/aws-marketplace-listing/trial-graveyard-feed/offers.md`,
  `00-business-formation/llc/certificate-of-formation.md` (principal office address).
