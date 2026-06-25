# AWS Data Exchange — Offer Structure (private-offer tiers)

> **Provider:** Trevor Robey Intelligence Network Citations LLC, a California limited liability company (CA SOS Entity No. **B20260217250**, filed 2026-05-06), operating under the wordmark **"Trevor Robey, INC."** (INC = Intelligence Network Citations).
> **AWS account:** `833390816446` · **Categories:** Healthcare, Life Sciences, Financial Services · **Contact:** trevor@trevorobeyinc.com · https://trevorobeyinc.com
> **Channel (decided):** AWS Data Exchange — ONE Files-type data set bundling report PDFs + structured CSV/Parquet, published as a **free public sample** plus **paid offers**.
> **Status of this file:** fills the placeholder at `03-platforms/aws-data-exchange/private-offer-tiers.md` (which previously held only the H1 `# AWS — private offer tiers (3% public, 2% $1M-$10M, 1.5% >$10M)` and `_Placeholder. To be filled in._`).
>
> **Number discipline:** every price, tier, and discount percentage below is taken verbatim from the repo (REVENUE_PLAYBOOK.md, listing-copy.md, and this file's own H1). AWS offer mechanics are from official AWS Data Exchange documentation. Anything the repo does not state is flagged **[decide]**. All contract/credit language is marked **DRAFT — for counsel review**.

---

## 1. Offer architecture at a glance

The product is published as a single AWS Data Exchange **Files-type data set** (report PDFs + structured CSV/Parquet). It is sold through **two layers**:

| Layer | Visibility | Pricing model | Audience | Purpose |
|---|---|---|---|---|
| **A. Public free sample** | Public | Free | All AWS accounts | Top-of-funnel; demonstrates the citation-discipline moat. This is the live **Pharmacovigilance Signal Synthesis — Free Citation-Traced Sample Pack** (10 ICI-class adverse-event signals, 29 verified-identifier rows). |
| **B. Public paid offer** | Public | Paid subscription (USD, per-duration, pay-upfront) | All AWS accounts (self-serve) | The standing list-price offer that every public buyer sees. **A public offer is an AWS prerequisite before any private offer can exist for a publicly-visible product.** |
| **C. Private offers (tiered)** | Private | Negotiated, keyed to deal size | Named AWS account IDs | Custom terms for specific buyers; the **3% / 2% / 1.5%** discount ladder applies here. |

AWS rule that drives this ordering: for a publicly-visible product you **must create the public offer first**; only then can you attach private offers to specific AWS account IDs. (AWS DX docs, *Preparing offers* / *Private offer configuration*.)

---

## 2. Layer A — Public free sample

| Field | Value | Source |
|---|---|---|
| Product type | Files data set (CSV today; report PDFs + CSV/Parquet at the data-set level for the full channel) | listing-copy.md / channel decision |
| Pricing model | **Free** | listing-copy.md, metadata-table.md |
| Visibility | Public | listing-copy.md |
| Title | "Pharmacovigilance Signal Synthesis - Free Citation-Traced Sample Pack" (67 chars) | listing-copy.md |
| What it contains | 10 ICI-class adverse-event signals; 29 verified-identifier rows (PMID/NCT/ChEMBL/RxNorm/PubChem/UniProt/DOI) | listing-copy.md, REVENUE_PLAYBOOK §0c |
| SLA | **None** — "free sample carries no SLA" (the refund-backed citation-audit SLA attaches only to paid deliverables) | listing-copy.md |

**Meaning:** the free sample is a marketing artifact. It validates the seller profile and lets a prospect inspect citation quality before buying. It is not refundable and carries no service commitment because it has no price.

---

## 3. Layer B — Public paid offer (price / duration / auto-renew)

This is the standing, self-serve list-price offer for the paid product. AWS requires you to choose a **price per duration in USD** (durations 1–36 months; up to 5 durations per public offer; pay-upfront), set whether **auto-renewal** is available **at creation** (it cannot be changed later), and specify a refund policy.

### 3a. SKU intent and price anchors (repo-stated)

The repo's canonical pricing is the **2026-04-30 ladder** (REVENUE_PLAYBOOK §0, §2, §10). These are the dollar figures to seed the AWS offer dimensions with — **use these exact numbers; do not invent others.**

| SKU (repo) | Repo price (verbatim) | Role | Source |
|---|---|---|---|
| **Investor Pre-Mortem (PRIMARY)** | **$9,950** anchor / **$14,950** standard / **$19,950** custom (with KOL primary) | Per-asset risk dossier (trial design + comparable failures + KOL sentiment + IP runway); 5–10 business days; refund-backed citation-audit SLA | REVENUE_PLAYBOOK §0, §2 |
| **Failed Trial Archaeology (FLANKING)** | **$14,950** | Structured post-mortem of Phase 2/3 terminations in a single mechanism; NCT-indexed failure-pattern matrix | REVENUE_PLAYBOOK §0, §2 |
| Conference Synthesis Brief | **$4,950 / conference** | 500+ ASCO/ESMO/AACR abstracts; 24–48 hr | REVENUE_PLAYBOOK §2 |
| Trial Design Benchmark Pack | **$4,950** | Comparative Phase 3 structure vs 10–20 comparable programs | REVENUE_PLAYBOOK §2 |
| Cross-Silo Connector Report | **$9,950 – $24,950** | Hidden mechanistic links across ChEMBL/PubMed/CT.gov | REVENUE_PLAYBOOK §2 |
| Plain-Language Patient Brief | **$2,500** | EU CTR 536/2014 PLS at 8th-grade literacy | REVENUE_PLAYBOOK §2 |
| Pharmacovigilance Pack (tactical) | **$2,500 – $4,950** | Existing marketplace tier, demoted from primary lead; listings preserved | REVENUE_PLAYBOOK §2 |

> **Retired ladder (do NOT use as the public structure):** the old Standard / Premium / Custom / Enterprise-ARR ladder — $2,500 / $4,950–$14,950 / $15K–$35K / $60K–$120K+ — is "no longer the public offering structure" (REVENUE_PLAYBOOK §2). Custom-tier and enterprise-subscription engagements remain available for large-pharma / CRO buyers via **private offer / direct contract**, not as a public ladder tier. (The free sample's own long description still references "Custom Intelligence Mission ($15,000–$35,000)" and "Enterprise Intelligence Subscription ($60,000–$120,000+ ARR)" — those are the superseded labels and should be reconciled to the 2026-04-30 ladder before go-live. **[decide]**)

### 3b. Mapping the SKUs onto an AWS public subscription offer

AWS DX public offers are **subscriptions priced per duration in USD, paid upfront**. The repo's SKUs are mostly **single-deliverable** engagements, so a decision is required on how each maps to a subscription duration:

| AWS offer parameter | Recommended value | Basis / flag |
|---|---|---|
| Offer currency | **USD** (AWS supports USD only) | AWS DX docs |
| Lead public list price | **$9,950** (Investor Pre-Mortem anchor) | REVENUE_PLAYBOOK §7 "First listing recommendation": "Lead listing: Investor Pre-Mortem (Primary) — $9,950 anchor." |
| Subscription duration(s) | **[decide]** — repo does not state a subscription term for any SKU. AWS allows 1–36 months and up to 5 durations per public offer. The SKUs read as one-time deliverables, not recurring terms. | AWS DX docs; repo silent |
| Auto-renewal | **[decide]** — repo does not state an auto-renew choice. AWS locks this at offer creation (immutable afterward). For one-time dossiers, auto-renew is likely **off**; for the demoted Pharmacovigilance / clinical-insights subscription motion it may be **on**. | AWS DX docs; repo silent |
| Number of public price points | **[decide]** — the Investor Pre-Mortem alone has three repo price anchors ($9,950 / $14,950 / $19,950). AWS lets a single public offer carry up to 5 durations, but multiple *price tiers* at the same duration are typically modeled as separate dimensions or as private offers. | AWS DX docs; repo silent on AWS modeling |
| US sales/use tax | Enable via tax-nexus settings + product tax codes in the AWS Marketplace Tax Calculation Service | AWS DX docs |
| Subscription verification | **Required / auto-enabled** for all public offers since 2025-04-08 (DOJ Final Rule — Country of Concern / Covered Person screen). Must be acknowledged in the wizard. | AWS DX docs |

> **Decision needed before publishing Layer B:** because the repo prices the deliverables as **fixed-fee, single-engagement** products while AWS DX public offers are **time-bound subscriptions**, you must decide the term-to-deliverable mapping (e.g., "1-month subscription = one dossier delivery" vs. a recurring feed). The repo does not state this. **[decide]**

---

## 4. Layer C — Private-offer tier discounts (the 3% / 2% / 1.5% ladder)

The repo states the private-offer ladder verbatim in the filename / H1 of this file:

> **3% public, 2% $1M-$10M, 1.5% >$10M**

These are **graduated discount percentages keyed to deal-size brackets**. They are applied to **private offers** — custom offers created for one or more named AWS account IDs, which AWS allows to differ from the public offer in **any** dimension (price, duration, payment schedule, DSA, refund policy). No body text elaborating these percentages exists anywhere else in the repo; the interpretation below is presented explicitly so it can be confirmed.

### 4a. The tier table (repo numbers)

| Tier | Deal-size bracket (repo) | Discount (repo) | What it means |
|---|---|---|---|
| **Tier 1 — Public / baseline** | "public" (i.e., the standard public-offer price, no large-deal commitment) | **3%** | The baseline discount level. See interpretation note below — "3% public" most plausibly reads as the discount **already baked into the public list price** (or the floor private-offer discount), against which the larger brackets step **down**. |
| **Tier 2 — Mid (\$1M–\$10M)** | Deal value **\$1,000,000 – \$10,000,000** | **2%** | A private-offer discount of 2% for committed spend in the \$1M–\$10M band. |
| **Tier 3 — Large (>\$10M)** | Deal value **greater than \$10,000,000** | **1.5%** | A private-offer discount of 1.5% for committed spend above \$10M. |

### 4b. How to read "discount goes DOWN as deal size goes UP"

The percentages **decrease** as the bracket grows (3% → 2% → 1.5%). This is the opposite of a volume *discount* and is consistent with these percentages being a **fee/take-rate or rebate that shrinks on larger deals**, OR a **list-price reduction that is largest at the public tier and tapers on big bespoke contracts** (where absolute dollars are already large). The repo does **not** state which of these it is:

- Whether 3%/2%/1.5% are **seller-granted discounts off list**, **list-price reductions**, a **commission / take-rate**, or a **rebate** — **[decide]** (the gathered research confirms "no further detail … is documented anywhere").
- Whether the bracket is measured by **single-offer contract value**, **annualized spend**, or **cumulative account spend** — **[decide]**.
- The exact **boundary handling at \$1,000,000 and \$10,000,000** (inclusive/exclusive; the H1 writes "$1M-$10M" and ">$10M", implying the >$10M tier starts strictly above $10M) — confirm. **[decide]**

> **Recommended interpretation to confirm (NOT repo-stated):** treat the ladder as *the maximum discount we will grant on a private offer, by committed deal size* — up to 3% on ordinary deals, capped at 2% once committed value reaches \$1M, and capped at 1.5% once it exceeds \$10M (discipline that protects margin on the largest contracts). Flagged **[decide]** because the repo does not define direction or base.

### 4c. AWS mechanics for delivering these tiers

A private offer is the AWS vehicle for every tier above Layer B. Per AWS DX docs, each private offer:

- Is created **only after** the public offer exists (publicly-visible product prerequisite).
- Targets **specific AWS account IDs** (the buyer's account; for consolidated billing, include the **payer** account ID — the payer must accept terms first, then linked accounts can accept).
- May differ from the public offer in **price, duration, payment schedule, DSA, and refund policy**.
- Carries an **expiration date** (offers expire at **23:59:59 UTC** on the set date).
- Can bundle **up to 5 legal documents** (e.g., legal terms, SOW, pricing sheet, addenda) combined into one.
- **Cannot be auto-renewing if it uses a flexible (installment) payment schedule** — a flexible-payment private offer and auto-renew are mutually exclusive.
- Is delivered to the buyer via **Actions → Copy offer URL**, emailed to the buyer's contact.

**Operational note:** the discounted price for each tier should be computed off the relevant Layer-B list price (e.g., Investor Pre-Mortem $9,950 / $14,950 / $19,950) using the tier percentage, then entered as the private-offer price dimension. The exact arithmetic base depends on the §4b **[decide]** items.

---

## 5. Refund policy (placeholder companion — summary)

The companion file `refund-policy.md` is also a placeholder; its stated intent (from its H1) is a **"refund policy mirroring Common Paper Service Credits."** This connects to the repo's recurring **"refund-backed citation-audit SLA"** on paid deliverables (REVENUE_PLAYBOOK §0). Captured here only for offer-structure completeness; the full schedule belongs in `refund-policy.md`:

- **Intent (repo):** model the refund structure on Common Paper's "Service Credits" standard. **[decide]** — no credit schedule, percentages, or trigger conditions are written in the repo.
- **Free sample (Layer A):** no SLA, no refund (no price). (listing-copy.md)
- **Paid offers (Layer B/C):** refund-backed citation-audit SLA applies. (REVENUE_PLAYBOOK §0, §2)
- **AWS mechanic:** the provider sets the policy (AWS does not require one) but must state it in the offer; AWS only processes **provider-authorized** refunds via a refund-approval form, visible in the monthly billed-revenue report. Refund policy is a required step in both the public and private offer wizards.

---

## 6. Data Subscription Agreement (DSA) — pointer

The legal terms a buyer accepts before purchase are set in the DSA (companion placeholder `data-subscription-agreement.md`; a complete DRAFT DSA already exists for the free sample at `workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/data-subscription-agreement.md`). For the paid/private layers:

- AWS provides a **StandardDsa** template you can edit, or you can upload a **CustomDsa** (URL to a DSA in an accessible S3 bucket). The DSA covers use, warranty, indemnification, and governing law and defines pre-purchase terms.
- Private offers may attach a **different DSA** than the public offer.
- **DRAFT — for counsel review:** governing law should be **California** (matching the LLC and the existing sample DSA), the research-use-only / no-PHI / AS-IS posture should carry over, and the liability cap must be revised upward from the free sample's "$0" to reflect paid pricing. **[decide]** on the paid-tier liability cap figure (repo does not state one).

---

## 7. Open decisions captured in this file (roll-up)

1. **Subscription term mapping** — repo prices SKUs as fixed-fee single deliverables; AWS public offers are time-bound subscriptions. Decide the term-to-deliverable mapping and auto-renew on/off. **[decide]**
2. **Public price-point modeling** — how the three Investor Pre-Mortem anchors ($9,950 / $14,950 / $19,950) map to AWS offer dimensions vs. private offers. **[decide]**
3. **Private-tier semantics** — whether 3%/2%/1.5% are discounts-off-list / list-price reductions / take-rate / rebate; the discount **base**; the deal-size **measure** (per-offer vs. annualized vs. cumulative); and bracket-boundary handling. **[decide]**
4. **Reconcile stale labels** — the free sample's long description cites the superseded "$15,000–$35,000" and "$60,000–$120,000+ ARR" tiers; align to the 2026-04-30 ladder before go-live. **[decide]**
5. **Refund credit schedule** — define the Common Paper Service-Credits mirror (triggers, credit %, caps) in `refund-policy.md`. **[decide]**
6. **Paid-tier DSA liability cap** — set a figure above the free sample's $0. **[decide]** · **DRAFT — for counsel review.**

---

*Sources: repo files `REVENUE_PLAYBOOK.md` (2026-04-30 ladder; §0, §2, §7, §10), `03-platforms/aws-data-exchange/{private-offer-tiers.md, refund-policy.md, product-creation.md, public-seller-profile.md}`, `workspace/aws-marketplace-listing/pharmacovigilance-sample-pack/{listing-copy.md, metadata-table.md, data-subscription-agreement.md}`. AWS offer mechanics: official AWS Data Exchange documentation (Preparing offers, Private offer configuration, Provider financials, Subscription verification, Publishing). All dollar figures and discount percentages are repo-verbatim; AWS modeling choices and undefined semantics are flagged [decide]; contract language is DRAFT for counsel review.*
