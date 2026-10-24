# DATA-ELIGIBILITY ATTESTATION & AWS DATA EXCHANGE COMPLIANCE CHECKLIST

**Product:** Pharmacovigilance Signal Synthesis — Free Citation-Traced Sample Pack (and the paid offers built on the same methodology)
**Provider:** Trevor Robey Intelligence Network Citations LLC, a California limited liability company (CA SOS Entity No. B20260217250, filed 2026-05-06), doing business under the wordmark "Trevor Robey, INC." (INC = Intelligence Network Citations)
**AWS Account:** 833390816446
**ADX Provider Qualification:** worked via AWS Marketplace Seller Operations case 00881277
**Channel (decided):** AWS Data Exchange — ONE Files-type data set bundling report PDFs + structured CSV/Parquet, free public sample + paid offers
**Document status:** ATTESTATION DRAFT — all legal text marked DRAFT for counsel review
**Prepared:** 2026-06-18

---

## 0. How to read this document

This is the provider's self-attestation that the staged product complies with the AWS Data Exchange (ADX) publishing guidelines and that the provider has made the required eligibility determinations BEFORE submitting the listing. It contains three deliverables the task requires:

1. A **publishing-guidelines compliance checklist** mapping the product to each ADX eligibility rule (Section 2).
2. The **subscription-verification decision** with its driving determination (Section 3).
3. A **ChEMBL CC-BY-SA GO / GO-WITH-CONDITIONS / NO-GO recommendation** with the exact conditions (Section 4).

AWS is explicit that it does **not** validate the provider's eligibility claims for you: "Product listing descriptions must be accurate" and questions on data-set eligibility go to the AWS Marketplace Seller Operations team — i.e., the burden of this attestation is on the provider [AWS-PG]. For subscription-verification request forms specifically, "AWS Data Exchange doesn't review or validate the information provided by a prospective subscriber on the request form. You are solely responsible for reviewing and verifying the information." [AWS-SV]

---

## 1. Product description (eligibility-relevant facts)

| Attribute | Value | Source |
|---|---|---|
| ADX product type | Files data set | metadata-table.md |
| Free-sample assets | `signal-register.csv` (10 ICI-class pharmacovigilance signals, 16 cols), `citation-index.csv` (29 citation rows, 5 cols) | signal-register.csv; citation-index.csv |
| Paid-tier assets (same methodology) | Report PDFs + structured CSV/Parquet | channel decision; REVENUE_PLAYBOOK.md |
| Data nature | Drug–adverse-event disproportionality signals + an auditable index of **public-database identifiers** (PMID, NCT, DOI, RxNorm, PubChem CID, UniProt, ChEMBL, MedDRA PT, DailyMed SPL) | citation-index.csv |
| Source databases | FDA AEMS / OpenFDA, DailyMed, RxNorm, PubMed, ClinicalTrials.gov, ChEMBL, UniProt, PubChem, MedDRA | metadata-table.md |
| Time coverage | AE reporting through 2024-Q4; literature 2008–2024 | metadata-table.md |
| Geographic coverage | Global | metadata-table.md |
| PHI / HIPAA | None handled or transmitted; HIPAA N/A | metadata-table.md; DSA §6 |

---

## 2. AWS Data Exchange publishing-guidelines compliance checklist

Each row maps the product to an AWS-stated publishing requirement. AWS warns: "AWS removes any product that breaches these guidelines and may suspend the provider." [AWS-PG]

### 2.1 Content prohibitions

| # | AWS guideline | Determination | Status | Evidence / basis |
|---|---|---|---|---|
| G-1 | No illegal content, viruses, or malware [AWS-PG] | Assets are plain UTF-8 / RFC-4180 CSV (and, for paid tiers, PDF + Parquet). No executables. | **PASS** | data-dictionary.md (encoding declared); manual inspection of both CSVs |
| G-2 | No data tracing a device or identifiable person to a "Sensitive Location" [AWS-PG] | No geolocation, no device identifiers, no person records of any kind. The data is drug/AE/metric rows and public bibliographic identifiers. | **PASS** | signal-register.csv (no location/device cols); citation-index.csv (identifier rows only) |
| G-3 | Unless enrolled in the Extended Provider Program (EPP), no information that can identify a person, **unless** it is "Publicly Available Information" [AWS-PG] | The data set contains **no person-identifying fields**. See Section 2.2 for the field-level audit. Provider is NOT enrolled in EPP and does not need to be. The Publicly-Available-Information carve-out is asserted as a belt-and-suspenders fallback only (Section 2.3). | **PASS** | Field-level audit, §2.2 |
| G-4 | Sensitive categories (biometric/genetic, health, race/ethnicity, political opinion, religion, sex/sexual orientation, union membership, financial/payment, Sensitive Locations) must be **aggregated or anonymized so that no person can be identified**; HCLS data must be HIPAA-deidentified via Expert Determination or Safe Harbor [AWS-PG] | The product is health-domain (HCLS) but at the **population/literature level**, not the individual level. Disproportionality metrics (ROR/PRR with 95% CI) are aggregate statistics computed over reporting populations — by construction they describe no identifiable individual. There are zero patient-level records, so neither Expert Determination nor Safe Harbor de-identification is triggered; "De-identification method: Not applicable — sources are public databases." | **PASS (aggregated)** | signal-register.csv (`aems_metric`, `aems_metric_value` are population ROR/PRR); metadata-table.md (Anonymization N/A; De-identification N/A) |
| G-5 | No Bulk U.S. Sensitive Personal Data or U.S. Government-related Data exported to Countries of Concern / Covered Persons (DOJ Rule, E.O. 14117) [AWS-PG][AWS-SV] | The data set contains no U.S. Sensitive Personal Data and no Government-related Data. The DOJ-Rule subscription-verification control is nonetheless auto-enabled on the public offer (Section 3). | **PASS + control enabled** | §2.2; §3 |

### 2.2 Field-level person-identifiability audit (the load-bearing evidence for G-3 and G-4)

This is the determinative analysis. Every column in every shipped asset was inspected for person-identifying content.

**`signal-register.csv` — 16 columns, 10 rows.** Columns: `signal_id, signal_label, compound_1, compound_1_rxnorm, compound_2, compound_2_rxnorm, meddra_pt, meddra_pt_code, soc, aems_metric, aems_metric_value, severity_tier, primary_pmid, primary_doi, primary_nct, recommended_action`.
- No name, address, NPI, MRN, date of birth, email, or any direct identifier.
- `aems_metric_value` is an aggregate disproportionality statistic (e.g., ROR 4.1, 95% CI 2.2–7.6) — population-level, not individual.
- `recommended_action` is generic clinical-protocol prose (e.g., "Baseline troponin-I and 12-lead ECG prior to cycle 1") naming no person.
- **Result: zero person-identifying fields.**

**`citation-index.csv` — 5 columns, 29 rows.** Columns: `identifier_type, identifier, source_database, signal_id, context`.
- All 29 `identifier` values are machine identifiers in public scientific databases: 5 PMID, 1 DOI, 2 NCT, 9 RxNorm, 3 PubChem CID, 2 UniProt, 1 ChEMBL (CHEMBL2907643), 5 MedDRA PT, 1 DailyMed SPL.
- **Specifically checked for ClinicalTrials.gov investigator names (the exact concern raised):** the two NCT rows carry only the registry accession numbers `NCT00302159` and `NCT03363659` and a short scientific `context` string. **No investigator name, sponsor contact, PI, or site-staff name is stored in any cell.** The product references trials by number, not by people.
- **Result: zero person-identifying fields.**

> **Attestation A-1:** As shipped, **no record in this data set contains personal data of any kind — including no public personal data such as ClinicalTrials.gov investigator names.** This is the controlling fact for both the EPP carve-out (G-3) and the subscription-verification decision (Section 3).

### 2.3 Publicly-Available-Information carve-out (asserted as fallback only)

AWS permits person-identifying information without EPP enrollment when it is "Publicly Available Information." [AWS-PG] Because the audit in §2.2 finds **no** person-identifying fields, the carve-out is **not required** for this product. It is asserted here only as a defense-in-depth fallback: *were* any public personal datum ever to enter a future revision (e.g., if a paid PDF quoted a published PI name from a ClinicalTrials.gov record or a PubMed author byline), that datum would be Publicly-Available Information sourced from a public registry / published literature, and would still need to be re-attested under §5 before that revision is finalized.

### 2.4 Listing-accuracy & operational requirements

| # | AWS guideline | Determination | Status | Evidence |
|---|---|---|---|---|
| L-1 | Description must accurately represent the data, including coverage and update frequency, and **note if data is aggregated or anonymized** [AWS-PG] | Long description and metadata state coverage (AE through 2024-Q4; lit 2008–2024), global geography, Static update cadence, and that metrics are aggregate. ACTION: ensure the public long description explicitly carries the "aggregated, no personal data" note from this attestation. | **PASS w/ action** | metadata-table.md; listing-copy.md |
| L-2 | Valid, non-personal support contact (managed alias, not a personal address) [AWS-DETAILS] | Support contact `trevor@trevorobeyinc.com` is a domain alias, not a personal mailbox; 1-business-day SLA stated. | **PASS** | listing-copy.md |
| L-3 | Up to two product categories [AWS-DETAILS] | Primary "Healthcare & Life Sciences"; secondary tags used. CONFIRM no more than two formal AWS categories are selected in the wizard (tags ≠ categories). | **PASS w/ confirm** | listing-copy.md; metadata-table.md |
| L-4 | Data dictionary: one .csv, ≤1 MB, conforming to the AWS template [AWS-DETAILS] | Current data dictionary is Markdown prose, not the AWS .csv template. ACTION: if uploading a data dictionary asset, convert to the AWS .csv data-dictionary template (≤1 MB). Markdown can remain as internal doc. | **GAP — action** | data-dictionary.md |
| L-5 | Up to 10 data samples, ≤50 MB each [AWS-DETAILS] | Free sample is itself the demo data; well within limits. | **PASS** | metadata-table.md |
| L-6 | Set Data sensitivity / Sensitive-information configuration at publish [AWS-PUBLISH] | ACTION: in the publish wizard, set sensitivity to reflect "no sensitive information / aggregated HCLS, no PHI." | **ACTION** | AWS publish flow |
| L-7 | First publish to **Limited visibility** (allowlisted accounts) to self-test before public release [AWS-PUBLISH] | ACTION: publish to Limited visibility first, verify listing renders + sample downloads, then promote to Public. | **ACTION** | AWS publish flow |
| L-8 | DSA: use editable StandardDsa or upload CustomDsa (URL to S3-stored doc) [AWS-OFFERS] | A complete CustomDsa is drafted (research-use-only, No-PHI clause, AS-IS, California law, $0 liability). DRAFT pending counsel. If uploaded as CustomDsa it must live in an accessible S3 bucket and be referenced by URL. | **READY (DRAFT)** | data-subscription-agreement.md |
| L-9 | Refund policy is a required offer step [AWS-OFFERS] | Free sample: refund N/A ($0). Paid offers: provider sets policy; repo intent is to mirror Common Paper Service Credits and a refund-backed citation-audit SLA. DRAFT pending counsel; AWS processes only provider-authorized refunds via the refund-approval form. | **ACTION (paid)** | refund-policy.md (placeholder); REVENUE_PLAYBOOK.md |

### 2.5 Pre-publish data-hygiene fixes (not AWS rules, but block a clean submission)

| # | Issue | Fix |
|---|---|---|
| H-1 | ✅ **RESOLVED 2026-06-19** — stale `.txt` duplicates had named a Delaware LLC; both regenerated from the canonical California `.md` files (no "Delaware" remains in any repo `.txt`, verified) | Done. Standing gate: re-verify California-only entity/jurisdiction before each publish. |
| H-2 | MANIFEST byte size for `citation-index.csv` (2,935 B) is stale; actual is 3,053 B | Refresh MANIFEST size table. Cosmetic, but tidy before submission. |
| H-3 | DSA + data dictionary are Markdown only; AWS may require PDF/template | Convert DSA to PDF and data dictionary to the AWS .csv template at upload time (L-4). |

---

## 3. SUBSCRIPTION-VERIFICATION DECISION

**Question posed:** *Do any records contain public personal data (e.g., ClinicalTrials.gov investigator names)? If so, enable subscription verification.*

**Determination (substantive):** **NO.** Per the field-level audit (§2.2) and Attestation A-1, **no record in the shipped data set contains any personal data — including no ClinicalTrials.gov investigator names.** Trials are referenced solely by NCT accession number; the citation index stores only machine identifiers; the signal register stores only drug/AE/metric/protocol fields. On the "public personal data" trigger alone, subscription verification would **not** be required.

**Decision (operative): ENABLE subscription verification.** Even though the data-content trigger is negative, AWS now makes the control mandatory:

- "Effective April 8, 2025… subscription verification is now enabled for all AWS Data Exchange public offers and requires subscribers to identify if they are in a Country of Concern or a Covered Person" (DOJ Final Rule implementing E.O. 14117). In the public-offer wizard the provider must "Acknowledge and agree to enable Subscription verification." [AWS-SV]

Therefore subscription verification **is enabled** for this product's public offer because the platform mandates it for ALL public offers — not because the data contains personal data. The two reasons are recorded separately so the eligibility record stays accurate.

**Operational notes for the verification step [AWS-SV]:**
- The request form collects subscriber contact details, company, email, Country-of-Concern / Covered-Person status, intended use case, and AWS account ID.
- **AWS does not validate any of it — the provider is solely responsible** for reviewing and approving each request. Assign a named reviewer (support alias) before going Public.
- Because the data has no personal/sensitive content and the product is free, the review bar can be light-touch (DOJ-Rule attestation + sanity check), but it must still be performed per request.
- For paid private offers to specific AWS account IDs, the same DOJ-Rule posture applies; verify the buyer account is not a Covered Person before issuing the offer.

> **Attestation A-2:** Subscription verification is ENABLED on the public offer (AWS mandate, eff. 2025-04-08). It is NOT enabled because of personal-data content, because the data set contains none.

---

## 4. ChEMBL CC-BY-SA — LICENSE RECOMMENDATION

**Context.** All upstream sources are U.S. Government public domain or open data **except ChEMBL**, which is licensed **CC-BY-SA 3.0** [metadata-table.md]. Exactly **one** cell in the shipped sample derives from ChEMBL: `citation-index.csv` row for `ChEMBL / CHEMBL2907643` (pembrolizumab bioactivity identifier, cross-linked to RxNorm 1547545, signal C-5). No ChEMBL-derived *content* (bioactivity values, structures, assay data) is reproduced — only the **identifier string** is stored, used as a pointer/citation.

**The CC-BY-SA tension.** CC-BY-SA is a copyleft license: it requires (a) **attribution** to ChEMBL/EMBL-EBI, and (b) **ShareAlike** — derivative/adapted works that incorporate licensed material must be licensed under the same (or compatible) terms. The product's DSA, by contrast, is **research-use-only, no-redistribution** (a more restrictive license). If ChEMBL-derived *expressive content* were embedded in the product, ShareAlike would conflict with the restrictive DSA. That conflict is the whole reason this decision exists.

### Recommendation: **GO — WITH CONDITIONS**

A bare database identifier (the accession string `CHEMBL2907643`) is a factual pointer, not a copyrightable expressive excerpt of the ChEMBL database, so reproducing it as a citation is the same low-risk act as citing a DOI or PMID. That supports GO. But because (i) the product's no-redistribution DSA is facially incompatible with ShareAlike if any *content* is ever pulled through, and (ii) the question is fact-sensitive enough to warrant counsel sign-off, the honest posture is **GO-WITH-CONDITIONS**, not unconditional GO.

#### Exact conditions (all must hold; these are the gating conditions from the research)

1. **Identifier-only, no content.** Ship only the ChEMBL **identifier string** as a citation pointer. Do **not** reproduce ChEMBL-sourced bioactivity values, IC50/EC50/Ki, structures, assay descriptions, or any other expressive database content in any shipped asset (CSV, PDF, or Parquet). The moment ChEMBL *content* (not just the ID) is embedded, re-run this decision — ShareAlike likely attaches and conflicts with the DSA.
2. **Attribution present.** Include a CC-BY-SA 3.0 attribution to ChEMBL / EMBL-EBI in the data dictionary, the long description's Data Sources note, and any per-asset provenance/NOTICE. State the version (ChEMBL CC-BY-SA 3.0) and link to the license.
3. **Source License Register completed.** The metadata points to a "Source License Register in companion deliverable." Complete and ship/retain it; it must list ChEMBL as CC-BY-SA 3.0 with the identifier-only usage scope and the per-source license for every other source.
4. **No relicensing claim.** Keep the DSA §4 language that the provider "does not relicense or sublicense those upstream sources" and that the subscriber is responsible for upstream license compliance when resolving identifiers. This preserves the factual-pointer posture and avoids the provider purporting to sublicense ChEMBL content under the restrictive DSA.
5. **Counsel review of the copyleft interaction.** Have counsel confirm, for the specific jurisdiction, that (a) reproducing a database accession identifier as a citation is not a "derivative/adapted work" of the CC-BY-SA database, and (b) the no-redistribution DSA does not violate ShareAlike given conditions 1–4. Treat this attestation's GO as provisional until that sign-off.
6. **Revision gate.** Add ChEMBL-content screening to the per-revision finalize checklist (§5): before any future revision is finalized, confirm no new ChEMBL expressive content was introduced; if it was, downgrade to NO-GO for that revision until conditions are re-met (and consider dual-licensing or removing the content).

> **Net:** GO for the current sample (identifier-only, low copyleft exposure) **provided conditions 1–6 are met and counsel signs off**. It becomes **NO-GO** for any asset that embeds ChEMBL-derived expressive content under the restrictive DSA, because ShareAlike would conflict with no-redistribution terms.

---

## 5. Per-revision finalize checklist (run before every ADX revision goes live)

Because ADX versions by revision, eligibility must be re-attested each revision, not just once:

- [ ] **Personal-data scan** — confirm no person-identifying field entered any asset (re-run §2.2 audit; specifically re-check for any newly added PI/investigator/author names in PDFs).
- [ ] **If public personal data was added** — confirm it qualifies as Publicly-Available Information (§2.3) AND re-evaluate whether EPP enrollment is required; update the subscription-verification rationale.
- [ ] **Aggregation check** — confirm any health metrics remain population-level/aggregate (G-4); no patient-level records.
- [ ] **ChEMBL content gate** — confirm identifier-only usage; if ChEMBL content was added, apply Section 4 conditions or remove (G-NO-GO trigger).
- [ ] **Source License Register** — updated for any new source.
- [ ] **Description accuracy** — coverage, update cadence, and the "aggregated, no personal data" note still accurate (L-1).
- [ ] **DSA/refund** — correct entity (California, not Delaware), current DRAFT-reviewed terms attached (H-1, L-8, L-9).
- [ ] **Limited-visibility self-test passed** before promoting to Public (L-7).

---

## 6. Summary attestation block

> Trevor Robey Intelligence Network Citations LLC (CA Entity No. B20260217250), as the AWS Data Exchange provider on account 833390816446, attests that the Pharmacovigilance Signal Synthesis product:
> 1. contains **no PHI** and is **not** subject to HIPAA (no protected health information handled or transmitted);
> 2. contains **no person-identifying data**, including **no ClinicalTrials.gov investigator names** (trials referenced by NCT number only);
> 3. presents only **aggregated/population-level** health metrics, so no individual is identifiable, and no Expert-Determination or Safe-Harbor de-identification is triggered;
> 4. links no person or device to any **Sensitive Location**;
> 5. relies on the **Publicly-Available-Information** carve-out only as a fallback (not required, as no personal data is present), and is **not** enrolled in / does not require the Extended Provider Program;
> 6. has **subscription verification ENABLED** on its public offer per the AWS mandate effective 2025-04-08 (DOJ Rule / E.O. 14117), independent of data content;
> 7. uses ChEMBL on an **identifier-only** basis and carries a **GO-WITH-CONDITIONS** posture under CC-BY-SA 3.0, subject to the six conditions in Section 4 and counsel sign-off.
>
> *All legal text (DSA, refund policy, license determinations) is DRAFT and subject to legal-counsel review prior to publishing. — Prepared 2026-06-18.*

---

## Sources

- **[AWS-PG]** AWS Data Exchange publishing guidelines — https://docs.aws.amazon.com/data-exchange/latest/userguide/publishing-guidelines.html (content prohibitions; Sensitive Location; EPP / Publicly-Available-Information carve-out; aggregate/anonymize + HIPAA de-identification for HCLS; description accuracy; DOJ Rule; removal/suspension; seller-ops for eligibility questions)
- **[AWS-SV]** AWS subscription verification — https://docs.aws.amazon.com/data-exchange/latest/userguide/subscription-verification-pro.html (auto-enabled for all public offers eff. 2025-04-08; DOJ Rule / Country of Concern / Covered Person; provider solely responsible for review; form fields)
- **[AWS-DETAILS]** AWS product description / listing fields — https://docs.aws.amazon.com/data-exchange/latest/userguide/prod-details-over.html (name, non-personal support contact, max two categories, short/long description accuracy, data dictionary 1 csv ≤1 MB, ≤10 samples ≤50 MB)
- **[AWS-PUBLISH]** AWS Files-product publishing flow — https://docs.aws.amazon.com/data-exchange/latest/userguide/publish-data-product.html (data-sensitivity configuration; Limited-visibility self-test before Public)
- **[AWS-OFFERS]** AWS prepare offers / DSA & refunds — https://docs.aws.amazon.com/data-exchange/latest/userguide/prepare-offers.html (StandardDsa vs CustomDsa with S3 URL; DSA covers use/warranty/indemnification/governing law; refund policy required + provider-authorized via refund-approval form)
- **Internal artifacts (verified this pass):**
  - `/Users/myhome/TRINC/Trevor Robey Intelligence Network Citations/workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/signal-register.csv`
  - `…/pharmacovigilance-sample-pack/citation-index.csv`
  - `…/pharmacovigilance-sample-pack/metadata-table.md`
  - `…/pharmacovigilance-sample-pack/data-subscription-agreement.md`
  - `…/03-platforms/aws-data-exchange/refund-policy.md` (placeholder); `.../REVENUE_PLAYBOOK.md` (pricing/refund intent)

---

## ChEMBL License — VERIFIED Assessment (web-grounded, 2026-06-19)

> This section supersedes the provisional ChEMBL reasoning above; it is grounded in the
> fetched license texts cited at the bottom. Still analysis, not legal advice — counsel to confirm.

**VERDICT: GO WITH CONDITIONS.**

Grounded facts:
- ChEMBL is released by EMBL-EBI under **CC BY-SA 3.0 (Unported)**.
- CC BY-SA 3.0 **expressly permits commercial use and distribution for a fee** ("redistribute
  the material in any medium or format for any purpose, even commercially"). There is **no
  restriction on charging money** for access.
- **ShareAlike (SA)** requires that any *adaptation* ("remix, transform, build upon") be
  licensed under the **same or a compatible license**.
- **Attribution (BY)** requires crediting ChEMBL/EMBL-EBI, the CC BY-SA 3.0 license notice +
  link, and an indication that changes were made.

The decisive design question — does ShareAlike "bite"?
- **If the product only CITES ChEMBL identifiers** (ChEMBL IDs as factual pointers) and does
  **not** redistribute ChEMBL's underlying data values/tables → no copyrightable ChEMBL content
  is reproduced, ShareAlike does **not** attach, and you simply provide attribution. This
  matches the citation-traced design (you ship the analysis + the pointer, not a republished
  ChEMBL table) → **clean GO.**
- **If the product REDISTRIBUTES substantial ChEMBL data** (e.g., bioactivity values pulled
  into the CSV/Parquet appendix), that portion is an adaptation subject to CC BY-SA: you must
  attribute **and** license that ChEMBL-derived subset under CC BY-SA — i.e., you cannot
  contractually forbid subscribers from redistributing that subset, which **conflicts with a
  paid, no-redistribution DSA.** Options: (a) cite IDs only (ship no ChEMBL data values);
  (b) carve out the ChEMBL-derived subset under CC BY-SA in the DSA and accept it is freely
  redistributable; or (c) drop ChEMBL-sourced fields.
- Separately: ChEMBL includes some calculated properties **derived from commercial software** —
  do **not** redistribute those specific fields; they carry separate commercial licensing.

**Recommended path:** design every product so ChEMBL appears **only as cited identifiers**
(pointers), never as redistributed data values → ShareAlike never attaches and the paid DSA
stays clean. Always include the ChEMBL CC BY-SA 3.0 attribution in the source-license register.

Caveats (counsel to confirm): the "a bare accession ID is an uncopyrightable fact" position is
well-founded but should be confirmed; the EU *sui generis* database right is a separate
consideration if you sell to EU subscribers.

Sources: ChEMBL licensing (CC BY-SA 3.0) — http://chembl.github.io/chembl-licensing/ ·
CC BY-SA 3.0 deed — https://creativecommons.org/licenses/by-sa/3.0/
