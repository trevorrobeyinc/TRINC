# Novel Cost-Cutting Strategy Brief

> Generated 2026-06-11 by the novel-cost-cutting research workflow (7 web-research vectors → 64 strategies, 12 flagged novel/unprecedented; adversarially synthesized). Sources are real URLs the agents found; verify before client use. This is product strategy, not a citation-traced client deliverable.

I have enough to produce the brief. The JSON is truncated mid-sentence in the last strategy, but I have full coverage of the first six angles and most of the seventh (clinical-trial operations), which is sufficient to rank and synthesize. Let me write the decision-grade brief directly.

# Cost-Cutting Strategy Brief — Trevor Robey Intelligence Network Citations

**Bottom line:** Your edge is not prediction (the SaaS incumbents own that) — it is **traceable failure-attribution and evidence-integrity grading**, delivered as citation-anchored "kill memos," and cross-referenced against the client's own de-identified internal failures. The savings lever across almost everything below is **cost AVOIDANCE** (don't fund the doomed program), not discovery of a winner. That framing fits a small citation-traced shop and is structurally hard for a black-box platform to copy, because the deliverable *is* the audit trail.

---

## 1. Top strategies to pursue (ranked)

Ranked by novelty × feasibility × fit to a citation-traced-report business.

### 1. Literature-foundation integrity audit (the "Bayer 2/3" / retraction scan)
- **Pitch:** Before a program is funded, grade the *evidence the target rests on* — not the hypothesis.
- **Mechanism:** Trace the citation chain of the load-bearing preclinical papers; flag retractions, single-lab/single-source claims, and known-irreproducible domains (Amgen reproduced 6/53 landmark oncology papers; Bayer halted ~2/3 of target-validation projects on failure to replicate). Kills programs built on broken biology before the full early-development burn.
- **Data needed:** PubMed + Crossref/Retraction Watch retraction feeds; citation graph (Semantic Scholar/Scholar Gateway); optionally the client's internal reference list to map exactly which claims underpin the decision.
- **Why novel/defensible:** The provenance/grading layer exists in academia (GRADE, ProvCaRe) but is **not sold as a commercial go/no-go report**. This is the purest expression of your core competence — per-claim citation tracing — and the hardest for a prediction vendor to match.
- **Delivery:** **Both.** Public report stands alone; far stronger when the client shares which references their decision rests on.

### 2. Stop-reason archaeology — mine the ClinicalTrials.gov `whyStopped` free-text graph
- **Pitch:** A citation-traced "graveyard memo": who tried this mechanism/indication before, at what phase, and exactly why it died.
- **Mechanism:** The `whyStopped` field is almost never analyzed at scale. Borrow the Open Targets / Razuvayevskaya 2024 classifier (~28,842 stopped trials machine-classified into safety/efficacy/enrollment/business) and assemble every prior dead program for a target+mechanism+indication, quoting the NCT IDs and stop text. One avoided Phase 2 = tens of millions; an avoided Phase 3 = $100M–$300M+.
- **Data needed:** ClinicalTrials.gov API v2 (`whyStopped`, interventions, conditions, phase, sponsor); the published stop-reason classification; PubMed/press to corroborate.
- **Why novel/defensible:** Emerging-but-real; the corpus is public and the classifier is published, so you can deliver it traceably today. Defensibility is execution + provenance, not exclusivity.
- **Delivery:** **Citation report.**

### 3. ClinicalTrials.gov change-history mining (which protocol elements will force an amendment)
- **Pitch:** Predict the avoidable protocol amendment before first-patient-in by learning from the public version-delta record.
- **Mechanism:** ClinicalTrials.gov publishes a per-record **version history** that the standard AACT database *explicitly omits* — so most vendors never touch it. Scrape the version deltas across completed trials in the indication, label which initial features later got amended (e.g., "an age cap of 75 was relaxed in 60% of trials within 8 months"), and score the client's draft. Each avoided amendment ≈ $535K + 3 months; 75–89% of protocols take at least one.
- **Data needed:** ClinicalTrials.gov archive/version-history pages (public); the client's draft eligibility/enrollment target. No confidential data needed for the baseline.
- **Why novel/defensible:** **Genuinely under-exploited** — the data source is deliberately omitted by the dominant academic database, creating a real, durable gap. This is the strongest "unprecedented-product-on-public-data" play in the set.
- **Delivery:** **Citation report.**

### 4. Genetic-support gate cross-referenced to stop-reason depletion
- **Pitch:** Flag targets that are *both* genetically unsupported *and* sitting in a failure-heavy neighborhood as priority kill candidates.
- **Mechanism:** Fuse Nelson 2015 / Minikel 2024 (genetic support ≈2x approval odds; lifting genetic-support share 15%→50% cuts R&D cost per launch ~22%) with Razuvayevskaya 2024's finding that efficacy/safety-stopped trials are *depleted* of genetic support. Add gnomAD constraint (pLOEUF/pLI) to also flag safety-stoppage-prone targets. Front-loads go/no-go before IND.
- **Data needed:** Open Targets genetics (L2G, ChEMBL IDs); ClinicalTrials.gov stop reasons; gnomAD constraint; the two genetics-of-approval papers as scoring rationale.
- **Why novel/defensible:** The two-signal *combination* (genetics × stop-reason depletion) is the novel part; the individual signals are well-mined. Quantified savings make it an easy ROI sell.
- **Delivery:** **Both.**

### 5. Value-of-information evidence-spend optimizer (PICO prediction × VOI)
- **Pitch:** "Fund these 3 studies, skip these 5" — rank candidate evidence-generation activities by expected reduction in reimbursement risk per dollar.
- **Mechanism:** Mine the client's public HTA footprint + analogue appraisals to predict the multi-country PICO set (avg ~8, often 10+), map existing evidence against each, then apply a VOI lens with an HTA-outcome prior to rank where to spend. Attacks the biggest line item directly (a single Phase III ≈ $53M; $7.7B in failed-candidate trial spend across big pharma in 2024). De-scoping one unnecessary confirmatory study dwarfs the report fee.
- **Data needed:** Public HTA reports/methods guidelines/dossier templates + prior appraisals; client pipeline economics, candidate-study cost estimates, target price.
- **Why novel/defensible:** The *wiring* of precedent-mined PICO prediction to a VOI evidence-spend optimizer is the novel combination — incumbents productize the pieces, not the loop. Medium feasibility (needs cost/price inputs from the client).
- **Delivery:** **Both.**

### 6. Buried-negative-results recovery (harvest unpublished failures from the results DB)
- **Pitch:** Surface the failed dose/regimen/endpoint a prior sponsor proved doesn't work but never published.
- **Mechanism:** ~50% of registered trials never publish and negatives are ~2x likelier to stay dark — yet many post "basic results" to the ClinicalTrials.gov results database under FDAAA §801. Pull posted effect sizes / AE tables / dropped doses for the client's mechanism-indication that have *no* matching publication. Prevents paying to rediscover a dead dose or arm; sharpens dose selection.
- **Data needed:** ClinicalTrials.gov results database (outcome + AE modules) cross-matched against PubMed for publication gaps; EBM DataLab TrialsTracker.
- **Why novel/defensible:** Novel-as-product; the asset is the *gap* (posted-but-unpublished), which only a systematic cross-match reveals. Citation-traceable by construction.
- **Delivery:** **Citation report.**

### 7. (Tie / situational) Standard-of-care drift radar
- **Pitch:** Predict that a Phase 3's control arm will be obsolete before readout.
- **Mechanism:** Project competitor readout timing and label-change cadence forward to the client's expected readout date; flag when the planned comparator or non-inferiority margin will be outdated by a competitor approval first. Avoids the worst late-stage waste — a fully-enrolled Phase 3 rendered non-approvable, forcing a $100M+ re-run.
- **Data needed:** ClinicalTrials.gov (competitor status, primary-completion dates, control-arm definitions), FDA approvals/labels, sponsor pipelines.
- **Why novel/defensible:** Novel framing; medium feasibility (timing projection is inherently uncertain). Include as a high-value situational module, not a flagship.
- **Delivery:** **Citation report.**

**Deliberately demoted** (real but commodity/crowded — sell as infrastructure or bundle, do not lead with): AI-accelerated living SLR (pure commodity, price as infrastructure), objection-handler packs (standard consulting deliverable, thin moat), 505(b)(2) screens, mechanism-crowding/FTO, external/synthetic-control feasibility, site/investigator track-record dossiers, biomarker-salvage triage, polypharmacology mechanism-twin matching, Swanson ABC bridges.

---

## 2. The client-data-parsing play (the moat)

**Highest-yield de-identified, NON-PHI client inputs** — none require patient-level PHI:

1. **Terminated-program / shelved-compound registry + the internal memos behind each kill.** Lets you classify "killed for business vs. killed for science." A business-killed asset that already cleared Phase 1 safety is the highest-value, lowest-risk revival candidate (repurposing ≈ $300M vs ≈ $2.5B NCE; can skip to Phase 2). This is the single biggest savings unlock because it surfaces assets the client *already paid for*.
2. **Internal negative-results / failed-assay / terminated-experiment records (ELN/LIMS metadata, not patient data).** Structured into a queryable layer so proposed new work is checked against dead ends the company already hit — the eTOX shared-tox-data model. Pure anti-duplication; no external citation strictly needed.
3. **Their target list + internal reference list.** Maps *exactly which* load-bearing claims underpin a decision, so the integrity audit (Strategy 1) and contradiction sweep run against the real foundation, not a generic one.
4. **De-identified utilization / population / net-pricing aggregates from their claims or EHR licenses** (aggregate counts, not records) — feeds the client-claims-validated BIM that defeats the #1 payer objection (manufacturer models are distrusted as non-representative).
5. **Historical site-performance / amendment logs** — calibrates the amendment-risk and site-saturation models to their own portfolio.

**Why cross-referencing creates a moat:** The public failure graph (stop reasons, retractions, genetic support, buried negatives, change-history) is a commodity any vendor can scrape. The client's de-identified internal failures are unique and unscrapeable. **The join is the defensible product:** "your shelved compound X matches a public mechanism-twin in indication Y that 3 competitors abandoned for *business* reasons with intact safety — here's the citation-traced revival case," or "the target you're about to fund rests on 2 references one of which is retracted *and* your own 2019 internal assay (which you forgot) already failed to replicate it." No black-box SaaS can produce that join because (a) it never sees the internal data and (b) it can't show the per-claim provenance that makes the verdict defensible. The moat compounds: each client engagement enriches your mapping of *how* internal kills correlate to public failure patterns.

---

## 3. What the post-research engine must do (capabilities, not code)

1. **Per-claim provenance ledger.** Every assertion in every deliverable resolves to a primary source with a stable ID (NCT, PMID, DOI, Open Targets/ChEMBL accession). This is the product's spine — if a claim can't be traced, it doesn't ship.
2. **Live ingestion of the under-exploited public corpora,** including the two most vendors skip: the ClinicalTrials.gov **`whyStopped` free text** and the **version/change-history archive** (not just AACT). Plus results-database outcome/AE modules, PubMed/preprints, Crossref + Retraction Watch, FAERS/openFDA, Open Targets genetics, gnomAD constraint, ChEMBL, FDA labels/Orange Book, public HTA appraisals.
3. **Retraction / integrity flagging** on the citation graph — automatic check of every cited paper against retraction and expression-of-concern feeds before it can support a "go."
4. **Contradiction / negative-evidence detection** — surface where one body of literature negates another for a load-bearing claim, presenting *both* citations (counters confirmation bias), and flag posted-but-unpublished results.
5. **Borrowed/maintained classifiers** for stop-reason categorization and protocol-complexity primitives (eligibility-criterion counts, endpoints, unique vs. total procedures, visit cadence, arms) with matched-cohort benchmarking.
6. **Secure client-data parsing lane** that ingests de-identified internal data (terminated-program registries, failed-assay logs, reference lists, aggregate utilization) into a queryable layer and **joins it to the public failure graph** — with strict NON-PHI enforcement at the boundary (aggregate counts only; no patient-level records).
7. **A VOI / risk-ranking layer** to turn evidence gaps into a prioritized, dollar-ranked spend recommendation.
8. **Deliverable assembly** that emits decision-grade memos (kill memo, foundation-risk rating, graveyard memo, amendment-risk score) where the citation trail is the artifact, plus living-document refresh so a maintained corpus amortizes across countries/indications.
9. **Runtime citation verification** — close the current known gap (citations model-generated, not runtime-verified): every cited ID must be resolved against the live source API before the report is released.

**Shipped (2026-06-12):** Several of the capabilities above are now live in the engine and were verified on an armed heart-failure run.
- **Citation gate (#1, partial #9).** A report-level gate (`verifyReportCitations`) cross-checks every identifier cited in the assembled report against the union of identifiers actually retrieved at runtime by tool-prefetch, classifying each as *grounded* (present in fetched evidence) or *ungrounded* (likely model-introduced). It hard-fails (`PHASE30_CITATION_UNVERIFIED`) when the grounded ratio falls below a configurable floor (`minGroundedCitationRatio`, default 0.34), writes `citation-verification.json` + `report-annotated.md` (surviving ungrounded cites flagged inline `[UNVERIFIED]`), and engages only when there is fetched ground truth. The agent prompt also carries an absolute zero-fabrication rule (never invent a PMID/NCT/DOI; emit "[no verifiable citation found]" instead). **Scope note honoring the brand:** citations are now *grounded in the source records actually retrieved at runtime and DOI retraction-screened against Crossref* — this is **not** yet per-citation independent re-resolution against each live source database (the remaining work item under #9).
- **Retraction screen (#3).** Each cited DOI is checked against Crossref (`/works/{DOI}` retraction relations); any retracted paper hard-stops the report (`PHASE30_CITATION_RETRACTED`). Fail-soft — a Crossref network error yields no retractions, so a blip can never wrongly block a report.
- **Stop-reason + change-history ingestion (#2, #5).** A local ClinicalTrials.gov v2 fetcher (`ctgov_stopped_trials`) pulls TERMINATED/WITHDRAWN/SUSPENDED trials for a condition with each trial's `whyStopped` text and protocol change-history (version count + most-amended modules), routed into role prefetch; every record is NCT-traced.
- **New deliverables (#8).** Every mission bundle now ships `deliverables/citation-integrity.md` (a graded A–D provenance ledger from the grounded ratio; F/"BLOCKED" on any retraction; N/A when nothing is cited) and `deliverables/graveyard-memo.md` (prior terminated/withdrawn/suspended programs in the indication, each NCT-traced with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — never invented — plus a protocol amendment-risk band LOW/MODERATE/HIGH from change-history version counts). Both memos are rendered deterministically from the fetched records (no LLM), so every claim is verifiable, and are sealed in the bundle's checksums/manifest.

---

## 4. Honest novelty caveats

**Genuinely under-exploited / closest to unprecedented as a product:**
- **ClinicalTrials.gov change-history mining** — the strongest claim. The data is deliberately omitted by the dominant academic database (AACT), so the gap is real and durable. Still, the *academic task* (eligibility-amendment prediction) is published — your novelty is productizing it, not inventing it.
- **Literature-foundation integrity audit as a commercial go/no-go report** — the components (GRADE, ProvCaRe, retraction feeds, the Bayer/Amgen reproducibility data) all exist; nobody sells the *assembled commercial verdict*. Real white space, but built entirely from existing parts.
- **Buried-negative-results recovery** and **"killed for business not science" salvage scoring** — novel as packaged products; the underlying data and the publication-bias statistics are well-documented.
- **VOI-wired-to-PICO-prediction** — novel only as a *combination*; every piece is productized separately (ISPOR 2025 ML-HTA work, VOI literature, EU-HTA suites).

**Emerging-but-real (do not call "unprecedented"):**
- Stop-reason archaeology, genetic-support gating, FAERS dual-source confirmation, target-class ADR forecasting, dose-optimization (Project Optimus) checks, fit-for-purpose RWD pre-screen, client-claims-validated BIM. All rest on *published* methods/classifiers; your value is traceable execution and the client-data join, not new science.

**Standard / commodity — do NOT inflate (sell as infrastructure or bundle):**
- AI-accelerated living SLR (Cytel LiveSLR et al. — heavily productized), objection-handler packs (Clarivate/Petauri/NHTA), 505(b)(2) screens, mechanism-crowding/FTO, external/synthetic-control feasibility, site/investigator dossiers, polypharmacology matching, Swanson ABC, indication launch-sequencing, biomarker-salvage triage.

**Overarching caveat:** You cannot beat Intelligencia/Cortellis/Causaly at black-box PoS prediction, and you should not try. Every "novel" item above is novel as a *traceable, low-capital report product built on public + client-authorized data* — not as new predictive science. The defensibility is the audit trail and the public-vs-internal join, both of which a SaaS black box structurally cannot reproduce.

*(Note: the source JSON was truncated mid-sentence in its final strategy — the "non-core/dark-data procedure pruning audit" — but its thrust is clear: 25–30% of collected trial data is non-core, and pruning it against endpoint mapping is a real but standard-tier operational saving. It does not change the ranking above.)*