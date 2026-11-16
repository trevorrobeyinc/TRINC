# Brand Identity — what Trevor Robey, INC. actually is

> **Dating note.** This work landed **2026-07-30**. The `-2026-07-29` in the filename is a
> dating error made when the file was created; it is retained because other surfaces already
> reference this path by name. Every date *inside* this document is correct.


**Written:** 2026-07-30 · **Method:** read from this business's own files, nothing recalled.
**Why it exists:** the operator said, plainly, that he does not know what the brand identity is.
That turned out to be a *structural* problem, not a personal one — see §5.

Companion files: [`brand-system.md`](./brand-system.md) (visual/verbal kit) ·
[`personal-brand.md`](./personal-brand.md) (founder voice, distinct from company voice) ·
[`../OFFERINGS.md`](../OFFERINGS.md) (the ladder) · [`../REVENUE_PLAYBOOK.md`](../REVENUE_PLAYBOOK.md).

---

## 1. The answer, in one sentence

> **Trevor Robey, INC. sells citation-traced biomedical due diligence to people making
> high-stakes bets on someone else's science — biotech investors and pharma business
> development — and its entire differentiator is that a claim without a verifiable
> identifier fails a gate rather than passing with a warning.**

That is not aspiration. Every clause is enforced somewhere in the codebase or priced in the
ladder. The identity is far more specific and far more built than the operator described it.

---

## 2. What the canon actually says

Read across seven canon files, the positioning is remarkably consistent. The doubt is not
coming from contradiction in *what* the business is.

| Element | The statement | Source |
|---|---|---|
| Tagline | *Every citation, checked. Every risk, named. In days, not weeks.* (operator decision 2026-11-15; where it stops: `SYSTEM-REALITY.md:15`) | `OFFERINGS.md:3` |
| Elevator | *Citation-traced biomedical due diligence for biotech investors and pharma BD. Five days. Every cited paper and trial checked twice, against the evidence retrieved and at its registry, with retractions screened and anything unconfirmed flagged. Audit trail included.* (2026-11-15) | `OFFERINGS.md:5` |
| Buyer | **Five** segments as of 2026-07-30: **Biotech Equity Investors** (hedge fund PM, biotech VC partner, family office) · **Pharma & Biotech R&D** (head of CI, VP BD/licensing, CMO) · **Academic & Clinical Researchers** · **Patient Advocacy Groups** · **Medical Startup Founders** *(added by operator decision — see [`founder-lane-2026-07-29.md`](./founder-lane-2026-07-29.md))* | `OFFERINGS.md`, `TREVOR_ROBEY_INC_AGENTS_DOSSIER.md` — both ICP tables |
| Product | 7 SKUs, **$2,500 – $24,950**; anchor is Investor Pre-Mortem at $9,950 / $14,950 / $19,950 | `OFFERINGS.md:13-19`, `REVENUE_PLAYBOOK.md:66-68` |
| Promise | Zero-Fabrication Guarantee · refund-backed Citation-Audit SLA · 5–10 business-day speed SLA | `OFFERINGS.md:32-35` |
| Moat | *"Citation traceability is enforced as a gate, not a warning"* — outputs lacking a verifiable PMID/NCT/CID/DOI **fail**, they do not pass flagged | `REVENUE_PLAYBOOK.md:70`, `DOSSIER:68` |
| Voice | *Technical · citation-dense · zero marketing hyperbole. Lead with verifiability, not AI.* | `01-brand-system/brand-system.md:11` |
| Refusals | Not clinical decision support · not a publishing bot · not a PHI processor | `README.md:19-23`, `NOTICE.md:98-112` |
| Entity | Trevor Robey Intelligence Network Citations LLC (CA **B20260217250**); "INC" is a backronym — Intelligence Network Citations — never a corporate suffix | `NOTICE.md:13-21` |

**Drift found — two items, both real:**

1. **`trevor-robey-inc Commercial Launch Playbook.md:7` still says "Zero hallucinations."**
   `OFFERINGS.md` deliberately replaced that phrase on 2026-07-13 (commit `7801443`, the
   never-overclaim sweep) with *"Every citation grounded and retraction-screened."* (That line was
   itself replaced on 2026-11-15 by the elevator in the table above.) The Playbook
   was touched later, on 2026-07-22, but for AWS reconciliation — the tagline block was never
   revisited. So the single most quotable line in the largest canon file is the one the
   operator's own doctrine has since retired. **Fix this before it lands in a customer's inbox.**
2. **`REVENUE_PLAYBOOK.md:150` still carries a generic product line** — `research_packs …
   "Curated research artifacts on any topic"` — sitting directly above the biomedical SKU table.
   Same file, two taxonomies. It is the only place in customer-facing canon where the business
   reads as general-purpose.

---

## 3. The gap between the described business and the built one

The operator described the business as *"research and data for companies to make sound decisions
of any kind"* and proposed pivoting to biomedical specialization.

**That pivot already happened, and it is not close.** Across every commercial and
customer-facing file, the business is never once positioned as general-purpose. General-purpose
framing survives in exactly three places, all internal plumbing:

- `docs/WORKFLOW_CATALOG.md:13` — a `general-research-pack` template whose example topic is
  *"AI governance"*. An engine capability, never an offer.
- `REVENUE_PLAYBOOK.md:150` — the stale product-line row noted above.
- `REVENUE_PLAYBOOK.md:223` — a `sample/` vs `biomedical/` input-directory convention.

Even the Playbook's own appended market research reaches the opposite conclusion of the one the
operator voiced: at `:482` it argues that independent sellers beat platform incumbents *"by
adopting the boutique model — curating highly specific, manually verified datasets for hyper-niche
industries (e.g., biomedical research intelligence)."* The strategy document already made the case
for staying narrow.

**So the identity is not unclear. It is unread.**

---

## 4. The pivot he is actually proposing (and nobody has written down)

The request named a buyer that does not exist anywhere in this business:

> `grep -ri "medical startup"` → **0 hits.** `grep -ri "entrepreneur"` → **0 hits**, repo-wide,
> excluding `node_modules` and `vendor`.

The four ICP segments are all people evaluating **someone else's** science. "Medical startups and
entrepreneurs" are people defending **their own**. That is not a change of industry — biomedical
is already locked — it is a **change of buyer**, and it is the harder of the two changes:

| | Current buyer (investor / pharma BD) | Proposed buyer (medical startup founder) |
|---|---|---|
| Job to be done | Should I write this check / do this deal? | Is my asset defensible, and can I prove it? |
| Whose asset | Someone else's | Their own |
| $15K feels like | 0.1% of a $15M position | Payroll |
| Buys | Investor Pre-Mortem, Failed Trial Archaeology | FTO, IP landscape, trial-design benchmarks |
| Reachable at | $9,950 – $19,950 | realistically $2,500 – $4,950 |

**The price problem is the whole problem.** The ladder is built for a buyer with institutional
money. Of the seven SKUs, only **Plain-Language Patient Brief ($2,500)**, **Trial Design Benchmark
Pack ($4,950)** and **Conference Synthesis Brief ($4,950)** sit where a pre-Series-A founder can
actually transact.

**Recommendation: this is a second buyer on the same engine, not a pivot.**

Keep the investor lane — it is what is built, priced, marketplace-listed, and AWS-cleared. Add a
founder lane at the tactical price point, assembled from what already transfers:

- **Failed Trial Archaeology** and the **graveyard memo** answer *"has anyone tried my approach and
  died?"* — arguably more valuable to a founder designing a protocol than to an investor.
- **Trial Design Benchmark Pack** ($4,950) is already a founder product wearing an investor label.
- **PatSnap** (§5) adds freedom-to-operate — the single thing a medical startup most reliably pays
  for before a priced round, and a capability this stack did not have until today.

Do not rewrite the brand for this. Extend the ICP table by one row and build one founder-priced
SKU. The tagline, the moat, and the voice all survive the new buyer unchanged.

---

## 5. Why the identity felt unknowable

The structural cause, stated plainly: **the positioning is asserted in at least seven files and
owned by none of them.** `OFFERINGS.md` has the corrected elevator; the Playbook has the stale one;
`README.md` and the dossier have a shortened one; `REVENUE_PLAYBOOK.md` has the "why us"; the ICP
table is duplicated in two places; the product catalog has an eighth SKU the ladder files do not
list. Ask "what is the brand" and you get a different answer per file opened.

Nothing was wrong. There was just no front door. **This document is the front door** — the others
stay authoritative for their own domain, and this one says who the business is.

---

## 6. What PatSnap changes, and its one hard limit

Authorized by OAuth 2026-07-30 and verified live the same day: a US · `A61K` · active ·
2022-onward GLP-1 query returned **50,447 patents**, each with assignee, inventor, IPC, legal
status, all four date fields, citation count, and full claim text. Registered as connector
`patsnap` in [`config/connector-registry.json`](../config/connector-registry.json); bound as
`~~patent` in [`config/plugin-bindings.json`](../config/plugin-bindings.json).

Before today, **none of the 46 registered connectors held a single patent record.** This is a new
capability class, not a duplicate — and it is precisely the class the founder buyer needs.

**The limit, which is load-bearing.** `openclaw-bridge/core/citation-extractor.js` recognizes seven
identifier types: PMID, PubChem CID, NCT, UniProt, ChEMBL, DrugBank, DOI. A patent number like
`US12458612B2` matches **none** of them. Therefore:

- A patent-grounded claim is **invisible to the Phase-30 grounding gate** and is never
  retraction-screened.
- **"Every citation, checked." does not currently extend to patent assertions** (the tagline
  since 2026-11-15; `SYSTEM-REALITY.md:15` records where it stops). Until a `PATENT`
  pattern and a runtime patent-id grounding source ship *in the same change*, patent findings
  inform operator judgement but must not be sold as citation-traced. Honest phrasing:
  *"patent evidence, outside the citation gate."*
- **Correction (2026-07-30, same day):** an earlier revision of this section said wiring PatSnap into
  prefetch would make patent records count as ungrounded and *deflate* the ratio. **Verified false**
  against `citation-gate.js:106-108` — the cited set is built solely from `extractCitations()`, so an
  unrecognized identifier never reaches the grounded/ungrounded fork. Patent evidence is **invisible**
  to the grade, not counted against it. **The real risk is the opposite and sharper:** a buyer sees an
  A grade on `citation-integrity.md` beside a patent section and concludes the patents were graded.
  They were never counted. PatSnap stays out of `tool-prefetch-map.json` regardless — there is no
  engine fulfillment path.

This is the sequencing constraint on the whole founder lane: **the citation grammar has to grow
before the IP product can be sold under the guarantee.**

---

## 7. Decisions only the operator can make

1. ~~**Second lane, or replacement?**~~ **DECIDED 2026-07-30 — second lane, additive.** Operator,
   verbatim: *"add the founder lane as a second buyer, keep the investor ladder."* Executed in
   [`founder-lane-2026-07-29.md`](./founder-lane-2026-07-29.md). One caveat that decision surfaced and
   this document did not anticipate: **the founder SKUs that are fundable and the ones that are
   fulfillable do not intersect at Phase I.** The lane opens with one SKU (Failed Trial Archaeology,
   sized to the **Phase II** TABA line), not the five-SKU reframe §4 below implies.
2. **Founder-lane price point.** Nothing in canon prices a founder SKU. It has to be set, not
   derived — and the existing tactical tier ($2,500 / $4,950) is the only honest anchor. *Band now
   evidenced ($2,500–$4,950, six benchmarks) in the founder-lane doc §5, but deliberately still
   **unset** pending California counsel and sourced benchmark files.*
3. **Close the patent citation gap, or fence it?** Extending `CITATION_PATTERNS` makes IP work
   sellable under the guarantee. Fencing it means saying so in every deliverable. Both are
   defensible; silently doing neither is not.
4. **Fix the two drift items in §2** — the Playbook's "Zero hallucinations" line especially, since
   it is live customer-facing copy contradicting the business's own never-overclaim doctrine.
