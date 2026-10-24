# Implementation Plan: trevor-robey-inc Brand & Commercial Surface

**Branch**: `004-trevor-robey-inc-brand` | **Date**: 2026-05-13 | **Spec**: [`spec.md`](./spec.md)

> **Authority deferral**: The `trevor-robey-inc-brand-guardian` skill at `~/.claude/skills/trevor-robey-inc-brand-guardian/` is the canonical authority on customer-facing brand language. This plan describes the commercial structure for reverse-engineering purposes; it does NOT supersede brand-guardian. Any customer-facing copy change goes through brand-guardian.

## Technical Context

- **Language / runtime**: Not a code surface. Artifacts are markdown, HTML (inline-SVG landing page), and PDFs (rendered from HTML via Safari Save-as-PDF). No build system, no dependencies, no tests.
- **Module system**: N/A.
- **Workspace orchestrator**: N/A. Folder structure is the spec — 15 numbered directories (`00-business-formation/` through `15-first-sale-risk-mitigation/`) plus three root files (`README.md`, `OFFERINGS.md`, `trevor-robey-inc Commercial Launch Playbook.md`). Each folder maps to a specific section of the 30-day commercial launch playbook (see Architecture).
- **Test framework**: N/A. The five YES/NO items in `14-due-diligence-checklist/` plus the 10-item `15-first-sale-risk-mitigation/` checklist function as the quality gates.

## Architecture

The `trevor-robey-inc/` directory is the commercial-launch workspace — the home for everything the playbook prescribes. It is the brand canon plus the operational paperwork. Three layered structures:

1. **Two-name structure** (legal compliance):
   - **Legal entity**: Trevor Robey Intelligence Network Citations LLC (CA, filed 2026-05-06 at bizfileOnline, receipt B20260217250, approval pending per memory snapshot).
   - **Wordmark**: Trevor Robey, INC. — where INC = Intelligence Network Citations (backronym). Paired with the LLC disclosure on customer-facing surfaces.
   - Compliance rationale: Cal. Corp. Code §17701.08(e) bars "Inc." inside LLC names (legal name spells the words out); Cal. Bus. & Prof. Code §17910.5(a) requires the wordmark+disclosure pairing where the entity is invoked.

2. **Six-SKU offering ladder** (per spec.md FR-006 + `OFFERINGS.md`):
   - **Investor Pre-Mortem** (Primary) — $9,950 / $14,950 / $19,950 anchor + KOL primary research at the top tier
   - **Failed Trial Archaeology** (Flanking Primary) — $14,950
   - **Conference Synthesis Brief** (Tactical) — $4,950/conference
   - **Trial Design Benchmark Pack** (Tactical) — $4,950
   - **Cross-Silo Connector Report** (Tactical) — $9,950–$24,950
   - **Plain-Language Patient Brief** (Tactical) — $2,500
   - **Pharmacovigilance Pack** (Tactical, demoted — existing marketplace listings preserved) — $2,500–$4,950

3. **15-folder workspace** mapped to the 30-day playbook:
   - `00-business-formation/` — §5 items 7–10 (LLC, banking, insurance, tax, compliance)
   - `01-brand-system/` — TR monogram (inline SVG inside `landing-page/index.html`), IBM Plex typography, color tokens, marketplace listing visuals
   - `02-product-packs/` — pack templates and sample deliverables
   - `03-platforms/` — Datarade, AWS Data Exchange, HuggingFace gated dataset, Kaggle SEO breadcrumb, rejected channels
   - `04-pricing-benchmarks/` — pricing ladder + five competitor benchmarks (GlobalData, DealForma, Citeline, Cortellis, Definitive Healthcare)
   - `05-launch-plan/` — week-by-week execution plan, contractor budget
   - `06-target-accounts/` — 12 named accounts × 4 personas + 3 wildcards
   - `07-outbound/` — cold-email templates, LinkedIn openers, 9-touch sequence cadence, SDR contractor brief
   - `08-contracts-legal/` — Common Paper MSA / SOW / NDA / DPA, IP, indemnification, refund policy, payment terms
   - `09-source-licenses/` — per-source license register (FAERS/AEMS, ChEMBL share-alike, PubMed, PubChem, UniProt, DrugBank STOP-SHIP)
   - `10-quality-pipeline/` — citation reproducibility validator (Python ≤200 lines), Microsoft Presidio PHI/PII screen, Ragas LLM-as-judge, freshness YAML, pre-publication checklist
   - `11-financial-ops/` — Stripe Invoicing (ACH primary), Bonsai, P&L, invoice archive
   - `12-pipeline-tracking/` — discovery calls log, NDA pipeline, signed deals, EoM KPIs
   - `13-supplementary-research/` — monetization architecture, buyer cohorts, vendor landscape, tiered report architecture, RFP/government, community-led growth
   - `14-due-diligence-checklist/` — the five YES/NO items required before any pack ships
   - `15-first-sale-risk-mitigation/` — the 10-item checklist for a Week-2 $50K custom inquiry

## Port Map

N/A. The brand workspace owns no network listeners.

## Data Model

- **Customer-facing surfaces**: Datarade vendor listing, marketplace listings (AWS Data Exchange staged for Week 3 May 11–15 per memory `project_aws_marketplace_week3.md`), HuggingFace gated dataset, Kaggle breadcrumb, the landing page at `trevorobeyinc.com` (deployed by Cloudflare Worker `shy-grass-fccd` from `/Users/trevorrobey/openclaw-landing-deploy/index.html` — external to this monorepo), sample deliverables (`02-product-packs/*/samples/`), outbound templates (`07-outbound/`).
- **LLC filing record**: `trevor-robey-inc/00-business-formation/llc/certificate-of-formation.md`. Receipt B20260217250. Filed 2026-05-06 at bizfileOnline.
- **Brand canon assets**: Inline SVG TR monogram inside `01-brand-system/landing-page/index.html` (canonical pixels — generate raster exports from this source for Datarade thumbnails, AWS DX product logos, HF banners). Brand-system source-of-truth at `01-brand-system/brand-system.md`. Figma file `cAlmeot0lXqqcIDecpQjdO` (trevorobeyinc-team education-Pro) holds 5 logo variants and the 7-token color collection — visual reference only.
- **Playbook**: `trevor-robey-inc Commercial Launch Playbook.md` (30-day source-of-truth, moved from `~/Downloads`, renamed from "OpenClaw Commercial Launch Playbook.md" on 2026-04-30).
- **NOTICE / disclaimers**: `NOTICE.md` (research-artifacts-only posture, no PHI, manual-only external actions, citation traceability quality gate).

## External Integrations

- **bizfileOnline** (California Secretary of State filing portal) — LLC filing 2026-05-06, receipt B20260217250.
- **Datarade** — tier-1 vendor marketplace. Application paste-ready at `03-platforms/datarade/vendor-application.md` (submission targeted Tue Apr 28 per playbook).
- **AWS Data Exchange** — Week-3 May 11–15 listing target per memory `project_aws_marketplace_week3.md`. Free Pharmacovigilance Sample Pack staged; awaiting Provider Qualification + seller profile + LLC SOS approvals.
- **HuggingFace** — gated dataset (Fri May 1 push target per README's highest-leverage actions).
- **Kaggle** — SEO breadcrumb only.
- **Stripe Invoicing** — ACH primary payment rail, card fallback. Per `11-financial-ops/`.
- **Bonsai** — invoicing bundle alternative. Per `11-financial-ops/`.
- **Domain**: `trevorobeyinc.com` (Cloudflare Worker `shy-grass-fccd` deploys from external `/Users/trevorrobey/openclaw-landing-deploy/index.html`).
- **Contact**: `trevor@trevorobeyinc.com`.
- **Engine credit**: *"Powered by OpenClaw"* — the open-source agent framework (the engine under `trevor-robey-inc-agents/`). NOT a brand owned by Trevor Robey Intelligence Network Citations LLC. The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated and MUST be disambiguated where confusion is possible.
- **Source-of-truth pointers** (do not break): brand/landing-copy edits happen at `trevor-robey-inc-agents/workspace/collateral/`; copy back into `01-brand-system/` to keep this folder current. The Cloudflare-deployed `/Users/trevorrobey/openclaw-landing-deploy/` paths are external to the monorepo.

## Constraints

- **Brand commitments cannot be omitted from customer-facing surfaces**:
  - **Citation-Audit SLA** (refund-backed) on every deliverable
  - **Public Hallucination Audit v1** — 100 questions, 5 systems, methodology open-source
  - **Speed SLA** — 5–10 business days for Investor Pre-Mortem (written guarantee)
- **Posture statements cannot be removed from customer-facing surfaces**:
  - Research artifacts only — not validated for clinical decision support
  - No PHI hosted, transmitted, or processed
  - Manual-only external actions — no autonomous publishing, posting, or login
  - Citation traceability quality gate — every row carries a real PMID, NCT, ChEMBL CID, or DOI
- **Legal naming compliance**: Cal. Corp. Code §17701.08(e) bars "Inc." inside LLC names. Cal. Bus. & Prof. Code §17910.5(a) requires the wordmark+disclosure pairing. The legal name spells the backronym out.
- **Tagline (do not paraphrase)**: *"Every claim, sourced. Every risk, named. In days, not weeks."*
- **Elevator pitch (do not paraphrase)**: *"Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Zero hallucinations. Audit trail included."*
- **Engine credit disambiguation**: "Powered by OpenClaw" refers to the open-source agent framework. The retired `openclaw.ai` consumer product is unrelated and MUST be disambiguated where confusion is possible.
- **Retired product names** MUST NOT appear on any customer-facing surface: "OpenClaw Research Intelligence", "OpenClaw Pipeline", and the retired tier names ("Standard", "Premium", "Custom", "Enterprise") from the pre-2026-04-27 product line.
- **Source-of-truth discipline**: brand/landing copy edits happen at `trevor-robey-inc-agents/workspace/collateral/`, then are copied back into `01-brand-system/` here. Files in this folder are **copies**, not the originals — do not break the source pointers.
- **The four ICPs** (per spec.md FR-007) MUST be reflected in outbound templates and pricing positioning:
  1. Pharma & Biotech R&D — Head of CI, VP BD/Licensing, SVP R&D Strategy, CMO
  2. Biotech Equity Investors — Hedge fund PM, Biotech VC Partner, Family Office Research Director
  3. Academic & Clinical Researchers — PI, Dept Admin, Research Networks
  4. Patient Advocacy Groups — ED, Scientific Director

## Phase Status (reverse-engineered)

- **LLC filed** 2026-05-06 at bizfileOnline (receipt B20260217250). CA SOS approval pending per memory snapshot dated 2026-05-13 (2–3 business day target; verify current status — see Open Questions).
- **Wordmark + LLC disclosure pairing** baked into customer-facing copy. Brand-guardian skill enforces canon.
- **Six-SKU offering ladder** finalized 2026-04-30 (rename of playbook file from "OpenClaw Commercial Launch Playbook.md" to "trevor-robey-inc Commercial Launch Playbook.md").
- **Product rebrand** OpenClaw → trevor-robey-inc-agents merged 2026-04-27 (memory `project_openclaw_rebrand.md`). Stale product names ("OpenClaw Research Intelligence", "OpenClaw Pipeline") are now flagged by brand-guardian.
- **AWS Marketplace** listing staged for Week 3 (May 11–15). Free Pharmacovigilance Sample Pack ready; awaiting Provider Qualification + seller profile + LLC SOS approvals.
- **Brand-guardian skill** live at `~/.claude/skills/trevor-robey-inc-brand-guardian/`.
- **Workflow templates feed offerings** — the citation-traced biomedical due diligence engine in `trevor-robey-inc-agents/` produces the Investor Pre-Mortem, Failed Trial Archaeology, Conference Synthesis Brief, Trial Design Benchmark Pack, Cross-Silo Connector Report, Plain-Language Patient Brief, and Pharmacovigilance Pack outputs that map to the six-SKU ladder.
- **Already-populated artifacts** (per README "What's already filled in"): brand-system source-of-truth, landing-page HTML (inline SVG TR monogram), pharmacovigilance teaser + sample deliverable, target-validation one-pager + matrix, enterprise-deep-dive data teaser, Datarade vendor application, platform-specific setup guides, cold-email templates for four personas, LinkedIn opener templates, prospect-targeting guide.
- **Highest-leverage near-term actions** per README §"Highest-leverage actions in the next seven days":
  - Tue Apr 28 — Submit Datarade vendor application
  - Fri May 1 — Push HuggingFace gated dataset live + bind E&O+Cyber policy
  - In parallel — file AWS Data Exchange qualification
  - Engage contracts attorney for fixed-fee MSA + SOW + DPA, target Wed May 13
  - Pharmacovigilance copy refresh — replace "FAERS quarterly" with "AEMS daily, real-time since Aug 2025; FAERS-to-AEMS migration completed Mar 11, 2026"
  - Remove every DrugBank field from public sample/marketing collateral

## Open Questions / NEEDS CLARIFICATION

- **[NEEDS CLARIFICATION]** CA SOS LLC approval current status — filed 2026-05-06 with a 2–3 business day target (i.e., expected by ~2026-05-11). README and spec both record "pending" as of the snapshot. Verify current state in bizfileOnline before relying on the LLC name in any signed contract or marketplace listing.
- **[NEEDS CLARIFICATION]** SKU naming drift between `README.md` folder map and `OFFERINGS.md` / spec 004. The README's `02-product-packs/` folder description says "Six pack templates (Pharmacovigilance, Drug Discovery, Target Validation, Market Overview, Full Market, Enterprise Deep Dive, Custom)" — that is a different SKU set than the canonical six-SKU offering ladder in `OFFERINGS.md` (Investor Pre-Mortem, Failed Trial Archaeology, Conference Synthesis Brief, Trial Design Benchmark Pack, Cross-Silo Connector Report, Plain-Language Patient Brief, with Pharmacovigilance demoted). The README appears to predate the 2026-04-30 ladder finalization. Refresh README or confirm which set is canonical.
- **[NEEDS CLARIFICATION]** Customer intake flow (intake form → SOW → dispatch) — referenced in spec 001 plan and again here. Not documented in this repo. Confirm whether it lives in a CRM, a separate doc, or needs a spec of its own.
- **[NEEDS CLARIFICATION]** Brand-guardian skill discoverability across all Claude Code/Desktop sessions — assumed at `~/.claude/skills/trevor-robey-inc-brand-guardian/` and listed as available in this session, but the skill is global-user-scope and may not surface in every project context. Verify in non-`TrevClaw-Obsidianodus` working directories.

## Verification

This is a commercial / paperwork surface, not a code surface. The verification is editorial and operational, not executable:

1. `ls -la /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/` returns all 15 numbered folders plus the three root files (`README.md`, `OFFERINGS.md`, `trevor-robey-inc Commercial Launch Playbook.md`).
2. `grep -r "Trevor Robey, INC\." /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/01-brand-system/landing-page/index.html` returns the wordmark with the LLC disclosure pairing.
3. `grep -rn "OpenClaw Research Intelligence\|OpenClaw Pipeline" /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/` returns ZERO hits (stale product names purged per the 2026-04-27 rebrand).
4. `grep -rn "FAERS quarterly" /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/02-product-packs/pharmacovigilance/` returns ZERO hits (post-pharmacovigilance copy refresh).
5. `grep -rn "DrugBank" /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc/02-product-packs/*/samples/` returns ZERO hits in public sample/marketing collateral (DrugBank STOP-SHIP per `09-source-licenses/`).
6. CA SOS approval verified directly in bizfileOnline (out-of-band, not a `grep`-able check).
7. `trevor-robey-inc-brand-guardian` skill loads when invoked from any project context — sanity check via `Skill claude-skill-discovery` or by direct invocation.
