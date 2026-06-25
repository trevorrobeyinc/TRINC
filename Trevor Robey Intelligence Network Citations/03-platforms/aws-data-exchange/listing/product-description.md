# AWS Data Exchange — Listing Copy

**Product:** Pharmacovigilance Signal Synthesis — Free Citation-Traced Sample Pack (free tier of a single Files-type data set; paid offers attached to the same product)
**Provider entity:** Trevor Robey Intelligence Network Citations LLC (California LLC, Entity No. B20260217250)
**Wordmark:** Trevor Robey, INC.
**AWS account:** 833390816446
**Prepared:** 2026-06-18 · Pricing per REVENUE_PLAYBOOK 2026-04-30 ladder · Legal text marked **DRAFT — for counsel review**

> How to use this document: each section maps to an AWS Data Exchange listing-wizard field. Field names match AWS UI labels. All product copy is accurate to what is actually delivered: the **free sample** ships CSV only; **Parquet, Amazon S3, and Athena-queryable delivery are features of the paid offers**, not of the free sample. Do not advertise any data source under a stop-ship license (e.g., DrugBank) in this listing.

---

## 1. Product title

**Field:** Product name (max 72 chars, ASCII, unique)

```
Pharmacovigilance Signal Synthesis - Free Citation-Traced Sample Pack
```

(67 characters, ASCII only.)

---

## 2. Short description

**Field:** Short description (max 200 chars, shown on catalog tiles)

```
Citation-traced pharmacovigilance signals for biotech investors and pharma BD/CI. 10 immune-checkpoint-inhibitor adverse-event signals; 29 verified identifier rows (PMID, NCT, ChEMBL, RxNorm). Free sample.
```

(204 chars — trim to under 200 before paste; suggested 199-char variant below.)

```
Citation-traced pharmacovigilance signals for biotech investors and pharma BD/CI. 10 ICI adverse-event signals; 29 verified identifier rows (PMID, NCT, ChEMBL, RxNorm). Free sample from Trevor Robey, INC.
```

(199 chars.)

---

## 3. Long description

**Field:** Long description (Markdown supported; must accurately state data coverage and update frequency)

### Product summary

This free sample pack demonstrates the citation-traced pharmacovigilance methodology behind Trevor Robey, INC.'s paid biomedical due-diligence deliverables. Every adverse-event signal in the included CSV files resolves to a verifiable identifier — PubMed PMID, ClinicalTrials.gov NCT, ChEMBL ID, RxNorm, PubChem CID, UniProt, MedDRA PT, DailyMed SPL, or DOI — in a public source database. The sample contains no fabricated citations: each identifier in the citation index is a real, resolvable reference you can check yourself in the named source.

The sample focuses on immune checkpoint inhibitor (ICI) class adverse events — myocarditis, colitis, pneumonitis, and hepatitis — plus three glioblastoma drug-repurposing safety signals, derived from FDA Adverse Event Reporting System (FAERS/AEMS, via OpenFDA) disproportionality analysis and peer-reviewed literature.

### What you get in this free sample

- **`signal-register.csv`** — 10 pharmacovigilance signals (16 columns), each with a disproportionality metric (Reporting Odds Ratio or Proportional Reporting Ratio), a severity tier (Critical / High / Moderate), MedDRA preferred term and System Organ Class, RxNorm-normalized compounds, and a recommended monitoring/clinical action.
- **`citation-index.csv`** — 29 citation rows (5 columns) mapping every signal to verifiable public-database identifiers across nine identifier systems (PMID, DOI, NCT, RxNorm, PubChem CID, UniProt, ChEMBL, MedDRA PT, DailyMed SPL), with the source database and a foreign key back to each signal.

### Key features

- **Citation traceability you can audit.** Every one of the 10 signals maps to a real PMID, NCT, ChEMBL ID, RxNorm, or DOI — resolvable in the named source database. No AI-fabricated identifiers.
- **Disproportionality grounded in reporting data.** Reporting Odds Ratios and Proportional Reporting Ratios reflect FDA adverse-event reporting analysis, not parametric language-model output.
- **Cross-file integrity.** Every `signal_id` in the signal register appears in the citation index, so the provenance trail is complete and reproducible.
- **No PHI.** All sources are public biomedical databases (FDA OpenFDA, DailyMed, RxNorm, PubMed, ClinicalTrials.gov, ChEMBL, UniProt, PubChem, MedDRA). No protected health information is hosted, transmitted, or processed.
- **A preview of the paid methodology.** This sample shows the citation-discipline approach used in the paid deliverables described below.

### Paid offers on this product

This sample is the free tier of a single product. Paid deliverables are sold as private offers (custom terms per buyer). The paid tiers extend the same citation-traced methodology into full due-diligence dossiers, delivered as report PDFs plus structured CSV/Parquet:

| Offer | For | Price | What's included |
|---|---|---|---|
| Investor Pre-Mortem (primary) | Biotech hedge funds, biotech-specialist VC, pharma BD/licensing | $9,950 anchor / $14,950 standard / $19,950 custom (custom adds KOL primary research) | Per-asset risk dossier: trial design, comparable failures, KOL sentiment, IP runway — every claim PMID/NCT/ChEMBL/DOI-traced; 5–10 business days; refund-backed citation-audit SLA |
| Failed Trial Archaeology (flanking) | Pharma R&D competitive intelligence, biotech VC diligence | $14,950 | Structured post-mortem of Phase 2/3 terminations within a single mechanism; NCT-indexed failure-pattern matrix |
| Conference Synthesis Brief | Pharma R&D, investors, BD/licensing (event-driven) | $4,950 / conference | Synthesis of 500+ ASCO/ESMO/AACR abstracts; 24–48 hour turnaround |
| Trial Design Benchmark Pack | Biotech R&D, pharma CI | $4,950 | Comparative Phase 3 structure benchmarked against 10–20 comparable programs |
| Cross-Silo Connector Report | Pharma R&D, biotech partnerships | $9,950 – $24,950 | Mechanistic links surfaced across ChEMBL, PubMed, and ClinicalTrials.gov |
| Plain-Language Patient Brief | Patient-advocacy groups, trial sponsors | $2,500 | EU CTR 536/2014 plain-language summary at 8th-grade literacy |
| Pharmacovigilance Pack (tactical) | Mid-market pharma safety teams | $2,500 – $4,950 | Multi-section pharmacovigilance dossier with citation index, executive summary, and evidence-provenance appendix |

Paid deliverables can be delivered into your own AWS environment — Amazon S3 buckets and Athena-queryable Parquet — or via Snowflake/BigQuery federation, by private offer. Contact us to scope an engagement.

### Data sources

| Source | Use in this product |
|---|---|
| FDA FAERS / AEMS (via OpenFDA) | Adverse-event disproportionality (ROR, PRR) |
| DailyMed | Structured product labeling and boxed-warning surveillance |
| RxNorm | Drug-name normalization and cross-database linkage |
| PubMed / MEDLINE | Peer-reviewed pharmacovigilance literature |
| ClinicalTrials.gov | Trial-level safety endpoints |
| ChEMBL | Bioactivity and target-pharmacology data |
| UniProt | Enzyme and channel target identification |
| PubChem | Chemical-compound properties |
| MedDRA | Adverse-event preferred-term taxonomy |

### Coverage and update frequency

- **Update frequency:** Static. This free sample is a one-time, fixed dataset. It is not on a recurring update schedule. Paid deliverables are produced per mission (typical turnaround 24–48 hours for the Conference Synthesis Brief; 5–10 business days for the Investor Pre-Mortem).
- **Time period covered:** Adverse-event reporting through 2024-Q4; cited literature spans 2008–2024.
- **Geographic coverage:** Global. FDA reporting data is US-centric; literature and ClinicalTrials.gov coverage is international.
- **Format:** CSV (RFC 4180, UTF-8, ASCII content). Two files; under 10 KB combined; 39 rows total (10 signals + 29 citations).

### Limitations and compliance

- **Research artifacts only.** Outputs are not validated for clinical decision support, pharmaceutical prescribing, diagnosis, regulatory submission, or any professional medical use, and must not be used as the sole basis for any such decision.
- **No PHI.** All sources are public biomedical databases. No protected health information is hosted, transmitted, or processed. Subscribers who combine these outputs with their own PHI remain solely responsible for that PHI and for HIPAA, GDPR, and other applicable privacy compliance.
- **Independent verification is the buyer's responsibility.** Buyers are responsible for independently verifying each cited claim against its source database and for compliance with all applicable laws, regulations, and the licensing terms of the upstream data sources cited.
- **Upstream attribution.** Cited identifiers reference content owned by their respective sources (NLM, FDA, EMBL-EBI, MedDRA MSSO, and others). Provider does not relicense or sublicense upstream sources. Upstream licenses are mixed — mostly US-Government public domain; ChEMBL is CC-BY-SA 3.0.

### About the provider

Trevor Robey, INC. delivers citation-traced biomedical due-diligence reports and datasets for biotech investors and pharma business-development, competitive-intelligence, and safety teams. Every cited claim resolves to a real PubMed PMID, ClinicalTrials.gov NCT, ChEMBL ID, or DOI; sources are public-domain biomedical databases.

Contact: trevor@trevorobeyinc.com · https://trevorobeyinc.com

---

## 4. Highlights

**Field:** Highlights (1–3 short bullets; at least 1 required)

1. **Every claim is verifiable.** All 10 signals trace to a real PMID, NCT, ChEMBL ID, RxNorm, or DOI — no AI-fabricated citations.
2. **Disproportionality grounded in reporting data.** Reporting Odds Ratios and Proportional Reporting Ratios reflect FDA adverse-event reporting analysis, not language-model output.
3. **Audit-ready provenance.** Every signal-to-citation mapping is reproducible and independently checkable in the source database.

---

## 5. Product categories

**Field:** Product categories (AWS allows a maximum of two per listing)

Per the registered AWS seller profile, the entity's categories are **Healthcare, Life Sciences, Financial Services**. Because AWS Data Exchange caps a single listing at two categories, choose the two that match the listing surface:

- **Primary:** Healthcare & Life Sciences
- **Secondary:** Financial Services *(reflects the biotech-investor / hedge-fund / pharma-BD buyer base)*

> Note for the operator: AWS permits at most two categories per product. The seller profile's three-category set (Healthcare, Life Sciences, Financial Services) describes the business overall; on this individual listing, pick two. If the wizard treats "Healthcare" and "Life Sciences" as separate taxonomy entries, those two cover the clinical-content fit; substitute "Financial Services" if the buyer-base framing is preferred.

---

## 6. Target buyers

| Buyer | Why this product fits |
|---|---|
| Biotech hedge funds and biotech-specialist VC | Evaluate ICI-class and other assets for portfolio risk; the sample previews the Investor Pre-Mortem methodology |
| Pharma business development / licensing teams | Run citation-traced due diligence on immuno-oncology and repurposing candidates |
| Pharma R&D competitive-intelligence teams | Benchmark trial-design and safety patterns; preview Failed Trial Archaeology |
| Pharma drug-safety / pharmacovigilance teams | Assess adverse-event signal quality and provenance for ICI-class compounds |
| Patient-advocacy groups and trial sponsors | Source verifiable safety references for plain-language communications |

---

## 7. What's included (free sample vs. paid offers)

**Free sample (this listing's public tier):**

- `signal-register.csv` — 10 ICI-class and GBM-repurposing pharmacovigilance signals (16 columns).
- `citation-index.csv` — 29 verified-identifier rows (5 columns) across nine identifier systems.
- Format: CSV only (RFC 4180 / UTF-8 / ASCII). No PDF or Parquet in the free tier. Static; no recurring updates.
- License: research-use-only, no redistribution (see DSA, Section 9).

**Paid offers (private offers on the same product):**

- Full due-diligence dossiers delivered as report PDFs plus structured CSV/Parquet.
- Optional delivery into the buyer's own AWS environment (Amazon S3, Athena-queryable Parquet) or Snowflake/BigQuery federation.
- Refund-backed citation-audit SLA on paid deliverables (the free sample carries no SLA).
- Pricing per the table in Section 3. Enterprise/recurring engagements are scoped as custom contracts.

---

## 8. Example use cases

- **Portfolio risk screen.** A biotech hedge-fund analyst pulls the ICI adverse-event signals to gauge safety overhang on a checkpoint-inhibitor asset before a position, then commissions an Investor Pre-Mortem on the lead candidate.
- **BD diligence input.** A pharma licensing team uses the citation index to confirm that a target's reported safety signals trace to real PMIDs/NCTs before a partnering discussion.
- **CI benchmarking seed.** A competitive-intelligence team uses the sample to validate methodology, then engages Failed Trial Archaeology on a mechanism class with prior Phase 2/3 terminations.
- **Safety-team triage reference.** A pharmacovigilance group reviews the disproportionality metrics and recommended-action protocols as a structured, citable starting point — every entry independently verifiable.
- **Patient-communication sourcing.** A patient-advocacy group draws verified safety references for a plain-language summary, then commissions a Plain-Language Patient Brief.

---

## 9. Required wordmark disclosure line

**Field:** Include on the seller profile and on the listing where the entity is named.

> Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company. INC = Intelligence Network Citations.

---

## 10. Support contact

**Field:** Support contact (AWS requires valid, non-personal contact information; it is publicly visible)

- Email: trevor@trevorobeyinc.com
- Website: https://trevorobeyinc.com
- Response SLA: 1 business day for listing inquiries

> Operator note: AWS strongly recommends a managed alias or case-management link rather than a personal address, because the contact is public. `trevor@trevorobeyinc.com` is a domain alias (not a personal Gmail), which satisfies this; consider a `support@` or `aws@` alias on the same domain for additional separation.

---

## 11. Data Subscription Agreement (free tier) — DRAFT, for counsel review

> **DRAFT — not legal advice; review by qualified counsel before publishing.** AWS Data Exchange lets you either edit the AWS-provided Standard DSA or upload a Custom DSA (a URL to a document in an accessible S3 bucket). The text below is the intended Custom DSA for the free tier. Paid private offers carry their own terms (and their own refund policy and liability cap — the free-tier $0 cap below does **not** apply to paid offers).

**Provider:** Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed with the California Secretary of State 2026-05-06; Entity No. B20260217250), doing business under the wordmark "Trevor Robey, INC." (INC = Intelligence Network Citations) ("Provider").
**Product:** Pharmacovigilance Sample Pack (free tier).
**Effective date:** Date of subscription acceptance via AWS Data Exchange.

**1. License grant.** Subject to acceptance of this Agreement, Provider grants Subscriber a non-exclusive, non-transferable, revocable, worldwide license to access and use the contents of the Pharmacovigilance Sample Pack (`signal-register.csv` and `citation-index.csv`, collectively the "Sample Data") for internal research, evaluation, and reference purposes only.

**2. Permitted uses.** Subscriber may: access and view the Sample Data within Subscriber's organization; use it to evaluate Provider's citation-traced methodology before considering paid engagements; quote individual citation identifiers in internal research notes provided the underlying source databases are independently consulted; and federate the Sample Data into Subscriber's internal AWS, Snowflake, or other analytics warehouse for internal evaluation use.

**3. Prohibited uses.** Subscriber shall not: redistribute, resell, sublicense, or relicense the Sample Data, in whole or in part; repackage it into a derivative commercial product; remove, alter, or obscure any provenance, citation, or attribution information; use it as the sole basis for any clinical, prescribing, diagnostic, regulatory, or other professional medical decision; or combine it with Subscriber's own Protected Health Information in any manner that violates HIPAA, GDPR, or any other applicable privacy regulation (PHI handling remains solely Subscriber's responsibility).

**4. Intellectual property.** The Sample Data is the original compiled work of Provider. The underlying citation identifiers reference public-database content owned by their respective sources (NLM, FDA, EMBL-EBI, MedDRA MSSO, and others); Provider does not relicense or sublicense those upstream sources. Subscriber is responsible for compliance with the licensing terms of any upstream source consulted via the citation identifiers.

**5. Data quality and disclaimer.** THE SAMPLE DATA IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR ACCURACY OR PERSISTENT AVAILABILITY OF THE UPSTREAM CITATION IDENTIFIERS. The Sample Data is a research artifact, not validated for clinical decision support, prescribing, regulatory submission, or any professional medical use. Subscribers are solely responsible for independent verification of every claim against the cited source database and for compliance with all applicable laws and professional standards.

**6. No PHI.** The Sample Data contains no Protected Health Information; all identifiers reference publicly accessible biomedical databases. Provider does not act as a HIPAA Business Associate with respect to the Sample Data.

**7. Term and termination.** Effective on subscription acceptance and continuing until terminated by either party. On termination, Subscriber shall destroy all copies and certify destruction in writing within 30 days. Sections 3, 4, 5, 6, 8, and 9 survive.

**8. Limitation of liability.** PROVIDER'S AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE SAMPLE DATA IS LIMITED TO ZERO US DOLLARS, REFLECTING THE FREE NATURE OF THE SAMPLE PACK. PROVIDER IS NOT LIABLE FOR ANY INDIRECT, SPECIAL, INCIDENTAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES.

**9. Governing law.** Governed by the laws of the State of California, USA, without regard to conflict-of-laws principles; disputes resolved in the state or federal courts of California, to whose jurisdiction Subscriber consents.

**10. Contact.** trevor@trevorobeyinc.com

*By subscribing through AWS Data Exchange, Subscriber acknowledges having read this Agreement and agrees to be bound by its terms.*

---

## 12. Refund policy (free tier) — DRAFT, for counsel review

> **DRAFT — for counsel review.** AWS requires a refund policy to be stated in the offer even when none is offered.

**Free public offer:** This product is offered at no charge. No payment is collected, so no refund is applicable.

**Paid private offers:** Each paid offer states its own refund policy. The intended model is a refund-backed citation-audit SLA (structured on a service-credits basis comparable to the Common Paper Service Credits standard). AWS processes only provider-authorized refunds via a refund approval form submitted through the AWS Marketplace Management Portal. *Finalize the credit schedule, triggers, and percentages with counsel before publishing any paid offer.*

---

## 13. Operator publishing notes (not buyer-facing)

- **Subscription verification:** As of 2025-04-08, AWS auto-enables subscription verification for all public offers (DOJ Final Rule — Countries of Concern / Covered Persons). Acknowledge and enable it in the wizard; Provider is solely responsible for reviewing each request's form data.
- **Limited-visibility self-test:** The product first publishes in Limited visibility (allowlisted AWS account IDs only). Test the listing end-to-end there before going public.
- **Listing assets:** Free sample is CSV; AWS accepts all file types for Files-type assets. The companion data dictionary may be uploaded as the AWS data-dictionary asset (one .csv, ≤1 MB, conforming to the AWS template) — note the staged dictionary is currently Markdown and would need conversion. Up to 10 data samples (≤50 MB) are allowed; .csv samples are buyer-previewable.
- **Pricing source of truth:** Prices above are the canonical 2026-04-30 ladder (REVENUE_PLAYBOOK). The retired Standard/Premium/Custom/Enterprise-ARR ladder ($2,500 / $4,950–$14,950 / $15K–$35K / $60K–$120K+) is superseded and must not appear in buyer-facing copy.
- **Wordmark compliance:** Pair the Section 9 disclosure line with the wordmark on every customer-facing surface (Cal. Bus. & Prof. Code §17910.5(a); avoids Cal. Corp. Code §17701.08(e)).

