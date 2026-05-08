# trevor-robey-inc

Business workspace for **Trevor Robey, INC.** — citation-traced biomedical due diligence at **trevorobeyinc.com**. Powered by OpenClaw (open-source agent framework).

> *Trevor Robey, INC. is the wordmark of **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company (filed 2026-05-06; receipt B20260217250). INC = Intelligence Network Citations. See [`00-business-formation/llc/certificate-of-formation.md`](./00-business-formation/llc/certificate-of-formation.md).*

This directory is the canonical home for everything the [`trevor-robey-inc Commercial Launch Playbook.md`](./trevor-robey-inc%20Commercial%20Launch%20Playbook.md) prescribes. Every folder below corresponds to a specific section of that playbook. Files are placeholders unless noted; fill them in as you work the 30-day plan.

> **Status:** Real directory inside the `TrevClaw-Obsidianodus` monorepo (not a symlink, unlike `Claude/`, `Copilot-Everything/`, `trevor-robey-inc-agents/`).

---

## Folder map → playbook section

| Folder | Playbook reference | Purpose |
|---|---|---|
| [`trevor-robey-inc Commercial Launch Playbook.md`](./trevor-robey-inc%20Commercial%20Launch%20Playbook.md) | (root file) | The 30-day source of truth. Moved here from `~/Downloads`. Renamed from "OpenClaw Commercial Launch Playbook.md" on 2026-04-30. |
| `00-business-formation/` | §5 items 7–10 | LLC, banking, insurance, tax, compliance (OFAC, HIPAA, GDPR, conflicts log). |
| `01-brand-system/` | (Trevor Robey, INC. brand wordmark) | TR monogram logo, IBM Plex typography, color tokens, landing-page HTML, marketplace listing visuals. |
| `02-product-packs/` | §3 + §7.4 + §4 Week 2 / Week 4 | Six pack templates (Pharmacovigilance, Drug Discovery, Target Validation, Market Overview, Full Market, Enterprise Deep Dive, Custom). |
| `03-platforms/` | §2 + §7.7 | Datarade, AWS Data Exchange, HuggingFace gated dataset, Kaggle SEO breadcrumb, rejected channels (Outlier/Mindrift), tier-1 aggregators, tier-2 cloud-native, tier-3 creator-centric, tier-4 Web3. |
| `04-pricing-benchmarks/` | §3 | trevor-robey-inc pricing ladder ($9,950 / $14,950 / $19,950 anchors + tactical SKUs) + five competitor benchmarks (GlobalData, DealForma, Citeline, Cortellis, Definitive Healthcare). |
| `05-launch-plan/` | §4 | Week-by-week, day-by-day execution plan from Mon Apr 27 to Fri May 22, plus contractor budget. |
| `06-target-accounts/` | §1 | 12 named accounts across 4 personas + 3 wildcards, each with verified 2025–2026 buying signal. |
| `07-outbound/` | §1 + §4 Week 2 | Cold-email templates by persona, LinkedIn openers, 9-touch sequence cadence, SDR contractor brief. |
| `08-contracts-legal/` | §5 items 3–9 | Common Paper MSA / SOW / NDA / DPA, IP license structure, LoL, indemnification, refund policy, payment terms, vendor security questionnaires (SIG-Lite, CAIQ-Lite). |
| `09-source-licenses/` | §5 item 1 + §6 item 2 | Per-source license register (FAERS/AEMS, ChEMBL share-alike, ClinicalTrials.gov, PubMed, PubChem, UniProt, **DrugBank STOP-SHIP**). |
| `10-quality-pipeline/` | §6 (the 5 YES/NO items) | Citation reproducibility validator (Python ≤200 lines), Microsoft Presidio PHI/PII screen, Ragas LLM-as-judge, freshness windows YAML, pre-publication checklist. |
| `11-financial-ops/` | §5 item 5 | Stripe Invoicing (ACH primary, card fallback), Bonsai bundle, pricing tiers, P&L, invoices archive. |
| `12-pipeline-tracking/` | §4 Week 4 KPIs | Discovery calls log, NDA pipeline, signed deals, end-of-month KPIs. |
| `13-supplementary-research/` | §7 | Monetization architecture, buyer cohorts, vendor landscape, tiered report architecture, CPL benchmarks, publisher economics, 4-tier distribution taxonomy, RFP/government, community-led growth. |
| `14-due-diligence-checklist/` | §6 | The five YES/NO items required before any pack ships. |
| `15-first-sale-risk-mitigation/` | §5 | The 10-item checklist to run if a $50K custom inquiry arrives in Week 2. |

---

## What's already filled in vs. placeholder

**Already populated (copied from existing collateral):**
- `01-brand-system/brand-system.md` — full brand-system source-of-truth
- `01-brand-system/landing-page/index.html` — production HTML for trevorobeyinc.com (inline SVG TR monogram lives here; this is the canonical "graphic file")
- `01-brand-system/landing-page/assets/openclaw-pharmacovigilance-teaser.html` — rendered teaser HTML (open in Safari → Cmd+P → Save as PDF)
- `02-product-packs/product-catalog.md`
- `02-product-packs/pharmacovigilance/samples/*.md` — 2-page teaser + sample deliverable
- `02-product-packs/pharmacovigilance/pharmacovigilance-report-onepager.md`
- `02-product-packs/target-validation/target-validation-onepager.md` + `target-validation-matrix.md`
- `02-product-packs/enterprise-deep-dive/enterprise-data-teaser.md`
- `03-platforms/datarade/vendor-application.md` — paste-ready Datarade application (Tue Apr 28 submission)
- `03-platforms/{datarade,aws-data-exchange,huggingface,kaggle-seo-breadcrumb}/*setup*.md` — platform-specific setup guides
- `07-outbound/cold-email-templates/email-{ci-director,quant-analyst,target-discovery,academic-researcher}.md`
- `07-outbound/linkedin-openers/linkedin-connection-templates.md`
- `07-outbound/prospect-targeting-guide.md`

**Everything else is a placeholder** — a one-line stub naming the deliverable and pointing back to the playbook section it belongs to. Fill them in as the 30-day plan progresses.

---

## Note on "graphic files"

The TR monogram and all marketing visuals were built as **inline SVG inside HTML**, not as standalone `.svg`/`.png` files on disk. The canonical pixels ship from `01-brand-system/landing-page/index.html`. If you need raster exports for marketplace listings (Datarade thumbnail, AWS DX product logo, HF banner), generate them from that source — the placeholder folders under `01-brand-system/marketplace-listing-visuals/` mark where each export should land.

The Figma file (`cAlmeot0lXqqcIDecpQjdO`, trevorobeyinc-team education-Pro) holds 5 logo variants and the 7-token color collection — kept as visual reference only, not as production source.

---

## Source-of-truth pointers (do not break these)

These paths are referenced by other systems in the monorepo. Files were **copied** into this folder, not moved, so the originals remain authoritative:

| Original (do not move) | Used by |
|---|---|
| `/Users/trevorrobey/openclaw-landing-deploy/index.html` | Cloudflare Worker `shy-grass-fccd` deploys trevorobeyinc.com from here. (External to monorepo — not consolidated.) |
| `/Users/trevorrobey/openclaw-landing-deploy/assets/openclaw-pharmacovigilance-teaser.html` | Same Cloudflare deploy. |
| `trevor-robey-inc-agents/workspace/collateral/` (this monorepo) | Command Center plugin (powered by OpenClaw) reads from here. Path migrated from `/Users/trevorrobey/Code/trevor-robey-inc-agents/workspace/collateral/` during the 2026-05-07 monorepo consolidation. |

Edits to brand/landing copy should happen at `trevor-robey-inc-agents/workspace/collateral/` (now relative to this monorepo root); copy back into `01-brand-system/` here to keep the canonical brand kit in this folder current.

---

## Highest-leverage actions in the next seven days

Per the playbook's bottom-line:

1. **Tue Apr 28** — Submit Datarade vendor application (`03-platforms/datarade/vendor-application.md`).
2. **Fri May 1** — Push HuggingFace gated dataset live (`03-platforms/huggingface/`) + bind E&O+Cyber policy (`00-business-formation/insurance/`).
3. In parallel — file AWS Data Exchange qualification (`03-platforms/aws-data-exchange/seller-registration.md`).
4. Engage contracts attorney for fixed-fee MSA + SOW + DPA pair, target turnaround Wed May 13.
5. Update pharmacovigilance copy: replace every "FAERS quarterly" with **"AEMS daily, real-time since Aug 2025; FAERS-to-AEMS migration completed Mar 11, 2026."**
6. Remove every DrugBank field from public sample/marketing collateral.
