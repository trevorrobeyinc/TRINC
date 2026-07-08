# AWS Data Exchange — Provider Qualification (Re-Application)

**Submitted via:** AWS Marketplace Seller Operations — Case 00881277 ("AWS Data Exchange — Onboarding Request")
**Nature of this submission:** Re-application following a prior ADX provider application that was not approved (~2026-05-03), which was returned with the message that the *"proposed solution does not currently meet these criteria."* This document is written to be pasted into the case thread and is also retained in our repository as a runbook artifact.

---

## 1. Provider Identity & Legal Entity

- **Legal entity:** Trevor Robey Intelligence Network Citations LLC — a California limited liability company.
- **California Entity No.:** B20260217250 (approved 2026-06-18 by the California Secretary of State).
- **Wordmark:** "Trevor Robey, INC." (INC = *Intelligence Network Citations*).
- **AWS account ID:** 833390816446.
- **Contact:** trevor@trevorobeyinc.com
- **Website:** https://trevorobeyinc.com
- **Onboarding readiness:** Tax interview completed; U.S. bank account on file.

We understand that a public seller-profile verification and a disbursement-method review are also in progress as separate AWS-side holds. This document addresses ADX **provider eligibility** specifically and does not assume those separate reviews are resolved by it.

---

## 2. Positioning

Trevor Robey Intelligence Network Citations LLC is a **regularly-updated, public-domain biomedical data-feed provider.**

We want to be explicit about a reframing relative to our first application: we are positioning ourselves as a **subscription data-feed publisher**, not a bespoke, one-off-report shop. Our flagship product (the Trial Graveyard Feed) is a standardized, schema-stable dataset that refreshes on a published monthly cadence and ships as versioned ADX revisions — designed for ongoing subscription consumption rather than custom client engagements.

---

## 3. Products & Offers

**1. Pharmacovigilance Sample Pack — FREE public offer.**
A no-cost sample dataset: 10 immune-checkpoint-inhibitor adverse-event signals plus 29 verified-identifier rows. Delivered as CSV. This product is already built and is upload-ready; we are prepared to publish it immediately upon qualification so AWS and prospective subscribers can evaluate our data quality directly. It serves as a fixed evaluation sample (not a recurring feed); the recurring, regularly-updated product is the Trial Graveyard Feed below.

**2. Trial Graveyard Feed — paid subscription (with a free single-therapeutic-area teaser).**
A monthly, per-therapeutic-area, NCT-traced feed rendered **deterministically, with no LLM in the data path.** Each row represents a terminated, withdrawn, or suspended ClinicalTrials.gov trial and includes:
- verbatim `whyStopped` text (or an explicit `(none stated by sponsor)` when absent),
- protocol-version count,
- the most-amended protocol modules,
- a LOW / MODERATE / HIGH amendment-risk band, and
- a resolvable study URL.

Delivered as CSV, with Parquet for paid subscribers. Offered as a free single-TA teaser plus a paid auto-renewing subscription, with monthly **immutable** revisions.

**3. Pharmacovigilance Signal Register — roadmap.**
A planned per-drug-class monthly feed derived from openFDA / FAERS. Listed here for transparency about direction; it is not part of the immediate launch.

---

## 4. Data Eligibility & Licensing

Our datasets are built **exclusively from public-domain and open biomedical sources**, and the licensing posture is the core of our eligibility case.

**Sources used:**
- PubMed (NLM)
- ClinicalTrials.gov (NIH)
- openFDA (FDA)
- RxNorm (NLM)
- PubChem (NIH)
- ChEMBL (CC-BY-SA) — **cited by identifier only; data values are never redistributed.**
- UniProt (CC-BY)

**No PHI — architectural zero.** Our pipeline does not ingest, store, or process protected health information at any stage. Outputs are aggregated and anonymized research findings only.

This maps directly onto AWS's own stated permitted example — *"aggregated or anonymized research findings from pharmaceutical drug studies"* — and onto the **"Publicly Available Information"** category covering government / NIH / FDA records.

**License-governance differentiator — DrugBank is excluded, and the exclusion is enforced in code.** DrugBank is not used. Rather than relying on policy alone, our build enforces a **fail-closed license-allowlist guard**: any source not on the approved-license allowlist halts the build. For attribution-licensed sources such as ChEMBL, we restrict usage to **identifiers only** and do not redistribute licensed data values, keeping our output within the public-domain / open-license envelope.

---

## 5. Update Cadence (regularly-updated data)

- **Trial Graveyard Feed:** refreshed **monthly**, shipped as versioned ADX revisions, each accompanied by a changelog. Each monthly revision is immutable once published, and revision history is preserved so subscribers can track changes over time.
- **Pharmacovigilance Sample Pack:** a fixed evaluation sample; it is provided as a one-time free reference rather than a recurring feed.

The monthly versioned-revision model demonstrates a concrete, repeatable means of keeping the subscription data regularly updated.

---

## 6. Customer Support Process

- **Response target:** subscriber support inquiries answered **within one business day.**
- Support intake is via our published business contact (trevor@trevorobeyinc.com).
- Our support and refresh processes are documented as artifacts, so support is a defined process rather than ad hoc.

---

## 7. Data Integrity & Security (data free of vulnerabilities)

Our data-integrity and security controls are built into the publishing pipeline:

- **Zero-fabrication citation gate** — no citation or identifier is emitted unless it traces to a verifiable source.
- **Per-delivery Reproducibility Manifest (live re-resolution).** Beyond grounding citations against the evidence fetched during research, every cited identifier is **programmatically re-resolved against its issuing public registry at delivery** (PubMed E-utilities, ClinicalTrials.gov API v2, Crossref/doi.org, PubChem, RxNorm, ChEMBL, UniProt). Each result — VERIFIED / UNRESOLVED / UNCHECKED, with the URL queried and a UTC timestamp — is recorded in a Reproducibility Manifest shipped with the dataset, so a subscriber can re-run the listed URLs and reproduce the verdicts. A cited identifier that does not resolve in its source registry **fails the delivery closed** (the dataset does not ship); identifiers that could not be checked are listed UNCHECKED, never as verified.
- **Crossref DOI retraction screen** — DOIs are screened against retraction status.
- **Schema and de-duplication validation** on every build.
- **Malware scan + checksum** on published artifacts.
- **Least-privilege** access across the pipeline.
- **Manual approval gate** — there is no autonomous publishing; a human approves every revision before it ships.

These controls — anchored by the per-delivery Reproducibility Manifest — are intended to ensure published artifacts are validated, reproducible, and free of malware before delivery.

---

## 8. Account Standing & Compliance

- **AWS customer in good standing:** our AWS account (833390816446) is active, the tax interview is completed, and a U.S. bank account is on file.
- **Subscription verification:** we will enable subscription verification, which we understand is mandatory on public offers.
- **No PHI** is ingested, stored, or processed.
- **No clinical decision support** is provided.
- **Research-use-only:** all products are offered for research use only.

---

## 9. The Ask

This is a re-application. The prior application was returned with the message that the *"proposed solution does not currently meet these criteria,"* and we understand AWS does not publish per-applicant rejection reasons. To close the gap efficiently, we respectfully request:

1. **Confirmation of our current ADX provider eligibility status** under Case 00881277.
2. **The specific criterion** the prior application did not meet, so we can address it precisely.
3. **The exact steps** required to qualify as an ADX data provider.
4. Please note that we are **ready to publish the free Pharmacovigilance Sample Pack immediately upon qualification**, so AWS can evaluate our data quality directly.

We believe the public-domain / open-license sourcing, the architectural absence of PHI, the enforced DrugBank exclusion, the deterministic (no-LLM) rendering of the Trial Graveyard Feed, and the regularly-updated monthly subscription model together align with ADX provider requirements. We welcome specific guidance on any remaining gap.

Thank you for your time and review.

— Trevor Robey Intelligence Network Citations LLC ("Trevor Robey, INC.")
