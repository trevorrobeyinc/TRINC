# trevor-robey-inc Biomedical Due Diligence — Product Catalog

> *Every claim, sourced. Every risk, named. In days, not weeks.*
>
> Powered by OpenClaw (open-source agent framework).

---

## Product Portfolio

### 1. Investor Pre-Mortem (`target-validation-pack` engine) — PRIMARY

Per-asset risk dossier delivered in 5–10 business days for biotech investors and pharma BD/licensing teams. Compresses McKinsey-grade asset diligence into a citation-traced report.

- **What's inside**: trial design archaeology · comparable-failures synthesis · KOL sentiment mapping · IP runway analysis
- **Citation discipline**: every claim PMID / NCT / ChEMBL CID / DOI traced; refund-backed citation-audit SLA
- **Speed SLA**: 5–10 business days, written guarantee
- **ICP**: biotech hedge funds (Citadel, Point72, RA Capital), biotech-specialist VC, pharma BD/licensing
- **Pricing**: **$9,950 anchor / $14,950 standard / $19,950 custom (with KOL primary research)**

---

### 2. Failed Trial Archaeology — FLANKING PRIMARY

Structured post-mortem of Phase 2/3 terminations in a single mechanism. Endpoint analysis, enrollment dynamics, regulatory feedback, and comparable-failures matrix.

- **Citation discipline**: NCT-indexed failure pattern matrix
- **ICP**: pharma R&D CI / medical affairs · biotech VC diligence leads
- **Pricing**: **$14,950**

---

### 3. Conference Synthesis Brief

Real-time synthesis of 500+ ASCO / ESMO / AACR abstracts with citation traceability.

- **Turnaround**: 24–48 hours
- **Format**: HTML executive summary + filterable results table
- **ICP**: pharma R&D, investors, BD/licensing (event-driven)
- **Pricing**: **$4,950 per conference**

---

### 4. Trial Design Benchmark Pack

Comparative analysis of Phase 3 trial structure, enrollment targets, and outcomes for a named mechanism, benchmarked against 10–20 comparable programs.

- **Format**: PDF report + interactive Tableau workbook
- **ICP**: biotech R&D (cost forecasting); pharma CI (competitive benchmarking)
- **Pricing**: **$4,950**

---

### 5. Cross-Silo Connector Report

Hidden mechanistic links between drug targets, diseases, and compounds across ChEMBL, PubMed, and ClinicalTrials.gov, synthesized as repurposing opportunities.

- **Format**: narrative synthesis + interactive knowledge-graph export
- **ICP**: pharma R&D (target validation); biotech partnerships
- **Pricing**: **$9,950 – $24,950**

---

### 6. Plain-Language Patient Brief

Regulatory-compliant Plain Language Summary of a trial (EU CTR 536/2014 or equivalent), written at 8th-grade health-literacy level.

- **Format**: Word/PDF document; EMWA-aligned template
- **ICP**: Patient Advocacy Groups; trial sponsors (regulated CRO function)
- **Pricing**: **$2,500**

---

### 7. Pharmacovigilance Pack (tactical)

Existing safety-signal + AEMS/FAERS analysis with reproducibility manifest. Retains existing Datarade / HuggingFace listings.

- **Citation Density**: 135+ verified references
- **Data Sources**: AEMS (daily real-time updates since 2026-03-11), DailyMed, EudraVigilance, PubMed
- **Pricing**: **$2,500 – $4,950 per report** (existing marketplace tier; demoted from primary lead)

---

## Engine credit

trevor-robey-inc Biomedical Due Diligence is powered by **OpenClaw** (open-source agent framework). OpenClaw provides the underlying multi-agent runtime; trevor-robey-inc owns the methodology, the citation-discipline gate, and the customer-facing offering.

---

## Engine workflow templates (operator reference)

The seven offerings above are produced by six biomedical workflow templates in the `trevor-robey-inc-agents` engine. Each template runs end-to-end via `node scripts/run-workflow.js --template <id>`.

| Template ID | Powers Offering(s) | Data Sources |
|---|---|---|
| `target-validation-pack` | Investor Pre-Mortem (primary inputs) | OpenTargets, UniProt, HPA, InterPro, ChEMBL |
| `clinical-trial-landscape` | Failed Trial Archaeology, Trial Design Benchmark Pack | ClinicalTrials.gov, EuropePMC, PubMed |
| `drug-discovery-full` | Cross-Silo Connector Report | PubChem, OpenTargets, ChEMBL, ADMETai, RxNorm, UniProt |
| `pharmacovigilance-report` | Pharmacovigilance Pack (tactical) | AEMS (formerly FAERS), DailyMed, EudraVigilance, PubMed, RxNorm |
| `rare-disease-brief` | Plain-Language Patient Brief (rare-disease lane) | Monarch, OMIM, OrphaNet, GDC, GARD |
| `general-research-pack` | Conference Synthesis Brief, Plain-Language Patient Brief (general) | PubMed + topic-specific databases |

---

## Every Deliverable Includes

- Multi-section dossier (40–80+ pages typical)
- Citation index CSV with identifier type, source, and context — every row carries a real PMID, NCT, ChEMBL CID, or DOI
- Executive summary with prioritized findings
- Evidence provenance appendix
- Chain-hashed integrity verification (Phase 22 / Phase 28 evidence ledgers)

---

## Why trevor-robey-inc

- **Citation discipline as a gate, not a warning**: every claim PMID / NCT / ChEMBL CID / DOI traced; outputs without verifiable identifiers fail the build
- **Refund-backed citation-audit SLA**: written guarantee on every deliverable
- **5–10 business day Speed SLA** for Investor Pre-Mortem; 24–48 hours for Conference Synthesis Brief
- **Cryptographic Provenance**: Phase 28 evidence ledger for SEC/FDA compliance
- **Frictionless Ingestion**: native delivery via Snowflake, AWS, BigQuery — zero ETL
- **Deterministic Methodology**: multi-agent pipeline (powered by OpenClaw) with automated quality auditing
- **Public Hallucination Audit**: trevor-robey-inc Hallucination Audit v1 — 100 biomedical questions, 5 systems, methodology open-source

---

**Contact: trevor@trevorobeyinc.com**
