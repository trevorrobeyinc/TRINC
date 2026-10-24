# Feature Specification: trevor-robey-inc Brand & Commercial Surface

**Feature Branch**: `004-trevor-robey-inc-brand`
**Created**: 2026-05-13
**Status**: Draft (reverse-engineered)

**Input**: Existing `trevor-robey-inc/` workspace — brand canon, LLC paperwork, offerings, revenue playbook, NOTICE. NOT a code surface; this spec governs commercial/legal artifacts.

> **Authority deferral**: The `trevor-robey-inc-brand-guardian` skill is the canonical authority on customer-facing brand language. This spec describes the commercial structure for reverse-engineering purposes; it does NOT supersede brand-guardian. Any customer-facing copy change goes through brand-guardian.

## User Scenarios & Testing

### User Story 1 — Buyer Encounters Offering (Priority: P1)

A buyer (one of the four ICPs) lands on a customer-facing surface (Datarade listing, landing page, marketplace listing, outbound email). They see the tagline, the relevant SKU, the price, the SLA promises. The brand assets (TR monogram, IBM Plex typography, color tokens) are consistent across surfaces. Engine credit ("Powered by OpenClaw") is present on the relevant assets.

**Why P1**: This is the entire revenue funnel. Inconsistency or stale language here directly costs sales and erodes the citation-discipline brand.

### User Story 2 — Operator Updates Offering Ladder (Priority: P2)

The operator adds, retires, or re-prices an SKU. Update flow: edit `trevor-robey-inc/OFFERINGS.md` → propagate to `REVENUE_PLAYBOOK.md` §2 → notify all dependent customer-facing surfaces (Datarade listing, landing page, sample deliverables, outbound templates). The `trevor-robey-inc-brand-guardian` skill self-updates via its evolution protocol.

### User Story 3 — Legal/Compliance Disclosure (Priority: P2)

Customer-facing materials pair the wordmark with the disclosure: *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company."* This handles Cal. Bus. & Prof. Code §17910.5(a) (restricts "Inc." in fictitious business names to incorporated entities).

### Edge Cases

- Buyer confuses the engine framework "OpenClaw" with the retired homebrew `openclaw.ai` consumer product → ALWAYS disambiguate in customer-facing copy.
- A new SKU is added without the Citation-Audit SLA promise → REJECTED by brand-guardian; the SLA is a brand commitment, not optional per-SKU.
- A surface uses stale product names ("OpenClaw Research Intelligence", "OpenClaw Pipeline") → flagged by brand-guardian for replacement with "trevor-robey-inc-agents" (rename completed 2026-04-27).

## Requirements

### Functional Requirements (commercial / legal)

- **FR-001**: All customer-facing copy MUST use the wordmark **"Trevor Robey, INC."** and pair it with the LLC disclosure where the entity is invoked.
- **FR-002**: Legal entity is **Trevor Robey Intelligence Network Citations LLC** (CA, filed 2026-05-06 at bizfileOnline, receipt B20260217250, approval pending as of 2026-05-13).
- **FR-003**: "INC = Intelligence Network Citations" — this is a backronym, NOT a corporate suffix. Comply with Cal. Corp. Code §17701.08(e) (which bars "Inc." inside LLC names — the legal name spells the words out).
- **FR-004**: Brand tagline (do not paraphrase): *"Every claim, sourced. Every risk, named. In days, not weeks."*
- **FR-005**: Brand elevator pitch (do not paraphrase): *"Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Zero hallucinations. Audit trail included."*
- **FR-006**: Offering ladder MUST consist of the six canonical SKUs documented in `trevor-robey-inc/OFFERINGS.md`:
  - **Investor Pre-Mortem** (Primary) — $9,950 / $14,950 / $19,950 (last tier +KOL primary research)
  - **Failed Trial Archaeology** (Flanking Primary) — $14,950
  - **Conference Synthesis Brief** (Tactical) — $4,950 / conference
  - **Trial Design Benchmark Pack** (Tactical) — $4,950
  - **Cross-Silo Connector Report** (Tactical) — $9,950–$24,950
  - **Plain-Language Patient Brief** (Tactical) — $2,500
  - **Pharmacovigilance Pack** (Tactical, demoted — existing marketplace listings preserved) — $2,500–$4,950
- **FR-007**: Four canonical ICPs (per `OFFERINGS.md` ICPs table):
  1. **Pharma & Biotech R&D** — Head of CI, VP BD/Licensing, SVP R&D Strategy, CMO
  2. **Biotech Equity Investors** — Hedge fund PM, Biotech VC Partner, Family Office Research Director
  3. **Academic & Clinical Researchers** — PI, Dept Admin, Research Networks
  4. **Patient Advocacy Groups** — ED, Scientific Director
- **FR-008**: Three brand commitments (cannot be omitted from customer-facing surfaces):
  - **Citation-Audit SLA** (refund-backed) on every deliverable
  - **Public Hallucination Audit v1** — 100 questions, 5 systems, methodology open-source
  - **Speed SLA**: 5–10 business days for Investor Pre-Mortem (written guarantee)
- **FR-009**: Posture statements (cannot be removed from customer-facing surfaces):
  - Research artifacts only — not validated for clinical decision support
  - No PHI hosted, transmitted, or processed
  - Manual-only external actions — no autonomous publishing, posting, or login
  - Citation traceability quality gate — every row carries a real PMID, NCT, ChEMBL CID, or DOI
- **FR-010**: Engine credit: *"Powered by OpenClaw"* — the open-source agent framework. NOT a brand owned by Trevor Robey Intelligence Network Citations LLC. The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated and MUST be disambiguated where confusion is possible.

### Key Entities

- **Legal entity**: Trevor Robey Intelligence Network Citations LLC (CA)
- **Brand wordmark**: Trevor Robey, INC.
- **Brand slug**: `trevor-robey-inc` (used in code paths and internal references; not a regulated entity name)
- **Domain**: trevorobeyinc.com
- **Contact**: trevor@trevorobeyinc.com
- **Filing record**: `trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md`
- **Six SKUs** (offering ladder, above)
- **Four ICPs** (above)
- **Three brand commitments** (Citation-Audit SLA, Public Hallucination Audit v1, Speed SLA)

## Success Criteria

- **SC-001**: Zero customer-facing surfaces contain retired product names ("OpenClaw Research Intelligence", "OpenClaw Pipeline", retired tier names like "Standard / Premium / Custom / Enterprise").
- **SC-002**: Every customer-facing surface pairs the wordmark with the LLC disclosure where the entity is invoked.
- **SC-003**: Citation-Audit SLA + Public Hallucination Audit v1 + Speed SLA appear on every relevant customer surface.
- **SC-004**: Engine credit "Powered by OpenClaw" appears on the relevant assets and is always disambiguated from the retired `openclaw.ai` consumer product.

## Assumptions

- The `trevor-robey-inc-brand-guardian` skill remains the canonical authority on customer-facing language. All copy passes through it.
- CA SOS LLC approval will land 2–3 business days after the 2026-05-06 filing (i.e., by ~2026-05-11; verify current status).
- The 15-folder workspace structure under `trevor-robey-inc/` (00-business-formation through 15-first-sale-risk-mitigation) maps to the 30-day commercial launch playbook.

## Out of Scope

- Engineering changes (those live in specs 001–003).
- Pricing experiments / A-B tests — those are operator decisions, not constitution-level.

## Open Questions / NEEDS CLARIFICATION

- **[NEEDS CLARIFICATION]** CA SOS LLC approval status — verify current (filed 2026-05-06; 2–3 business day target means it should be approved by now, but spec records "pending" per `README.md` snapshot).
- **[NEEDS CLARIFICATION]** Customer intake flow (intake form → SOW → dispatch) — referenced in spec 001 but not documented in this repo. Confirm whether it lives in a CRM or elsewhere.
- **[NEEDS CLARIFICATION]** Brand-guardian skill location (assumed at `~/.claude/skills/trevor-robey-inc-brand-guardian/`) — verify discoverability across all Claude Code/Desktop sessions.
