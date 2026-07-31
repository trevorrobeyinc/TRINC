# The Founder Lane — medical-startup founders as a second buyer

> **Dating note.** This work landed **2026-07-30**. The `-2026-07-29` in the filename is a
> dating error made when the file was created; it is retained because other surfaces already
> reference this path by name. Every date *inside* this document is correct.


**Decision (operator, 2026-07-30):** *"add the founder lane as a second buyer, keep the investor ladder."*
**Status:** lane opened. **TWO** transactable SKUs as of **2026-07-31** — Backlog item #1 shipped and the
**Phase I tier is now OPEN**. See the update box in §1. Everything else remains build-gated and named below.
**Method:** designed by an 11-agent workflow — 7 parallel evidence agents, 1 synthesis, 3 adversarial
lenses. The lenses returned **13 blocking defects** against the first design. This document is what
survived them.

Companion: [`brand-identity-2026-07-29.md`](./brand-identity-2026-07-29.md) (who the brand is) ·
[`../OFFERINGS.md`](../OFFERINGS.md) (the ladder, unchanged) ·
[`../config/connector-registry.json`](../config/connector-registry.json) (`patsnap`).

---

## 1. The finding that shaped everything

> **The founder SKUs that are FUNDABLE and the founder SKUs that are FULFILLABLE did not intersect.**

The sourced procurement ceiling for a pre-seed/Phase-I founder is **$6,500** (SBIR/STTR TABA, Phase I).
Of the five SKUs a founder-lane reframe would naturally reach for, exactly **one** has a verified
end-to-end coded path — **Failed Trial Archaeology at $14,950**, which is 2.3× that entire line.

Every SKU a Phase I founder *can* fund is one the engine *cannot currently produce*:

| SKU | Price | Fundable at Phase I? | Fulfillable today? | The gap |
|---|---|---|---|---|
| Failed Trial Archaeology | $14,950 | ✗ (2.3× the line) | **✓ verified** | none — runs as `clinical-trial-landscape` |
| **Trial Design Benchmark Pack** | **$4,950** | ✓ | **✅ SHIPPED 2026-07-31** | ~~no workflow template, no mission template, no intake path; connectors `claude-host-mcp`; "PDF + Tableau workbook" unbuildable~~ — **all five cleared, see the update box below** |
| Conference Synthesis Brief | $4,950 | ✓ | **✗** | no ingestion code at all |
| Plain-Language Patient Brief | $2,500 | ✓ | **✗** | no code implements the 8th-grade health-literacy or EU CTR 536/2014 transform |
| Founder Patent Landscape Brief | not set | ✓ | **✗** | `patsnap` is `claude-host-mcp`, deliberately outside prefetch — no engine path; plus the legal review in §5 |

**The resolution:** the lane opens with the one combination that is both fundable and fulfillable —
**Failed Trial Archaeology sold against the Phase II TABA line ($50,000), not Phase I.** That buyer is
real, smaller, and reachable. ~~The Phase I tier stays closed until a build lands (§6).~~

> ### 🟢 UPDATE 2026-07-31 — the build landed; the Phase I tier is OPEN
>
> Backlog item #1 (§6) shipped in commit `160372c`. **All five blockers named in the row above are
> cleared**, each verified individually against the files:
>
> | # | Blocker as written | Now |
> |---|---|---|
> | 1 | no workflow template | ✅ `config/workflow-templates/trial-design-benchmark.json` — `phase30-workflow-v1`, id `trial-design-benchmark`, required input `indication` |
> | 2 | no mission template | ✅ present in `config/mission-templates.json` |
> | 3 | no intake path | ✅ `intake.html` carries the `tdb_*` field group |
> | 4 | connectors `claude-host-mcp`, adapter missing/blocked | ✅ `ctgov-design-benchmark` is `subprocess-mcp`, `adapter_status: wired`, and present in `config/tool-prefetch-map.json` |
> | 5 | "PDF + Tableau workbook" unbuildable | ✅ corrected 2026-07-30 — `CLAUDE.md` now reads *Manual ZIP — `design-benchmark.md` + `design-benchmark.csv`*; `export-release.js` still emits `folder\|zip` only, and the copy no longer claims otherwise |
>
> **So the lane now has a real Phase I anchor.** Trial Design Benchmark Pack at **$4,950** fits inside
> one **$6,500** TABA Phase I line with room left — which is exactly what §6 said this build would do.
>
> **Unchanged:** Failed Trial Archaeology stays the **Phase II** play ($50,000 line), since $14,950 is
> 2.3× the Phase I cap. The other three SKUs remain unbuildable and must still not be quoted.
> Operating summary: the `trinc-founder:founder-fit` skill.

This is deliberately *not* a five-SKU reframe. Shipping one would have put prices on four things the
engine cannot make.

---

## 2. The segment

| | |
|---|---|
| **Name** | Medical Startup Founders |
| **Titles** | Founder/CEO, CSO, VP Clinical Development, Head of Regulatory |
| **Stage** | pre-seed → Series A; biotech, medtech, diagnostics |
| **WTP** | SBIR/STTR TABA — up to **$6,500** per Phase I project, **$50,000** per Phase II |
| **Trigger** | SBIR/STTR application drafting |

**The channel discovery, and it is the most useful thing in this document.** NIH Guide Notice
**NOT-OD-26-075** (2026-04-20) sets the TABA caps above, names *"market research and/or validation"* as an
eligible activity, and lets recipients *"select one or more vendors to assist the small business."* NIDA's
TABA guidance adds that the budget justification must carry the **name of the vendor** and a detailed
description of what they will provide.

> **Therefore the sale closes BEFORE the grant is submitted, not after the award.**

That inverts the timing of all four existing personas, which sell into a post-decision moment. Get this
backwards and the entire outbound sequence arrives months late. It is also, usefully, a *budgeted* line —
the founder is not spending discretionary cash, they are filling a named vendor slot in an application.

Secondary headroom, not a channel: consultants and contractors *"generally may not exceed 33 percent of
the total requested amount"* on Phase I (NIH GPS 18.5.2), against an SBA Phase I ceiling of **$323,090**
(SBIR.gov/about, April 2026).

**No named-account list exists for this persona.** `06-target-accounts/` has four persona directories and
none is founders. Do not create one populated with invented company names — an empty-but-present directory
reads as finished work.

---

## 3. Jobs to be done

1. *Has anyone already tried my approach and died — and did the sponsor say why, in their own words?*
2. *Is my asset defensible, and can I prove it?*
3. *Among comparable programs **that were stopped**, how much did protocols churn, and which modules?*
4. *My investor's diligence team is going to run this analysis on me. What will they find first?*
5. *Who else already has patents in my space, and is this a conversation I need to take to an attorney?*

JTBD 3 is phrased that way on purpose — see §4.

---

## 4. The one live SKU: Failed Trial Archaeology, founder-framed

**Price: $14,950, unchanged.** Sized to the **Phase II** TABA line ($50,000). Not offered against Phase I.

**Investor framing (unchanged):** structured post-mortem of Phase 2/3 terminations in a single mechanism.

**Founder framing:** the programs in your indication that already stopped — each NCT-traced, each carrying
the sponsor's own stated stop reason or an explicit *"(none stated by sponsor)"*, never invented — plus
protocol-churn statistics and an amendment-risk band.

**Why it transfers:** it is the only founder-relevant SKU with a verified coded path. It runs as the
`clinical-trial-landscape` template; `buildGraveyardMemo` and `buildAmendmentRisk`
(`openclaw-bridge/monetization/graveyard-memo.js:11-38` and `:40-68`) are deterministic, no-LLM renderers
that fire off the buyer's own `therapeutic_area` input and fail soft.

### Three corrections the adversarial review forced — all now binding copy rules

**(a) It is not "every" program.** `workflow-engine.js:484` calls `searchStoppedTrials({ condition })` with
no `pageSize`, so a single un-paginated page of **8** applies. Change-history enrichment — the sole input to
the amendment band — is bounded to the **first 5** records. The renderers are already honest
(`graveyard-memo.js:19` prints *"N stopped program(s) retrieved"*); marketing copy must not upgrade
"retrieved" to "every." A completeness claim is the sharpest possible overclaim for a graveyard product,
because *"did you miss one?"* is the buyer's entire question.

> **Required coverage line:** "This memo reports the stopped programs retrieved by a single
> ClinicalTrials.gov query at generation time (currently up to 8), not an exhaustive census. Protocol-churn
> statistics are computed from at most the first 5 of those."

**(b) The amendment band is survivorship-inverted.** `buildAmendmentRisk` receives the same
`stoppedTrials` array as the graveyard memo, so the median is computed **exclusively over terminated,
withdrawn, and suspended trials.** Programs that ran to completion contribute nothing. Handing that median
to a founder about to lock a protocol implies it is the amendment rate for *comparable programs*; it is the
amendment rate for *comparable programs that died*.

> **Required sampling line:** "The amendment-risk band is derived only from trials that were terminated,
> withdrawn, or suspended. It is not a general amendment rate for the indication, and the
> LOW/MODERATE/HIGH thresholds are an internal heuristic with no published basis."

**(c) The graveyard memo is not covered by the citation grade.** It is built *after* the gate has run, from
a separate ClinicalTrials.gov call. The gate's cited set comes only from subtask `output_path` files, and
`graveyard-memo.md` is never in that text — so its NCTs are never counted in the grounded ratio or the
grade. It is **grounded by construction** (no LLM, rendered straight from fetched records) but **not
graded**. The packager writes it into the same `deliverables/` folder as `citation-integrity.md`, so a
buyer sees an A grade sitting beside an ungraded artifact.

> **Required grade-adjacency line, on the cover of any bundle carrying a graveyard memo:** "The Citation
> Integrity grade covers only the PMID / NCT / ChEMBL / DOI-traced sections of `report.md`. The graveyard
> memo and search-coverage ledger are deterministic post-gate renders — grounded by construction, but not
> counted in the ratio that produced this grade."

---

## 5. The patent brief — designed, priced, and deliberately NOT on the ladder

**Not on `OFFERINGS.md`. Price: not yet set** (following the `product-catalog.md:47` precedent already
used for the Trial Graveyard Feed).

**What it would be:** who already holds patents in your space, mapped from PatSnap — assignees, filing
timeline, legal status, claim text, and where density sits relative to your approach. **Search and
landscape analysis only.** The packet you hand your patent attorney, not a substitute for one.

### The price band, if and when it ships: **$2,500 – $4,950** (the existing tactical band, no new tier)

Derived by this business's own documented method — `04-pricing-benchmarks/pricing-positioning.md:3-7`
places every SKU in the under-occupied gap between a cheap self-serve alternative and an enterprise one.
Applied here:

| Benchmark | Figure | What it establishes |
|---|---|---|
| ipCapital Group (updated June 2026) | $100–$500 vs $1,000–$3,000+ | the cheap tier buys *"a hit list, little or no analysis"*; the upper tier buys CPC strategy, global full-text, and an analyst-written report — **the floor** |
| Planet Patent | Landscape $800–$1,200; FTO/clearance $1,500–$3,000 | published non-attorney pricing |
| WashPat fee schedule | Landscape $3,000 / $4,250 / $6,000 (14/10/7 days) | closest direct analogue — **lands inside the existing tactical band** |
| Cann IP | prior-art search **$3,000** vs non-infringement **opinion $9,500** | cleanest single-firm measurement of the search→opinion premium: **~$6,500** |
| Vic Lin / Innovation Capital Law | Stage 1 search from $3,000; Stage 4 written opinion from $6,000/patent | staged confirmation of the same premium |
| NIH NOT-OD-26-075 | $6,500 Phase I TABA cap | a $4,950 SKU fits inside one named-vendor line with room left |

**Why not higher:** above ~$5,000 the buyer's reference class stops being "analyst report" and becomes
"attorney opinion." That premium is not skill — it is **35 U.S.C. § 298**: the willful-infringement
defense attaches to *the advice of counsel*, and that function is not for sale by a non-attorney at any
price. **Why not lower:** below ~$2,500 the deliverable is a hit list, which discards the analytical moat.

**Confidence: MODERATE on the band, LOW on any single figure.** Every rate card found is **undated**
(WashPat's linked PDF is named `2017FeeSchedule.pdf`), no large IP consultancy publishes a price at all,
and **no medtech- or diagnostics-specific figure was found anywhere.** Do not put any of these numbers in
customer-facing copy until they exist as sourced files under `04-pricing-benchmarks/benchmarks/` with URL,
retrieval date, and the staleness caveat.

**What would firm it up, in order of value:** (1) the AIPLA *Report of the Economic Survey* — the
industry-standard biennial median, paywalled, the correct spend if a defensible single number is ever
needed; (2) two or three direct quote requests to the named consultancies; (3) **resolving whether the NIH
Niche Assessment Program still gives every NIH SBIR Phase I awardee a FREE third-party market assessment.**
The most recent notice found is NOT-OD-16-144 (2016) but the program is still listed on a live NIH page.
**If that is still free and running it is the single most important competitive fact for this entire lane**,
because it caps what a founder will pay for anything adjacent.

### The two blockers

**Blocker 1 — legal.** A non-attorney may sell a patent **search and landscape**; a **freedom-to-operate
opinion** is a different product. The boundary is drawn from *Sperry v. Florida*, 373 U.S. 379 (1963) —
which shields only work *"reasonably necessary and incident to the preparation and prosecution of patent
applications"* and whose charged conduct **expressly included** *"rendering legal opinions, including
opinions as to patentability or infringement"* — and from **Cal. Bus. & Prof. Code § 6125**, which binds
this California LLC directly. The industry pattern matches: Parola Analytics, the closest structural
analogue, sells the **search** and partners with a law firm for the **opinion**.

> **Open question that goes to California counsel before anything FTO-adjacent is sold:** no state bar
> ethics opinion or case was found squarely holding whether a non-attorney analytics company may sell an
> FTO search **direct to a company** rather than through counsel, and § 6125 does not itself define
> "practice law." The fences below are **not** a substitute for that review.

**Blocker 2 — no engine path.** `patsnap` is `claude-host-mcp` and deliberately absent from
`config/tool-prefetch-map.json`. Any brief produced today is hand-assembled and therefore claims **none**
of the engine guarantees.

### The four required fences (verbatim, wherever patent evidence appears)

1. **Citation fence.** *"Patent evidence — outside the citation gate. The citation-integrity engine
   recognizes seven identifier types: PMID, PubChem CID, NCT, UniProt, ChEMBL, DrugBank, and DOI. A patent
   number matches none of them, so patent findings in this document are never extracted as citations at
   all: they are not grounded against the records retrieved at runtime, and they are not retraction-
   screened. They are invisible to the Citation-Integrity Gate — they neither raise nor lower the grade,
   because they were never counted in it. The Zero-Fabrication Guarantee and the Citation-Audit SLA do not
   extend to this section."*
2. **Grade-adjacency fence.** *"The Citation Integrity grade in this bundle covers only the PMID / NCT /
   ChEMBL / DOI-traced sections. It does not cover the patent section, and no patent identifier was counted
   in the ratio that produced this grade."*
3. **Legal-boundary fence.** *"This is a patent search and landscape analysis. It is not a freedom-to-
   operate opinion, a clearance opinion, a validity opinion, or any other legal opinion. Trevor Robey
   Intelligence Network Citations LLC is not a law firm, is not a registered patent practitioner, and does
   not provide legal advice. Nothing in this document states or implies a conclusion about infringement,
   validity, enforceability, or freedom to operate. A freedom-to-operate opinion — and the advice-of-counsel
   defense against willful infringement under 35 U.S.C. § 298 that depends on it — can only be provided by
   qualified patent counsel. Take these search results to your attorney."*
4. **Scope fence** (in the SKU description itself, not only the deliverable). *"Deliverable: the search
   results and the landscape analysis. Not included: any opinion on whether your product infringes. That
   determination is reserved to a licensed attorney."*

---

## 6. Build backlog — what unlocks the Phase I tier

Ranked. Each is a decision, not a documentation task.

1. ~~**`trial-design-benchmark.json` workflow template + intake entry**, and rewrite the `CLAUDE.md:362`
   Delivery cell off *"PDF + Tableau workbook"* onto what `export-release.js` actually emits.~~
   ✅ **DONE 2026-07-31 — commit `160372c`** (Delivery cell corrected 2026-07-30). This was the single
   highest-value build in the lane, and it did what it promised: a $4,950 SKU that fits inside one
   $6,500 TABA Phase I line. **The Phase I tier is open.** Verification table in §1.
2. **California counsel review** of the direct-to-company FTO-search question (§5, Blocker 1).
3. **Sourced benchmark files** under `04-pricing-benchmarks/benchmarks/` before any competitor price
   reaches customer copy.
4. **The patent citation grammar** — a `PATENT` pattern in `CITATION_PATTERNS` **and** a runtime patent-id
   grounding source, **in the same change**. Adding the pattern alone is the ordering that genuinely breaks
   things (every patent citation would then report ungrounded and reports would start failing).
5. **Coverage build for the graveyard memo** — paginate `searchStoppedTrials` and raise `maxHistory` — if
   exhaustiveness is ever to be sold. Until then §4(a) governs the copy.
6. **Outbound persona 5**, built on **pre-submission** timing. Note `linkedin-connection-templates.md`
   enforces strict four-persona parity in two separate blocks; either add a fifth to both or record
   explicitly that the founder persona is email-only and why.

---

## 7. Do not do

1. Do **not** reprice, demote, rename, or remove any existing SKU. Every price string stays byte-identical.
2. Do **not** invent a founder "Top Pain" statistic to make the fifth ICP row look symmetrical. The other
   four carry sourced figures; none exists for founders. **An asymmetric row is correct; a fabricated one
   is the failure this business sells against.**
3. Do **not** set the patent-brief price this pass.
4. Do **not** repeat the claim that wiring PatSnap into prefetch would make patent numbers count as
   ungrounded and **deflate** the ratio. **Verified false** against `citation-gate.js:106-108` and
   `citation-extractor.js:3-27` — patent numbers are never extracted, so they never reach the
   grounded/ungrounded fork. They are *invisible*. The guardrail is right; that stated mechanism was not.
5. Do **not** add a `PATENT` pattern without a grounding source in the same change (§6.4).
6. Do **not** add `patsnap` to `config/tool-prefetch-map.json`.
7. Do **not** describe any deliverable as an FTO opinion or as telling the founder whether they infringe.
8. Do **not** soften the four fences to make copy read better. All are load-bearing.
9. Do **not** treat the fences as a substitute for California counsel.
10. Do **not** quote WashPat, Planet Patent, Cann IP or Vic Lin figures in customer copy before §6.3.
11. Do **not** quote PatSnap/Derwent/Orbit enterprise ranges — every figure found came from a competing
    advisory's blog which itself says they are quotes inflated 30–50% above close rates. PatSnap's own
    published Life Sciences Pro tier ($400/month) is first-party and may be cited.
12. Do **not** cite SBIR Phase I as "$150,000" — SBIR.gov contradicts itself (`/about` says $323,090, April
    2026; `/faq/all` still says $150,000). Only `/about` is current. Both primary NIH pages return 403 to
    fetch tools — that is bot-blocking, not absent data; resolve via the Claude Browser pane.
13. Do **not** fill the fulfillment gaps as if they were documentation gaps.
14. Do **not** claim the Citation-Integrity Gate, Speed SLA, or Citation-Audit SLA for any hand-assembled
    deliverable that never ran through the engine.
15. Do **not** ship any new SKU under a **refund-backed** SLA until `08-contracts-legal/` carries a written
    refund policy. `PLUGIN-BINDINGS.md:751-753` already logs this as a live overclaim; do not extend it to
    a second buyer.
16. Do **not** edit the dated audit artifacts under `workspace/audit/` to add the fifth segment — that
    falsifies the audit trail.
17. Do **not** add a founder SKU to `intake.html`'s `QUESTION_TYPE_MAP` that maps to no workflow template.
18. Do **not** rewrite the tagline, elevator, moat, or voice.
19. Do **not** treat this as a replacement for the investor lane.
20. Do **not** build outbound on post-award timing (§2).
21. Do **not** stand up `06-target-accounts/persona-5-*/` with invented company names.

---

## 8. Unresolved, carried forward honestly

- Whether the NIH Niche Assessment Program still gives Phase I awardees a free market assessment (§5).
- Whether a non-attorney may sell an FTO search direct to a company in California (§5, Blocker 1).
- Whether PatSnap now closes the Investor Pre-Mortem's documented "IP runway" hole
  (`workspace/audit/doctrine-reality-questionnaire-2026-07-10.md`, Q23 — *"only two patent-site domains in
  the SearXNG allowlist… no structured connector"*). **The commercial-realism lens argues this should be
  sequenced FIRST** — it fixes a hole in the flagship, which has the buyer with money, the AWS-cleared
  listing, and four written personas — and that releasing a founder standalone first risks cannibalising
  investor-lane revenue in the direction the operator's ladder constraint forbids.
- No medtech- or diagnostics-specific pricing figure exists anywhere in the evidence set.
