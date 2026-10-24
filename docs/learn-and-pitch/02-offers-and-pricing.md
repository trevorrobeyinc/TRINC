# 02 — Offers and pricing

> **Prices are copied verbatim from `ENGINE/OFFERINGS.md`, the only canonical list.** Never compute,
> discount, bundle, total or annualise them. If `ENGINE/OFFERINGS.md` changes, this file is out of date.

## A. The biomedical ladder (the flagship)

[src: `ENGINE/OFFERINGS.md` → "Offering Ladder"]

| Tier | SKU | Description | ICP | Price |
|---|---|---|---|---|
| **Primary** | **Investor Pre-Mortem** | Per-asset risk dossier — trial design + comparable failures + KOL sentiment + IP runway. Every claim PMID/NCT/ChEMBL-traced. 5–10 business days, written Speed SLA. | Biotech hedge funds, biotech-specialist VC, pharma BD/licensing | **$9,950 / $14,950 / $19,950 (+ KOL primary)** |
| **Flanking primary** | **Failed Trial Archaeology** | Structured post-mortem of Phase 2/3 terminations in a single mechanism. NCT-indexed failure pattern matrix. | Pharma R&D CI, biotech VC diligence | **$14,950** |
| Tactical | Conference Synthesis Brief | 500+ ASCO/ESMO/AACR abstracts synthesized in 24–48 hours. | Pharma R&D, investors, BD | **$4,950 / conference** |
| Tactical | Trial Design Benchmark Pack | Comparative Phase 3 structure analysis vs **up to 20** comparable programs — allocation, masking, intervention model, arms, enrollment, primary endpoints, sponsor class. Cohort is reported as **N of M eligible** under a stated selection rule; where an indication has fewer than 20 eligible programs the pack covers the **entire** eligible population and says so. | Biotech R&D, pharma CI | **$4,950** |
| Tactical | **Scoped Research Pack** | One agreed **biomedical** research question, scoped in writing before the run and answered through the **full citation-integrity gate** — same guarantee as every other gated SKU. Bounded to a **single question at fixed depth**; the bound is what makes a flat price honest. If the evidence does not exist, the bundle ships the **search-coverage ledger documenting exactly that**, never a padded report. | Medical-startup founders (SBIR/STTR Phase I), investors with a question outside the standard SKUs | **$4,950** |
| Tactical | Cross-Silo Connector Report | Hidden mechanistic links across ChEMBL/PubMed/CT.gov as repurposing opportunities. | Pharma R&D, biotech partnerships | **$9,950 – $24,950** |
| Tactical | Plain-Language Patient Brief | Regulatory-compliant PLS at 8th-grade health-literacy level (EU CTR 536/2014). | Patient Advocacy Groups, trial sponsors | **$2,500** |
| Tactical (demoted) | Pharmacovigilance Pack | Safety-signal + AEMS/FAERS analysis with a graded citation-integrity ledger. Existing marketplace listings preserved. | Mid-market pharma safety teams | $2,500 – $4,950 |

## B. Business research, any field (also available — booking gated)

[src: `ENGINE/OFFERINGS.md` → "Business research (any field)"]

> Prices approved by the operator on 2026-10-23. **Booking opens after the first live business-lane run
> passes the citation gate**; as of 2026-10-23 none has run. Biomedical due diligence stays the flagship.

| Tier | Scope | Turnaround | Price |
|---|---|---|---|
| **Quick Brief** | One question, a short answer memo with every source listed | 3 business days | **$1,500** |
| **Standard Report** | One agreed question at fixed depth: full report + source ledger (the Scoped Research Pack, widened to any field) | 5 business days | **$4,950** |
| **Deep-Dive Report** | Up to three related questions: options compared, cost-avoidance or cost-cutting analysis, risks named | 10 business days | **$9,950** |
| **Research Retainer** | An ongoing research desk: up to two Standard-depth reports a month, plus quick questions | monthly | **$7,500 / month** |
| **Enterprise Program** | Multi-month programs, private data rooms, or reports built on the client's own data | scoped in writing | **custom quote** |

- Every tier: the question and depth are agreed in writing before the run. If the evidence does not exist,
  the report says so and shows what was searched.
- Sold by direct invoice, or as an AWS private offer for buyers who pay through their AWS bill.
- Research, not advice: never legal, medical, tax or investment advice.
- The guarantee's scope for business identifiers is in `04`.

## C. What each SKU needs to be delivered (read before pitching any of them)

A price on the ladder is not proof the engine can produce the SKU. This table is what the sources say.

| SKU | Engine template | A completed run on disk? | Status for a pitch |
|---|---|---|---|
| Trial Design Benchmark Pack | `trial-design-benchmark` | **Yes, 3 runs passed the gate; run #6 is the proof run** | ✅ Proven. Lead with it. |
| Failed Trial Archaeology | `clinical-trial-landscape` | Yes, 3 completed runs (2026-06/07); the latest (2026-07-16) stores a PASS verdict, the two earlier ones predate that record format | ✅ Path verified [src: `ENGINE/01-brand-system/founder-lane-2026-07-29.md` §1] |
| Scoped Research Pack | `general-research-pack` | No completed run stored | ⚠ Built, not shown live |
| Pharmacovigilance Pack | `pharmacovigilance-report` | No completed run stored | ⚠ Built, not shown live |
| Investor Pre-Mortem | **no single template is named for it** | — | ⚠ `[UNVERIFIED]` fulfilment path. Confirm with Trevor before a pitch promises its Speed SLA. |
| Cross-Silo Connector Report | no template named | — | ⚠ `[UNVERIFIED]` fulfilment path |
| Conference Synthesis Brief | none | — | ❌ No ingestion code exists [src: `ENGINE/01-brand-system/founder-lane-2026-07-29.md` §1] |
| Plain-Language Patient Brief | none | — | ❌ No code implements the plain-language transform [src: same] |
| Business tiers (all five) | `business-research-pack`, `cost-reduction-analysis`, `market-landscape` | **No live run ever** | ⏳ Priced; booking after the first live run |

[src for the run column: `ENGINE/workspace/workflows/` *(on disk, not in git)*, six stored runs, all
`completed`: three `trial-design-benchmark`, three `clinical-trial-landscape`. Templates: `ENGINE/docs/WORKFLOW_CATALOG.md`]

**Rule for the pitches:** show the ladder as written ("show the core ladder", operator, 2026-10-23), but the
*proof* slides use only what has run. Do not describe how a ❌ or ⚠ SKU is produced.

## D. The commitments, in short

- **Zero-Fabrication Guarantee.** Findings are never fabricated to fit what the research is looking for.
  Every cited identifier is grounded in evidence actually retrieved for the report, or it is flagged
  `[UNVERIFIED]` and never presented as fact; if the evidence isn't there, the report says so.
- **Citation-Audit SLA**, refund-backed, on every deliverable.
- **Speed SLA:** 5–10 business days for Investor Pre-Mortem (written guarantee).
- **Scope:** both commitments cover what the engine enforces on an engine-generated deliverable, and only
  sections cited to identifier types the engine recognises. Anything else (patent evidence is the live
  example) sits outside them and must say so on its face.

[src: `ENGINE/OFFERINGS.md` → Brand Commitments]

## E. Not on the ladder (do not offer)

- **The Trial Graveyard Feed** (data product): not listed; its prices are on hold (`06`).
- **A founder patent/IP brief:** no price, pending California counsel review.
  [src: `ENGINE/OFFERINGS.md` → ICPs, founder note]
- **The amendment-risk band:** paused since 2026-10-08 (`04`).
