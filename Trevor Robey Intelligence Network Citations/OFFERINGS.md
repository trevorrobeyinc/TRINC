# trevor-robey-inc — Offerings (canonical, 2026-04-30)

> *Every claim, sourced. Every risk, named. In days, not weeks.*
>
> Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Every citation grounded and retraction-screened. Audit trail included.
>
> Powered by OpenClaw (open-source agent framework).

## Offering Ladder

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

## ICPs

| Segment | Buyer Titles | Top Pain | WTP | Trigger |
|---|---|---|---|---|
| Pharma & Biotech R&D | Head of CI, VP BD/Licensing, SVP R&D Strategy, CMO | Fragmented UX; 77% of pharma content underutilized | Mid-5 to low-6 fig/module/yr | New asset eval; Phase 2→3 |
| Biotech Equity Investors | Hedge fund PM, Biotech VC Partner, Family Office Research Director | 8/30 biotech IPOs above offer (2024); 58.3% Phase 2→3 failure | $10K–$20K/seat; $50K–$100K+/yr enterprise | Pre-deal diligence; phase readout |
| Academic & Clinical Researchers | PI, Dept Admin, Research Networks | 60%+ hallucination in domain LLMs; <70% citation accuracy | $30K–$62.5K per grant min | Grant cycles; lit synthesis |
| Patient Advocacy Groups | ED, Scientific Director | <5% rare diseases have treatments | $5K–$50K project-based | Mandated PLS (EU CTR 2022+) |
| Medical Startup Founders *(added 2026-07-30)* | Founder/CEO, CSO, VP Clinical Development, Head of Regulatory — pre-seed → Series A; biotech, medtech, diagnostics | Investor diligence surfaces prior failures in the indication before the founder has read them. *No published segment statistic was sourced; this cell is deliberately left asymmetric rather than filled.* | SBIR/STTR TABA: up to **$6,500** per Phase I project, **$50,000** per Phase II — "market research and/or validation" is an eligible activity (NIH Guide Notice NOT-OD-26-075, 2026-04-20) | SBIR/STTR application drafting. The vendor must be **named in the budget justification**, so the sale closes *before* submission — the inverse of the other four triggers. |

> **Founder lane — read [`01-brand-system/founder-lane-2026-07-29.md`](01-brand-system/founder-lane-2026-07-29.md) before quoting this segment.**
> The lane is **additive**: no SKU above is repriced, demoted, or renamed. Today it has exactly **one**
> transactable SKU — Failed Trial Archaeology, sized to the **Phase II** TABA line, not Phase I. The
> tactical SKUs a Phase I founder could afford have verified fulfillment gaps and are **not** offered to
> this segment yet. The patent/IP brief is **not on this ladder** and has no price pending California
> counsel review.

## Brand Commitments

- **The Zero-Fabrication Guarantee — only the truth.** Findings are never fabricated to fit what the research is looking for. Every cited identifier is grounded in real evidence actually retrieved for the report, or it is flagged `[UNVERIFIED]` and never presented as fact; if the evidence isn't there, the report says so rather than inventing a result. A report whose citations can't be traced to retrieved evidence does not ship. This is **enforced by the engine at generation time**, not a promise on paper — see the Citation-Integrity Gate below.
- **Citation-Audit SLA** on every deliverable — refund-backed
- **Scope of the two commitments above (2026-07-30).** Both describe what the **engine enforces at
  generation time** on an engine-generated deliverable. The citation engine recognizes seven identifier
  types — PMID, PubChem CID, NCT, UniProt, ChEMBL, DrugBank, DOI. Evidence carrying none of them is
  **never extracted as a citation at all**: it is not graded, not counted in the grounded ratio, and not
  retraction-screened — so it is neither improved nor penalised by the Gate, it is invisible to it.
  **Patent evidence is the live instance of this** (a patent number matches none of the seven). Two
  consequences, stated here so no deliverable has to imply otherwise: (a) any section built on evidence
  outside those seven types sits outside the Guarantee and outside this SLA, and must say so on its face;
  (b) a bundle's Citation Integrity grade covers only its PMID/NCT/ChEMBL/DOI-traced sections — the
  deterministic post-gate artifacts (`graveyard-memo.md`, `search-coverage.md`) are grounded **by
  construction**, rendered with no LLM straight from the records fetched at runtime, but they are **not
  counted in the ratio that produced that grade**. A hand-assembled deliverable that never ran through the
  engine claims none of this.
- **Citation-Integrity Gate** — every cited identifier in the assembled report is cross-checked against the source records actually retrieved at runtime; citations are graded "grounded" (present in retrieved evidence) vs "ungrounded" (likely model-introduced). The report refuses to ship when the grounded ratio falls below threshold, and surviving ungrounded cites are annotated inline `[UNVERIFIED]`. Cited DOIs are screened against Crossref for retractions, and any report citing a retracted paper hard-stops. (Citations are grounded in the retrieved source records + DOI retraction-screened — they are not independently re-resolved against each live external database.)
- **Speed SLA**: 5–10 business days for Investor Pre-Mortem (written guarantee)

### Bundle deliverables (shipped)

Every mission bundle now seals two audit-trail artifacts alongside the report:

- **Citation Integrity & Provenance ledger** — a graded provenance ledger (A/B/C/D from the grounded ratio; F/BLOCKED if any cited paper is retracted; N/A if nothing is cited), the report's audit-trail spine.
- **Graveyard Memo + protocol Amendment-Risk** — for an indication, a memo of prior terminated/withdrawn/suspended trial programs, each NCT-traced with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, and a resolvable clinicaltrials.gov link; plus a protocol amendment-risk band (LOW/MODERATE/HIGH) derived deterministically from change-history version counts. Rendered from the fetched records (no LLM), so every claim is verifiable.

## Posture (preserved)

- Research artifacts only — not validated for clinical decision support
- No PHI hosted, transmitted, or processed
- Manual-only external actions — no autonomous publishing, posting, or login
- Citation traceability quality gate — every row carries a real PMID, NCT, ChEMBL CID, or DOI; a report-level gate cross-checks every cited identifier against the records actually retrieved at runtime (grounded vs ungrounded) and refuses to ship below the grounded-ratio threshold, and cited DOIs are screened against Crossref for retractions (grounded + retraction-screened, not independently re-resolved against each live source database)

## Engine credit

trevor-robey-inc is powered by **OpenClaw** (open-source agent framework). OpenClaw provides the underlying multi-agent runtime; trevor-robey-inc owns the methodology, the citation-discipline gate, and the customer-facing offering. OpenClaw is not a brand owned by Trevor Robey Intelligence Network Citations LLC (the legal entity behind the "Trevor Robey, INC." wordmark, where INC = Intelligence Network Citations), and trevor-robey-inc is unaffiliated with the homebrew `openclaw.ai` consumer "Personal AI assistant" product (a different, unrelated product retired from this stack on 2026-04-27).

## Source

Demand-Validation Report (2026-04-30); locked decisions and per-file diff plan. *(Original source files lived on the operator's prior, since-wiped machine — `~/Downloads/…Demand-Validation Report.md`, `~/.claude/plans/…merry-spark.md`, `/tmp/rebrand-diffs-2026-04-30.md` — and are not on the current machine; retained here as provenance only. The offering ladder above is the canonical carry-forward.)*
