# Failed Trial Archaeology: Sample

**SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.**

**Proof run:** the engine's clinical-trial-landscape workflow, input "heart failure" (a trial-landscape, endpoint and competitor report). The engine has no dedicated Failed Trial Archaeology workflow; this sample shows the run's stopped-trial memo, the part of the run that corresponds to this offering.
**Offering:** Failed Trial Archaeology (scope and price are on the companion offer sheet)
**Trevor Robey, INC.** · trevor@trevorobeyinc.com · trevorobeyinc.com

---

## What this answers

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

Before money goes into a program, it helps to know which comparable programs have already stopped and what their sponsors recorded as the reason. Failed Trial Archaeology answers that from the public record, not from memory. Each stopped trial is traced to its ClinicalTrials.gov record by NCT number. Each stop reason is the sponsor's own text, quoted verbatim, or marked "(none stated by sponsor)" when the record has none. Nothing is filled in where the record says nothing. The written report that comes with the memo is checked, identifier by identifier, against the evidence retrieved in the same run.

## 1. This proof run compared with the offering

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

The offering is listed as: *"Structured post-mortem of Phase 2/3 terminations in a single mechanism. NCT-indexed failure pattern matrix."* This proof run does not match that scope. The differences are:

- **Scope.** The run covered a therapeutic area, heart failure. That was the single input to the engine's clinical-trial landscape workflow. The run did not cover a single mechanism.
- **Phases.** The stopped-trial search had no phase filter. Two of its eight records are Phase 2 or Phase 2/Phase 3, and neither was terminated: one is suspended and one was withdrawn. The run's written report mentions one terminated Phase 2/3 trial, PEERLESS-HF (Section 3). No stop reason for that trial appears in this run's outputs.
- **Coverage.** The search was a ClinicalTrials.gov condition search for "heart failure", limited to terminated, withdrawn and suspended records. At the time, the engine asked the registry for a single page of eight records (its default page size then) and listed those eight. That is not every stopped heart-failure trial. Since 2026-07-31 the engine walks the registry's result pages for the search term, up to a 2,000-record guard, and the memo states how many of the registry's own count it lists, or marks the list PARTIAL. This run happened before that change.
- **Mechanism.** The stopped-trial search takes a condition term. This sample does not show how a single-mechanism scope would be applied.
- **Grouping.** The engine renders the stopped trials as a list. The grouping by stated reason in Section 2 was done by hand for this sample. NCT numbers, titles and stop reasons are copied verbatim from the engine's memo; status and phase are the registry's codes reformatted for reading (TERMINATED → Terminated, PHASE2/PHASE3 → Phase 2/Phase 3), and "none recorded" marks the one record with no phase field.

## 2. Failure-pattern excerpt: eight stopped heart-failure records

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

The engine renders the memo without a language model, directly from the ClinicalTrials.gov records it fetched on 2026-07-16. Status and phase are the registry's values, reformatted for reading. Stop reasons are the sponsors' own text, verbatim, with their original capitalisation. Each group reflects only what the stated reason says.

### Recruitment (2)

| Trial | Registry title | Phase | Status | Sponsor's stated stop reason |
|---|---|---|---|---|
| [NCT01549158](https://clinicaltrials.gov/study/NCT01549158) | Single Dose Study to Compare the Pharmacodynamics of Torasemide-PR 10 mg,Torasemide-IR 10 mg and Furosemide-IR 40 mg in Patients With Compensated Heart Failure | Phase 4 | Terminated | "Slow recruitment" |
| [NCT04095416](https://clinicaltrials.gov/study/NCT04095416) | Compression Wraps as Adjuvant Therapy in Management of Acute Systolic Heart Failure | NA | Terminated | "challenges in recruitment due to covid-19" |

### Funding (2)

| Trial | Registry title | Phase | Status | Sponsor's stated stop reason |
|---|---|---|---|---|
| [NCT00825188](https://clinicaltrials.gov/study/NCT00825188) | A Study of the Effects of Eplerenone and Amlodipine on Blood Pressure and Basal Metabolic Rate in Obese Hypertensives | NA | Terminated | "funding to complete was inadequate" |
| [NCT00869869](https://clinicaltrials.gov/study/NCT00869869) | Melatonin Supplementation to Improve Sleep in Patients With Heart Failure | Phase 2 | Withdrawn | "No subjects were enrolled in this study. Funding ran out." |

### Study-specific operational or design reasons (3)

| Trial | Registry title | Phase | Status | Sponsor's stated stop reason |
|---|---|---|---|---|
| [NCT03694431](https://clinicaltrials.gov/study/NCT03694431) | Comparative Trial of Home-Based Palliative Care | NA | Terminated | "Low intervention uptake, lack of substitution of video for home visits, and study sites' decision to expand telehealth use in response to payment changes" |
| [NCT03132441](https://clinicaltrials.gov/study/NCT03132441) | Cardiac Rehab for Advanced Heart Failure-LVAD Candidates | NA | Withdrawn | "Major changes to study that were better suited to creating a whole new study" |
| [NCT02340702](https://clinicaltrials.gov/study/NCT02340702) | Chronic Obstructive Pulmonary Disease (COPD) in Patients Hospitalized for Acute Decompensated Heart Failure. | none recorded | Withdrawn | "Unable to abstract pulmonary function and some other data from medical records." |

### No reason stated (1)

| Trial | Registry title | Phase | Status | Sponsor's stated stop reason |
|---|---|---|---|---|
| [NCT00369044](https://clinicaltrials.gov/study/NCT00369044) | Prednisone for Decompensated Congestive Heart Failure | Phase 2/Phase 3 | Suspended | (none stated by sponsor) |

**What these eight show.** These points rest only on what the stated reasons say:

- Recruitment or enrolment appears in three of the seven stated reasons. Two name recruitment, and one says no subjects were enrolled.
- Funding appears in two of the reasons. One of them is the record with no enrolment.
- None of the seven stated reasons mentions safety or efficacy.
- One sponsor gave no reason.
- Eight unfiltered records are a small slice. These counts describe this slice only, not heart-failure research as a whole.

**Notes on the table.**

- "NA" is the registry's phase value for "not applicable". NCT02340702 has no phase in the fetched record.
- The registry returned NCT00825188 for the condition term "heart failure", but its title describes obese hypertensive patients. It is listed exactly as the registry returned it.
- The proof run also recorded protocol version counts for some of these records. They are left out of this sample. ClinicalTrials.gov has refused the change-history requests they depend on since 2026-10-08, so a deliverable produced today would not contain them.

## 3. Excerpt from the written report

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

The bundle also carries a written report produced by the language-model roles. This excerpt from its first section is quoted exactly as written:

> - **NCT00382863** — PEERLESS-HF, HeartNet Ventricular Support System elastic restraint device (Phase 2/3, TERMINATED).
> - **NCT02686749** — catheter ablation vs medical therapy in AF with impaired LV function (Phase 4, TERMINATED).

How its two citations were checked:

| Identifier | Citation gate, at generation | Re-checked at delivery against ClinicalTrials.gov |
|---|---|---|
| [NCT00382863](https://clinicaltrials.gov/study/NCT00382863) | Grounded: retrieved during this run | VERIFIED, HTTP 200, 2026-07-16 23:30:12 UTC |
| [NCT02686749](https://clinicaltrials.gov/study/NCT02686749) | Grounded: retrieved during this run | VERIFIED, HTTP 200, 2026-07-16 23:30:12 UTC |

- These two terminated trials came from the report's own trial search, a different search from the one behind the stopped-trial memo in Section 2; they were not among the memo's eight records. No stop reason for either appears in this run's outputs, and this sample does not state one.
- The report's later sections call this first step a "prior scout run" and tag its identifiers, including NCT00382863 and NCT02686749, "[PRIOR-RUN — RE-VALIDATE]", asking that they be re-checked before client delivery. That step was the first role of this same run (task-2914df9eae6b1257013d4aba), so the gate counted what it retrieved, and the delivery re-check then VERIFIED both NCT identifiers. The report's wording was not corrected, which is one reason the proof run's bundle is not distributed (Section 5).

## 4. Citation integrity, as recorded

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

**Citation gate, at generation on 2026-07-16.** The gate checks each identifier cited in the written report against the evidence retrieved in that run.

- 47 cited identifiers: 17 PMID, 14 NCT and 16 DOI.
- 47 were grounded and 0 were ungrounded. That is a grounded ratio of 1.0, against a threshold of 0.75. The verdict was PASS, and the ledger grade is A.
- Retraction screen: no cited paper was found to be retracted (0 DOIs, 0 PMIDs). The manifest marks the screen INCOMPLETE, so this run does not claim a complete retraction screen.

**Re-check at delivery, 2026-07-16, 23:30:11 to 23:30:13 UTC.** Each cited identifier was looked up again in the public registry that issued it.

- Of the 47, 36 were VERIFIED, 0 were UNRESOLVED and 11 were UNCHECKED.
- All 14 NCT identifiers and all 16 DOIs resolved, along with 6 of the 17 PMIDs. For the other 11 PMIDs, NCBI returned a rate-limit response (HTTP 429). They are recorded as UNCHECKED and are not counted as verified.
- The recorded delivery decision is DELIVER_WITH_FLAGS, meaning the bundle could ship but was flagged because some identifiers could not be re-checked. The manifest records only this one re-check, and it was not repeated for this sample.

**What these numbers do not cover.**

- A grounded identifier was retrieved during the run, but grounding does not show that the record is relevant. 17 of the 47 are off-topic records cited in the report's second section. That section's searches ran with the wrong search terms, and it cites these records only to show that the results were off-topic. The report itself marks two more as out of scope: a veterinary paper and its DOI.
- The stopped-trial memo in Section 2 is rendered without a language model, straight from the fetched registry records, so it is grounded by construction. It is not counted in the 47 or in the grade, and its eight NCT identifiers were not part of the delivery re-check.
- A re-check confirms that an identifier resolves to a real registry record. It does not confirm that the source's conclusions are correct.

## 5. What the full report contains

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

The proof run's sealed bundle contains, among other files:

- **report.md:** the written report in three sections (source discovery, endpoint and competitor analysis, synthesis) and a citation summary.
- **graveyard-memo.md:** the stopped-trial memo, with eight records in this run.
- **tables.csv:** one row for each cited identifier (47 rows), giving its type, the identifier, the section it came from and the surrounding text.
- **citation-integrity.md:** the citation-integrity ledger.
- **reproducibility-manifest.md** and **.json:** the delivery re-check record for each identifier, with status, HTTP code and timestamp.
- **checksums.txt:** a SHA-256 checksum for each file.

A Failed Trial Archaeology bundle today has the same form: one sealed ZIP, handed over manually. It contains Markdown files (the report and the stopped-trial memo), a CSV, the citation-integrity ledger, a search-coverage ledger, the reproducibility manifest and checksums.txt. This proof run's bundle does not include a search-coverage ledger.

The proof run's own bundle is not distributed. Its generated cover files predate later corrections to their wording, and this sample quotes only the parts checked against the run's records.

## 6. Limits

*SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.*

- This is an internal proof run. No client commissioned it, and no client question shaped it.
- Its scope differs from the offering's in four ways (Section 1): it covered a therapeutic area rather than a mechanism, it had no phase filter, it listed one page of eight stopped records with no registry count, and its failure-pattern grouping was done by hand rather than generated by the engine.
- The report's second section records a retrieval fault. Its live searches ran with generic terms ("mechanism", "endpoints") instead of "heart failure" and returned off-topic records. The section says so and does not present those records as heart-failure evidence.
- The report's second and third sections describe the first section's findings as a "prior scout run" and recommend re-running the searches before client delivery. The first section was this run's own first step (task-2914df9eae6b1257013d4aba in the run record), and the gate counted its identifiers as retrieved in this run; the "prior run" wording is an error in this proof run's report text (Section 3).
- Two of the report's planned literature sources returned nothing: Semantic Scholar returned an error and no Europe PMC result reached the first step.
- Stop reasons are what sponsors entered in the registry. They are not independently checked, they can be brief or incomplete, and a registry record can change after the date it was fetched.
- Condition search works on the search term. A different name for the same condition returns a different set of records.
- The stopped-trial memo depends on ClinicalTrials.gov responding at generation time. If the registry does not respond, the memo is left out, or marked partial if retrieval stops part-way. It is never filled in from memory.
- This is a research artifact only. It is not medical, investment, legal or regulatory advice, and it is not validated for clinical decision support. No protected health information is used or processed.

---

**SAMPLE — excerpt from an internal proof run on 2026-07-16, not a client deliverable.**

Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.

trevor@trevorobeyinc.com · trevorobeyinc.com · Powered by OpenClaw (open-source agent framework).
Registry data: ClinicalTrials.gov, U.S. National Library of Medicine.
