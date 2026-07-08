# AWS Data Exchange — Product Packaging & Build Plan

> **File:** `03-platforms/aws-data-exchange/product-creation.md`
> **Scope:** How the single AWS Data Exchange (ADX) **Files** data set is structured, versioned, and published — covering the free Pharmacovigilance Sample Pack as the public free offer, plus the paid dossiers that attach to the same listing.
> **Status:** Build/packaging plan. The free sample pack is a standards-compliant DRAFT (prepared 2026-05-06); **nothing is uploaded to AWS yet.** Blocked on (1) ADX Provider Qualification (Seller Ops case 00881277) and (2) public seller-profile verification, and downstream on the disbursement-method review that is currently holding payouts.
> **Provider:** Trevor Robey Intelligence Network Citations LLC (California LLC, Entity No. B20260217250), wordmark **"Trevor Robey, INC."** (INC = Intelligence Network Citations). AWS account `833390816446`. Contact `trevor@trevorobeyinc.com` / `https://trevorobeyinc.com`.
> **Legal text below is DRAFT for counsel review** — every clause marked `[DRAFT — counsel review]`.
> **Pricing is taken verbatim from `REVENUE_PLAYBOOK.md`** (2026-04-30 ladder). No prices are invented here.

---

## 0. Channel decision (already made — recorded, not re-litigated)

- **Channel:** AWS Data Exchange (ADX), provider-published.
- **Packaging:** **ONE ADX Files-type data set** is the spine of the listing. It bundles report **PDFs** + a structured **CSV/Parquet appendix** as assets inside revisions.
- **Offer structure on that one product:** a **public Free offer** (the Pharmacovigilance Sample Pack) that anyone can self-subscribe to, plus **paid public/private offers** for the dossier SKUs attached to the same product record.
- **Why one product, many offers:** ADX lets a single product carry a public offer *and* custom private offers that differ in any dimension (price, duration, DSA, refund). The free sample validates the seller profile and seeds the funnel; paid offers ride the same listing's credibility and reuse the same data-set plumbing.

---

## 1. ADX Files data set structure

### 1.1 The object model (ADX terms)

```
Product (1)  ── the marketplace listing buyers see
   │             title, descriptions, categories, logo, support contact, data sensitivity
   │
   ├── Offer(s)  ── the terms a buyer accepts
   │      • Public Free offer        → Pharmacovigilance Sample Pack
   │      • Public paid offer(s)      → tactical SKUs (self-serve)
   │      • Private offer(s)          → Investor Pre-Mortem / enterprise (per-account)
   │
   └── Data set(s) (Files type)  ── the deliverable container
          └── Revision(s)  ── an immutable, finalized version of the contents
                 └── Asset(s)  ── the actual files
                        • report PDF(s)        (the dossier / sample narrative)
                        • appendix CSV(s)      (machine-readable signal + citation tables)
                        • appendix Parquet(s)  (Athena/Redshift/Snowflake-friendly, paid tiers)
```

Key ADX facts that drive this structure (all grounded in AWS docs):
- A **product must reference a data set whose revision is *finalized*** before it can be published — only finalized revisions can be added to a product.
- ADX **supports all file types** as assets, so PDF + CSV + Parquet can all live in the same revision.
- A **published product first enters Limited-visibility** status (visible only to the creating account + allow-listed accounts) so the listing can be tested before going public — this is our built-in pre-publish QA gate (see §5).

### 1.2 Asset layout inside a revision

Each revision is a self-contained, dated snapshot. Proposed asset naming (stable, lowercase, ASCII):

| Asset | Format | Role | Tier |
|---|---|---|---|
| `report-<sku>-<yyyymmdd>.pdf` | PDF | Human-readable dossier / sample narrative with inline citations | all |
| `signal-register.csv` | CSV (RFC 4180, UTF-8, ASCII) | One row per signal: drug(s), MedDRA PT, AEMS metric, severity tier, recommended action, primary identifier | all |
| `citation-index.csv` | CSV (RFC 4180, UTF-8, ASCII) | One row per cited identifier; foreign-keyed to `signal_id`; the auditable provenance trail | all |
| `signal-register.parquet` | Parquet | Columnar mirror of the CSV for Athena/Redshift/Snowflake federation | **paid only** |
| `citation-index.parquet` | Parquet | Columnar mirror of the citation index | **paid only** |
| `data-dictionary.pdf` | PDF (converted from MD) | Per-column schema, allowed values, identifier-resolution URL patterns, cross-file integrity rule | all |

**Free Sample Pack reality (as staged today):** assets are **CSV only** — `signal-register.csv` (10 signals) and `citation-index.csv` (29 citation rows). **No PDF and no Parquet are staged** in the sample folder yet; Parquet/Athena/Redshift/Snowflake is described in the listing copy only as a *feature of the paid tiers*. The free pack's report PDF and the MD→PDF conversions are **build steps still pending** (see §6 gaps).

### 1.3 The CSV/Parquet appendix schema (locked at v1)

Two files, joined on `signal_id`:

- **`signal-register.csv`** — 16 columns: `signal_id`, `signal_label`, `compound_1`, `compound_1_rxnorm`, `compound_2`, `compound_2_rxnorm`, `meddra_pt`, `meddra_pt_code`, `soc`, `aems_metric`, `aems_metric_value`, `severity_tier` (Critical / High / Moderate), `primary_pmid`, `primary_doi`, `primary_nct`, `recommended_action`.
- **`citation-index.csv`** — 5 columns: `identifier_type` (PMID / NCT / DOI / RxNorm / ChEMBL / PubChem CID / UniProt / MedDRA PT / DailyMed SPL), `identifier`, `source_database`, `signal_id` (FK), `context`.

**Cross-file integrity invariant (must hold every release):** every `signal_id` in `signal-register.csv` appears at least once in `citation-index.csv`, and every `signal_id` in `citation-index.csv` exists in `signal-register.csv`. This is validated on every revision before finalize.

**Parquet rule:** the Parquet appendix is a **byte-faithful columnar mirror** of the CSV — identical column names, types, and row counts; Parquet is added only for paid tiers as a delivery convenience, never as a divergent schema. Encoding contract for CSV: UTF-8, RFC 4180, ASCII content, double-quoted fields containing commas, header row, no smart quotes / em dashes.

### 1.4 Encoding & format contract

- CSV: RFC 4180, UTF-8, ASCII-only content.
- PDF: text-selectable (not scanned images), so citation identifiers are copy-pasteable and auditable.
- Parquet: Snappy compression, one row group per file at sample scale; schema derived 1:1 from the CSV dictionary.
- Total free-pack data payload: < 10 KB combined (sample tier, deliberately tiny).

---

## 2. Revision / versioning model

ADX versioning is **revision-based**: a data set is a series of immutable revisions, each a finalized snapshot of assets. We layer a disciplined release process on top.

### 2.1 Versioning rules

1. **Each release = a new finalized revision.** Revisions are immutable once finalized; never mutate a published revision. Corrections ship as a *new* revision.
2. **Semantic label in the revision comment.** Tag each revision `vMAJOR.MINOR` in the ADX revision comment + the data dictionary:
   - **MINOR** = content refresh, added rows, corrected values, new citations — schema unchanged.
   - **MAJOR** = schema change (added/removed/renamed column, changed allowed values, changed FK semantics).
3. **Schema changes are announced.** Any schema (MAJOR) change is communicated via the listing's **"What's New"** entry *and* a versioned `data-dictionary.pdf` shipped in the same revision.
4. **Revision access rules.** When attaching the data set to the product, set revision access so subscribers receive new revisions per the chosen policy (e.g., all finalized revisions). For the static free sample this is effectively one revision; paid/subscription tiers use ongoing revisions.
5. **Provenance is never stripped.** Citation/attribution columns are part of the schema contract — a revision that drops provenance is invalid by definition (also a DSA prohibition).
6. **Integrity gate before finalize.** The cross-file `signal_id` invariant (§1.3) and a "no fabricated citation" check (every cited identifier is a real, resolvable public-domain reference, grounded against the source records retrieved when the deliverable was produced) must pass *before* a revision is finalized. This enforces the citation-grounding / zero-fabrication discipline at the packaging boundary.

### 2.2 Free sample versioning specifics

- The free Sample Pack is **Static** (update frequency = Static, one-time sample). It is expected to live as a single finalized revision; a refresh would be a new MINOR revision with a "What's New" note.
- Paid tiers are **per-mission / on-demand** (typical 48–72h turnaround; Investor Pre-Mortem written Speed SLA 5–10 business days), each delivered as its own revision (often via a private offer to a single subscriber account).

### 2.3 Revision build checklist (per release)

- [ ] Regenerate/refresh CSV(s); re-run cross-file integrity check (every `signal_id` present in both files).
- [ ] Re-verify every cited identifier is a real, resolvable public-domain reference (no fabricated citation).
- [ ] Regenerate Parquet mirror from the *same* CSV (paid tiers); confirm row counts match.
- [ ] Render report PDF + `data-dictionary.pdf`; confirm text is selectable.
- [ ] Create revision → import assets → set revision comment `vX.Y` + change summary → **Finalize**.
- [ ] If schema changed: draft the "What's New" entry.

---

## 3. Free Pharmacovigilance Sample Pack → public Free offer mapping

The Sample Pack is the **public, Free, self-serve offer** on the product. It exists to demonstrate the citation-traced methodology of the paid Investor Pre-Mortem and Failed Trial Archaeology dossiers and to validate the seller profile before paid listings go live.

### 3.1 Product / offer field mapping (paste-ready, already authored)

| AWS field | Value (source) |
|---|---|
| **Product name** | `Pharmacovigilance Signal Synthesis - Free Citation-Traced Sample Pack` (67 chars, under AWS limit) |
| **Short description** | Authored, 199 chars (under 200-char cap), in `listing-copy.md` |
| **Long description** | Authored Markdown (Summary / Key Features / Use Cases / Data Sources table / Update Cadence / Limitations & Compliance / About), in `listing-copy.md` |
| **Highlights** | 3 bullets (every-claim-verifiable / AEMS-grounded / audit-ready provenance), in `listing-copy.md` |
| **Categories (max 2)** | Primary **Healthcare & Life Sciences**; secondary tags Drug Safety / Pharmacovigilance / Clinical Trials / Real-World Evidence *(AWS caps at two categories — pick two; the rest are descriptive only)* |
| **Support contact** | `trevor@trevorobeyinc.com` (managed business alias — not a personal address, per AWS guidance), 1-business-day SLA |
| **Product logo** | Optional (.png/.jpg/.jpeg) — **not yet created** |
| **Data set (Files)** | "Pharmacovigilance Signal Synthesis - Free Sample"; one revision; assets = `signal-register.csv` + `citation-index.csv` (+ `data-dictionary.pdf` if AWS requires PDF) |
| **Data dictionary (listing asset)** | AWS optional data dictionary slot accepts **one .csv ≤ 1 MB conforming to the AWS template** — our human-readable dictionary is Markdown→PDF; attach the PDF as documentation and, separately, prepare an AWS-template CSV data dictionary if we want the structured slot |
| **Data samples (listing asset)** | The two CSVs double as previewable samples (AWS allows up to 10 samples ≤ 50 MB; .csv samples are previewable in-catalog) |
| **Data sensitivity** | No sensitive info; **No PHI / HIPAA N/A**; anonymization N/A (public-database identifiers only) |

### 3.2 The Free offer itself

| Offer setting | Value | Note |
|---|---|---|
| **Visibility** | Public | Anyone can find + subscribe |
| **Pricing model** | **Free** | $0 across all durations |
| **Duration** | Provider-chosen (1–36 months; pick a long, supportable duration) | Avoid discontinuing a duration later — that cancels affected auto-renew subscribers |
| **Auto-renewal** | Decide at creation — **immutable afterward** | Recommend enabling so subscribers retain access to future revisions |
| **DSA** | Custom DSA (research-use-only) | See §4.1; free-tier DSA caps liability at $0 |
| **Refund policy** | N/A for free (state "Free product — no charges, no refunds") | Refund step is still required in the wizard |
| **Subscription verification** | **Auto-enabled & required on ALL public offers since 2025-04-08** | DOJ Rule (Countries of Concern / Covered Persons). Provider must acknowledge + agree in the wizard. **We are solely responsible for reviewing each request** (contact, use case, AWS account ID) — AWS does not validate it. |
| **US sales tax** | N/A at $0; configure tax nexus + product tax codes before any *paid* offer | Set in AWS Marketplace Tax Calculation Service / MMP Settings |

**Subscription-verification implication for the "free" pack:** because verification is now mandatory on every public offer, the free pack is **not zero-touch** — each subscription request lands in our queue for review/approval. Build a lightweight review SOP (who reviews, SLA, the DOJ Country-of-Concern / Covered-Person check) before go-live.

### 3.3 Why free-first

The free pack carries **no SLA** (the refund-backed citation-audit SLA applies to *paid* deliverables only) and exists to (a) prove zero-fabrication citation discipline in a real marketplace context, (b) clear and exercise the seller profile, and (c) be the top-of-funnel that the tactical Pharmacovigilance Pack and the headline Investor Pre-Mortem convert against.

---

## 4. Legal & offer terms (paid tiers attach to the same product)

> All clauses below are **`[DRAFT — counsel review]`**. The placeholder files `data-subscription-agreement.md`, `private-offer-tiers.md`, and `refund-policy.md` in this directory currently contain only titles; this section is the proposed substance to fill them, consistent with the stated intent. **The private-offer percentages and the "Common Paper Service Credits" refund model exist only as filename intent in the repo — they are reproduced here verbatim and formalized as drafts, not invented.**

### 4.1 Data Subscription Agreement (DSA)

- **Mechanism:** ADX offers a **StandardDsa** (AWS-managed template, no URL) you can edit, or a **CustomDsa** (your own document, referenced by an S3 URL). We use a **Custom DSA** — the research-use-only license already authored for the free tier (`data-subscription-agreement.md`): 10 sections — license grant, permitted uses, prohibited uses (no redistribution/resale/repackaging; not the sole basis for clinical/prescribing/regulatory decisions; no PHI commingling that breaches HIPAA/GDPR), IP, AS-IS warranty disclaimer, No-PHI (Provider is not a HIPAA Business Associate), term/termination with 30-day destruction certification, **liability capped at $0 for the free tier**, California governing law, contact. `[DRAFT — counsel review]`
- **Paid-tier DSA variant:** clone the free DSA, then for paid offers (a) raise the liability cap to a counsel-set figure, (b) attach the **refund-backed citation-audit SLA** as an addendum, (c) keep the no-PHI / research-artifacts-only / no-clinical-decision-support clauses verbatim. A private offer can bundle **up to 5 legal docs** (DSA + SLA addendum + SOW + pricing sheet + bill of materials) that AWS merges into one. `[DRAFT — counsel review]`
- **Upload form:** AWS may accept plain text or require PDF — convert MD→PDF and host the CustomDsa in an accessible S3 bucket; handle the plain-text-vs-PDF choice live in the wizard.

### 4.2 Pricing ladder (verbatim from `REVENUE_PLAYBOOK.md`, 2026-04-30 — do not edit prices)

| SKU | Role | Price (verbatim) | Delivery |
|---|---|---|---|
| Pharmacovigilance Sample Pack | Free preview | **$0** | Public Free offer (this listing) |
| **Investor Pre-Mortem** | **PRIMARY** | **$9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary)** | Mostly direct/private offer; 5–10 business-day Speed SLA |
| **Failed Trial Archaeology** | Flanking | **$14,950** | Public paid or private offer |
| Conference Synthesis Brief | Tactical | **$4,950 / conference** | 24–48h |
| Trial Design Benchmark Pack | Tactical | **$4,950** | — |
| Cross-Silo Connector Report | Tactical | **$9,950 – $24,950** | — |
| Plain-Language Patient Brief | Tactical | **$2,500** | — |
| Pharmacovigilance Pack (paid tactical) | Tactical | **$2,500 – $4,950** | Low-friction marketplace entry |

> The retired **Standard / Premium / Custom / Enterprise ARR** ladder ($2,500 / $4,950–$14,950 / $15K–$35K / $60K–$120K+) is **explicitly superseded** and is **not** the public offering structure. Custom/enterprise engagements with cloud-platform delivery remain available as off-ladder custom contracts via discovery call.
>
> ADX offer mechanics for paid tiers: **USD only**, price per duration, durations **1–36 months** (up to **5 durations per public offer**), **pay-upfront**, optional **auto-renewal set at creation (immutable)**. A **public offer must exist before any private offer** on a publicly-visible product. Configure **US sales tax** (nexus + product tax codes) before the first paid offer goes live.

### 4.3 Private-offer tiers `[DRAFT — counsel review; numbers are repo intent only]`

Filename intent (verbatim, the *only* source for these numbers in the repo): **"3% public, 2% $1M–$10M, 1.5% >$10M."** These read as graduated terms keyed to deal-size brackets; the repo body never elaborates whether they are discounts, list-price reductions, or commission terms. Proposed formalization **for counsel to confirm or correct**:

| Deal size bracket | Tier rate | Mechanism (ADX) |
|---|---|---|
| Public / self-serve | 3% | Standard public offer terms |
| $1M – $10M | 2% | Private offer to named AWS account ID(s), custom price/duration/DSA, expiration set at 23:59:59 UTC on a chosen date |
| > $10M | 1.5% | Private offer; may use a flexible payment schedule (note: flexible-payment private offers **cannot** auto-renew) |

Private-offer build path: a public offer must already exist → create offer → add buyer AWS account IDs (for linked accounts, include the payer account, which must accept hourly terms first) → bundle legal docs → set refund policy → review/create → **Actions → Copy offer URL** → email to buyer.

### 4.4 Refund policy `[DRAFT — counsel review; "Common Paper Service Credits" is repo intent only]`

Filename intent (verbatim): **"refund policy mirroring Common Paper Service Credits."** The repo gives no credit schedule, percentages, or triggers — only the related claim that paid deliverables carry a **refund-backed citation-audit SLA**. Proposed formalization **for counsel**:

- Model remedies as **Service Credits** (Common Paper style): if a citation-audit SLA breach is found (a cited identifier does not resolve / is fabricated / is retracted and unflagged), the subscriber is made whole via service credit against current or future engagements, per a counsel-defined schedule. `[DRAFT]`
- ADX refund mechanics: the **provider sets the policy** (AWS does not require offering refunds) but **must state it in every offer** (required wizard step). AWS only processes **provider-authorized** refunds via a refund-approval form in the AWS Marketplace Management Portal; processed refunds appear in the monthly billed-revenue report.
- Free offer: "Free product — no charges, no refunds."

---

## 5. ADX state machine — Draft → Submitted → Action Required → Approval Required (preview) → Publishing

ADX/AWS Marketplace surfaces a listing lifecycle through these statuses. The build target for each state and the gate to advance:

| State | What it means | Our build target before leaving this state |
|---|---|---|
| **Draft** | Product/offer being authored in MMP; not submitted. The free pack is here today (locally staged, not yet in AWS). | Product fields pasted (§3.1); data set created; revision with all assets imported & **finalized**; DSA attached; offer configured (Free/Public, duration, auto-renew, refund text, subscription verification acknowledged); data sensitivity = No PHI. |
| **Submitted** | Submitted to AWS; lands in **Limited visibility** (creator + allow-listed accounts only) for self-test. | Allow-list our own + a test AWS account; subscribe end-to-end from the test account; confirm CSV preview renders, assets download, DSA displays, descriptions/coverage/update-frequency are accurate, links/identifiers resolve. This is the usability QA gate. |
| **Action Required** | AWS (or our QA) flagged something to fix — accuracy, anonymization, contact validity, sensitive-data/DOJ-rule compliance, or a publishing-guideline issue. | Resolve each flag: descriptions accurate & note any aggregation/anonymization; valid non-personal support contact; no PII unless publicly-available-info or EPP; no Sensitive-Location data; DOJ-rule (no Bulk U.S. Sensitive Personal / Gov-related Data to Countries of Concern / Covered Persons); HCLS data HIPAA-deidentified — N/A for us (no PII/PHI, public-domain identifiers only). Re-submit. |
| **Approval Required (preview)** | Final pre-publish review/preview of the listing as buyers will see it. | Full preview pass: title/short/long copy, highlights, categories (≤2), logo, samples preview, DSA, refund text, offer terms, subscription-verification acknowledgment. Sign-off = entity/jurisdiction is **California** everywhere (kill the stale Delaware text), pricing matches the canonical ladder. |
| **Publishing** | Approved → going public. | Public Free offer live + discoverable; verify a clean external subscribe; capture the Product ID/code; record go-live + revision `vX.Y` in the listing log. For first-time data products, allow AWS's documented **5–7 business-day** first-listing review window. |

> **Note on terminology:** AWS's published docs name **Draft / Limited-visibility / Public** as the concrete product-visibility states and describe the publishing-guideline review; "Submitted," "Action Required," and "Approval Required (preview)" are the operational console/review stages this plan maps onto that flow. Treat the table as our internal readiness ladder layered on the documented Draft → Limited-visibility (test) → Public progression.

---

## 6. Product-readiness checklist

### A. Assets / data set (Files type)
- [ ] `signal-register.csv` present, 10 signals, 16 columns — **staged (2,879 B)**
- [ ] `citation-index.csv` present, 29 citation rows, 5 columns — **staged (3,053 B on disk)**
- [ ] Cross-file `signal_id` integrity invariant verified
- [ ] No-fabricated-citation check: every cited identifier is a real, resolvable public-domain reference
- [ ] **Report PDF for the free pack rendered** — *PENDING (not staged)*
- [ ] `data-dictionary.pdf` rendered from MD — *PENDING MD→PDF*
- [ ] Parquet mirrors — *paid tiers only; not required for the free pack*
- [ ] Revision created, assets imported, comment `v1.0`, **Finalized**

### B. Listing copy / metadata
- [ ] Title 67 chars ✓ | Short desc 199 chars ✓ | Long desc Markdown ✓ | Highlights ×3 ✓ — **authored in `listing-copy.md`**
- [ ] Categories trimmed to **≤ 2** (AWS hard cap)
- [ ] Metadata fields ready (`metadata-table.md`): Static / coverage / Global / CSV / file count / No PHI ✓
- [ ] Support contact = business alias, not personal ✓
- [ ] Product logo — *optional, not created*

### C. Legal / offer
- [ ] Custom DSA authored (research-use-only, $0 liability free tier) — **`data-subscription-agreement.md` ✓**; convert to PDF + host in S3
- [ ] `[DRAFT — counsel review]` stamped on DSA, private-offer tiers, refund policy
- [ ] Fill placeholder `private-offer-tiers.md` (3% / 2% / 1.5% intent) — *PENDING, counsel*
- [ ] Fill placeholder `refund-policy.md` (Common Paper Service Credits intent) — *PENDING, counsel*
- [ ] Free offer: Public + Free + duration + auto-renew decision + refund text + **subscription-verification acknowledged** + No-PHI sensitivity
- [ ] US tax nexus + product tax codes configured *before any paid offer*

### D. Consistency / hygiene (must fix before publish)
- [x] ~~Remove/reconcile stale `.txt` duplicates~~ ✅ **RESOLVED 2026-06-19** — `listing-copy.txt` and `data-subscription-agreement.txt` regenerated from their canonical **California** `.md` files; no "Delaware" remains in any repo `.txt` (verified).
- [ ] Update `MANIFEST.md`: `citation-index.csv` is **3,053 B** (manifest says 2,935 B) and the package is **9 files** (manifest counts 7, omitting the two `.txt` duplicates)
- [ ] Confirm "California LLC / B20260217250 / Trevor Robey, INC. (INC = Intelligence Network Citations)" appears identically across product, DSA, metadata, and seller profile

### E. External blockers (cannot publish until cleared)
- [ ] **ADX Provider Qualification** — Seller Ops case **00881277** in flight
- [ ] **Public seller-profile verification** — independent ~2–3 business-day review in flight (status pending as of 2026-05-26)
- [ ] **Disbursement-method review** — currently erroring "account still being reviewed," blocking payouts; **no offer can monetize until cleared** (escalation letter drafted, send-status unconfirmed). Free offer can technically publish without payouts; paid offers cannot complete.

### F. Post-submit
- [ ] Limited-visibility self-test from a test AWS account (subscribe, preview, download, DSA)
- [ ] Subscription-verification review SOP live (reviewer, SLA, DOJ Country-of-Concern / Covered-Person check)
- [ ] Allow for AWS 5–7 business-day first-listing review window
- [ ] On go-live: record Product ID/code + revision version in the listing log

---

## 7. Build sequence (once qualification + profile clear)

1. **MMP → Data products → Create data product.** Paste title; generate Product ID + code.
2. **ADX console → create Files data set** "Pharmacovigilance Signal Synthesis - Free Sample"; create revision; import `signal-register.csv` + `citation-index.csv` (+ `data-dictionary.pdf` if PDF required); add revision comment `v1.0`; **Finalize**.
3. **Product details:** paste short/long description, highlights, ≤2 categories, support contact; attach samples; set logo (if any).
4. **Metadata + data sensitivity:** Static / coverage / format / No PHI; set sensitive-info config; set revision access rules.
5. **Offer:** Public + Free; choose duration(s) + auto-renew (immutable); attach Custom DSA; state refund ("Free — no refunds"); **acknowledge subscription verification**.
6. **Submit → Limited visibility:** allow-list self + test account; run §6.F self-test.
7. **Publish:** resolve any Action-Required flags; preview; publish public; allow 5–7 business-day first-listing review.
8. **Paid offers (after free validates + disbursement clears):** add public/private offers per §4.2–4.4 on the same product, reusing the same data-set/revision plumbing with PDF + Parquet appendices.

> MANIFEST estimates ~15 minutes of UI work once both approvals land — realistic **only** if MD→PDF conversions and the stale-`.txt`/manifest fixes (§6.D) are done first and the report PDF is pre-rendered.

