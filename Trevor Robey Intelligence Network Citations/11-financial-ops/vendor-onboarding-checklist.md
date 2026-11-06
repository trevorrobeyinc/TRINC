> **DRAFT 2026-11-04 — prepared by Claude from Common Paper standard terms (where used); NOT reviewed by counsel. Operator decision 2026-11-04: counsel review deferred until funds allow; recommended before the first contract is signed.**
>
> Not legal, tax or financial advice. Common Paper terms used in this document: none (it is a checklist,
> not a contract). Every `[PENDING: …]` and `[NONE on file …]` marker below is a real gap. Do not paper
> over any of them. The operator's choices were settled on 2026-11-06 (decision sheet
> `08-contracts-legal/decision-sheet-2026-11.md`, "all picks") and are written into the rows below.

# Vendor-onboarding checklist: what a buyer's procurement will ask, and where each answer lives

**What this is for.** When a buyer says yes to one of the two services, their procurement team opens a
vendor record before anything is signed or paid. This file lists what they will ask for, the answer where
one exists, the file it comes from, and what is still missing. It is internal: the operator answers
procurement from it; it is not itself sent to a buyer.

**The two services in scope** (prices verbatim from `OFFERINGS.md`, the only source of prices):

| Service | Price |
|---|---|
| Trial Design Benchmark Pack | $4,950 |
| Failed Trial Archaeology (held since 2026-11-06: not offered until the engine produces it) | $14,950 |

Paths below are relative to the engine folder
`/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations/` unless they start with `~` or `/`.

---

## 0 · Answer honestly (read this before answering any form)

- **If the answer is pending, write "pending" and, where the operator has set one, the expected date.**
  Never improvise a number, a policy, a certification, a limit or a date to get a form accepted.
- **Never invent an identifier.** No EIN, bank, DUNS or policy number exists until the document that
  issues it is in hand. A wrong number on a vendor record is worse than a blank one: it gets paid, taxed
  or audited against.
- **Never send a placeholder file.** Most files under `08-contracts-legal/`, `00-business-formation/insurance/`
  and `00-business-formation/tax/` are 3-line stubs ("Placeholder. To be filled in."). A filename is not
  an answer.
- **Pre-revenue is an acceptable answer.** There are no customers, no references, no audited financials and
  no certifications yet. Say so plainly; procurement teams see first-time vendors often.
- **Say "we don't do that" when it's true.** No PHI, no patient-level data, no clinical decision support,
  no advice. Those are part of what's being sold, not gaps.
- **The legal name is never "Trevor Robey Inc."** on any form, invoice or signature block. The party is
  always **Trevor Robey Intelligence Network Citations LLC**.

---

## 1 · Identity and standing

| What procurement asks | Answer | Where it lives | Status |
|---|---|---|---|
| Legal name | **Trevor Robey Intelligence Network Citations LLC**, exactly, no abbreviation | `00-business-formation/llc/certificate-of-formation.md` | ✅ |
| Entity type, state | California limited liability company, member-managed; sole member Trevor Robey | same file | ✅ |
| State registration number | **CA SOS Entity No. B20260217250**: Articles filed 2026-05-06, approved 2026-06-18. Certified copy **Certificate No. 457169837** (issued 2026-05-12) | same file; PDFs in `~/Documents/` and `~/Documents/457169837/` (outside the repo) | ✅ |
| Trade name / DBA | Wordmark "Trevor Robey, INC." (INC = Intelligence Network Citations, not a corporate suffix). Every customer-facing document carries: *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."* | `/Users/myhome/.claude/local-plugins/trinc-business/skills/brand-check/SKILL.md` | ✅ disclosure; ⚠ see next row |
| Fictitious business name filing | None on file. Answer "none filed" if asked. Whether a county statement is needed for the wordmark, and whether one can carry "INC.", is a counsel question (§8); do not file one before the counsel hour (operator decision 2026-11-06). | — | `[PENDING: counsel hour — whether a county fictitious business name statement is needed]` |
| Business address | **8161 Oahu Dr, Fair Oaks, CA 95628-3745**: principal office and mailing address as filed in the Articles | `00-business-formation/llc/certificate-of-formation.md` line 28 | ✅ |
| Email / website | trevor@trevorobeyinc.com · https://trevorobeyinc.com | — | ✅. Confirm business mail actually flows first (root `STATUS.md` step 1, Workspace billing). |
| Phone | Email first: trevor@trevorobeyinc.com. Give the number already on the AWS account contacts (recorded in `03-platforms/aws-data-exchange/account-access.md`) only when a vendor form requires a phone (operator decision 2026-11-06). | `03-platforms/aws-data-exchange/account-access.md` | ✅ decided |
| Authorized signatory | Trevor Robey, **Managing Member** (operator decision 2026-11-06), sole member of a member-managed LLC per the Articles. Proof of authority if asked: the certified Articles. The operating agreement is a placeholder; whether the title binds the LLC without one is NDA counsel question 7. | `00-business-formation/llc/operating-agreement.md` (placeholder); the title decision is recorded once, in the decisions table of `08-contracts-legal/common-paper/mutual-nda.md` | ✅ title decided; the NDA, the Order Form and the AWS case carry the same one |
| Good standing / certificate of status | The Statement of Information (LLC-12, due 2026-09-16) and the $800 FTB 3522 (due 2026-08-15) were both **not done** as of 2026-10-21. Clear both before any signature, then order the certificate. | `00-business-formation/compliance/compliance-calendar.md`; `filing-walkthrough-2026-10.md` | `[PENDING: LLC-12 filed and FTB 3522 paid; then a CA SOS certificate of status]` |
| DUNS / UEI / SAM.gov registration | None | — | `[NONE on file]` (answer "not registered") |
| NAICS code | **541690**, Other Scientific and Technical Consulting Services (operator decision 2026-11-06; 2022 NAICS, census.gov). If a form refuses it, 541990, All Other Professional, Scientific, and Technical Services. | — | ✅ decided |
| Small / diverse-supplier certifications | None | — | answer "none" |
| Sanctions / export screening of the vendor | Placeholder only | `00-business-formation/compliance/ofac-bis-screen.md` | `[PENDING]` |
| Conflict-of-interest check on the buyer | Placeholder only | `00-business-formation/compliance/client-conflicts-log.md` | `[PENDING]` |

---

## 2 · Tax, payment and remit-to

| What procurement asks | Answer | Where it lives | Status |
|---|---|---|---|
| EIN | Not applied for. The IRS issues it as **Notice CP 575**, to be saved outside the repo. Never write an EIN anywhere until the CP 575 is in hand. | `00-business-formation/llc/ein-confirmation.md` | `[PENDING: EIN not yet issued]` |
| Form W-9 | Not prepared. The placeholder's heading still says "Trevor Robey Inc."; correct it when you fill it in. **What the form itself says (IRS Form W-9, Rev. March 2024, read 2026-11-04):** a single-member LLC that is disregarded for federal tax puts the **owner's** name on line 1 and the LLC's name on line 2, checks the owner's classification on line 3a, and enters the **owner's SSN (or EIN, if the owner has one)**. The entity's own EIN goes on the form only if the LLC is classified as a corporation or partnership. So getting an EIN does not by itself put only the LLC's name and number on the W-9. | `00-business-formation/tax/w9.md` (placeholder); `00-business-formation/tax/s-corp-election.md` (placeholder) | `[PENDING: federal tax classification and which TIN goes on the W-9 — with a tax preparer]`. Until then the default applies (a disregarded single-member LLC). Claude never fills in a TIN. |
| Remit-to bank details | No business bank account exists; opening one is blocked on the EIN. ACH account ending 262 is the **AWS Marketplace disbursement** account. Whether it can be a remit-to for direct invoices has not been decided; the plan is an account in the LLC's name first (root `STATUS.md` step 2). | `00-business-formation/banking/` (placeholders); `03-platforms/business-identity-map.md` §1 | `[PENDING: business bank account in the LLC's name]` |
| Bank verification letter / voided check | — | — | `[PENDING]` (follows the bank account) |
| Payment terms | **Net 30 after delivery** (operator decision 2026-11-04). An open Material Defect claim does not pause the due date (operator decision 2026-11-06). | `08-contracts-legal/payment-terms.md` §4 (Exhibit B); the order form `08-contracts-legal/common-paper/sow-template.md` section 6 | ✅ decided |
| Late-payment fee / interest | None (operator decision 2026-11-06) | `08-contracts-legal/payment-terms.md` §8 | ✅ decided |
| Invoicing method / invoice template | Not built. Ask the buyer whether a PO number must appear on the invoice. | `11-financial-ops/stripe-invoicing/` (placeholders); `11-financial-ops/invoices/README.md` | `[PENDING: invoicing tool and template]` |
| Currency | USD (prices in `OFFERINGS.md` are in dollars) | `OFFERINGS.md` | ✅ |
| Discounts / payment-term discounts | None decided | — | answer "none". Never invent one. |
| Buying through AWS instead (private offer) | Not offered for these two services (operator decision 2026-11-06): invoice directly, and revisit once a public AWS product exists. `OFFERINGS.md` names AWS private offers only for the business-research tiers. The refund policy (§1.1, §8) and payment terms (§9) keep dormant AWS sections that have no effect until then. | — | ✅ decided (not now) |
| Sales tax on the services | Not determined | `00-business-formation/tax/state-sales-tax-determination.md` (placeholder: "confirm with CPA before invoicing") | `[PENDING]` |
| Financial statements / credit references / customer references | Pre-revenue: no revenue, no customers, no audited financials | — | answer honestly: "pre-revenue; none yet" |

---

## 3 · Insurance

| What procurement asks | Answer | Where it lives | Status |
|---|---|---|---|
| Certificate of insurance (E&O / professional liability, cyber, general liability) | No policy is bound and no quote has been obtained | `00-business-formation/insurance/certificate-of-insurance.md`, `bound-policy-eo-cyber.md`, `hiscox-quote.md`, `embroker-quote.md`, `vouch-quote.md` (all placeholders) | `[NONE on file — E&O/cyber quotes not obtained]` |
| Minimum limits the buyer requires | Write down the buyer's stated requirement; do not promise a policy or a date. Quotes are obtained only when a buyer requires a certificate (operator decision 2026-11-06). | — | ✅ decided (no quotes before the first deal) |

---

## 4 · Security and data handling

| What procurement asks | Answer | Where it lives | Status |
|---|---|---|---|
| Security questionnaire, CAIQ-Lite | Placeholder only | `08-contracts-legal/caiq-lite-answers.md` (3 lines) | `[PENDING]` |
| Security questionnaire, SIG-Lite | Placeholder only | `08-contracts-legal/sig-lite-answers.md` (3 lines) | `[PENDING]` |
| SOC 2 / ISO 27001 report | None | — | answer "none; one-person firm; questionnaire answers available on request" (once written) |
| Data-handling statement | Draft text below (§4a) | this file | draft. Confirm the `[PENDING]` items in it before sending. |
| Subprocessors | Anthropic (the Claude models that draft the report); Google Workspace (business email, where questions and NDAs arrive); AWS only if a sale goes through AWS. The engine runs on the operator's personal Claude Max subscription, not a business account. **Customer runs are isolated (operator decision 2026-11-06):** a customer's order runs from the CLI with `node scripts/run-workflow.js … --customer-run`, never through the Obsidian door. That switch turns off the prior-research read-back, the research-memory priors and ingest, and vault publish for the run; because nothing from it reaches the vault, the vault's hosted note linking (`copilot-plus-flash`) never sees it either. Internal runs still use all of those features. **Two words, two jobs:** on a security or data-protection questionnaire, Anthropic is a *subprocessor* (a third party that processes the buyer's data for us); under the order form it is a *tool*, not a *Subcontractor* in the Common Paper PSA §1.5 sense (someone who performs the services and needs the buyer's prior consent), which is why order form section 7 discloses it and records the buyer's consent. | `03-platforms/business-identity-map.md` §1 R4, §2; `config/vault-publish.json`; order form section 7 | `[PENDING: confirm the data-use / model-training setting and the terms that apply to the operator's Claude account before answering any AI or subprocessor question]` · ✅ customer-run isolation decided (same decision as order form section 7) |
| HIPAA / BAA | No PHI is requested, received, hosted or processed. The assessment file is a placeholder. If a buyer wants to send PHI, stop: it is out of scope. | `00-business-formation/compliance/hipaa-assessment.md` (placeholder); `OFFERINGS.md` "Posture" | ✅ posture; `[PENDING]` written assessment |
| GDPR / personal data / DPA | Only business-contact details of the buyer's staff. Public registry records can name trial investigators. The DPA/SCC file is a placeholder. Order form section 8 says the same and leaves the DPA as `[PENDING: DPA / GDPR position]`. | `00-business-formation/compliance/gdpr-scc-module-2.md`; `08-contracts-legal/common-paper/dpa.md` (placeholders) | `[PENDING: DPA / GDPR position]` |
| Where data is stored | Not written down | — | `[PENDING: where work files and deliverables are stored]` |
| Retention and deletion | Each order's inputs and deliverable are kept 12 months after delivery, then deleted; sooner on written request. Signed paper and invoices are financial records and follow tax-record rules instead (operator decision 2026-11-06). | — | ✅ decided |
| Generative-AI use | Yes: Claude models draft the report, inside a citation-integrity gate (§5). Say so up front; pharma questionnaires increasingly ask. | `OFFERINGS.md` "Brand Commitments" | ✅ |

**Do not send** `03-platforms/aws-data-exchange/adx-provider-qualification/data-integrity-and-security.md`
as a security answer. It was written for the 2026 AWS Data Exchange qualification. Its own README says to
confirm controls before attesting them (malware scanning, secrets manager). It names the unlicensed drug
database, and it describes ChEMBL attribution, which contradicts the ChEMBL exclusion below.

### 4a · Data-handling statement: draft for buyers (not reviewed by counsel)

> Trevor Robey Intelligence Network Citations LLC ("Trevor Robey, INC.") produces research artifacts from
> public sources: clinical-trial registry records (ClinicalTrials.gov) and bibliographic records (PubMed
> and Crossref, among others). The full list for each engagement is shipped in the deliverable's search-coverage
> ledger. We do not request, receive, host or process protected health information (PHI) or patient-level
> data. The only buyer information we use is the research question agreed in the order form (for example an
> indication or mechanism), which we treat as Confidential Information under the NDA before an order and
> under the order form once one is signed. Search terms derived from that question are sent as queries to the
> public registries' interfaces. The question and the public records retrieved are processed by a third-party
> large language model provider (Anthropic) to draft the report. `[PENDING: data-use terms of that account]`.
> We do not use a buyer's question or deliverable in work for anyone else: a buyer's order is run with our
> engine's customer-run setting, under which no earlier research is read into the run and nothing from it is
> added to our research memory or notes. The deliverable is one sealed ZIP bundle, handed over directly: by
> email from trevor@trevorobeyinc.com, or by a download link shared only with the buyer's delivery contact
> when their mail filters strip ZIP attachments. Retention: each order's inputs and deliverable are kept for
> 12 months after delivery and then deleted, or sooner on written request. Deliverables are research
> artifacts only, not medical, investment, legal or regulatory advice, and not validated for clinical
> decision support.
>
> *Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*

---

## 5 · Contract documents and deliverable scope

| What procurement asks | Answer | Where it lives | Status |
|---|---|---|---|
| Mutual NDA | Common Paper Mutual NDA cover page naming the LLC, drafted 2026-11-04; its terms were settled on 2026-11-06. Only its Cover Page block goes to a counterparty; status boxes stay on the operator's copies (operator decision 2026-11-06). `workspace/legal/nda-mutual-template.md` is now a pointer to it. `workspace/legal/CommonPaper-Mutual-NDA-v2.pdf`, a saved 404 web page rather than an NDA, was removed 2026-11-04. | `08-contracts-legal/common-paper/mutual-nda.md` | draft, not reviewed by counsel |
| Order form / SOW | Order Form and SOW, drafted 2026-11-04; the operator's choices were settled on 2026-11-06 (Common Paper Professional Services Agreement Standard Terms incorporated by reference). Order of precedence: Order Form, Exhibit A (refund policy), Exhibit B (payment terms), Standard Terms. | `08-contracts-legal/common-paper/sow-template.md` | draft, not reviewed by counsel; fill its blanks and `[PENDING]` items before sending |
| Refund policy | `08-contracts-legal/refund-policy-boilerplate.md`, *Refund Policy: the Citation-Audit SLA for research deliverables* (draft, version 2026-11-06, not reviewed by counsel), attached to the order form as Exhibit A and incorporated by its section 5. **Operator rule, 2026-11-04:** the buyer reports a Material Defect within 30 days of delivery; the LLC corrects and redelivers within 15 business days; if it is still defective, a refund of the full fee paid for the affected deliverable is the sole and exclusive remedy. Exhibit A §2 holds the only Material Defect definition: a cited identifier that is ungrounded, retracted or did not resolve at delivery, or that carries an author name the registry record does not list (operator decision 2026-11-06); the order form refers to it. | that file; order form section 5 | draft; its choices were settled on 2026-11-06 |
| Payment terms | `08-contracts-legal/payment-terms.md`, *Payment Terms: research services* (draft, version 2026-11-06, not reviewed by counsel): Net 30 after delivery, ACH or wire, PO handling, bank-detail-change rule, taxes. Attached to every order form as Exhibit B (operator decision 2026-11-06). | that file; order form section 6 | draft, not reviewed by counsel |
| (not for services deals) AWS Data Exchange refund policy | `03-platforms/aws-data-exchange/refund-policy.md` is a counsel-pending **service-credit** policy for **AWS Data Exchange subscriptions** only. It shares the 30-day claim window and California law with the services rule but uses a different remedy. Do not send it for a direct services deal. | that file | n/a |
| Governing law / venue | Governing law **California** (operator decision 2026-11-04). Venue: the state and federal courts in **Sacramento County**, exclusive (operator decision 2026-11-06). | — | ✅ decided; whether to add arbitration is a counsel question (§8) |
| "Sign our paper instead" | Many pharma buyers require their own MSA. Policy (operator decision 2026-11-06): offer our paper; if a buyer insists on its own MSA, book the counsel hour before signing. Reviewing a buyer's MSA is a counsel task. | — | ✅ decided |
| Sample deliverables | Trial Design Benchmark Pack: `workspace/collateral/samples/trial-design-benchmark-sample-als.md` (run #7, 2026-11-04; replaced the NSCLC run #6 sample, now in `.archive/`). Failed Trial Archaeology: `workspace/collateral/samples/failed-trial-archaeology-sample-heart-failure.md`. | those paths | drafts written 2026-11-04. `[PENDING: operator review and brand-check before either goes to a buyer]` |
| Turnaround | Trial Design Benchmark Pack: 5 business days after the Agreed Question is confirmed. Failed Trial Archaeology: not offered yet (held, operator decision 2026-11-06). `OFFERINGS.md` gives a written Speed SLA only for Investor Pre-Mortem. | `OFFERINGS.md` | ✅ decided |

**Deliverable scope: say it this way, no stronger.**

- Each deliverable is one sealed ZIP bundle with exactly the files order form section 4 lists: the report
  (`report.md`), the citation index (`tables.csv`), the citation-integrity ledger (`citation-integrity.md`), the
  search-coverage ledger (`search-coverage.md`), the reproducibility manifest (`.md` and `.json`), the graveyard
  memo (`graveyard-memo.md`) and `checksums.txt`; the Trial Design Benchmark Pack adds `design-benchmark.md` and
  `.csv`. **Both services ship the graveyard memo.** Nothing else goes in: the engine's export ZIP also carries
  marketplace copy and listing files, which are never part of a customer delivery.
- **ChEMBL identifiers are excluded from paid deliverables** until counsel answers the CC BY-SA 3.0 share-alike
  question (§8). Paid bundles are checked before delivery to cite PMID, NCT and DOI identifiers only: the
  buyer-ZIP builder (`scripts/build-buyer-zip.js`, 2026-11-06) refuses any bundle that carries a ChEMBL
  identifier. Two earlier NSCLC benchmark bundles (`workspace/releases/offer-3dec35098e8e47e2d0a72012/`,
  `offer-7e373eb2de36a7a2e73e7c1c/`) carry ChEMBL ids, so the first-sale-gate skill's "no shipped bundle
  contains a ChEMBL identifier" is stale. The check is step 7 in §6.
- Every PMID, NCT and DOI cited in the narrative report is re-resolved against its public registry at delivery.
  Re-resolution shows an identifier points to a real record; it does not validate the source's conclusions.
  Retraction screening is Crossref + PubMed. The benchmark tables and the graveyard memo are rendered without
  a language model straight from the registry records retrieved, each row linked to its record; they are not
  separately re-resolved (the memo in the benchmark bundle checked cites 1,420 NCT numbers, none in the
  manifest). (`OFFERINGS.md` "Brand Commitments" scope (b); `SYSTEM-REALITY.md` "GAP CLOSED"; order form
  section 8.)
- The protocol amendment-risk band is **paused** (ClinicalTrials.gov has refused the change-history requests
  since 2026-10-08). Do not list it as part of the deliverable.
- Research artifacts only: not medical, investment, legal or regulatory advice; no PHI processed.

---

## 6 · Order of work before the first "yes" can become an invoice

1. Business mail working (root `STATUS.md` step 1).
2. EIN → CP 575; FTB 3522; LLC-12 (`STATUS.md` step 2; `00-business-formation/compliance/filing-walkthrough-2026-10.md`).
3. Business bank account in the LLC's name; W-9 decided with a tax preparer.
4. NDA, order form with Exhibit A (refund policy) and Exhibit B (payment terms), and the two samples (the
   2026-11-04 drafts), each through `brand-check`. Their choices were settled on 2026-11-06 (decision sheet).
5. Then fill in this checklist's `[PENDING]` rows from the documents themselves, not from memory.
6. Counsel hour before the first signature, once funds allow (§8).
7. **Before every delivery** (order form operator notes, "Before every delivery"): build the customer ZIP
   with `node scripts/build-buyer-zip.js --offer-id <offer-…> --out <file.zip>`, which copies only the order
   form section 4 files, writes a fresh `checksums.txt` over exactly those files, and refuses if a file is
   missing or any file contains a ChEMBL identifier. Never send the engine's export ZIP
   (it carries `store-copy.md`, which names ChEMBL as a source, `sample-preview.md`, `offer.json`,
   `release-approval.json` and `submission/` marketplace files); search every file for `CHEMBL` (and
   ChEMBL-derived fields such as `chemblId`) and remove any hit or regenerate; confirm the reproducibility
   manifest exists and shows no UNRESOLVED identifier.

---

## 7 · Every open marker in this file

- `[PENDING: EIN not yet issued]`
- `[PENDING: business bank account in the LLC's name]`, and the bank verification letter after it
- `[NONE on file — E&O/cyber quotes not obtained]`
- `[PENDING]`: CAIQ-Lite and SIG-Lite answers (placeholders)
- `[PENDING: LLC-12 filed and FTB 3522 paid; then a CA SOS certificate of status]`
- `[PENDING: operator review and brand-check of the two samples before either goes to a buyer]`
- `[PENDING: invoicing tool and template]` · `[PENDING]` sales-tax determination
- `[PENDING]`: sanctions screen, conflicts log, HIPAA written assessment · `[PENDING: DPA / GDPR position]`
- `[PENDING: data-use / model-training setting and terms of the operator's Claude account]`
- `[PENDING: where work files and deliverables are stored]`
- `[PENDING: federal tax classification and which TIN goes on the W-9 — with a tax preparer]`
- `[PENDING: counsel hour — whether a county fictitious business name statement is needed]` (answer "none
  filed" until then)
- `[NONE on file]`: DUNS / UEI / SAM.gov

**Settled on 2026-11-06** (decision sheet `08-contracts-legal/decision-sheet-2026-11.md`, "all picks"), now in
the rows above: phone, signer's title (Managing Member), NAICS 541690, a pending claim does not pause the due
date, no late-payment interest, no AWS private-offer route for now, customer-run isolation, no insurance
quotes before the first deal, retention 12 months, delivery channel, turnaround, venue (Sacramento County),
and offering our own paper before the counsel hour.

### Open markers in the sibling files (updated 2026-11-06; each file's own list governs)

- **`08-contracts-legal/common-paper/mutual-nda.md`:** none; its terms were settled on 2026-11-06.
- **`08-contracts-legal/common-paper/sow-template.md` (order form):** `[PENDING]` business bank account
  (payment instructions) · `[PENDING]` Claude account data-use terms · `[PENDING]` DPA / GDPR position ·
  `[PENDING]` ClinicalTrials.gov last-update dates and modification description · operator notes:
  `[PENDING]` customer ZIP build, `[PENDING]` CHEMBL check, `[PENDING]` post-run-chain switch, `[PENDING]`
  live ClinicalTrials.gov terms check, optional `[PENDING]` re-resolver for memo and tables.
- **`08-contracts-legal/refund-policy-boilerplate.md` (Exhibit A):** `[PENDING]` Scope Statement.
- **`08-contracts-legal/payment-terms.md` (Exhibit B):** `[PENDING]` W-9 classification and TIN ·
  `[PENDING]` bank account · `[PENDING]` sales tax.

## 8 · Questions for the future flat-fee counsel hour (book before the first signature)

1. **Governing law and venue.** California law and the Sacramento County courts are decided; is the clause
   enforceable as drafted against an out-of-state pharma buyer, and should arbitration be added?
2. **Refund cap and sole remedy.** Does "correct and redeliver within 15 business days, then refund capped at the fee
   paid, as the sole and exclusive remedy" hold up as written, and how should it interact with the limitation of
   liability?
3. **ChEMBL CC BY-SA 3.0 share-alike.** Does citing ChEMBL identifiers or ChEMBL-derived facts in a paid report
   trigger share-alike on the report? Until answered, ChEMBL identifiers stay out of paid deliverables.
4. **Fictitious business name.** Does using the wordmark "Trevor Robey, INC." with the disclosure line require a
   county fictitious business name statement, and can one carry "INC."? (Answer "none filed" until then.)
5. **Buyer paper.** What must be checked before signing a buyer's own MSA instead of ours?

Separate, for a tax preparer (not counsel): the LLC's federal classification and which TIN goes on the W-9.

## Sources read for this file (2026-11-04)

- IRS Form W-9 (Rev. March 2024), https://www.irs.gov/pub/irs-pdf/fw9.pdf: name lines and Part I TIN rules for a
  single-member disregarded LLC. Also https://www.irs.gov/instructions/iw9 (page revised 03/2024).
- Repository canon: `OFFERINGS.md`; `03-platforms/aws-data-exchange/refund-policy.md`;
  `03-platforms/business-identity-map.md`; `00-business-formation/llc/certificate-of-formation.md`;
  `00-business-formation/llc/ein-confirmation.md`; the brand-check and first-sale-gate skills; root `STATUS.md`.
- Checked while applying the 2026-11-04 review: `config/vault-publish.json` (vault publish and
  `researchMemory` both `"enabled": true`); `workspace/releases/offer-2bc4ee4a8cfd54e0a788a0b0/` and its export
  ZIP (25 files; `graveyard-memo.md` 1,420 distinct NCT numbers, the reproducibility manifest 21, overlap 0);
  `workspace/releases/offer-3dec35098e8e47e2d0a72012/` and `offer-7e373eb2de36a7a2e73e7c1c/` (ChEMBL ids in
  `report.md` / `tables.csv`).

---

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*
