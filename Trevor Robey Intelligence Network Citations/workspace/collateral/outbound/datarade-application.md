# Datarade Vendor Application — Trevor Robey Inc.

**Submission target**: https://datarade.ai/company/contact/data-providers
**Drafted**: 2026-04-26 · **Submit by**: Tue 2026-04-28

Paste-ready blocks mapped to Datarade's intake form. Each `##` heading corresponds to a form field.

---

## Company info

| Field | Value |
|---|---|
| Company (legal) | Trevor Robey Inc. |
| Brand / trading name | Trevor Robey Inc Agents |
| Website | https://trevorobeyinc.com |
| Primary contact | Trevor Robey · trevor@trevorobeyinc.com |
| Country | United States |
| Year founded | 2025 |
| Company size | Solo founder / specialist provider |

## Geographic coverage

Worldwide for source data (US, EU, UK, Switzerland, Japan via primary databases). Headquartered United States. Buyer access unrestricted by geography.

## Data categories (Datarade taxonomy)

Select all that apply on the Datarade form:

- **Pharma Data**
- **Drug Discovery Data**
- **Pharmacovigilance Data**
- **Clinical Trial Data**
- **Biomedical Research Data**
- **Healthcare Provider Data** (peripheral — only when target validation packs reference investigator sites)

## Products / datasets

Six pack templates, each delivered as PDF + structured Parquet/CSV appendix with full citation manifest:

1. **Drug Discovery Intelligence Pack** — compound profiling, ADMET properties, target-compound mapping, molecular interaction networks, competitive landscape. ~200+ verified citations per report. Sources: PubChem, ChEMBL, RxNorm, OpenFDA, UniProt.

2. **Pharmacovigilance Safety Report** — adverse event signal detection, AEMS (formerly FAERS, daily updates since Aug 2025) disproportionality analysis (ROR, PRR), drug interaction profiling, clinical action recommendations. ~135+ verified citations per report. Sources: OpenFDA AEMS, DailyMed, RxNorm, PubMed, EudraVigilance public reports.

3. **Clinical Trial Landscape Analysis** — global trial registry mapping, competitive pipeline, phase transition probability, endpoint benchmarking. ~180+ verified citations per report. Sources: ClinicalTrials.gov (NCT IDs), PubMed, WHO ICTRP.

4. **Target Validation Intelligence Pack** — target-disease association evidence scoring, pathway analysis, PPI network mapping, validation matrix. ~289+ verified citations per report. Sources: OpenTargets, UniProt, HPA, PubMed, ChEMBL, RxNorm.

5. **Rare Disease Research Brief** — orphan drug mapping, genetic disease profiling, rare disease intelligence. ~150+ verified citations per report. Sources: GARD, Orphanet, PubMed, ClinicalTrials.gov.

6. **General Research Pack** — custom-topic research synthesis on any biomedical question. Sources: full public-domain stack from packs 1–5.

## Use cases supported

- **Competitive intelligence** for pharma R&D, BD/licensing, and corporate strategy teams
- **Pipeline benchmarking** for biotech-focused alternative-data quants and hedge funds
- **Target validation** for biotech R&D and target-discovery scientists
- **Pharmacovigilance signal triage** for safety + regulatory teams
- **Asset-evaluation diligence** for boutique life-sciences consultancies
- **Academic research** for citation-grounded literature reviews

## Delivery methods

- **Standard tier**: secure email delivery of signed/encrypted PDF + structured Parquet/CSV appendix within 72 hours of order confirmation
- **Custom tier**: native cloud delivery via Snowflake share, AWS S3 pre-signed URL, Google BigQuery shared dataset, or SFTP secure transfer
- **Enterprise tier**: API access (REST/JSON), private dataset endpoint, SLA-backed
- All tiers include a Reproducibility Manifest (per-citation resolution proof — every PMID, NCT, RxCUI, ChEMBL ID, PubChem CID, UniProt ID, and DOI checked against source databases at delivery time)

## Pricing model

| Tier | Price | Buyer profile |
|---|---|---|
| **Research Intelligence Pack** | $2,500 – $4,950 per single-topic report | Academic researchers, boutique life-sciences consultancies, biotech pre-IND teams |
| **Custom Intelligence Mission** | $15,000 – $35,000 per project | Mid-market pharma BD, biotech R&D, alt-data hedge funds |
| **Enterprise Subscription** | $60,000 – $120,000+ ARR | Large pharma CI directors, CROs, top-tier hedge funds |

One-off, custom, and subscription billing supported. Off-platform fulfillment — buyer invoiced directly via Stripe ACH (preferred) or wire.

## Sample availability

- **Public 2-page teaser** (no NDA) — Pharmacovigilance Signal Synthesis on Immune Checkpoint Inhibitors. Available on request via the trevorobeyinc.com landing page CTA or by direct email to trevor@trevorobeyinc.com.
- **Full 48-page redacted sample deliverable** — same topic, full structure, available post-NDA (Common Paper Mutual NDA template, 3-day signature turnaround typical).
- Both samples reflect the production output format including the Source License Register and Reproducibility Manifest appendices.

## Update frequency

- **Standard tier packs**: produced on-demand per buyer order; sources are current as of delivery date with each citation timestamped.
- **Custom Intelligence Missions**: quarterly refresh on request; included in scope for engagements ≥ 6 months.
- **Enterprise Subscriptions**: per-pack refresh cadence configurable (typical: monthly for AEMS-driven pharmacovigilance, quarterly for pipeline + clinical trial landscape, semi-annual for target validation).

## Compliance posture

| Area | Posture |
|---|---|
| **GDPR / UK GDPR** | All sources are public-domain or open-licensed primary databases. No personal data transferred. SCC Module Two addendum available for EU/UK buyers; UK IDTA addendum available. |
| **CCPA** | No California consumer personal information processed or sold. |
| **HIPAA** | No PHI in deliverables. Pharmacovigilance reports use de-identified, aggregate-only signal data. BAA available for healthcare entity buyers. |
| **PHI / PII screening** | Microsoft Presidio (HIPAA Safe Harbor 18-PHI-type recognizer set) run on every deliverable pre-publication. Pass condition: zero high-confidence matches outside cited paper authors. |
| **Citation reproducibility** | Every PMID, NCT, RxCUI, ChEMBL ID, PubChem CID, UniProt ID, and DOI is automatically validated at build-time via NCBI E-utilities, Crossref, and Unpaywall. Manifest attached to every pack. |
| **Source licensing** | See Source License Register below. |

## Source license register

Proactive disclosure of every source database used and its license terms.

| Source | License | Inclusion |
|---|---|---|
| AEMS (formerly FAERS) | US Government work — public domain | ✅ Included |
| ClinicalTrials.gov | US Government work — public domain | ✅ Included |
| PubMed (citation metadata + PMC OA full text) | Free for any use; full-text restricted to PMC Open Access Subset | ✅ Included with attribution |
| PubChem | Public domain (NIH/NLM) | ✅ Included |
| RxNorm | Public domain (US federal data) | ✅ Included |
| OpenFDA | Public domain (FDA) | ✅ Included |
| UniProt | CC BY 4.0 | ✅ Included with attribution string |
| ChEMBL | CC BY-SA 3.0 | ✅ Included as derived analyses with version cited (e.g., ChEMBL_36, Sept 2025); raw rows not redistributed |
| OpenTargets, GARD, Orphanet, HPA | Open-license, public | ✅ Included |
| **DrugBank** | Commercial-license-required | ❌ **NOT INCLUDED**. Commercial DrugBank-licensed pack available under separate engagement — contact trevor@trevorobeyinc.com. |
| EudraVigilance (public reports) | Public reports only — no licensed extracts | ✅ Public-portion only |

This register ships in every deliverable as an appendix.

## Vendor pitch — Variant B chosen for Datarade storefront

### ✅ Variant B — Hedge fund / alt-data framing (PASTE THIS into Datarade's free-text "describe your data" field)

> Citation-grounded biomedical intelligence for biotech-focused alt-data and quant teams. Every signal — pipeline phase, adverse event ROR, target-disease evidence score, trial enrollment trend — resolves to public-domain identifiers (NCT, PMID, AEMS report IDs) with timestamped Reproducibility Manifests so every claim is independently replayable. Six standardized pack templates plus custom missions. Standard $2.5K–$4.95K per single-topic report, 72-hour delivery; Custom $15K–$35K with native cloud delivery; Enterprise subscriptions $60K+ ARR with API access and SLA.

**Why this one for Datarade**: alt-data quants close in 2–6 weeks vs 3–9 months for pharma procurement; the Reproducibility Manifest + public-domain-citations differentiator is strongest in this audience; price-per-deal sits in the solo-operator-friendly $15K–$50K sweet spot. Targets: Citadel Surveyor + Data Strategies Group, Point72 MI-Data, RA Capital QR&S.

### Repurposed for Week 2 cold-email outreach (NOT for Datarade)

#### Variant A — for pharma CI directors

> Trevor Robey Inc. produces citation-backed biomedical research packs for pharma CI, biotech R&D, and life-sciences consulting buyers. Every claim resolves to a verifiable identifier in public-domain primary sources — PMID, NCT, RxCUI, ChEMBL, UniProt, PubChem CID, DOI — with a reproducibility manifest attached. Six pack templates from drug discovery to pharmacovigilance, $2,500–$4,950 per single-topic Standard pack, $15,000–$35,000 Custom Missions, $60K+ ARR Enterprise. 72-hour secure delivery; Snowflake / AWS / BigQuery for Custom and above.

**Use for**: AbbVie (Director, Competitive & Strategic Insights — Oncology), AstraZeneca (Senior Director, Competitive Intelligence — Oncology R&D), GSK (Head of Global CI Oncology).

#### Variant C — for boutique consultancy / academic

> Citation-backed biomedical research synthesis priced for boutique life-sciences consultancies, academic researchers, and biotech pre-IND teams who need verifiable evidence packs without enterprise-database overhead. Each pack ships with 135+ to 289+ resolved citations across PubMed, ClinicalTrials.gov, AEMS, ChEMBL, RxNorm, UniProt, and PubChem. Six standardized templates from drug discovery to rare disease briefs, $2,500–$4,950 per Standard pack, 72-hour secure delivery. No paywalled-source dependencies — every cited identifier resolves in its source database.

**Use for**: ClearView Healthcare Partners, Trinity Life Sciences, Clarivate.

## Attachments / links to provide

When Datarade asks for supporting materials, supply:

1. https://trevorobeyinc.com — canonical company URL
2. `pharmacovigilance-2page-teaser.md` (rendered to PDF) — public sample
3. `pharmacovigilance-sample-deliverable.md` (rendered to PDF, post-NDA) — full sample
4. `product-catalog.md` (rendered to PDF) — full product line
5. `brand-system.md` — internal reference; not for buyer-facing
6. Common Paper Mutual NDA link — https://commonpaper.com/standards/mutual-nda/

## Submission notes

- Datarade Basic vendor subscription is free; commission only on closed deals (commission rate confirmed during onboarding call — Monda commerce tier per playbook lists 30% Standard / 20% Professional)
- Off-platform fulfillment — buyer-vendor relationship is direct after Datarade introduces
- Vendor success team typically schedules an intake call within 3 business days of submission; ask explicitly about: (a) commission rate, (b) which Datarade taxonomy auto-tags drive most inbound, (c) timeline to storefront live (~3–10 days observed)

## Post-submission expectations

| Milestone | Realistic timeline |
|---|---|
| Datarade vendor success intake call | 1–3 business days post-submission |
| Storefront approved + listing live | 3–10 business days |
| First inbound buyer inquiry | 30–120 days (depends on outbound parallel effort, marketplace SEO ranking) |
| First closed deal | 60–180 days for Standard tier (per Datarade self-reported B2B norms) |

---

*Drafted: 2026-04-26 · Source: workspace/collateral/{catalog,samples,outbound,brand-system}.md · Live site: https://trevorobeyinc.com*
