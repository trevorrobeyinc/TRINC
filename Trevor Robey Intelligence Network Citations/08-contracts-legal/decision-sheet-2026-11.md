> **Operator only, never sent.** Prepared by Claude on 2026-11-06 (UTC) from the 2026-11-04 drafts at commit
> `5ee2e18`. Not legal or tax advice: my picks are business defaults. Items marked *counsel* are on the
> counsel-hour list; items marked *tax* are for a tax preparer. Nothing here sets or changes a price: prices
> come only from `OFFERINGS.md`.

# Decision sheet: the signable paper and the sales samples (2026-11)

**Answered 2026-11-06 by the operator: all picks.** Applied the same day (see each file).

Steps 3 and 4 of `STATUS.md` left 132 `[DECIDE]` markers in nine drafts, and many of them ask the same question:
the signer's title appears 6 times and the county for the courts 9 times. This sheet lists each decision once,
with the options, my pick and the reason, and every place the decision appears.

**How to answer.** The quickest way is one line in chat: "all picks", or "all picks except 10 (a), 22 (a)". You
can also write in the "Your call" lines below. Claude then applies each answer everywhere it appears and clears
the markers.

**Order.** Part 1 unblocks the first outreach email (`STATUS.md` step 5), Part 2 the first NDA, and Part 3 the
first order form. Part 4 covers what a buyer's procurement form asks.

**File codes.** Paths are relative to `Trevor Robey Intelligence Network Citations/`. Line numbers are as of
commit `5ee2e18`.

| Code | File |
|---|---|
| NDA | `08-contracts-legal/common-paper/mutual-nda.md` (the Mutual NDA cover page) |
| OF | `08-contracts-legal/common-paper/sow-template.md` (the Order Form and SOW) |
| RP | `08-contracts-legal/refund-policy-boilerplate.md` (Exhibit A, the refund policy) |
| PT | `08-contracts-legal/payment-terms.md` (Exhibit B, the payment terms) |
| VC | `11-financial-ops/vendor-onboarding-checklist.md` |
| AN | `03-platforms/aws-data-exchange/legal-name-change-request.md` (the AWS legal-name case) |
| SA | `workspace/collateral/samples/trial-design-benchmark-sample-als.md` (the Benchmark sample) |
| BP | `workspace/collateral/one-pagers/trial-design-benchmark-pack.md` (the Benchmark one-pager) |
| FA | `workspace/collateral/one-pagers/failed-trial-archaeology.md` (the Archaeology one-pager) |
| OT | `workspace/legal/nda-mutual-template.md` (the superseded NDA pointer, which holds 2 more markers) |

---

## Part 1 · Before the first outreach email (samples and one-pagers)

**1. Turnaround for the Trial Design Benchmark Pack** · PT:35, PT:185, OF:72, SA:195, BP:8, VC:149, VC:212
- (a) 5 business days after the Agreed Question is confirmed · (b) 10 business days · (c) other: ___
- **Pick (a).** Run #7 took 7 minutes of engine time. The rest of the time goes to your review, the buyer ZIP
  and the ChEMBL check. Five business days also matches "Five days." in the canonical elevator line
  (`OFFERINGS.md:5`).
- Your call: (a)

**2. Record the turnaround and your refund rule in `OFFERINGS.md`** · FA:1, FA:30
- (a) Yes. Add #1 to the Benchmark Pack row, and add your 2026-11-04 refund rule to the "Citation-Audit SLA"
  line (`OFFERINGS.md:72`): a claim within 30 days, correction and redelivery within 15 business days, then a
  refund capped at the fee as the sole remedy · (b) No. Keep them in the paper only, and the one-pagers point
  to the order form.
- **Pick (a).** The one-pagers may quote only what `OFFERINGS.md` says (FA:1). No price changes.
- Your call: (a)

**3. Failed Trial Archaeology: hold it, or sell it hand-assembled now** · FA:9, FA:22, FA:23, FA:38 (two markers)
- (a) Hold it. Its one-pager stays unsent until the engine has a template with phase and mechanism filters and
  a failure-pattern matrix; Feed v1.1 (`STATUS.md` step 7) is the building block · (b) Offer it now. An analyst
  builds the matrix by hand from the engine's graveyard memo, labelled as hand-assembled and outside the
  citation grade.
- **Pick (a).** `STATUS.md` already says "Hold its sheet". At $14,950, the part the buyer pays for would sit
  outside the guarantee, and the guarantee is the product.
- If you choose (b), set its turnaround (PT:36, PT:186, FA:34, VC:149, VC:212): (a) 10 business days · (b) other: ___
- Your call: (a)

**4. Customer runs: switch off cross-run memory, vault publish and read-back, and hosted note linking, or disclose them** · OF:140, VC:103, VC:126, VC:210, SA:131 (also OF:246)
- (a) Switch them off for customer runs. Claude builds and tests one switch for this. Today the pieces are
  separate settings, and nothing turns off the Obsidian door's post-run chain or the prior-research read-back ·
  (b) Keep them on, and disclose them in the order form, the vendor answers and the sample.
- **Pick (a).** "We do not use your question or deliverable in work for anyone else" is the sentence a pharma
  buyer will look for, and today it is false. Run #7's read-back pulled 6 records from the firm's own notes
  (SA:131).
- Your call: (a)

**5. Buyer ZIP: build it from the deliverable files only** · SA:171, BP:36
- (a) Claude writes a small builder. It copies only the order form's section-4 files out of a sealed bundle,
  writes a fresh `checksums.txt`, and refuses to build if a file is missing or any file contains a ChEMBL id ·
  (b) You assemble each buyer ZIP by hand from a checklist.
- **Pick (a).** The NSCLC proof-run export carries 25 files, including marketplace copy and Datarade listing
  files, and one slip by hand would ship them. The ChEMBL refusal also does the order form's pending
  pre-delivery check.
- Your call: (a)

**6. Two wording fixes in the generators** (asked for in SA:171 and BP:36)
- (a) Fix both with tests, then regenerate run #7's `design-benchmark.md`:
  - the "Citation-integrity scope" note in `openclaw-bridge/monetization/design-benchmark.js:166`. It says the
    grade scores claims and counted none of the table's ids. In fact the grade scores cited identifiers, and a
    cohort NCT id counts when the narrative cites it;
  - the "Source: ToolUniverse SMCP" label in `openclaw-bridge/core/tool-prefetch.js:310`, so that reports
    credit ClinicalTrials.gov, as the order form says they do.

  (b) Leave them.
- **Pick (a).** A buyer reads both, and both are wrong. Either way, run #7's own `report.md` stays unshared
  (SA:171 lists its defects).
- Your call: (a)

**7. The graveyard memo's funding-advice sentence** · SA:173
- (a) In `openclaw-bridge/monetization/graveyard-memo.js:98`, replace "Use it to avoid re-funding a path others
  have already abandoned." with neutral wording, for example "It records what each sponsor reported; it is
  not advice.", then regenerate run #7's memo · (b) Keep the sentence.
- **Pick (a).** The order form calls every Deliverable research material, "not medical, investment, legal or
  regulatory advice", and this sentence tells the reader what to fund.
- Your call: (a)

## Part 2 · Before the first NDA

**8. Signer's title** (decided once; the order form, the vendor checklist and the AWS case copy it) · NDA:44, NDA:61, OF:182, VC:57, VC:208, AN:114 (also NDA:83)
- (a) Managing Member · (b) Member · (c) Sole Member
- **Pick (a).** Your Articles record a member-managed LLC with one member, and "Managing Member" is the usual
  signature title for that member. *Counsel* (the NDA's question 7): whether a title binds the LLC when no
  operating agreement is on file.
- Your call: (a)

**9. MNDA Term** (how long the two sides may share information under the NDA) · NDA:32, NDA:62
- (a) It expires 1 year from the Effective Date (Common Paper's pre-marked choice) · (b) It continues until
  terminated.
- **Pick (a).** Once an order is signed, the order form's confidentiality section takes over for that order's
  information (order form section 9). Either side can also end the NDA early on written notice.
- Your call: (a)

**10. Term of Confidentiality** (how long shared information stays protected; under every option, trade secrets stay protected for as long as they remain trade secrets) · NDA:33, NDA:63
- (a) 1 year (Common Paper's pre-marked choice) · (b) 3 years from the date of last disclosure · (c) In perpetuity
- **Pick (b).** You are mostly the receiving side, and a buyer's indication or asset of interest stays
  sensitive for more than a year. A longer term costs you little and reads as serious. The 3 years in older
  notes was never your decision (NDA:63); choosing (b) would make it one.
- Your call: (b)

**11. County for the courts** (one answer for the NDA, the order form, both exhibits and the vendor checklist) · NDA:35, NDA:64, OF:175, RP:262, RP:308, PT:155, PT:194, VC:146, VC:213
- (a) Sacramento County, where your principal office of record is (Fair Oaks) · (b) another county: ___ ·
  (c) arbitration instead of the courts
- **Pick (a).** The NDA's Standard Terms §9 make the chosen courts exclusive. *Counsel* (the order form's
  question 1): whether to add arbitration.
- Your call: (a)

**12. Does the "draft, not reviewed by counsel" status box go to the counterparty?** (one rule for the NDA, the order form and both exhibits) · NDA:2, OF:7, RP:10, RP:302, PT:11, PT:184 (also NDA:14, OT:35, VC:141)
- (a) No. It stays on your copies, and the counterparty gets clean documents · (b) Yes. It travels with every
  document.
- **Pick (a).** The box is written to you ("prepared by Claude", "counsel review deferred until funds allow",
  "not legal advice"), and a buyer's counsel reviews the paper either way. Under (a), your 2026-11-04 rule that
  every document "says it hasn't been reviewed by counsel" applies to your copies. If you meant the buyer's
  copies too, choose (b).
- Your call: (a)

**13. Where signed NDAs are kept** · OT:31
- (a) A restricted folder in the business Google Drive, never the git repo · (b) elsewhere: ___
- **Pick (a).** A signed NDA carries the counterparty's names and signatures, and those stay out of git. Drive
  is the business account's document store, available again once step 1 restores Workspace.
- Your call: (a)

## Part 3 · Before the first order form

**14. Attach the payment terms as Exhibit B?** · OF:17 (also OF:6, PT:10, PT:195, VC:144)
- (a) Attach them · (b) Keep them as internal notes and rely on order form section 6.
- **Pick (a).** Exhibit B §2.2 stops the small print on a buyer's purchase order or supplier portal from
  changing the signed terms, and the order form does not say that on its own.
- Your call: (a)

**15. Covered identifier types: PMID, NCT, DOI** · OF:39 (also RP:343)
- (a) Confirm these three · (b) change the list: ___
- **Pick (a).** These are the three types the re-resolver checks at delivery (PubMed, ClinicalTrials.gov,
  Crossref). ChEMBL stays out until counsel answers the share-alike question.
- Your call: (a)

**16. Reproducibility manifest as a required file** · OF:224 (also OF:245, RP:347)
- (a) Keep it required, so delivery waits whenever the re-resolution pass fails · (b) Take it off the list.
  The engine can then ship without one.
- **Pick (a).** The manifest is the evidence behind "every citation re-resolved at delivery". The cost is a
  delay while a registry is down.
- Your call: (a)

**17. Cancellation** · OF:76
- (a) Free until the run starts; after that, no cancellation for convenience · (b) Free until the run starts;
  after that, part of the fee: ___ · (c) No cancellation at any time (the Standard Terms' default, §5.2)
- **Pick (a).** No money changes hands before delivery (Net 30 after delivery, no deposit), so an early exit
  costs you nothing, and once the run starts the work is done.
- Your call: (a)

**18. Minimum eligible count (M) for a free cancellation before the run** · OF:57
- (a) No fixed number. The buyer sees M before confirming the Agreed Question and can cancel free until the run
  starts (#17) · (b) A floor: either side may cancel free if M is below ___
- **Pick (a).** With #17 (a), a floor adds nothing, and Claude checks the cohort read-only before you quote
  (`STATUS.md` step 6).
- Your call: (a)

**19. Late-delivery remedy** · OF:73
- (a) Confirm Exhibit A's remedy: a 15-business-day cure after the buyer's notice, then cancellation at no
  charge · (b) replace it: ___
- **Pick (a).** It mirrors your fix-first rule, and a Deliverable that is never delivered is never invoiced.
- Your call: (a)

**20. Delivery channel** · VC:129 (its first marker), VC:212
- (a) Email the sealed ZIP from trevor@. If the buyer's mail strips ZIP attachments, send a Drive link shared
  only with the Delivery Contact · (b) a Drive link only · (c) email only
- **Pick (a).** The order form already says "by email or a secure download link", and many corporate mail
  filters strip ZIP files.
- Your call: (a)

**21. Retention of buyer inputs and deliverables** · VC:107, VC:129 (its second marker), VC:212
- (a) Keep them 12 months after delivery, then delete them, or sooner on written request · (b) keep them
  indefinitely · (c) a shorter period: ___
- **Pick (a).** Twelve months covers the 30-day claim window, a redelivery and the redelivery's own fresh
  window. Signed paper and invoices are financial records and follow tax-record rules instead. This holds only
  if #4 is (a); otherwise a run also lives on in the memory store and the vault.
- Your call: (a)

**22. Material Defect: does misattribution count, and must a defect be material?** · RP:84, RP:305, OF:111, VC:143 (also RP:218, RP:297)
- (a) Keep it narrow: only an identifier that is ungrounded, retracted or did not resolve · (b) Also count an
  author name, written beside an identifier, that the registry record does not list. That is what the
  2026-11-04 attribution check tests. Whether a source supports its sentence still does not count ·
  (c) Count any misattribution, including a source that does not support its sentence.
- Materiality: (x) none, so one bad identifier qualifies · (y) a defect must materially affect a finding.
- **Pick (b) with (x).** (b) promises only what the engine checks mechanically. Under fix-first, one bad
  citation costs a correction, not a refund. *Counsel* (the refund policy's question 5).
- Your call: (b) with (x)

**23. Refund amount** · RP:165, RP:306, VC:143
- (a) Always the full Fee for the affected Deliverable · (b) a partial refund, measured as: ___
- **Pick (a)**, the draft's own recommendation. Each service is one Deliverable, and procurement wants a fixed
  answer.
- Your call: (a)

**24. Refund timing** · RP:178, RP:307
- (a) 10 business days after the cure period ends · (b) 15 · (c) 30
- **Pick (a).** An unpaid invoice is cancelled by credit note instead (Exhibit A §7.2), so this deadline
  applies only to money you have already received.
- Your call: (a)

**25. Does an open defect claim pause the invoice?** · PT:80, PT:188, OF:119, VC:75, VC:209
- (a) No. Payment stays due at Net 30, and if the correction fails, a refund or credit note follows ·
  (b) Yes. The buyer may withhold that one invoice, in good faith, while its claim is open.
- **Pick (a)**, the draft's cash-flow recommendation. If a buyer pushes back, giving them (b) costs little,
  because the 30-day claim window and Net 30 end on the same day.
- Your call: (a)

**26. Late-payment interest** · PT:117, PT:191, OF:124, VC:76, VC:209
- (a) None · (b) a rate, checked with counsel against California limits: ___
- **Pick (a).** The Common Paper terms deliberately have none, and procurement often strikes one anyway. The
  practical lever is Exhibit B §8.2: no new work while an undisputed invoice is overdue.
- Your call: (a)

**27. An AWS private-offer route for these two services** · RP:32, RP:183, RP:303, PT:140, PT:193, VC:80, VC:209 (if yes, also the invoice date at PT:133, PT:192)
- (a) Not now. Invoice directly, and revisit once a public AWS product exists · (b) Set it up now.
- **Pick (a).** AWS professional-services offers need one public product first (board, 2026-11-04T11:35Z),
  and none exists. As a result, the business bank account, which follows the EIN in your step 2, is what stands
  between a buyer's yes and the first invoice.
- If you choose (b), date one invoice to the order form's scheduled delivery date (the draft's recommendation).
- Your call: (a)

**28. Licence: Affiliates, advisers and co-investors** · OF:131
- (a) Yes, when they are bound by confidentiality · (b) the Customer only
- **Pick (a).** Your buyers are investors and BD teams, and their diligence goes to investment committees,
  co-investors and advisers. Procurement would redline a licence that bars that first. *Counsel* (the order
  form's question 4).
- Your call: (a)

**29. Licence irrevocable once paid** · OF:132
- (a) Yes, like the §2.3 licence to Pre-Existing Materials · (b) No
- **Pick (a).**
- Your call: (a)

**30. Licence ends on a refund** · OF:133
- (a) Yes. When a Deliverable's Fee is refunded or its invoice cancelled, the licence ends and the buyer
  deletes the Deliverable · (b) No.
- **Pick (a).** Otherwise a refunded buyer keeps the report for free.
- Your call: (a)

**31. General Cap Amount** · OF:147
- (a) The Fees paid or payable under this Order Form · (b) a fixed amount: ___ · (c) a multiple of the Fees: ___
- **Pick (a).** "Or payable" closes the gap the order form's counsel question 2 raises: the fees paid stay at
  $0 until the buyer pays, Net 30 after delivery.
- Your call: (a)

**32. Claims above the cap** (Increased Claims, Increased Cap Amount, Unlimited Claims) · OF:148, OF:149
- (a) None named · (b) name them: ___
- **Pick (a)** until the counsel hour. The order form's question 2 asks exactly which claims, such as
  confidentiality, indemnity, fraud or wilful misconduct, should sit outside the cap.
- Your call: (a)

**33. Covered Claims (indemnities)** · OF:152
- (a) None for now · (b) Provider covers third-party IP claims about the Deliverable · (c) mutual
- **Pick (a).** You have no insurance, so any indemnity would be uninsured exposure. Add one after the counsel
  hour if a buyer asks (the order form's question 8).
- Your call: (a)

**34. Insurance minimums in the order form** · OF:153
- (a) None · (b) state the limits: ___
- **Pick (a)**, which matches #39: no policy is bound.
- Your call: (a)

## Part 4 · Vendor forms, tax and the AWS name change

**35. Federal tax classification, and which TIN goes on the W-9 and to AWS** · VC:72, VC:207, AN:133 (*tax*)
- (a) Stay a disregarded single-member LLC (the default) · (b) elect corporate treatment, for example as an S-corp
- **No pick: this is a tax preparer's call.** Until you elect otherwise, (a) applies, and VC:72 records what
  the W-9 then says. Claude never fills in a TIN.
- Your call: tax preparer (no pick)

**36. NAICS code** · VC:60, VC:208
- (a) 541690, Other Scientific and Technical Consulting Services · (b) 541990, All Other Professional,
  Scientific, and Technical Services · (c) other: ___
- **Pick (a).** The Census Bureau's 2022 NAICS defines 541690 as giving advice and assistance "on scientific
  and technical issues", which describes a diligence report. Use (b), the catch-all, if a form rejects (a).
- Your call: (a)

**37. Phone number for buyers** · VC:56, VC:208
- (a) Email only; give the number already on the AWS account contacts only when a vendor form requires a
  phone · (b) publish that number · (c) get a separate business number
- **Pick (a).** trevor@ is already the contact everywhere, and (a) keeps that number off sales material.
- Your call: (a)

**38. A fictitious business name statement for "Trevor Robey, INC."** · VC:53, VC:213 (*counsel*)
- (a) Ask at the counsel hour, and answer "none filed" until then · (b) file one in Sacramento County now
- **Pick (a).** This repo cites Cal. Bus. & Prof. Code §17910.5(a) as the reason customer-facing material must
  say the wordmark is not an incorporated entity. Whether a county statement is also needed, and whether one
  can carry "INC.", is a question for counsel, not a form to file alone.
- Your call: (a)

**39. Insurance quotes before the first deal** · VC:91, VC:211
- (a) Not yet. Answer "none on file", write down what each buyer requires, and get quotes when a buyer
  requires a certificate · (b) Get E&O and cyber quotes now.
- **Pick (a).** Your first targets are small and mid-size sponsors and boutique firms (`STATUS.md` step 5),
  and they ask for a certificate less often.
- Your call: (a)

**40. Signing a buyer's own paper before the counsel hour** · VC:147, VC:213
- (a) No. Offer your own paper, and if a buyer insists on its MSA, book the counsel hour first · (b) Decide case
  by case, without counsel.
- **Pick (a).** Reviewing a pharma MSA is what that hour is for.
- Your call: (a)

**41. The AWS legal-name case: open it now, or after the EIN letter** · AN:83 (also AN:121)
- (a) Wait for the CP 575 and send one complete case · (b) Open it now with the Articles, and send the EIN letter
  later.
- **Pick (a)**, the draft's own recommendation. You get the EIN in the same sitting as the filings (your step 2).
- Your call: (a)

---

## What happens after you answer

1. Claude applies each answer at every place listed above, including each draft's own list of open markers,
   and removes the resolved markers. `STATUS.md` step 3 gets one line recording the decisions.
2. If #2 is (a), `OFFERINGS.md` gets one edit adding the turnaround and the refund rule. No price changes.
3. A yes on #4, #5, #6 or #7 is also your go for Claude to build that item, with tests, uncommitted for your
   review: the customer-run switch, the buyer-ZIP builder, the two wording fixes and the memo sentence.
4. Claude then runs a `brand-check` on the sample and the one-pagers, confirms that no `[DECIDE]` is left in
   the drafts, and checks every price word for word against `OFFERINGS.md`. The commit stays yours.

## Not on this sheet: items that wait on facts or other people

These are the drafts' `[PENDING]` markers. No choice of yours settles them:
- your step 2: the EIN, the LLC-12, FTB 3522 and a certificate of status, then the business bank account;
- a CPA's answer on sales tax, and an invoicing tool;
- the data-use terms of the Claude account the engine runs on;
- the current ClinicalTrials.gov terms page, read in a browser;
- a DPA/GDPR position, for when a buyer outside the US asks;
- packager work: a Scope Statement, each record's last-update date, and a description of the changes made to
  registry fields;
- your review and `brand-check` of the samples.

## Lines that mention a marker but hold no decision

These lines are instructions, and they go away as the answers are applied: NDA:13, OF:8, OF:223, VC:4, VC:142,
VC:183.

**Coverage.** The ten files above have 122 lines that carry a `[DECIDE]` marker: the 132 markers in the nine
drafts plus 2 in the old pointer. Every one of those lines is listed in this sheet, either under a decision or
in the list just above. A script checked this on 2026-11-06.
