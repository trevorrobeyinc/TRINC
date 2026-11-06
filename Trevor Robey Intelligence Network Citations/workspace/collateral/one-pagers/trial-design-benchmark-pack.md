<!-- INTERNAL (operator decisions 2026-11-06, decision sheet 08-contracts-legal/decision-sheet-2026-11.md): build every buyer ZIP with `node scripts/build-buyer-zip.js --offer-id <offer-…> --out <file.zip>`; never attach a proof-run export ZIP to an email; never share run #7's report.md (its defects are listed in the ALS sample's operator notes). The design-benchmark generator's "Citation-integrity scope" note was corrected for new runs; run #7's sealed design-benchmark.md still carries the old note. -->

# Trial Design Benchmark Pack

**Trevor Robey, INC.** · Citation-traced biomedical research · trevor@trevorobeyinc.com · trevorobeyinc.com

| | |
|---|---|
| **Price** | **$4,950** |
| **Turnaround** | 5 business days after the Agreed Question is confirmed |
| **You send** | One indication, named exactly as you want it searched |
| **You receive** | One sealed ZIP, handed over manually |

## Who it is for

The pack is for biotech R&D and pharma competitive-intelligence teams, typically the Head of CI, SVP R&D Strategy, VP BD/Licensing or CMO. It is built for the moment a new asset is being evaluated, or when a program is moving from Phase 2 to Phase 3.

## What it is

Comparative Phase 3 structure analysis vs **up to 20** comparable programs — allocation, masking, intervention model, arms, enrollment, primary endpoints, sponsor class. Cohort is reported as **N of M eligible** under a stated selection rule; where an indication has fewer than 20 eligible programs the pack covers the **entire** eligible population and says so.

## What you get

- **Benchmark table (Markdown + CSV).** One row per program, each linked to its ClinicalTrials.gov record, plus a structure summary in which every figure carries its own denominator. The table is rendered from the registry records with no language model.
- **Narrative report.** It sets the cohort against published evidence. Every cited identifier is checked against the evidence the run retrieved. Any identifier not found there is tagged `[UNVERIFIED]` in the report and listed in the citation-integrity ledger. A report below the grounded-citation floor does not ship.
- **Citation Integrity & Provenance ledger.** It shows grounded and unverified counts, the retraction screen (Crossref and PubMed) and the grade.
- **Reproducibility manifest.** Every cited PMID, NCT and DOI is re-resolved against its issuing registry at delivery and marked VERIFIED, UNRESOLVED or UNCHECKED. Any UNRESOLVED identifier blocks delivery.
- **Graveyard memo.** For the condition term you name, it walks the registry's terminated, withdrawn and suspended programs, up to a 2,000-record cap, and states whether retrieval was complete. Each entry carries the sponsor's stated stop reason, or "(none stated by sponsor)", and a record link. If that registry query fails, the memo is left out rather than padded.
- **Search-coverage ledger.** It shows every search the research roles ran and what each returned, including searches that returned zero records.
- **checksums.txt.** It holds SHA-256 checksums for the bundle's files.

**Internal proof run (amyotrophic lateral sclerosis, 2026-11-04).** The run benchmarked 20 of 64 eligible Phase 3 programs (Phase 2/3 included). Its narrative report cited 38 identifiers (11 DOI, 20 NCT, 7 PMID; the 20 NCTs are the cohort's own records, which the run fetched itself and the narrative names), and all 38 were grounded in the evidence the run retrieved (ratio 1.0 against the 0.75 floor; grade A). None was flagged `[UNVERIFIED]`, and the retraction screen found no retracted paper. At delivery, all 38 resolved in their issuing registries (38 VERIFIED, 0 UNRESOLVED, 0 UNCHECKED in the reproducibility manifest). The graveyard memo covered 116 of 116 stopped-program records for the condition term. An ALS sample excerpt from this run is available on request.

## How delivery works today

You receive one sealed ZIP containing Markdown, CSV, the citation-integrity ledger, the search-coverage ledger, the reproducibility manifest and checksums.txt. It is handed over manually. There is no API, portal or data-warehouse delivery.

The ZIP is built from the deliverable files only, with a fresh checksums.txt covering exactly those files.

## How to order

Email **trevor@trevorobeyinc.com** with the indication. Name it exactly as you want it searched, because registry condition search is term-based and a different name for the same disease returns a different set.

## Limits

- **The cohort rule is fixed: newest registered start date first.** It favours recent programs, so part of the cohort may not have read out. In the ALS proof run 10 of the 20 were completed and 10 were recruiting or active, not recruiting; 8 of the 20 enrollment figures were sponsor estimates.
- **Comparable means registered for the same condition term at Phase 3 or Phase 2/3.** The pack takes one indication, so the cohort is not filtered by mechanism, modality or line of therapy. The ALS proof-run cohort mixes 15 randomized, parallel-group trials with five single-group studies whose primary endpoints are safety or feasibility, one of them a 15-participant study (NCT05568615).
- **The citation grade covers only the identifiers cited in the narrative report.** The benchmark table and the graveyard memo are grounded by construction and are not graded. The cohort's NCT ids do enter the grade when the narrative cites them, as all 20 did in the proof run.
- **The narrative is model-written and its prose is not graded.** Where the narrative and the benchmark table disagree, rely on the table: it is rendered directly from the registry records, with no language model.
- **A grounded citation means the identifier was retrieved in the run; re-resolution means it resolves to a real record.** A third check at delivery compares the author named beside a cited DOI or PMID with the registry record, wherever that pairing can be read, and marks any mismatch in the report. None of them checks the sentence around a citation, or whether the source's conclusions are right or characterized correctly.
- **Research artifact only.** It is not medical, investment, legal or regulatory advice, and no PHI is hosted, transmitted or processed.

---

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*

Powered by OpenClaw (open-source agent framework).
