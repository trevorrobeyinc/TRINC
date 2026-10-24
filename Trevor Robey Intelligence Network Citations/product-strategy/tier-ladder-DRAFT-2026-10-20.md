# Tier ladder — DRAFT for operator approval (2026-10-20)

Operator request, 2026-10-20: *"set all of those as choices of tiers for a buyer in the
biomedical industry and i want more choices of tiers added for a section that's custom so if that
way if any buyer needs any research done in any field, my research engine will help them with any
kind of report etc that they'll need for cost cutting, or whatever their reason for needing a
report may be."*

The three data prices are the operator's choice. **The custom-section prices are Claude's
proposals** and need the operator's yes before anything here moves into `OFFERINGS.md`.

---

## Section A — Biomedical data subscriptions (AWS Data Exchange)

Product: Trial Graveyard Feed (stopped trials with the sponsor's stated stop reason, NCT-traced,
monthly revisions). Each tier is its own ADX product with one public offer, so the tiers can differ
in content and none depends on how many public offers AWS allows per product.

| Tier | Price | What the subscriber gets |
|---|---|---|
| **Free Sample** | $0 | 5-row sample of every covered area + data dictionary. Subscription verification on |
| **Essentials** | **$99 / month** | 6 areas: glioblastoma, pancreatic cancer, Alzheimer disease, ALS, sickle cell disease, idiopathic pulmonary fibrosis |
| **Professional** | **$249 / month** | All 12 areas (the 6 above + non-small cell lung cancer, breast cancer, prostate cancer, Parkinson disease, multiple sclerosis, NASH) |
| **Enterprise** | **$499 / month** | All 12 areas + one additional area of the subscriber's choice added each quarter + Parquet files (Parquet step still to be built) |

Each offer can also carry 12-month pricing (AWS allows up to 5 durations per public offer). The
annual discount is `[DECIDE]`.

## Section B — Custom research reports (any field)

> **Update 2026-10-23: APPROVED by the operator, gated.** The five tiers below moved into `OFFERINGS.md`
> → "Business research (any field)" exactly as listed, marked "booking after the first live business-lane run",
> with the guarantee scope for business identifiers stated there. `OFFERINGS.md` is now canonical; this
> section is the record of the proposal. Section A (the feed prices) is **not** affected and stays on hold.
>
> **Status, checked 2026-10-21 (live files, not notes): ON HOLD by the operator's call.**
> The "second research engine" is a **module inside the same engine**, by design, not a separate
> engine (`docs/business-research-lane.md` §"Why a module, not a second engine"): commit `6ca9d78`
> (2026-10-21) added the `research_profile: "business"` lane, three templates
> (`business-research-pack`, `cost-reduction-analysis`, `market-landscape`) and new citable
> identifiers (`WEB:` page snapshots, `SEC:` EDGAR filings, `WB:` World Bank indicators, OpenAlex
> DOIs). Its offline tests pass (`tests/core/business-research-lane.test.js`, 23/23 on
> 2026-10-21). **It has never run live**: none of the 14 runs under `workspace/workflows/` uses a
> business template. So prerequisite 4 below is still open, and nothing in this section can be
> sold until one real run passes.

Sold direct (Stripe invoice) and as AWS **private offers** for buyers who want to pay through their
AWS bill. ADX public listings carry data, not services, so these do not go on the public feed
products.

| Tier | Proposed price | Scope | Turnaround |
|---|---|---|---|
| **Quick Brief** | $1,500 | One question, short answer memo with every source listed | 3 business days |
| **Standard Report** | $4,950 | One agreed question at fixed depth, full report + source ledger (this is the existing *Scoped Research Pack*, widened to any field) | 5 business days |
| **Deep-Dive Report** | $9,950 | Up to three related questions: options compared, cost-avoidance or cost-cutting analysis, risks named | 10 business days |
| **Research Retainer** | $7,500 / month | Ongoing research desk: up to two Standard-depth reports a month, plus quick questions | monthly |
| **Enterprise Program** | custom quote | Multi-month programs, private data rooms, or reports built on the client's own data | scoped in writing |

Common to every custom tier: the question and depth are agreed in writing before the run; if the
evidence doesn't exist, the report says so and shows what was searched.

### What has to be true before Section B is sold outside biomedicine

1. **The guarantee has to be scoped.** The citation gate verifies PMID, NCT, PubChem, UniProt,
   ChEMBL, DrugBank and DOI identifiers. DOIs cover most academic fields, so peer-reviewed sources in
   any field can be checked. Web pages, company documents and most business sources carry none of
   these, so a cost-cutting report built on them sits outside the Zero-Fabrication Guarantee and the
   refund-backed SLA, and must say so on its face (`OFFERINGS.md` already states this rule).
2. **Brand copy changes.** Every canon file sells "citation-traced *biomedical* due diligence", and
   `REVENUE_PLAYBOOK.md:154` "any topic" is currently logged as drift. Opening Section B means
   writing the biomedical lane as the flagship and the custom section as "also available".
3. **Advice boundaries.** Reports stay research, never legal, medical, tax or investment advice.
4. **Fulfillment check.** The engine's workflow templates are biomedical. A non-biomedical Standard
   Report needs one test run through the engine before the first sale.
