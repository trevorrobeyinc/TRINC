# 04 — Trust: citation integrity

> The gates are the product. A report reaches a customer only if it passes all of them.
> [src: `HOW-IT-WORKS.md` §4]

## The checks, in the order they run

| # | Check | What it does | What fails it |
|---|---|---|---|
| 1 | **Zero-fabrication instruction** | Every role is told never to invent a PMID, NCT or DOI and to write `[no verifiable citation found]` instead. | — (an instruction, not a check) |
| 2 | **Grounding gate** | Every identifier cited in the assembled report is compared with the identifiers actually retrieved during the run. A match is "grounded"; a miss is "ungrounded" and is marked `[UNVERIFIED]` inline. | Below **75%** grounded → `UNVERIFIED`; nothing retrieved at all → `INSUFFICIENT_EVIDENCE`; no citations → `NO_CITATIONS`. Only `PASS` ships. The 75% floor is read fail-closed: a missing setting means the strict value. |
| 3 | **Retraction screen** | Cited DOIs are checked against Crossref, cited PMIDs against PubMed, and every DOI is also mapped to its PMID and checked in PubMed. | Any retracted paper → hard stop (`RETRACTED`). |
| 4 | **Re-resolution when the report is assembled** | Every cited PMID, PMCID, NCT, ISRCTN and EudraCT number, DOI, PubChem CID, UniProt accession and ChEMBL id is looked up again at the registry that issued it (NCBI, ClinicalTrials.gov, the ISRCTN registry, the EU Clinical Trials Register, Crossref, PubChem, UniProt, ChEMBL) and stamped VERIFIED, UNRESOLVED or UNCHECKED in the reproducibility manifest; the bundle states the date. | Any UNRESOLVED id → `BLOCK`. `DELIVER` needs 100% VERIFIED; otherwise `DELIVER_WITH_FLAGS`. |
| 5 | **Shipment licence check** | Content from sources the business holds no redistribution licence for is refused at packaging. | A banned source name or id anywhere in the bundle. |

[src: `ENGINE/CLAUDE.md` → "Citation Integrity Layer" and "Instructions must not contradict the shipment gate";
`ENGINE/SYSTEM-REALITY.md` → "GAP CLOSED"]

## What the customer can check for themselves

Every bundle seals these files beside the report, and **code, not a model, writes them**:

- **`citation-integrity.md`**: a grade from the grounded ratio (A/B/C/D; F and BLOCKED on any retraction;
  N/A if nothing is cited).
- **`graveyard-memo.md`**: earlier terminated, withdrawn or suspended programs in the indication, each with
  the sponsor's own stated stop reason — or "(none stated by sponsor)", never an invented one — and a link to
  the trial.
- **`search-coverage.md`**: every search the run made and what each returned. A search that honestly found
  nothing is listed apart from a source that could not be reached, because "zero results" and "failed" are
  different facts. A zero-evidence run still ships this ledger rather than a padded report.
- **`reproducibility-manifest.md`**: how every cited PMID, NCT and DOI re-resolved, with HTTP status, URL and
  time.
- For the trial-design benchmark: **`design-benchmark.md` / `.csv`**, a comparison matrix rendered straight
  from registry records.
- **`checksums.txt`**: one checksum per file, so any later change is detectable.

[src: `ENGINE/OFFERINGS.md` → "Bundle deliverables"; `ENGINE/CLAUDE.md` → "Integrity-driven deliverables"; `HOW-IT-WORKS.md` §5]

## The exhibit: run #6 (2026-10-08)

| Check | Result |
|---|---|
| Grounding | **PASS**, 44 of 45 cited ids grounded (0.978 against a 0.75 floor); 102 ids retrieved |
| Retraction screen | checked; 14 DOIs and 10 PMIDs; **0 retracted** |
| Re-resolution | **45 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED** of 45 → **DELIVER** |
| Graveyard memo | complete retrieval: **1,412 of 1,412** stopped-trial records for the condition query "non-small cell lung cancer" (complete for that term; another name for the disease returns a different set) |
| Benchmark | **20 of 675** eligible Phase 3 programs, every row linked to its ClinicalTrials.gov record |
| Search coverage | 17 searches, 14 sources, 101 records, 1 honest zero (stated, not hidden) |

[src: `ENGINE/workspace/workflows/workflow-6cc2f82cbced588b04c4d135/` *(on disk, not in git)*]

Note the one ungrounded citation, DOI `10.3389/fonc.2024.1422160`. The gate passed the report and marked
that citation `[UNVERIFIED]` in the annotated report instead of hiding it. Re-resolution then found the DOI
is real (VERIFIED at Crossref). **"Ungrounded" does not mean "fake"**: it means the model cited something
the run did not retrieve, so the run itself cannot vouch for it. The two checks answer different questions
(*did we read it?* versus *does it exist?*), which is why both run. [src: run #6 `citation-verification.json`
→ `ungrounded_list`; `reproducibility-manifest.md`; `report-annotated.md` *(on disk, not in git)*]

## Approved wording (use these, word for word or very close)

- "Every cited paper and trial checked twice, against the evidence retrieved and at its registry, with
  retractions screened and anything unconfirmed flagged. Audit trail included."
  [src: `ENGINE/OFFERINGS.md`, elevator]
- "Every cited identifier is checked against the evidence retrieved for the report, and one not found there
  is flagged `[UNVERIFIED]` at every mention; if the evidence isn't there, the report says so rather than
  inventing a result." [src: `ENGINE/OFFERINGS.md` → Brand Commitments]
- "Every cited PMID, PMCID, NCT, ISRCTN and EudraCT number, DOI, PubChem CID, UniProt accession and ChEMBL id
  is re-resolved against its issuing public registry when the report is assembled, and the bundle states the
  date." [src: `ENGINE/OFFERINGS.md` → Citation-Integrity Gate; `ENGINE/SYSTEM-REALITY.md` → "Honest framing"]
- "A claim without a verifiable identifier fails a gate rather than passing with a warning."
  [src: `ENGINE/01-brand-system/brand-identity-2026-07-29.md` §1]

## The bounds (every pitch keeps these)

1. **Re-resolution proves an identifier points at a real record. It does not prove the source's
   conclusions are correct.**
2. An identifier with no definite answer is reported **UNCHECKED**, never VERIFIED.
3. The gates cover only sections cited to identifier types the engine recognises. **Patent evidence is
   outside the gate today** (a patent number matches none of the recognised types), so a patent section
   would say "patent evidence, outside the citation gate" on its face.
4. The deterministic memos (graveyard, search coverage) are grounded by construction but are **not counted**
   in the grade.
5. A hand-assembled deliverable that never ran through the engine claims none of this.

[src: `ENGINE/SYSTEM-REALITY.md` → "GAP CLOSED"; `ENGINE/OFFERINGS.md` → Brand Commitments, scope]

> ⚠ **Do not soften re-resolution to "grounding only".** That was true before 2026-07-10 and is now a false
> understatement. [src: `ENGINE/SYSTEM-REALITY.md`, copy-sweep warning]

## The business lane's identifiers and their limits

| Id | What it is | What re-resolution proves |
|---|---|---|
| `WEB: <12 hex>` | A stored snapshot of the exact page text the model saw | **Exactly what was read, from which URL and when.** Not that the page is correct or still online. |
| `SEC: <cik>/<accession>` | An SEC EDGAR filing | The filing exists |
| `WB: <indicator>` | A World Bank indicator | The indicator exists |
| `BLS:` / `EUROSTAT:` (`CENSUS:` / `EIA:` dormant) | Official statistics series | **The series, not the value.** Agencies revise values; the report shows the value as published on the retrieval date. |
| DOI (via OpenAlex) | A published work | The DOI resolves |

Pages behind a paywall or that need JavaScript to show their text are skipped.
[src: `ENGINE/OFFERINGS.md` → "Business research (any field)", guarantee scope; `ENGINE/docs/business-research-lane.md` → identifiers and "Limits to keep in the copy"]

## What is paused

**The amendment-risk band** (LOW/MODERATE/HIGH, from how often a trial's protocol was amended) is not
produced: ClinicalTrials.gov has refused the change-history requests it needs with HTTP 403 since
2026-10-08, and the engine does not try to get around the refusal. The memo says "Not available for this
run". **Do not sell the band.** [src: `ENGINE/OFFERINGS.md` → Bundle deliverables; `ENGINE/CLAUDE.md`]
