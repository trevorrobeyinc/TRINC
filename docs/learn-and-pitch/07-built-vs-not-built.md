# 07 — Built versus not yet real

> The honest state of every part on **2026-10-23**. When this file and any other disagree about what is
> real, this file wins (and the disagreement should be reported to Trevor).

## The parts

| Area | State | Source |
|---|---|---|
| Revenue | **$0.** No listings live, no deals, no customers. | `STATUS.md` |
| Legal entity | **Exists and approved** (CA No. B20260217250, 2026-06-18) | `ENGINE/SYSTEM-REALITY.md` §1 |
| Biomedical engine | **Works.** Run #6 (2026-10-08) delivered 45 of 45 citations re-resolved VERIFIED. | `HOW-IT-WORKS.md` §8 |
| Citation gates (grounding, retraction screen, re-resolution) | **Built, wired, proven live** | `ENGINE/SYSTEM-REALITY.md` → "GAP CLOSED" |
| Trial Design Benchmark Pack | **Proven:** three gate-passing runs on disk | `ENGINE/workspace/workflows/` *(on disk)* |
| Failed Trial Archaeology | **Path verified** (`clinical-trial-landscape`, completed runs on disk) | `ENGINE/01-brand-system/founder-lane-2026-07-29.md` §1 |
| Scoped Research Pack, Pharmacovigilance Pack | **Templates built**; no completed run stored | `ENGINE/docs/WORKFLOW_CATALOG.md` |
| Investor Pre-Mortem, Cross-Silo Connector Report | **Priced; fulfilment path not documented** `[UNVERIFIED]` | `02` §C |
| Conference Synthesis Brief, Plain-Language Patient Brief | **Priced; no code** to produce them | `ENGINE/01-brand-system/founder-lane-2026-07-29.md` §1 |
| Business research lane | **Built and unit-tested; never run live.** Evidence Desk built. Census and EIA sources dormant until free keys are registered. | `STATUS.md`; `ENGINE/CLAUDE.md` |
| Business research tiers | **Priced (2026-10-23); booking after the first live run** | `ENGINE/OFFERINGS.md` |
| Web search for the business lane | SearXNG's general web results are unusable (only Bing answers, often for one word of the query); the lane uses the `science` category until a Brave Search API is added (deferred) | `ENGINE/CLAUDE.md` → Business research lane |
| Amendment-risk band | **Paused** (ClinicalTrials.gov HTTP 403 since 2026-10-08) | `ENGINE/OFFERINGS.md` |
| Patent evidence | **Outside the citation gate**; no patent SKU is priced | `ENGINE/01-brand-system/brand-identity-2026-07-29.md` §6 |
| Trial Graveyard Feed | **Refresh reviewed; not uploaded, not listed**; prices on hold | `06` |
| Research REST API, scheduled runs, usage metering | **Code and tests exist; not deployed** | `HOW-IT-WORKS.md` §8 |
| Obsidian pipeline (engine writes the vault, plugin enriches) | **Works headless** | `CLAUDE.md` → Obsidian |
| Claude's one door | **Live** (27 tools), first real runs through it 2026-10-08 | `ARCHITECTURE.md` §4 |
| Local Ollama model for Copilot | **Ollama runs, no model installed** | `ARCHITECTURE.md` §7 |
| Visuals in a run | **None automatic**; Viz Studio draws only on request | `ARCHITECTURE.md` §3.7 |
| CI | **None runs**; the local gates are the pipeline | `ENGINE/CLAUDE.md` → Tech Stack |

## INTERNAL — Trevor's open queue (learning deck only, never on a client slide)

| Item | Why it matters | Source |
|---|---|---|
| **Google Workspace payment failed**; Workspace suspends **2026-11-02** | It carries business mail and the AWS root email | `STATUS.md`, queue 1 |
| **Compliance is behind**: EIN not applied for; LLC-12 (due 2026-09-16) and the $800 FTB 3522 (due 2026-08-15) not filed | A suspended entity cannot sell | `STATUS.md`, queue 2 |
| AWS listing decisions deferred | The feed cannot list until they are made | `STATUS.md`, queue 3 |
| First live business-lane run | Business tiers stay closed until it passes | `STATUS.md`, queue 9 |
| Confirm how Investor Pre-Mortem is fulfilled | It is the lead SKU and carries a written Speed SLA | this pack, `02` §C |
| Re-source the ICP market statistics | They cannot go on slides until their sources are found | this pack, `01` |

## What "fully realised" would look like (the missing pieces, from the sources)

This is the gap list the learning deck should walk through, in the operator's framing of "the research
business engine sitting right next to the biomedical engine":

1. One live, gate-passing business-lane run (opens the five business tiers).
2. Census and EIA keys registered (switches on two dormant statistics sources).
3. A working general web search for the business lane (the Brave Search API, deferred).
4. A supported source for protocol history (brings back the amendment-risk band).
5. A patent identifier in the citation grammar plus a runtime patent source, shipped together (lets IP work
   be sold under the guarantee).
6. Fulfilment code for the Conference Synthesis Brief and the Plain-Language Patient Brief.
7. A documented, tested fulfilment path for Investor Pre-Mortem and Cross-Silo Connector Report.
8. The Trial Graveyard Feed listed on AWS.
9. The entity brought current (EIN, LLC-12, franchise tax) before any paid product goes public.

[src: items 1–3 `ENGINE/CLAUDE.md` → Business research lane, `STATUS.md`; item 4 `ENGINE/OFFERINGS.md`; item 5
`ENGINE/01-brand-system/brand-identity-2026-07-29.md` §6; item 6 `ENGINE/01-brand-system/founder-lane-2026-07-29.md` §1;
item 7 this pack `02` §C; items 8–9 `STATUS.md`]
