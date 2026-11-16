# 10 — Slide and animation brief

> Build these from the pack only (`00` rules apply to every slide). Each slide below names the pack file its
> facts come from; put those sources in the speaker notes so every number can be traced.

## Format for everything

- **16:9**, dark background `#0a0a0f`, text `#e8e8ec`, one accent `#4a90d9`, IBM Plex Sans + Plex Mono
  (identifiers always in Plex Mono). No gradients, shadows or rounded corners. (`09`)
- **One idea per slide.** A headline that states the point, then at most five short lines or one table or one
  diagram.
- **Numbers as stat tiles** where a slide is about proof (big number, short label, source in the notes).
- **Speaker notes** on every slide: the `[src: …]` lines from the pack, plus anything the presenter must not
  overstate.
- Build as an HTML slide deck (one artifact, arrow-key navigation) unless Trevor asks for `.pptx`.
- Pitches end with the disclosure line in small type: *Trevor Robey, INC. is the wordmark of Trevor Robey
  Intelligence Network Citations LLC, a California limited liability company.*

---

## A. "Learn TRINC" — the study deck (Trevor only)

**Purpose:** let Trevor walk through every part of the business and its machine, both lanes, including what
is missing. **Audience:** Trevor alone. Internal details (ports, the open queue) are allowed here and only
here. **Length:** 26 slides. **Tone:** a patient teacher; plain words first, the technical term second.

| # | Slide | Content | From |
|---|---|---|---|
| 1 | Learn TRINC | Title; "how Trevor Robey, INC. works, as of 2026-10-23"; internal | — |
| 2 | Four names | Wordmark, LLC (CA No. B20260217250), TRINC, OpenClaw; the disclosure line and why it exists | `01` |
| 3 | The business in one sentence | The sentence; tagline; elevator | `01` |
| 4 | One engine, two lanes | Side-by-side table: biomedical flagship vs business lane (evidence, templates, state, prices) | `01` |
| 5 | Who buys | Five biomedical segments + the any-field business buyer; a red-flag note that the ICP market statistics are unverified | `01` |
| 6 | The biomedical ladder | The table, verbatim | `02` A |
| 7 | The business tiers | The five tiers, verbatim, with the booking gate banner | `02` B |
| 8 | Priced ≠ built ≠ proven | The fulfilment map, colour-coded ✅ ⚠ ❌ ⏳ | `02` C |
| 9 | A run, the whole picture | The flowchart | `03` |
| 10 | Question and approval | Templates and inputs; the YubiKey approval (one run, 300 s); the mock provider | `03` |
| 11 | Evidence first, then writing | Prefetch, ToolUniverse, the three Claude roles, the "never invent an id" rule | `03` |
| 12 | The gates | The five checks in order, with what fails each | `04` |
| 13 | Grounded is not the same as real | Run #6's one ungrounded DOI that re-resolved VERIFIED: *did we read it?* vs *does it exist?* | `04` |
| 14 | What the customer receives | The bundle and its audit files | `04` |
| 15 | Run #6 by the numbers | Stat tiles: 45/45 VERIFIED, 0.978 grounded, 0 retracted, 1,412 of 1,412, 20 of 675, ~6.5 min, 174,235 tokens | `03`, `04` |
| 16 | Five runs that failed first | Runs #1–#5 each blocked and each exposed a real bug; the gates block rather than wave through | `03` |
| 17 | The business lane up close | The Evidence Desk diagram; what replaces the scout | `03` |
| 18 | The business lane's limits | `WEB:` proves what was read, not truth; statistics re-resolve the series, not the value; paywalls skipped | `04` |
| 19 | The machine room | One Mac; Obsidian as console; the four bridges | `05` |
| 20 | Claude's one door | What it can and cannot do, and why there is only one | `05` |
| 21 | The security layers | HTTPS-only, YubiKey gates, secrets, Falcon, posture | `05` |
| 22 | The first product | Trial Graveyard Feed: what it is, coverage, caveats; not listed | `06` |
| 23 | Built vs not built | The status table | `07` |
| 24 | What "fully realised" looks like | The nine missing pieces, in order | `07` |
| 25 | Your queue | The INTERNAL table (Workspace payment, compliance, listing decisions, first business run, Pre-Mortem fulfilment, ICP sources) | `07` |
| 26 | Test yourself | Five questions, answers in the notes: (1) What makes a citation "grounded"? (2) Why can an ungrounded id still be real? (3) What does a `WEB:` id prove? (4) Which two SKUs are proven by runs on disk? (5) What must happen before the business tiers can be booked? | `03`, `04`, `02` |

---

## B. Biotech-investor pitch (8 slides)

**Audience:** biotech hedge fund PMs, biotech VC partners, family-office research directors, pharma BD.
**Strategy:** lead with **proof of method** (operator, 2026-10-23). No customers exist, so the proof is the
run, not testimonials. **Voice:** company voice; terminal-dense; no hype.

**Before this deck is sent (Trevor's checks):** (1) confirm how Investor Pre-Mortem is fulfilled, since it is
the lead SKU with a written Speed SLA (`07`); (2) consider the compliance items in `07`, which `STATUS.md`
says should be filed before any paid product goes public.

| # | Headline | Content | From |
|---|---|---|---|
| 1 | **Every citation, checked.** | Stat tiles from one real run (non-small cell lung cancer, 2026-10-08): **45 of 45** citations re-resolved VERIFIED at delivery · **0** retracted papers · **1,412 of 1,412** stopped-trial records retrieved for the registry query "non-small cell lung cancer" (complete for that query term, not for every name of the disease) · **20 of 675** comparable Phase 3 programs benchmarked. Subline: the tagline. | `04` exhibit |
| 2 | A claim you cannot trace is a risk you cannot price. | The job: diligence on someone else's science, fast. Plain framing only; **no market statistics** (they are unverified, `01`). | `01` |
| 3 | The gate, not a warning | Three checks as a left-to-right diagram: grounded in what was retrieved (≥75% or blocked) → retraction screen (one retraction blocks) → every PMID/NCT/DOI re-resolved at delivery (any unresolved blocks). Footnote: re-resolution proves the record exists, not that its conclusions are right. | `04` |
| 4 | What lands on your desk | The sealed bundle: report, citation-integrity grade, graveyard memo, search-coverage ledger, reproducibility manifest, checksums. One line each. | `04` |
| 5 | Has anyone tried this and stopped? | The graveyard memo: real stop reasons, quoted, each linked to its NCT record. Show three entries from run #6 (e.g. NCT02710396, "Frontline pembrolizumab approved in NSCLC … new standard of care"). Note: the amendment-risk band is paused; do not show it. | `04`; run #6 memo |
| 6 | The ladder | Rows verbatim from `02` A for this buyer: **Investor Pre-Mortem** $9,950 / $14,950 / $19,950 (+ KOL primary) · **Failed Trial Archaeology** $14,950 · **Trial Design Benchmark Pack** $4,950 · **Scoped Research Pack** $4,950. Leave out the Conference Synthesis Brief (no code yet, `02` C). | `02` |
| 7 | Terms, plainly | Zero-Fabrication Guarantee · refund-backed Citation-Audit SLA · 5–10 business days for the Pre-Mortem (written) · research artifacts only, not clinical decision support · no patient data · patent evidence sits outside the citation gate and is labelled so | `02` D, `04` |
| 8 | Send one asset. | Call to action: one asset or one indication by email to trevor@trevorobeyinc.com · trevorobeyinc.com · tagline · disclosure line | `09` |

---

## C. General, all-buyers pitch (10 slides)

**Audience:** any buyer who needs a research report they can check, biomedical first, any field second.
**Strategy:** proof of method on the flagship lane, then the same method offered to every field.
**Use gate:** the business tiers cannot be booked until the first live business run passes (`02` B). Until
then either (a) keep slide 7's banner, or (b) send the deck without slides 7–8. Trevor decides. Do not remove
the banner to make the deck look ready.

| # | Headline | Content | From |
|---|---|---|---|
| 1 | Every citation, checked. Every risk, named. In days, not weeks. | Title; wordmark; one line: research reports in which every cited claim traces to a public record | `01`, `09` |
| 2 | Proof, from one real run | The same four stat tiles as B1, labelled "flagship lane: biomedical due diligence" | `04` |
| 3 | How a report is made | Simplified flow: question agreed → evidence retrieved first → written by Claude → checked against what was retrieved → every cited PMID, NCT and DOI re-resolved at its registry → sealed bundle | `03` |
| 4 | Checked, not just written | "A claim without a verifiable identifier fails a gate rather than passing with a warning." Plus the honest zero: a search that finds nothing is reported as nothing. | `04` |
| 5 | One engine, two lanes | Biomedical due diligence (the flagship) · business research in any field (also available). Same gate. | `01` |
| 6 | Biomedical reports | The core ladder from `02` A: Pre-Mortem, Failed Trial Archaeology, Trial Design Benchmark Pack, Scoped Research Pack, Pharmacovigilance Pack. Leave out the two ❌ SKUs (`02` C). | `02` |
| 7 | Business research, any field | The five tiers verbatim ($1,500 Quick Brief → custom Enterprise Program), with a visible banner: **"Booking opens after our first live business-research run passes the citation gate."** | `02` B |
| 8 | What a business citation proves | `WEB:` = exactly what was read, from which URL, when (not that the page is right); official statistics = the series, shown as published on the retrieval date; SEC filings; DOIs | `04` |
| 9 | How we work | Question and depth agreed in writing first · if the evidence does not exist, the report says so and shows what was searched · research, not legal, medical, tax or investment advice · not clinical decision support · no patient data | `02`, `01` |
| 10 | Ask one question. | Call to action; contact; tagline; disclosure line | `09` |

---

## D. Animation storyboards

Build each as a looping HTML + SVG animation (CSS keyframes or a small script), 16:9, brand palette, Plex
type, with a **reduced-motion version** that shows the end state. Every number on screen comes from run #6
(`04`). Each storyboard also works as 4–6 static frames for a slide.

### D1. "A research run" — ~45 s (learning deck; a shortened cut can open the general pitch)

| Time | Visual | On-screen text |
|---|---|---|
| 0–5 s | A question card drops in, Plex Mono: `Trial Design Benchmark · non-small cell lung cancer` (the commercial name; never show an internal template id on screen) | "A question goes in." |
| 5–10 s | A hardware key glyph; a single pulse | "A person approves the run." |
| 10–20 s | Thin lines fan out to labelled source boxes (PubMed, ClinicalTrials.gov, ChEMBL, Open Targets…); identifier chips stream back and stack on a shelf labelled **Retrieved: 102** | "Evidence is gathered first." |
| 20–28 s | Three role blocks light in sequence: Scout → Analyst → Synthesizer; a report page assembles | "Three Claude roles gather, weigh, write." |
| 28–38 s | The report's 45 citation chips slide past a gate; 44 snap into the accent colour; 1 gets an `[UNVERIFIED]` tag and stays visible | "Every citation is checked against what was retrieved." |
| 38–45 s | The bundle seals: files stack into a box, a checksum line ticks per file, a `DELIVER` stamp | "Sealed. Auditable. 45 of 45 re-resolved." |

### D2. "The citation gate" — ~35 s (both pitches)

| Time | Visual | On-screen text |
|---|---|---|
| 0–6 s | Left: shelf of retrieved ids. Right: a report with highlighted citations | "Did we actually read it?" |
| 6–16 s | Each cited id flies to the shelf and matches; a ratio bar fills to **0.978** past a fixed line at **0.75** | "Grounded: 44 of 45. Below 75%, nothing ships." |
| 16–24 s | A scanner sweeps the papers; each gets a small "not retracted" tick | "Retraction screen: 0 retracted." |
| 24–32 s | Each id sends a ping to its registry (NCBI, ClinicalTrials.gov, Crossref) and a VERIFIED tick returns | "Every PMID, NCT and DOI looked up again at its registry." |
| 32–35 s | Counter lands on **45 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED** | "It proves the record exists — not that its conclusions are right." |

The last caption is mandatory (it is the claim's bound, `04`).

### D3. "The one door" — ~30 s (**learning deck only**; internal architecture)

| Time | Visual | On-screen text |
|---|---|---|
| 0–6 s | Obsidian drawn as a building with four rooms: Vault (:8798), Command Center (:8799), Viz Studio (:8800), Security (:8801) | "Obsidian is the console." |
| 6–14 s | A Claude figure walks to a single door marked `openclaw-obsidian`; the door opens onto Command Center and Viz Studio only | "Claude has exactly one door." |
| 14–22 s | Allowed actions light up: start a run, watch it, read notes, draw a diagram. Blocked actions bounce off: edit a note, run a command, enter the vault bridge | "Read, run, draw. Nothing else." |
| 22–30 s | A diagram lands on a shelf labelled `Visualizations/`; other shelves stay locked | "Every drawing lands in one folder." |

---

## E. Reviewing Trevor's `00-in-my-own-words.md`

When Trevor writes it, check it against `03` and `04` and reply with:

1. **What he has right**, in one or two lines.
2. **Gaps**: any step missing from the nine in `03` (the approval, the evidence-first prefetch, the gate, the
   retraction screen, re-resolution and the sealed bundle are the ones that matter most).
3. **Misconceptions**, gently. The common ones: thinking the gate checks whether a paper's conclusions are
   true (it does not); thinking "ungrounded" means "fake" (not necessarily); thinking the business lane has
   run (it has not).
4. **One question back** that tests the weakest point.

Only after this review, start on sections B and C.
