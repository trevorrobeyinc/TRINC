# 01 — What TRINC is

## The names

| Name | What it is |
|---|---|
| **Trevor Robey, INC.** | The brand wordmark. "INC" stands for **Intelligence Network Citations**; it is a backronym, not a corporate suffix. [src: `ENGINE/01-brand-system/brand-identity-2026-07-29.md` §2] |
| **Trevor Robey Intelligence Network Citations LLC** | The legal entity: a California limited liability company, **CA SOS Entity No. B20260217250**, filed 2026-05-06, **approved 2026-06-18**. [src: `ENGINE/SYSTEM-REALITY.md` §1] |
| **TRINC** | Short for Trevor Robey Intelligence Network Citations. Since 2026-10-23 it is also the name of the code repository and the whole stack. [src: `CLAUDE.md`, top note] |
| **OpenClaw** | The open-source agent framework the engine is built on. Not a brand the business owns, and unrelated to the consumer "openclaw.ai" assistant. [src: `ENGINE/OFFERINGS.md` → Engine credit] |

**The disclosure line**, used wherever the wordmark appears in customer-facing material:

> Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited
> liability company.

[src: `HOW-IT-WORKS.md`, header]

Why the disclosure exists: California law bars "Inc." inside an LLC's name and restricts it in fictitious
business names, so the legal name spells the words out and the disclosure makes the entity type explicit.
[src: `CLAUDE.md` → TRINC product summary, compliance note]

Website: https://trevorobeyinc.com · Email: trevor@trevorobeyinc.com [src: `ENGINE/CLAUDE.md` → Marketing and Brand Infrastructure]

## The lines

- **Tagline:** *Every citation, checked. Every risk, named. In days, not weeks.*
- **Elevator:** *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days.
  Every cited paper and trial checked twice, against the evidence retrieved and at its registry, with
  retractions screened and anything unconfirmed flagged. Audit trail included.*

[src: `ENGINE/OFFERINGS.md`, lines 3–5]

Both lines date from 2026-11-15. They hold for the identifiers the engine's extractor reads. A citation in
another form (a patent number, a EudraCT or ISRCTN trial id, a PMCID, an author-year reference with no id)
is not checked at all, and only DOIs and PMIDs are screened for retraction.
[src: `ENGINE/SYSTEM-REALITY.md`, tagline row]

## The business in one sentence

> Trevor Robey, INC. sells citation-traced biomedical due diligence to people making high-stakes bets on
> someone else's science — biotech investors and pharma business development — and its entire
> differentiator is that a claim without a verifiable identifier fails a gate rather than passing with a
> warning.

[src: `ENGINE/01-brand-system/brand-identity-2026-07-29.md` §1]

## One engine, two lanes

The business used to be biomedical only. Since 2026-10-21 the same engine has a second lane for business
research in any field. It is a **module inside the one engine**, not a second engine: both lanes share the
same pipeline and the same citation gate, and a template opts into the business lane with
`research_profile: business`. [src: `ENGINE/CLAUDE.md` → "Business research lane"; `ENGINE/docs/business-research-lane.md`]

| | Biomedical lane (the flagship) | Business lane (also available) |
|---|---|---|
| Questions | Drugs, trials, targets, safety signals, rare disease | Any field: cost cutting, market landscapes, a single agreed business question |
| Evidence it cites | PubMed (PMID), ClinicalTrials.gov (NCT), ChEMBL, DOIs, and other biomedical ids | Stored web-page snapshots (`WEB:`), SEC filings (`SEC:`), World Bank (`WB:`), BLS and Eurostat statistics, DOIs |
| Templates | 7 | 3 |
| State | Works; the latest proof run delivered 45 of 45 citations verified (run #6, 2026-10-08) | Built and unit-tested; **never run live** |
| Prices | The canonical ladder | Five tiers, approved 2026-10-23, **booking after the first live business run** |

[src: `ENGINE/docs/WORKFLOW_CATALOG.md`; `ENGINE/OFFERINGS.md`; `HOW-IT-WORKS.md` §8]

How to frame it (operator direction, 2026-10-23): biomedical research stays the focus and the flagship; the
business lane widens the same method to every other buyer. In brand copy, biomedical leads and business
research is "also available". [src: `ENGINE/product-strategy/tier-ladder-DRAFT-2026-10-20.md`, prerequisites; operator answers recorded in `ops/reorg/2026-10-cleanup-manifest.md`, Phase 7]

## Who buys

Five biomedical buyer segments are named in the canon:

1. **Biotech Equity Investors**: hedge fund PM, biotech VC partner, family office research director.
2. **Pharma & Biotech R&D**: head of competitive intelligence, VP BD/licensing, SVP R&D strategy, CMO.
3. **Academic & Clinical Researchers**: PIs, department admins, research networks.
4. **Patient Advocacy Groups**: executive and scientific directors.
5. **Medical Startup Founders** (added 2026-07-30): pre-seed to Series A founders in biotech, medtech and
   diagnostics.

[src: `ENGINE/OFFERINGS.md` → ICPs]

The business lane's buyer, in the operator's words: "any buyer [who] needs any research done in any field
… for cost cutting, or whatever their reason for needing a report may be."
[src: `ENGINE/product-strategy/tier-ladder-DRAFT-2026-10-20.md`, opening quote]

> ⚠ **Do not put the ICP table's market statistics on a slide.** The pain and willingness-to-pay cells in
> `ENGINE/OFFERINGS.md` (for example "58.3% Phase 2→3 failure" or "60%+ hallucination in domain LLMs") came
> from a 2026-04-30 Demand-Validation Report whose source files are **not on this machine**.
> `ENGINE/OFFERINGS.md` → Source says so itself. Treat them as `[UNVERIFIED]` until re-sourced. The one sourced
> cell is the founder segment's SBIR/STTR figure (NIH Guide Notice NOT-OD-26-075).

## What the business refuses to be

- **Not clinical decision support.** Research artifacts only.
- **Not a PHI processor.** No patient data is hosted, sent or processed.
- **Not a publishing bot.** Every external action (publishing, posting, uploads, logins, sales) is manual.

[src: `ENGINE/OFFERINGS.md` → Posture]

## Where it stands (2026-10-23)

- **Revenue: $0.** Nothing listed, no deals on record. [src: `STATUS.md`]
- **One person, one Mac.** [src: `HOW-IT-WORKS.md` §1, §6]
- **Proof of method:** run #6, a Trial Design Benchmark for non-small cell lung cancer, delivered on
  2026-10-08 with 45 of 45 citations re-resolved VERIFIED (detail in `04`).
