# Data Subscription Agreement (DSA)

## Trevor Robey, INC. — Citation-Traced Biomedical Intelligence Data Set

> **DRAFT — review by counsel before use.** This document is a working draft prepared for the AWS Data Exchange listing of Trevor Robey Intelligence Network Citations LLC. It has **not** been reviewed or approved by a licensed attorney. Do **not** publish, upload, or attach this document to any AWS Data Exchange offer (public or private) until counsel has reviewed and approved it. Bracketed `[…]` items are placeholders to be confirmed before finalization. Where this draft conflicts with the AWS-managed Standard Data Subscription Agreement, the AWS Customer Agreement, or the Terms and Conditions for AWS Marketplace Sellers, those controlling documents and counsel's guidance govern.

---

**Provider:** Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed with the California Secretary of State on 2026-05-06; receipt B20260217250; Entity No. B20260217250), doing business under the wordmark **"Trevor Robey, INC."** (where INC = Intelligence Network Citations — a backronym, not a corporate suffix) ("**Provider**," "we," "us," "our"). The wordmark is paired with this disclosure to satisfy Cal. Bus. & Prof. Code §17910.5(a); the legal name complies with Cal. Corp. Code §17701.08(e).

**Subscriber:** The AWS account holder that subscribes to the Product through AWS Data Exchange ("**Subscriber**," "you," "your").

**Product:** The "Trevor Robey, INC. Citation-Traced Biomedical Intelligence" data set offered on AWS Data Exchange, including (a) the free sample tier (the "**Sample Pack**," currently the Pharmacovigilance Signal Synthesis sample) and (b) any paid tier or private offer made available under this Agreement, delivered as one or more report documents (PDF), structured tabular files (CSV and/or Parquet), data dictionaries, and associated metadata (collectively, the "**Data Product**" or "**Data**").

**Effective date:** The date Subscriber's subscription to the Product is accepted through AWS Data Exchange.

**Delivery channel:** AWS Data Exchange. This Agreement is the Provider-specified Data Subscription Agreement (a custom DSA) for the Product and supplements, and is subject to, the AWS Customer Agreement and the AWS Data Exchange and AWS Marketplace terms.

---

## 1. License grant

Subject to Subscriber's acceptance of this Agreement, payment of any applicable subscription charges, and continued compliance with the terms below, Provider grants Subscriber a **non-exclusive, non-transferable, non-sublicensable, revocable, worldwide** license, for the duration of the applicable subscription term, to access, download, store, and use the Data Product **solely for Subscriber's internal business purposes** — including internal research, evaluation, due diligence, and competitive- and scientific-intelligence analysis.

The license extends to Subscriber's employees and contractors who (a) need access for the permitted purposes, (b) act on Subscriber's behalf, and (c) are bound by confidentiality and use restrictions at least as protective as this Agreement. Subscriber is responsible for their compliance.

The free **Sample Pack** is licensed on the same terms, except that it is provided at no charge for evaluation and reference, and the limitation of liability in Section 11 reflects its zero purchase price.

No rights are granted other than those expressly stated. All rights not expressly granted are reserved by Provider and the respective upstream source owners.

## 2. Permitted uses

Subscriber may:

- Access, view, and analyze the Data Product within Subscriber's organization for the internal purposes described in Section 1.
- Load and federate the Data Product into Subscriber's own internal analytics environment (for example, Amazon S3, Amazon Athena, Amazon Redshift, Snowflake, or a comparable internal warehouse) for internal evaluation and analysis.
- Create internal analyses, notes, models, and derived insights from the Data Product for Subscriber's own use, provided that any external disclosure complies with Section 3 and Section 4.
- Quote individual public-database citation identifiers (for example, PubMed PMID, ClinicalTrials.gov NCT, ChEMBL ID, DOI, RxNorm, PubChem CID, UniProt, MedDRA PT, DailyMed SPL) in Subscriber's internal research, provided the underlying public source records are independently consulted and verified by Subscriber.
- Use the Sample Pack to evaluate Provider's citation-traced methodology before considering paid Trevor Robey, INC. engagements.

## 3. Prohibited uses

Subscriber shall not, and shall not permit any third party to:

- **Redistribute, resell, sublicense, relicense, lease, lend, publish, broadcast, or otherwise make the Data Product (or any substantial part of it) available to any third party**, whether for a fee or free of charge, except as expressly permitted in Section 1.
- Repackage, incorporate, or use the Data Product (in whole or in substantial part) to build, train, or populate a derivative product, data set, database, or service that is distributed, sold, or otherwise made available to any third party.
- Remove, alter, obscure, or fail to reproduce any provenance, citation, attribution, copyright, trademark, or license notice embedded in or accompanying the Data Product (see Section 5).
- Use the Data Product as the sole or primary basis for any **clinical, diagnostic, treatment, or prescribing decision**; any **regulatory submission**; or any other professional medical, pharmaceutical, or healthcare decision (see Section 6 and Section 10).
- Combine the Data Product with Subscriber's own data, including any Protected Health Information ("**PHI**") or other personal data, in a manner that violates HIPAA, the EU GDPR, the California Consumer Privacy Act/CPRA, or any other applicable privacy or data-protection law; all responsibility for such data and combinations remains solely Subscriber's (see Section 7).
- Use the Data Product in violation of any law, regulation, or the licensing terms of any upstream source referenced in Section 5, including any restriction on export to, or use by, a Country of Concern or Covered Person under the U.S. DOJ Bulk Sensitive Personal Data rule implementing Executive Order 14117.
- Reverse engineer, or attempt to reconstruct from the Data Product, any Provider proprietary methodology, scoring model, or compilation logic for the purpose of replicating the Data Product.

## 4. Data sources, provenance, and attribution pass-through

**4.1 Public-source basis.** The Data Product is compiled from publicly accessible biomedical databases and public-domain or openly licensed sources. Every substantive claim in the Data Product is intended to resolve to a verifiable public identifier (PMID, NCT, ChEMBL ID, DOI, RxNorm, PubChem CID, UniProt, MedDRA PT, DailyMed SPL, or equivalent). Provider does not host, transmit, or process PHI in producing the Data Product (see Section 7).

**4.2 Upstream sources.** The Data Product draws on, references, or is derived from public databases and resources including, without limitation: PubMed and RxNorm (U.S. National Library of Medicine, NLM); ClinicalTrials.gov (U.S. National Institutes of Health, NIH/NLM); the FDA Adverse Event Reporting data / openFDA and DailyMed (U.S. Food and Drug Administration); ChEMBL and UniProt (European Bioinformatics Institute, EMBL-EBI); PubChem (NLM/NCBI); and MedDRA (MedDRA MSSO). Provider does not own these sources and does not relicense or sublicense them. **The specific sources and their licenses applicable to a given delivery are listed in the Source License Register and/or data dictionary accompanying that delivery, which Subscriber must consult and comply with.** `[Confirm the per-delivery Source License Register is attached/linked before publishing; the project register file is currently a placeholder.]`

**4.3 License posture by source (informational; confirm per delivery).**

- **U.S. Government sources** (PubMed, RxNorm, ClinicalTrials.gov, openFDA/FDA adverse-event data, DailyMed, PubChem) — generally U.S. Government works in the **public domain**, subject to each source's terms of use and any courtesy-attribution and "no endorsement" requirements. Subscriber must not imply NLM, NIH, FDA, or any U.S. Government endorsement.
- **ChEMBL (EMBL-EBI)** — to the extent ChEMBL-derived content is retained in a delivery, it is provided under the **Creative Commons Attribution-ShareAlike 3.0 (CC-BY-SA 3.0)** license. Subscriber must (a) **attribute EMBL-EBI/ChEMBL**, (b) preserve the ChEMBL attribution and license notice, and (c) license any further distribution of the CC-BY-SA-covered material (which is permitted only as allowed by that upstream license and Section 3) under the **same CC-BY-SA 3.0 terms**. The ShareAlike obligation is an upstream requirement and is not waived or altered by this Agreement.
- **UniProt (EMBL-EBI)** — provided under the **Creative Commons Attribution (CC-BY 4.0)** license; preserve attribution. `[Confirm current UniProt license version before publishing.]`
- **MedDRA** — MedDRA terms and codes are licensed by the MedDRA MSSO and require the recipient to hold a valid MedDRA subscription/license to access full MedDRA content; **Subscriber is responsible for maintaining any MedDRA license required for its use.**
- **Any source requiring a separate commercial license for redistribution** (for example, DrugBank, where applicable) is included, if at all, only as a referenced public identifier and not as relicensed content; Subscriber must obtain its own license for any such source as required.

**4.4 Attribution pass-through.** Subscriber shall preserve and reproduce all source attributions, citation identifiers, copyright/license notices, and the accompanying provenance documentation in any internally permitted copy of the Data Product, and shall pass through all upstream attribution and license obligations (including the ChEMBL CC-BY-SA attribution and ShareAlike obligations) to the extent Subscriber makes any use that triggers them. Where the upstream terms and this Agreement conflict, the more restrictive applicable obligation controls for that material.

**4.5 No verification of upstream content.** Provider compiles and cites public records but does not control, and does not warrant, the accuracy, completeness, currency, or continued availability of any upstream source or identifier (see Section 9).

## 5. Citation and notice preservation

The auditable citation trail (the mapping of each signal/claim to its public-database identifiers) and all embedded provenance, attribution, copyright, trademark, and license notices are a material part of the Data Product. Subscriber shall not remove, alter, obscure, or omit them in any permitted internal copy, extract, or derived analysis where the underlying source content is reproduced.

## 6. Not clinical decision support; no warranty of fitness

THE DATA PRODUCT IS A **RESEARCH AND INTELLIGENCE ARTIFACT**. IT IS **NOT** A MEDICAL DEVICE, IS **NOT** CLINICAL DECISION SUPPORT, AND IS **NOT** INTENDED OR VALIDATED FOR CLINICAL, DIAGNOSTIC, TREATMENT, OR PRESCRIBING USE; FOR PHARMACEUTICAL MANUFACTURING OR LABELING; FOR PHARMACOVIGILANCE REGULATORY REPORTING; OR FOR ANY REGULATORY SUBMISSION OR OTHER PROFESSIONAL MEDICAL USE.

Recommended actions, severity tiers, disproportionality metrics, and similar fields are illustrative of the methodology and are **not** medical advice. Subscriber is solely responsible for independently verifying every claim against the cited source records and for compliance with all applicable laws, regulations, and professional standards before relying on the Data Product in any decision context. Provider makes **no warranty that the Data Product is fit for any particular purpose**, including any clinical, regulatory, investment, or commercial purpose.

## 7. No PHI

The Data Product contains **no Protected Health Information** and no individually identifiable personal data; all citation identifiers reference content in publicly accessible biomedical databases. Provider does **not** act as a HIPAA Business Associate with respect to the Data Product, and no business associate relationship is created by this Agreement. If Subscriber chooses to combine the Data Product with Subscriber's own PHI or other personal data, Subscriber bears sole responsibility for that data and for compliance with HIPAA, GDPR, CCPA/CPRA, and all other applicable privacy and data-protection laws; no PHI-handling obligation transfers to Provider.

## 8. Intellectual property

**8.1 Provider's rights.** As between the parties, the selection, arrangement, coordination, compilation, scoring, annotation, narrative analysis, and original expression in the Data Product — and all Provider trademarks, including the "Trevor Robey, INC." wordmark — are owned by Provider and protected by applicable intellectual-property laws. This is a license, not a sale; no title to the Data Product passes to Subscriber.

**8.2 Upstream rights.** The underlying public-database content referenced by the citation identifiers is owned by, and remains the property of, the respective upstream sources (NLM, NIH, FDA, EMBL-EBI, NCBI, MedDRA MSSO, and others). Provider does not relicense or sublicense that content. Subscriber is responsible for compliance with the license terms of each upstream source it consults or uses, as described in Section 4.

**8.3 Subscriber's analyses.** As between the parties, Subscriber owns the original analyses and conclusions it independently creates, provided they do not reproduce or redistribute the Data Product or upstream content in violation of this Agreement.

**8.4 Feedback.** Provider may use any feedback Subscriber voluntarily provides about the Data Product without restriction or obligation.

## 9. Disclaimer of warranties

THE DATA PRODUCT IS PROVIDED **"AS IS"** AND **"AS AVAILABLE,"** WITHOUT WARRANTY OF ANY KIND, EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, COMPLETENESS, CURRENCY, OR THE PERSISTENT AVAILABILITY OR RESOLVABILITY OF ANY UPSTREAM SOURCE OR CITATION IDENTIFIER. PROVIDER DOES NOT WARRANT THAT THE DATA PRODUCT WILL MEET SUBSCRIBER'S REQUIREMENTS OR BE ERROR-FREE. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES, SO PORTIONS OF THIS SECTION MAY NOT APPLY TO SUBSCRIBER.

## 10. Subscriber responsibilities and indemnity

Subscriber is responsible for its use of the Data Product, including independent verification of all claims, compliance with all applicable laws and upstream source licenses, and the consequences of any decision made in reliance on the Data Product. `[Counsel to confirm scope, mutuality, and enforceability of any indemnity, and reconcile with AWS Marketplace seller terms.]` To the extent permitted by law and subject to counsel's review, Subscriber shall defend, indemnify, and hold Provider harmless from third-party claims arising out of Subscriber's breach of Section 3, Section 4, Section 5, or Section 7, or Subscriber's unlawful use of the Data Product.

## 11. Limitation of liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROVIDER SHALL NOT BE LIABLE FOR ANY INDIRECT, SPECIAL, INCIDENTAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOST PROFITS, LOST DATA, OR BUSINESS INTERRUPTION, ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE DATA PRODUCT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

FOR THE FREE **SAMPLE PACK**, PROVIDER'S AGGREGATE LIABILITY IS LIMITED TO **ZERO U.S. DOLLARS ($0)**, REFLECTING THE NO-CHARGE NATURE OF THAT TIER. FOR ANY **PAID TIER**, PROVIDER'S AGGREGATE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE DATA PRODUCT SHALL NOT EXCEED THE TOTAL SUBSCRIPTION CHARGES ACTUALLY PAID BY SUBSCRIBER FOR THE DATA PRODUCT IN THE **TWELVE (12) MONTHS** PRECEDING THE EVENT GIVING RISE TO THE CLAIM. `[Counsel to confirm the cap formulation and reconcile with the pricing tiers in the offer.]` SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS, SO PORTIONS OF THIS SECTION MAY NOT APPLY.

## 12. Term and termination

This Agreement is effective on the Effective date and continues for the subscription term selected through AWS Data Exchange, including any auto-renewal Subscriber elects, unless terminated earlier. Provider may suspend or terminate the license upon Subscriber's material breach (including any breach of Section 3, 4, 5, or 7). Either party may terminate as permitted by the applicable AWS Data Exchange offer terms.

Upon expiration or termination, Subscriber's license ends and Subscriber shall cease using and **destroy all copies** of the Data Product in its possession or control, except (a) copies Subscriber must retain by law and (b) routine backup copies not actively used, which remain subject to this Agreement. Upon Provider's written request, Subscriber shall provide written certification of destruction within **thirty (30) days**. Termination of access to data already delivered through AWS Data Exchange is handled per the AWS Data Exchange terms. Sections 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, and 14, and any accrued payment obligations, survive termination.

## 13. Refunds

`[Placeholder — confirm before publishing.]` Provider's refund policy is as stated in the applicable AWS Data Exchange offer. The free Sample Pack carries no charge and no refund. For paid tiers, the project's stated intent is a service-credit-style remedy modeled on the Common Paper Service Credits standard and/or a citation-audit service-level remedy; the **specific refund terms, triggers, and credit schedule must be finalized by counsel and stated in the offer's refund-policy field**, and AWS only processes provider-authorized refunds via the AWS Marketplace refund-approval process. Nothing in this draft sets a binding refund amount.

## 14. Governing law and dispute resolution

This Agreement is governed by the laws of the **State of California, USA**, without regard to its conflict-of-laws principles. Subject to any controlling AWS Customer Agreement or AWS Marketplace seller dispute terms and to counsel's review, the parties consent to the exclusive jurisdiction and venue of the state and federal courts located in **California** `[confirm county/venue]` for disputes arising out of or relating to this Agreement, and each party consents to personal jurisdiction therein. `[Counsel to decide between courts vs. arbitration and confirm consistency with AWS terms.]`

## 15. General

This Agreement, together with the applicable AWS Data Exchange offer terms, the AWS Customer Agreement, and any accompanying Source License Register and data dictionary, constitutes the entire agreement between the parties regarding the Data Product and supersedes prior understandings on that subject. If any provision is held unenforceable, the remaining provisions remain in effect. Provider's failure to enforce any provision is not a waiver. Subscriber may not assign this Agreement without Provider's consent; Provider may assign it in connection with a merger, acquisition, or sale of assets. Headings are for convenience only.

## 16. Contact

Questions about this Agreement or the Data Product: **trevor@trevorobeyinc.com** — Trevor Robey, INC. (Trevor Robey Intelligence Network Citations LLC), https://trevorobeyinc.com.

---

*By subscribing through AWS Data Exchange, Subscriber acknowledges having read this Agreement and agrees to be bound by its terms.*

**DRAFT — review by counsel before use. Not legal advice. Do not publish until reviewed and approved by a licensed attorney.**
