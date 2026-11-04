**SAMPLE — excerpt from an internal proof run on 2026-11-04, not a client deliverable.**

# Trial Design Benchmark Pack — Sample: Amyotrophic Lateral Sclerosis

**Trevor Robey, INC.** · Citation-traced biomedical research
**Indication:** amyotrophic lateral sclerosis (ALS) · **Proof run:** 2026-11-04 (UTC)
**Contact:** trevor@trevorobeyinc.com · trevorobeyinc.com

Quoted blocks, the table rows in sections 3 and 8, and the per-source counts in section 7 are excerpted from the files that one internal proof run produced. They are shortened only by omission, never rewritten. Every other count in this sample was read or tallied by us from the run's own files: the benchmark CSV, the graveyard memo, the gate record and the reproducibility manifest. Counts that combine several rows or files are marked "tallied for this sample". Section notes, the "What it is" column in section 7 and the limits in section 10 are our commentary. Nothing was re-run for this sample.

---

## 1. What this pack answers

How are the comparable Phase 3 programs in your indication built? The pack lays out allocation, masking, intervention model, arm count, enrollment, primary endpoints with their timeframes, and sponsor class, program by program. It also lists the programs registered for the indication that were stopped, with the sponsor's own stated reason. The structure table and the stopped-program memo are rendered straight from ClinicalTrials.gov records, with no language model writing any cell. A model-written narrative report then sets the cohort against published evidence. Every identifier that report cites is checked against the evidence the run actually retrieved, and every cited DOI and PMID is screened for retractions. At delivery, each cited PMID, NCT and DOI is also re-resolved against its issuing public registry.

## 2. The cohort rule, as the run stated it

> **Cohort: 20 of 64 eligible Phase 3 program(s)** registered on ClinicalTrials.gov for **amyotrophic lateral sclerosis**. Every row resolves to a real NCT record.
>
> **Selection rule.** Phase 3 (including Phase 2/3 combination) programs registered for the indication, status in {COMPLETED, ACTIVE_NOT_RECRUITING, RECRUITING, ENROLLING_BY_INVITATION}, ordered by start date descending; the N most recent of M eligible. (sort: `StartDate:desc`)

Both numbers count registered trial records, not patients. Here is what the rule produced in this run (tallied for this sample from the pack's CSV). Registered start dates run from 2020-10-29 to 2026-02-25.

- **Status:** COMPLETED 10 · RECRUITING 6 · ACTIVE_NOT_RECRUITING 4.
- **Phase:** PHASE3 9 · PHASE2/PHASE3 11.
- **Sponsor class:** INDUSTRY 13 · OTHER 7.
- **Enrollment type:** ACTUAL 12 · ESTIMATED 8.

---

**SAMPLE — excerpt from an internal proof run on 2026-11-04, not a client deliverable.**

## 3. Benchmark table — excerpt (12 of 20 programs)

These rows were rendered deterministically from the ClinicalTrials.gov records retrieved during the run. They appear in the run's order (newest start date first). These 12 were chosen to show a mix of statuses and sponsor classes; the other 8 are in the full table. The Start and In-summary columns come from the pack's CSV, whose record-link column is the link on each NCT; every other cell is copied from the pack's table.

| NCT | Start | Phase | Status | Sponsor (class) | Allocation | Model | Masking | Arms | Enrollment (type) | Primary endpoint(s) | Primary completion | In summary |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [NCT07410806](https://clinicaltrials.gov/study/NCT07410806) | 2026-02-25 | PHASE2/PHASE3 | ACTIVE_NOT_RECRUITING | Merit E. Cudkowicz, MD (OTHER) | RANDOMIZED | PARALLEL | QUADRUPLE | 2 | 240 (ESTIMATED) | Disease Progression (Baseline to 36 Weeks) | 2027-07-01 | yes |
| [NCT07322003](https://clinicaltrials.gov/study/NCT07322003) | 2026-02-01 | PHASE3 | RECRUITING | Prilenia (INDUSTRY) | RANDOMIZED | PARALLEL | QUADRUPLE | 2 | 500 (ESTIMATED) | Change from baseline through Week 26 and Week 48 in the Revised ALS Functional Rating Scale (ALSFRS-R) total score adjusted for mortality (Baseline to Week 48) | 2028-03 | yes |
| [NCT06719947](https://clinicaltrials.gov/study/NCT06719947) | 2025-11-28 | PHASE2/PHASE3 | RECRUITING | Universidade Federal do Rio Grande do Norte (OTHER) | RANDOMIZED | PARALLEL | QUADRUPLE | 2 | 80 (ESTIMATED) | Cortical excitability assessed via TMS (From the date of randomization (1 week before the start of the intervention) up to 6 months (follow-up)); Cortical tissue oxygenation (From the date of randomization (1 week before the start of the intervention) up to 6 months (follow-up)); Electromyographic activity of specific respiratory muscles (From the date of randomization (1 week before the start of the intervention) up to 6 months (follow-up)) | 2027-12 | yes |
| [NCT06126315](https://clinicaltrials.gov/study/NCT06126315) | 2025-03-26 | PHASE2/PHASE3 | RECRUITING | Mario Negri Institute for Pharmacological Research (OTHER) | RANDOMIZED | PARALLEL | QUADRUPLE | 3 | 246 (ESTIMATED) | self-sufficient (48 weeks) | 2027-04 | yes |
| [NCT04220190](https://clinicaltrials.gov/study/NCT04220190) | 2025-01-02 | PHASE2/PHASE3 | RECRUITING | Rapa Therapeutics LLC (INDUSTRY) | NA | SINGLE_GROUP | NONE | 1 | 41 (ESTIMATED) | In the expansion cohort enrolling standard-risk pwALS, determine the feasibility and safety of the highest established safe dose of RAPA-501 (80 x 10^6 cells per infusion). (Through 30 Weeks On-Study) | 2027-07-01 | yes |
| [NCT05842941](https://clinicaltrials.gov/study/NCT05842941) | 2023-05-24 | PHASE2/PHASE3 | COMPLETED | Merit E. Cudkowicz, MD (OTHER) | RANDOMIZED | PARALLEL | QUADRUPLE | 2 | 249 (ACTUAL) | Disease Progression as Assessed by the ALSFRS-R-Slope (Baseline to 24 Weeks); Mortality Event Rate (Baseline to 24 weeks) | 2024-10-29 | yes |
| [NCT05619783](https://clinicaltrials.gov/study/NCT05619783) | 2022-12-29 | PHASE3 | COMPLETED | Amylyx Pharmaceuticals Inc. (INDUSTRY) | NA | SINGLE_GROUP | NONE | 1 | 352 (ACTUAL) | To assess the Incidence of Treatment-Emergent Adverse Events during treatment with AMX0035 (108 weeks) | 2024-10-16 | yes |
| [NCT05178810](https://clinicaltrials.gov/study/NCT05178810) | 2021-10-18 | PHASE3 | COMPLETED | Ferrer Internacional S.A. (INDUSTRY) | RANDOMIZED | PARALLEL | QUADRUPLE | 2 | 313 (ACTUAL) | Change From Baseline in Amyotrophic Lateral Sclerosis Functional Rating Scale - Revised (ALSFRS-R) Score After 48 Weeks. (48 weeks) | 2023-10-26 | yes |
| [NCT04768972](https://clinicaltrials.gov/study/NCT04768972) | 2021-06-14 | PHASE3 | ACTIVE_NOT_RECRUITING | Ionis Pharmaceuticals, Inc. (INDUSTRY) | RANDOMIZED | PARALLEL | DOUBLE | 2 | 89 (ACTUAL) | Change from Baseline (Day 1) through Study Day 505 in Part 1 in functional impairment (Baseline, Day 505 in Part 1) | 2026-06-17 | yes |
| [NCT04856982](https://clinicaltrials.gov/study/NCT04856982) | 2021-05-17 | PHASE3 | ACTIVE_NOT_RECRUITING | Biogen (INDUSTRY) | RANDOMIZED | PARALLEL | TRIPLE | 4 | 158 (ACTUAL) | Part B: Time to Emergence of Clinically Manifest ALS (Up to 5.6 years) | 2027-08-07 | yes |
| [NCT04745299](https://clinicaltrials.gov/study/NCT04745299) | 2021-02-24 | PHASE3 | COMPLETED | Corestemchemon, Inc. (INDUSTRY) | RANDOMIZED | PARALLEL | QUADRUPLE | 3 | 123 (ACTUAL) | Joint rank scores (CAFS, Combined Assessment of Functional and Survival) (at 12 months, and 6 months) | 2024-10-03 | yes |
| [NCT04615923](https://clinicaltrials.gov/study/NCT04615923) | 2020-12-18 | PHASE2/PHASE3 | COMPLETED | Merit E. Cudkowicz, MD (OTHER) | RANDOMIZED | PARALLEL | QUADRUPLE | 2 | 163 (ACTUAL) | Disease Progression as Assessed by the ALSFRS-R Total Score (Baseline to 24 Weeks); Mortality Event Rate (Baseline to 24 Weeks) | 2022-07-14 | yes |

## 4. Structure summary over all 20 programs, as the pack prints it

> - **Randomized:** 15 of 20 reporting an allocation.
> - **Masking** (of 20 reporting): QUADRUPLE — 12; NONE — 5; DOUBLE — 2; TRIPLE — 1.
> - **Most common intervention model:** PARALLEL (15 of 20 reporting).
> - **Median enrollment:** 162 participants (over 20 of 20 programs reporting a non-zero count; range 15–500).
> - **Median arm count:** 2 (over 20 of 20 reporting arms).
>
> **Most frequent primary endpoint measures** (sponsor free-text, grouped case-insensitively; the most common spelling is shown):
>
> - Mortality Event Rate — 4 program(s)
> - Disease Progression as Assessed by the ALSFRS-R-Slope — 2 program(s)
> - Disease Progression — 1 program(s)
> - Change from baseline through Week 26 and Week 48 in the Revised ALS Functional Rating Scale (ALSFRS-R) total score adjusted for mortality — 1 program(s)
> - Cortical excitability assessed via TMS — 1 program(s)

Two things to know when reading these lines (both tallied for this sample from the pack's CSV). The median enrollment of 162 combines 12 ACTUAL counts with 8 ESTIMATED ones. Endpoint names are grouped by their text, ignoring only case and spacing, so "ALSFRS-R-Slope" (2 programs) and "ALSFRS-R Slope" (1 program, NCT05136885) are counted separately. The pack prints five measures.

---

**SAMPLE — excerpt from an internal proof run on 2026-11-04, not a client deliverable.**

## 5. Narrative report — excerpt

The narrative report is written by the engine's language models from the evidence the run retrieved. The gate checks the identifiers it cites against that evidence; it does not check the prose (sections 6 and 10). Where the run found nothing to cite, the report says so in place: it carries five "[no verifiable citation found in the retrieved evidence]" markers rather than a reference (tallied for this sample). The three passages below are reproduced word for word, citations included, and shortened only where marked […]. In the first, the report wraps each NCT id in note-link brackets ([[…]]); those brackets are left out here, and nothing else is changed.

> Of the 20 retrieved programs, **13 are INDUSTRY-sponsored** and **7 are OTHER (academic / individual investigator)**.
>
> - **INDUSTRY (13):** Prilenia (NCT07322003), Shanghai Zhimeng Biopharma (NCT07082192), Coya Therapeutics (NCT07161999), Rapa Therapeutics (NCT04220190), Amylyx Pharmaceuticals (NCT05619783 and NCT04516096), Shionogi (NCT05568615 and NCT04577404), Ferrer Internacional (NCT05178810), Ionis Pharmaceuticals (NCT04768972), Biogen (NCT04856982), Corestemchemon (NCT04745299), and AB Science (NCT03127267).
> - **OTHER (7):** Merit E. Cudkowicz, MD sponsors five […] trials (NCT07410806, NCT05842941, NCT05740813, NCT05136885, NCT04615923); the Universidade Federal do Rio Grande do Norte (NCT06719947) and the Mario Negri Institute for Pharmacological Research (NCT06126315) each sponsor one.

> **Five single-group open-label records carry no control arm and no masking (NONE):** the Rapa Therapeutics autologous T-stem-cell program (NCT04220190), the two Amylyx AMX0035 programs (NCT05619783, NCT04516096), and the two Shionogi MT-1186 programs (NCT05568615, NCT04577404). These are safety/tolerability-oriented designs rather than controlled efficacy trials […]

> The 2026 *JAMA* ALS reference (PMID: 42348198; doi: 10.1001/jama.2026.9755) is listed in the European PMC live results but returned without abstract in this retrieval; its content could not be used to supplement the mortality endpoint precedent. [DATA LIMITATION: abstract not retrieved for PMID: 42348198.]

The first two passages can be checked against the benchmark CSV, NCT by NCT. The sponsors and sponsor classes in the first, and the sponsors and design fields in the second, match the CSV for every NCT id named (checked for this sample); drug names are not CSV fields. Every identifier in the three passages is listed as VERIFIED in the run's reproducibility manifest (section 6). VERIFIED means the identifier resolves in its registry. It does not confirm the sentence that cites it.

## 6. Citation integrity — what was checked, and when

| Check | Result | When |
|---|---|---|
| Identifiers cited in the narrative report | 38 (11 DOI · 20 NCT · 7 PMID) | At the gate, during the 2026-11-04 run |
| Found in the evidence retrieved during the run (grounded) | 38 of 38 (ratio 1.0; the gate's minimum is 0.75), checked against the 101 identifiers extracted from that evidence | At the gate |
| Not found; tagged `[UNVERIFIED]` in the report | 0 | At the gate |
| Gate verdict · integrity grade | PASS · A | At the gate |
| Retraction screen (Crossref for DOIs, PubMed for PMIDs, with a DOI→PMID cross-check) | Checked: 11 DOIs and 7 PMIDs; retracted: 0 | At the gate |
| Re-resolved against the issuing registry (ClinicalTrials.gov for NCT, NCBI E-utilities for PMID, Crossref for DOI) | 38 VERIFIED · 0 UNRESOLVED · 0 UNCHECKED of 38 (NCT 20 of 20 · PMID 7 of 7 · DOI 11 of 11, tallied for this sample from the manifest's rows) | At delivery, 2026-11-04, 12:54:28–12:54:32 UTC |
| Delivery decision | DELIVER | 2026-11-04 |

**What the gate covers.** The gate grades the identifiers cited in the model-written narrative report against the evidence retrieved in that same run. Of the 38, 20 are the cohort's own NCT records (tallied for this sample by matching the manifest against the CSV): the narrative names them, and the run fetched them itself, so they are grounded automatically. The other 18 are literature identifiers (11 DOI, 7 PMID), and all 18 were found in the retrieved evidence.

**What carries no grade.** The benchmark table and the graveyard memo are rendered from registry records with no language model, so they carry no citation-integrity grade of their own. The table's scope note in this run's `design-benchmark.md` says the grade "scores the narrative report's cited claims, and no identifier below was counted in it". For this run both halves of that note are wrong. The grade scores cited identifiers, not claims (see below). And all 20 of the table's NCT ids were counted in it, because the narrative cites them, as the table above shows. Every table and memo row links to its registry record, so each can be checked directly.

**What neither check covers.** The gate confirms that a cited identifier was retrieved in the run. It does not check the sentence around it, the author names, or how a source is characterized. Re-resolution confirms that each identifier exists in its issuing registry, not that the source's conclusions are correct.

## 7. Search coverage

> **Coverage:** 17 search(es) across 14 source(s) · 110 record(s) retrieved · 1 returned zero · 2 failed (source unreachable).

| Source (as recorded) | What it is | Searches | Records | Zero-result | Failed |
|---|---|---:|---:|---:|---:|
| `ctgov_design_benchmark` | ClinicalTrials.gov, Phase 3 cohort query | 1 | 20 | 0 | 0 |
| `ctgov_stopped_trials` | ClinicalTrials.gov, stopped-program query, as passed to the narrative roles | 1 | 8 | 0 | 0 |
| `DOAJ_search_articles` | Directory of Open Access Journals | 1 | 6 | 0 | 0 |
| `europepmc_preprints` | Europe PMC preprints | 1 | 6 | 0 | 0 |
| `EuropePMC_search_articles` | Europe PMC articles | 1 | 6 | 0 | 0 |
| `findTool` | Tool-catalogue search; returns tool descriptions, not literature or trial records | 1 | 10 | 0 | 0 |
| `obsidian_prior_research` | The firm's own prior-research notes (context only) | 2 | 6 | 0 | 0 |
| `openalex_literature_search` | OpenAlex | 1 | 8 | 0 | 0 |
| `opentargets_disease_intel` | Open Targets Platform, disease evidence | 1 | 9 | 0 | 0 |
| `PubMed_search_articles` | PubMed | 2 | 15 | 0 | 0 |
| `research_memory_priors` | The firm's own prior-research memory (context only) | 1 | 0 | 1 | 0 |
| `search_clinical_trials` | ClinicalTrials.gov search | 1 | 10 | 0 | 0 |
| `sec_edgar_disclosures` | SEC EDGAR filing search (filing metadata) | 1 | 6 | 0 | 0 |
| `SemanticScholar_search_papers` | Semantic Scholar | 2 | 0 | 0 | 2 |

The ledger is rendered with no language model, straight from the run's search log, and it records zero-result and failed searches rather than hiding them. **Both Semantic Scholar searches failed.** The ledger classes a failure as a transport error (timeout, rate limit or outage), so it is inconclusive: it is not evidence that no relevant papers exist, and Semantic Scholar contributed nothing to this run. The two prior-research sources and the SEC filing search are used only as context and cannot ground a citation, and `findTool` returns tool descriptions. The 8 stopped-program records above are what the narrative roles were given; the memo in section 8 is rendered from the full registry walk for the condition term.

[DECIDE: client-data reuse. In this run the prior-research read-back returned 6 records from the firm's own notes. State whether a client's deliverable is excluded from prior-research read-back and memory ingest, and put the same answer in the contract. Resolve before this sample goes out.]

---

**SAMPLE — excerpt from an internal proof run on 2026-11-04, not a client deliverable.**

## 8. Graveyard memo — excerpt

The memo lists the programs registered for the condition term "amyotrophic lateral sclerosis" that were terminated, withdrawn or suspended. Each entry gives the stop reason the sponsor reported, or "(none stated by sponsor)" where there is none, never a filled-in reason, plus a link to the record. It records what each sponsor reported. The run recorded its retrieval as follows:

> **Complete retrieval for the ClinicalTrials.gov condition query "amyotrophic lateral sclerosis": 116 of 116 record(s).**

Tallied for this sample from the memo: of the 116 entries, 74 are terminated, 35 withdrawn and 7 suspended, and 11 read "(none stated by sponsor)". The memo covers every stopped study registered for the term, including observational studies and registries; 23 entries list no phase. 18 entries are Phase 3 or Phase 2/3, all of them terminated, and one of those 18 states no reason. The table shows 10 of the 18, chosen to show a range of stated reasons and listed in memo order. Titles and stop reasons are verbatim.

| NCT | Status · Phase | Registered title | Sponsor-stated stop reason |
|---|---|---|---|
| [NCT04248465](https://clinicaltrials.gov/study/NCT04248465) | TERMINATED · PHASE3 | An Efficacy and Safety Study of Ravulizumab in ALS Participants | The IDMC recommended the study be discontinued due to lack of efficacy with ravulizumab. |
| [NCT01016522](https://clinicaltrials.gov/study/NCT01016522) | TERMINATED · PHASE3 | Safety and Tolerability of the Ketogenic Diet in Amyotrophic Lateral Sclerosis (ALS) | (none stated by sponsor) |
| [NCT04569084](https://clinicaltrials.gov/study/NCT04569084) | TERMINATED · PHASE3 | Efficacy and Safety Study of Oral Edaravone Administered in Subjects With ALS | Futility was met. |
| [NCT04944784](https://clinicaltrials.gov/study/NCT04944784) | TERMINATED · PHASE3 | A Study to Evaluate the Efficacy and Safety of Reldesemtiv in Patients With Amyotrophic Lateral Sclerosis (ALS) | The DMC recommended the trial be discontinued due to futility following a planned second interim analysis. |
| [NCT01583088](https://clinicaltrials.gov/study/NCT01583088) | TERMINATED · PHASE3 | Early Stage Amyotrophic Lateral Sclerosis Phrenic Stimulation | in the absence of benefits and because of a statistically significant excess mortality in the group of patients receiving active stimulation. |
| [NCT00818389](https://clinicaltrials.gov/study/NCT00818389) | TERMINATED · PHASE2/PHASE3 | Study to Investigate the Safety and Efficacy of Lithium in Volunteers With Amyotrophic Lateral Sclerosis (ALS) | NINDS DSMB recommended trial be terminated for futility after reviewing an interim analysis of 84 subjects. |
| [NCT00839033](https://clinicaltrials.gov/study/NCT00839033) | TERMINATED · PHASE3 | Evaluation of a Mechanical Device During Acute Respiratory Failure in Patients With Neuromuscular Disorders | No inclusion |
| [NCT06008249](https://clinicaltrials.gov/study/NCT06008249) | TERMINATED · PHASE3 | Platform Trial to Assess the Efficacy of Multiple Drugs in Amyotrophic Lateral Sclerosis (ALS) | The planned interim analysis showed no survival benefit of taking the drug when compared with placebo. |
| [NCT05193994](https://clinicaltrials.gov/study/NCT05193994) | TERMINATED · PHASE3 | Triumeq in Amyotrophic Lateral Sclerosis | A planned interim analysis resulted in the recommendation that the trial be stopped. The results showed no benefit of Triumeq for people with ALS compared with placebo on survival, the primary outcome measure. |
| [NCT05866926](https://clinicaltrials.gov/study/NCT05866926) | TERMINATED · PHASE3 | Study to Investigate the Long-term Safety of FAB122 in Patients With Amyotrophic Lateral Sclerosis | After the analysis of the main ADORE study it is concluded that there is no clinical benefit for the patients. |

## 9. What the full pack contains

The full pack is one sealed ZIP, handed over manually, with these files:

- `report.md`: the full narrative report, with its closing citation summary. An identifier not found in the run's evidence is tagged `[UNVERIFIED]` inline; this run had none.
- `design-benchmark.md` and `design-benchmark.csv`: all 20 programs with the structure summary. The CSV adds each program's start date and record link.
- `graveyard-memo.md`: all 116 stopped-program entries for the condition term, each with the sponsor's stated stop reason or "(none stated by sponsor)" and a record link. Its closing section states that protocol version history was not available for this run, so the memo gives no protocol-change signal.
- `tables.csv`: an index of the 38 cited identifiers with type and context.
- `citation-integrity.md`: the graded Citation Integrity & Provenance ledger.
- `search-coverage.md`: every search the research roles ran and what each returned, zero results and failures included.
- `reproducibility-manifest.md` and `reproducibility-manifest.json`: for every cited PMID, NCT and DOI, the re-resolution status, HTTP code, resolved URL and UTC timestamp.
- `checksums.txt`: SHA-256 checksums for the files above.

[DECIDE: buyer ZIP contents. The proof run's release bundle also carries files that must not reach a buyer: `store-copy.md` (marketplace copy whose sources list names a database the Deliverable excludes), `sample-preview.md`, `evidence-appendix.md`, `private-delivery-note.md`, `delivery-manifest.json`, `submission-metadata.json`, `offer.json`, `metadata.json`, `manifest.json`, `release-notes.md`, `release-approval.json` (a Datarade platform approval), `submission/` (Datarade listing files) and `submission-evidence/`, and its `checksums.txt` covers them. Before first send, build the buyer ZIP with only the files listed above and regenerate `checksums.txt` for them, or rebuild the packaging so those files never enter a buyer bundle. Two files in the list above also carry wrong or internal text; fix both before first send. (1) `design-benchmark.md`: its "Citation-integrity scope" note says the grade scores the narrative's claims and counted none of the table's identifiers, both wrong for this run (section 6). Fix the text in the generator, `openclaw-bridge/monetization/design-benchmark.js:166`, so it says the grade scores cited identifiers, not claims, and that cohort NCT ids enter the grade when the narrative cites them (for example: "The table itself is not graded; any of its NCT ids that the narrative cites are counted in the narrative's grade."). Then regenerate this run's file and update section 6 of this sample. (2) `report.md`: (a) it credits the fetch of the ClinicalTrials.gov records to ToolUniverse (report.md:25, :167, :257), while the order form says the Deliverable credits ClinicalTrials.gov (sow-template.md:89); the model copied that label from the fetcher text in `openclaw-bridge/core/tool-prefetch.js:310` ("Source: ToolUniverse SMCP") and the `tooluniverse://` path at :315, so fix it there, not in the packager; (b) internal labels: the tier line (:4), an internal source id (:5), "Research Output" section titles (:13-15, :21, :55, :159), task-id lines (:23, :57, :161), "Doc 5" / "Doc 12" references (:50, :63, :125, :133) and note-link markup `[[…]]` (for example :179-180, :238); (c) :253 says the prior vault and research-memory context "returned no results", but `search-coverage.md:17` in the same ZIP records 6 prior-research records; (d) :146-147 credit the 2022 Lancet and 2017 NEJM ALS reviews to "Chio et al." and "Paganoni et al.". Both are CONFIRMED misattributions (checked 2026-11-04): Crossref gives 10.1016/s0140-6736(22)01272-7 as Feldman et al., Lancet 2022, and NCBI gives 10.1056/NEJMra1603471 (PMID 28700839) as Brown & Al-Chalabi, NEJM 2017. The DOIs are real, retrieved and resolve, so neither the gate nor re-resolution caught the wrong author names; (e) :218 lists among "the largest completed-accrual controlled trials" an ESTIMATED enrollment that is still recruiting (NCT03127267) and a single-group study with no control arm (NCT05619783). For this proof run, edit or regenerate `report.md`. Until those defects are corrected or disclosed on the report's face, do not share run #7's `report.md` as a full sample, and do not attach the proof-run ZIP to any outbound email.]

[DECIDE: the shipped graveyard memo's opening paragraph contains a sentence telling the reader how to use the memo in funding decisions, which reads as investment advice. Replace that sentence in the memo generator (`openclaw-bridge/monetization/graveyard-memo.js:98`) with neutral wording, for example "It records what each sponsor reported; it is not advice.", then regenerate this run's memo. Resolve before this sample goes out or any buyer ZIP is built.]

---

**SAMPLE — excerpt from an internal proof run on 2026-11-04, not a client deliverable.**

## 10. Limits, stated plainly

- **The cohort is newest-first.** The rule takes the most recent programs by registered start date: here 20 of 64 eligible. In this run 10 of the 20 are completed; the other 10 are recruiting (6) or active, not recruiting (4). 8 of the 20 enrollment figures are sponsor estimates, and 9 of the 20 primary completion dates fall after the 2026-11-04 run date, so those are the sponsor's planned dates (all tallied for this sample from the pack's CSV). The cohort shows current design practice; it is not a set of programs that have all read out.
- **Registry fields are the sponsor's own entries** as of the retrieval date. Endpoint names are grouped by their text, ignoring only case and spacing, so one endpoint can appear under several spellings.
- **Comparable means registered for the same condition term at Phase 3 or Phase 2/3.** The pack takes one indication, so the cohort is not filtered by mechanism, modality or line of therapy. This cohort mixes 15 randomized, parallel-group trials with five single-group studies whose primary endpoints are safety or feasibility, one of them a 15-participant study, NCT05568615 (tallied for this sample from the pack's CSV; the pack's summary gives the 15 randomized and the 15 parallel separately).
- **The benchmark table and graveyard memo are not graded.** No language model writes them, and every row links to its record. The grade covers only the identifiers cited in the narrative report; the 20 cohort NCT ids enter it only because the narrative names them.
- **The narrative's prose is not graded; check it against the table.** For example, the narrative states that 14 of 20 programs use ALSFRS-R as a primary or joint-primary endpoint. Its own endpoint table gives 10 for "ALSFRS-R total score or slope" and 4 for "ALSFRS-R slope + mortality event rate", and lists NCT04615923 in both rows. In the registry's primary-endpoint text, 9 of the 20 programs name ALSFRS-R (tallied for this sample). Where the narrative and the benchmark table differ, rely on the table: it is rendered directly from the registry records, with no language model.
- **Re-resolution confirms that an identifier resolves to a real record in its registry.** It does not confirm that the source's conclusions are right, or that the report characterizes them correctly.
- **The retraction screen uses Crossref and PubMed.** The Retraction Watch dataset is not used, so a retraction recorded only there would not be caught.
- **Condition search is term-based.** A different name for the same indication returns a different set, so the memo's completeness holds for the term queried, not for every name of the disease.
- **Research artifact only.** It is not medical, investment, legal or regulatory advice, and it is not validated for clinical decision support. No PHI is hosted, transmitted or processed.

---

**SAMPLE — excerpt from an internal proof run on 2026-11-04, not a client deliverable.**

Trial Design Benchmark Pack · **$4,950** · Turnaround: [DECIDE: turnaround] · trevor@trevorobeyinc.com · trevorobeyinc.com

*Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company.*

Powered by OpenClaw (open-source agent framework).
