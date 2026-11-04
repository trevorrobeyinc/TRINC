# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026-11-04] Root cause of the misattributions: the model now sees each paper's real authors

The attribution check (next entry) found 6 of the 7 papers in run #7's reference table credited to the wrong authors. The cause: every literature source the engine queries returns author names, but no author name ever reached the prompt, so the model wrote bylines from memory. A live re-render of the four mis-credited PMIDs makes it concrete. Before, the writer saw no author line. Now it sees "Calvo A, Moglia C, Canosa A, Manera U, Zucchi E et al. (21 authors)", "Yin Y … (8 authors)", "Benatar M, Wuu J, Turner MR, Macklin EA" and "Uysal SP … (10 authors)"; the report had said "Rissanen", "Mazzini", "Al-Chalabi" and "Basiri".

- **`tooluniverse-mcp/tu-record-normalizer.js`:** new `author_names` field, filled only from a row's genuine `authors` list (at most 25, placeholders such as OpenAlex's "Unknown Author" dropped).
  - It sits apart from the legacy `authors`, which falls back to a category, the source or "tooluniverse" and is never printed.
  - `author_count` is PubMed's declared total (it sends five names), otherwise the list length when the list was cut. `author_count_is_minimum` is set when a source may itself have cut the list (OpenAlex stops at 100).
- **`core/tool-prefetch.js`:**
  - `renderAuthors` prints `**Authors:** a, b, c, d, e et al. (N authors)` ("at least N" for a floor). It also prints a local fetcher's `authors` string, for example Europe PMC preprints' `authorString`.
  - Context-only prior-run text now has its bylines withheld as well as its identifiers (`redactBylines`). Run #7's vault notes and research-memory pack still say "Chio et al. / Lancet 2022", and a model must not re-attach that to the live DOI.
- **`mcp/business-sources/openalex.js`:** keeps each work's authorships as `author_names`. The business lane had no author data at all.
- **`core/agent-engine.js` `buildPrompt`:** the ZERO FABRICATION clause gains one sentence. Name an author only as the record's "Authors:" line gives it; with no such line, cite by identifier without naming an author.
- **`config/role-prompts.json`:**
  - The literature_reviewer's references table becomes "Authors | Year | PMID or DOI | Key Finding", with Authors copied from the Authors line or "not retrieved". This is the table that failed in run #7.
  - The report_generator (no evidence of its own) no longer says "Add additional identifiers where possible". It names an author only where its input already does.
- **`core/citation-attribution.js`:**
  - Reads the plain Vancouver list the Authors line now shows the model ("Calvo A, Moglia C, …"), taking the FIRST surname. Initials are required on every name, so "Japan, Korea", "Type II, Type III" and "Stage IV" never qualify.
  - Accepts an italic *et al.*
  - Reads a year after ", et al.".
- **Adversarial review (2 lenses):** no false Authors: line from any mapped tool (no tool puts inventors, sponsors or firms in `authors`), and prompt growth is small. Its should-fixes are all applied above: the over-25 count, the role prompts, the prior-run bylines, the Vancouver backstop and the placeholder. Left as notes:
  - The attribution check accepts any author on the record, not only the lead.
  - A record's identifiers print after its abstract, below its byline.
- **Tests:** new `tests/core/author-byline.test.js` (15); `tests/core/citation-attribution.test.js` (+3); `tests/core/tu-record-normalizer-payload.test.js` now pins the live-captured OpenAlex and DOAJ bylines. `npm test` 1394 → 1412, 0 fail. Phase 18/19/29/30 policy gates and the restricted-globals lint pass. The live attribution check over the 7 reports on disk is unchanged: 6 misattributed works, all run #7, no false alarm.
- **Not done (operator's call):** run #7's vault notes and research-memory pack still carry the wrong bylines as data. The prompt can no longer pick them up, but correcting or superseding them is a separate decision.

## [2026-11-04] Attribution check: the author and year written beside a cited DOI / PMID are now compared with the registry record

Run #7 (`workflow-e5947dccdce0e06fde1884b5`, ALS, DELIVER 38/38) credited Feldman et al., Lancet 2022 (10.1016/s0140-6736(22)01272-7) to "Chio et al." and Brown & Al-Chalabi, NEJM 2017 (10.1056/NEJMra1603471, PMID 28700839) to "Paganoni et al." The identifiers were real, retrieved and resolvable, so the citation gate (was it fetched?) and re-resolution (does it exist?) both passed them. Neither checks the attribution written beside an identifier.

- **New `openclaw-bridge/core/citation-attribution.js`** (pure, plus a fail-soft annotator).
  - **What counts as a checkable attribution:** a line names exactly one author ("X et al.", or "X & Y" / "X and Y" anchored to a year or a table's "Author / Journal" slash) beside exactly one cited work. A DOI + PMID count as one work only in the "PMID: …; doi: …" form. Outside a table the name must sit near the identifier.
  - **Year:** the one written next to the name, or a table's year-only cell. Never any year on the line, and never one inside an identifier or a wiki-link target.
  - **Name match:** the name matches if it is on the record's author list at all, compared token by token, so particles, compound surnames, diacritics and transliterations ("Ø", "æ"), "Jr" suffixes and collective-name-only NCBI records do not raise a flag.
  - Anything else is `not_checked` with a reason.
- **`citation-reresolver.js`:**
  - `resolvePMID` keeps the docsum's authors and years.
  - New `checkAttributions(reresolved, reportText)` fetches Crossref `/works/{doi}` only for DOIs with an author beside them. It skips doi.org-fallback DOIs, counts mismatched identifiers and mismatched works, and never changes an identifier's status. An unreachable registry gives `not_checked`.
- **`reproducibility-manifest.js`:**
  - Optional `attribution` input. Without it the manifest is byte-identical.
  - A mismatch adds `flag_reasons: ["attribution_mismatch"]` → `DELIVER_WITH_FLAGS` (operator decision 2026-11-04: flag and mark inline, never block; BLOCK still wins).
  - New `summary.attribution_check`, recording counts, mismatches, `marked_lines`, and a fixed `error` code if the check could not run.
  - An "Attribution check" markdown section, omitted when no DOI or PMID was cited (the business lane).
  - The DELIVER_WITH_FLAGS explanation is now per reason. The network/throttle sentence no longer appears for an attribution flag.
- **`workflow-engine.js`:**
  - Runs the check after re-resolution; a crash is logged and recorded as `internal_error`.
  - Writes `[ATTRIBUTION MISMATCH: registry lists …]` into the shipped section files before the manifest is persisted. Each line is re-checked; the mark goes after the whole wiki-link, markdown link or URL, and the write is idempotent.
- **`deliverable-packager.js`:** the re-resolution sentence and `report.md`'s Citation Summary state the mismatched works as a subset of the VERIFIED: "Of the VERIFIED, N cited works carry an author or year … and are marked …", with "marked" only when a mark was written.
- **Adversarial review (same day):** found no regression and no path to a block. Its false-alarm probes are now pinned as tests: "Merck Sharp & Dohme", "Muscle & Nerve", "*Tissue & Cell*", "Pemetrexed & Carboplatin", "EULAR & ACR", "Japan and Korea", a guideline year on the line, a DOI-embedded year in a wiki-link, "Jack CR Jr", collective-only PMIDs, "Van Es", "Pascual Figal", an unverified second work on the line, a name sentences away, marks inside links, DOI prefixes, and PMIDs inside PMCIDs.
- **Tests:**
  - new `tests/core/citation-attribution.test.js` (20) and `tests/core/citation-attribution-engine.test.js` (1, through the real engine into the sealed bundle);
  - `tests/citation-reresolver.test.js` (+6) and `tests/reproducibility-manifest.test.js` (+7).
- **Live, read-only, over the 7 real reports on disk:**
  - 151 DOI/PMID cited; 17 checkable.
  - 7 match.
  - 10 mismatch, all in run #7: 6 of the 7 papers in its reference table, cited 10 times. Feldman → "Chio", Brown & Al-Chalabi → "Paganoni", Calvo → "Rissanen", Yin → "Mazzini", Benatar → "Al-Chalabi", Uysal → "Basiri". Only Hardiman is right.
- **Root cause:** `tool-prefetch.js` `renderRecord` never printed a literature record's authors, so the model wrote author names from memory. Fixed the same day; see the entry above.

## [2026-11-04] The Trial Design Benchmark analyst now sees the registry fields it is asked to compare, and the cohort's N of M (run #6 guessed sponsors from drug names)

Building the first sales sample from run #6 (`workflow-6cc2f82cbced588b04c4d135`, NSCLC, 45/45 VERIFIED) showed its narrative contradicting its own `design-benchmark.csv`. It named Roche as sponsor of NCT07388524 ("inferred — atezolizumab"); the registry says the National Cancer Institute. NCT07738172 became AstraZeneca instead of National Taiwan University Hospital. The narrative also said the design fields "must be retrieved separately", gave a 14/6 phase split where the registry has 15/5, and headed the cohort "20 of 20" where the deliverable says 20 of 675.

- **Cause: fetched, then dropped on the way into the prompt.** `ctgov-design-benchmark.js` returns sponsor and class, allocation, masking, intervention model, arm count, enrollment, primary outcomes and dates for every cohort trial. `tool-prefetch.js` `renderRecord` printed only title, phase and status. The `competitive_intel_analyst`, whose task is to compare exactly those fields, never saw them. The eligible-population denominator rides on the array as non-enumerable properties and was never rendered either.
- **`openclaw-bridge/core/tool-prefetch.js`:**
  - New `renderRegistryDesignFields` prints each field a record carries, with ESTIMATED/ACTUAL on dates. It prints nothing for a field the record lacks, so every other source renders byte-identically (verified by a regression review over every wired fetcher, the ToolUniverse normalizer and the business sources).
  - Outcome and intervention lists are capped at 3 and 6, with a count of the rest. A 50-trial vaccine cohort reached about 70K characters uncapped.
  - The `ctgov_design_benchmark` result now opens with a cohort line ("20 of 64 eligible registered programs … not a patient population", plus the selection rule and sort) and a note naming exactly which fields were requested. That note separates "not retrieved" from "not reported" and forbids inferring a sponsor, phase or design field from a title or an intervention name. Both lines are tied to the tool name, never to field names.
- **`openclaw-bridge/mcp/ctgov-supplemental/ctgov-design-benchmark.js`:**
  - Also requests `armsInterventionsModule.interventions` (same call), so a Drug/Intervention column comes from the registry.
  - Keeps the start and primary-completion date types.
  - A `null` registry enrollment count is now `null`, not 0 (`Number(null)` was slipping through), and an empty arm list is `null`, not 0 arms. `design-benchmark.js` already treats null as not reported and leaves zeros out of the median.
- **`config/mission-templates.json` (`trial_design_benchmark`):**
  - The analyst step names the table columns (sponsor and class through primary endpoint), to be filled from the registry fields with "not retrieved" for a gap. They replace the generic pipeline table.
  - The synthesizer step now depends on steps 1 and 2, so it reads the analyst's registry table, not only the literature review. It defines N of M as a count of registered trials.
- **Tests:**
  - `tests/core/tool-prefetch.test.js` (+2): the real analyst mapping renders the cohort line and every field while a stopped-trial record renders exactly as before; plus caps, missing fields, the 0-vs-null case, and the note never attaching to another source.
  - New `tests/core/ctgov-design-benchmark.test.js` (+3): record shape from an injected v2 response, interventions requested, date types kept, null enrollment and empty arm list not reported as 0.
  - `npm test`: 1355 → 1360, 0 fail. Phase 18, 19 and 29 policy gates and the restricted-globals lint pass.
- **Live check (read-only CT.gov, no model call):** the ALS cohort renders 20 of 64 eligible programs, each with lead sponsor, design, enrollment, interventions, outcomes and typed dates.
- **Not changed, stated:**
  - Cohort tallies (phase split, sponsor class) are still model arithmetic. `design-benchmark.md` does not tally them.
  - Nothing yet compares the narrative against `design-benchmark.csv` after assembly.
  - Local-fetcher docs still carry the "Source: ToolUniverse SMCP" label.
  - `config/role-prompts.json` still asks this analyst for a ChEMBL id per drug, while the commercial paper (2026-11-04) excludes ChEMBL ids from paid deliverables pending counsel. That is the operator's decision.
- **Proven the same day by run #7** (`workflow-e5947dccdce0e06fde1884b5`, ALS, operator-armed through the Command Center door, about 6½ min):
  - **Gate and delivery:** citation gate PASS, 38/38 grounded, retraction screen clean. Delivery re-resolution 38/38 VERIFIED (20 NCT, 7 PMID, 11 DOI), DELIVER. Post-run chain all `ok`.
  - **The narrative now agrees with `design-benchmark.csv`:**
    - all 20 cohort trials are named with their registry sponsor;
    - the cohort reads "20 of 64 eligible registered programs … not a patient population", with no "20 of 20";
    - the phase split (9 Phase 3 / 11 Phase 2/3) and the sponsor classes (13 INDUSTRY / 7 OTHER) match the registry, every listed NCT under the right heading;
    - missing fields say "not retrieved" (7×), never "not reported".
  - It is also the Pack's first gate-PASS outside NSCLC. Still open: the report quotes the source as "ToolUniverse ctgov_design_benchmark" (the local-fetcher label above).

## [2026-11-01] zod 3.24.1 → 4.6.7, with the schemas made version-neutral first

The engine's only open dependency advisory was zod 3.24.1 (GHSA-mrhx-c7xc-m3w5, high; no 3.x fix). The work went in two commits. The first makes every schema behave the same on zod 3.24.1 and 4.6.7 (the bullets below). The second moves the version, and the operator approved it as the named reviewer in `security/dependency-review.md`. It changes `package.json` (exact `4.6.7`), `package-lock.json`, the LOCKED cache, `security/npm-cache.lock.json` and `security/known-good-dependencies.json`. The cache again holds one tarball blob plus its index entry. Record: `ops/security/dependency-audit-2026-10.md`, "2026-11-01 follow-up".

- **`z.record(X)` → `z.record(z.string(), X)`** in 13 places (`workflow-schema.js`, `cc-schema.js`, `mcp-service.js`, `notion-mcp.js`, `notion-mcp.stub.js`, `searxng-mcp/index.js`, `tu-schema.js`). This is the documented zod 4 form and means the same in zod 3. zod 4.6.7 still accepts the one-argument form at runtime, with the same results (checked).
- **`workflow-schema.js` `input_schema` default is now a function.** zod 4 only shallow-copies a value default, so the nested `required: []` and `properties: {}` would be one shared array and one shared object for every template that omits `input_schema`. A probe shows a push into one parse's array appearing in the next parse under zod 4, and not under zod 3 or with the function default.
- **Tests:** `npm test` (Node 22.13.1) gives 1352 / 1355 in every state: zod 3.24.1 before and after the schema change, zod 4.6.7 swapped into the checkout, a rehearsed flip in a scratch copy, and the real flip installed offline from the new LOCKED cache. The 2 failures are the Phase 29 startup-integrity checks, which need the ToolUniverse submodule checked out (it is not in the cloud container), and the 1 skip is pre-existing.
- **After pulling on the Mac:** run `npm ci --offline --ignore-scripts` in this folder. Until then, `node_modules` still holds zod 3.24.1, which the new schemas also accept.

## [2026-10-08] The stall watchdog no longer kills a healthy model call — the orchestrator's time guards nest (run #5 was paused at exactly 120 s)

The fifth real run (`workflow-89c1c0e8352a99fa34a38801`, `trial-design-benchmark`, non-small cell lung cancer) was the first with the research runtime on a real clock (`e5e5a3f`). Its first role call finished in 115 s (101 s of model time, read from the interaction log, which now records real durations). The second was dispatched at 05:43:02.702 and the mission was paused with `PHASE18_MISSION_STALLED` at 05:45:02.758 — 120.06 s later, while that call was healthy and still working. The `research` step failed; the dataset, packaging and approval steps never ran, so run #4's licence-gate fix was not reached.

- **Cause: a watchdog that had never met a real model call.** `spawn-orchestrator.js` fails a mission when work is queued and `nowMs() - lastProgressAtMs >= stall_interval_ms`, and `nowMs()` is `Date.parse(timeProvider.nowIso())`. Under the frozen research clock that was always `0`, so the stall guard (`stallIntervalMs: 120000`) and the mission runtime cap (`maxRuntimeMs: 1800000`) were dead code in production; `e5e5a3f` switched them on. A role call routinely runs 60-300 s, so with the 120 s value essentially every real run would stall at its first slow call. The existing stall test (a handler that never resolves) shows the guard's intended meaning, a hang detector, and the value was simply too small for it.
- **`config/agent-spawner.json`** — `missionExecution.stallIntervalMs` 120000 → 1200000 (20 min), with a `_comment_missionExecutionGuards` note. The four guards now nest, innermost first: model call 10 min (`llm-providers.json`) < subtask timeout 15 min < stall 20 min < mission cap 30 min. The 15-minute subtask timeout is the per-call hang detector; the stall interval is a backstop for a scheduler that stops dispatching; neither can preempt a call the one inside it still allows.
- **Test:** `tests/core/phase18-runtime-guard-config.test.js` (+5) pins the ladder from the config files (a subtask timeout covers the model call; the stall interval exceeds the subtask timeout and the documented 5-minute call; the mission cap outlasts the stall interval; 0 means off). Two of them failed before the change, with the ladder in the message.
- **Audit of everything else the real clock switched on** (every time-dependent branch in the ten components the research root builds): the mission runtime cap is the only other guard that is newly live (30 min against a typical 10-15 min run; a throttled run can approach it); the model-call timeout is a real timer and was always live; the governance bridge's `asOfIso` is read only when `requireStrictCompliance` is set, which this lane never does; the rest only stamp timestamps. Nothing else branches on elapsed time.
- **Not changed, stated:** the stall guard still cannot tell a long healthy call from a hang within its interval; that is what the per-subtask timeout is for. Making the stall detector ignore in-flight work would be a larger change to the orchestrator and was not made.

## [2026-10-08] The model is no longer instructed to write a word the shipment gate bans — run #4 was blocked by its own disclaimer

The fourth real run (`workflow-936d33e0daaf7d7218816725`, `trial-design-benchmark`, non-small cell lung cancer) completed the mission, the quality check and the dataset, then failed at the `package` step: `DrugBank reference/identifier found in shipped content — no license to redistribute.` Nothing was fabricated and nothing shipped. The text that tripped the gate was the synthesizer's own closing line, "*Research artifact only — not clinical or regulatory advice. No DrugBank fields used.*" — a compliant sentence that `license-allowlist.js` cannot tell from a violation, because it rejects the bare word anywhere in shipped content (its header says its constraints are hard, and they were not touched).

- **Cause: the model was told to write it, in contradiction.** `config/role-prompts.json` (last edited 2026-05-19, five weeks before the gate was added on 2026-06-24) told this template's two roles, `literature_reviewer` and `competitive_intel_analyst`, to attach "a PubChem CID or DrugBank ID" to every drug, and told the safety role to fill a "DrugBank ID" table column. `config/agents/*/SOUL.md` (July) told the same roles "No DrugBank fields". The model reconciled the two at random: the clause appeared in 1 of 25 stored role outputs, which is why runs #2 and #3 shipped. Same family as the UniProt extractor bug (a truthful honest-negative sentence read as a violation), one layer earlier.
- **`config/role-prompts.json`** — the four sentences that asked for DrugBank now ask for PubChem CID and ChEMBL IDs (the safety role's table column is "PubChem CID"; the report generator's preserve-list drops the name).
- **`config/agents/{scout,analyst,synthesizer}/SOUL.md`** — "No DrugBank fields" became a positive allowlist: cite compounds, drugs, targets and publications only by PMID, NCT, PubChem CID, ChEMBL, ENSG, UniProt, DOI or RxNorm; an identifier from any other database is STOP-SHIP. A model that never reads the banned word has nothing to echo.
- **Test:** `tests/core/instruction-gate-consistency.test.js` (+19) asserts that nothing the model is instructed with (the role prompts, the mission and workflow templates, every `SOUL.md` / `AGENTS.md`) contains text `assertNoBannedContent` would reject, and that the gate itself still rejects the run-#4 sentence and a bare `DB#####` id. Four of them (`role-prompts.json` and the three `SOUL.md` files) failed before the change; the rest, and the gate controls, passed.
- **What run #4 did prove, live (before the fix → after):** `mission.json` `created_at` 1970-01-01 → 2026-10-08T05:05:48Z; dataset `build_completed_at` 1970-01-01 → 2026-10-08T05:14:39Z; `artifacts.graveyard.amendment_status` absent → `unavailable`; the memo's amendment section silently absent → "Not available for this run … 40 request(s) failed (first error: HTTP 403)". It could not prove `approved_at` and the report's `Generated` date: both are written during the step the gate stopped.
- **Not changed, stated:** the gate. The other sources of the word are data (prefetch documents, the model's own memory), so the model can still volunteer it; that blocks delivery by design and the cost is one run. The extractor and the quality-audit regex still DETECT `DB#####` ids on purpose.

## [2026-10-08] The research runtime runs on a real clock — the supervisor's circuit breaker can recover, and the interaction log records real durations

The customer-visible-clock entry below left the RESEARCH runtime on its frozen default clock "for a decision", because `supervisor-authority.js` runs a circuit breaker on that clock. The decision was taken by the operator on 2026-10-08 after the exposure was measured: `buildResearchRuntime` now defaults the way `buildMonetizationRuntime` already does.

- **`scripts/_research-runtime.js`** — `buildResearchRuntime` resolves `timeProvider = options.timeProvider || core/time-provider.js` once and hands it to the ten components it builds (interaction log, LLM adapter, research output manager, lane queue, comms bus, supervisor authority, governance bridge, agent engine, spawn orchestrator, agent spawner). Both production roots get it: `run-workflow.js` through `buildWorkflowRuntime`, and the legacy `run-research-task.js` lane through `buildPhase14Runtime`. An injected clock still wins, so no test changed.
- **What changes in a real run.** The supervisor's circuit breaker (3 failures → OPEN, 30 s timeout) can now half-open and close again: under the frozen clock `now - lastTransitionAt` was always 0, so a tripped breaker stayed OPEN for the life of the process and reported `next_retry_at: 30000` — 1970-01-01T00:00:30Z, an instant that cannot arrive (reproduced against the real modules, raw breaker and through the authority). Supervisor decision stamps, task metadata, mission checkpoints, agent inbox/outbox, lane-queue events and governance-ledger timestamps are real instead of 1970. The interaction log's `timestamp` and `duration_ms` are real: all 11 entries the real runs had written so far read `1970-01-01` and `0 ms`, so the throttling diagnostic in `CLAUDE.md` (compare `duration_ms` with the 60–300 s role baselines) had nothing to read. Entries written before this change are not a baseline.
- **Exposure, measured before fixing: nil today.** The breaker guards only `runApprovedTask`, whose one production caller (`scripts/run-research-task.js`) calls it once per process against a threshold of 3; the `run-workflow.js` lane reaches the authority only through `requestApproval`, which has no breaker; `drainOne` / `enqueueApprovedTask` have no callers; breaker state is in-memory per process. The three other breaker owners (`supervisor-v1`, `base-mcp`, `api-governance`) call `checkBeforeRequest(slug)` with no `now` and were already on the breaker's own real clock, and `tool-prefetch` defaults to the real clock too. So this fixes a latent defect and a class of stamps; it changes no approval decision.
- **Tests:** `tests/core/phase14-research-runtime-clock.test.js` (+2). The first builds the runtime the way production does (no clock; write paths in a tmpdir), trips the breaker through the real engine's task validation and asserts that the refusal's `next_retry_at` is a future instant and that the decision is dated — before the fix it failed with `got 30000 (1970-01-01T00:00:30.000Z)`. The second pins the recovery lifecycle with an injected clock: OPEN, still refused at 29,999 ms, HALF_OPEN at 30,000 ms, CLOSED after one success. Full suite 1245 → 1247, 0 failures, exit 0, two consecutive runs, no `--test-force-exit`; restricted-globals lint clean; 38 of the 39 `phase2:gates` scripts pass (the 39th, `verify-phase-workflow-policy.sh`, needs the operator's SSH).
- **Not changed:** the components' own frozen defaults (unit tests rely on them) — `createSupervisorAuthority` built directly with no clock is still on the epoch, by design; only the production roots default to real time. Bundles, ledgers and log entries written earlier are not rewritten.

## [2026-10-08] Runtime-state writers can no longer lose each other's updates — per-file serialization in the persistent store

While verifying the changes below, `phase18 agent spawner writes mission artifacts and leaves global runtime state as the single index` failed once in a full-suite run (`1 !== 0` open loops) and never in 80 isolated runs, including 40 under twelve busy processes. The cause is an interleaving, not a timing threshold: `registerOpenLoop`, `resolveOpenLoop`, `upsertMissionRuntime` and `appendRecentDecision` are each load → mutate → save on ONE json file. The temp-file + rename keeps the file from tearing, but not from losing an update: two overlapping cycles load the same old state, and the later rename wins.

- **`openclaw-bridge/state/persistent-store.js`** — the four mutators run through a per-path promise chain (`withRuntimeStateLock`), keyed by the resolved path: a cycle sees the previous cycle's result, different files never wait on each other, and a cycle that fails does not block the next. Return values, validation errors and persisted contents are unchanged for calls that do not overlap.
- **Reproduced deterministically before the fix** (the real functions, a temp dir): two concurrent `resolveOpenLoop` calls left an open loop behind in 20 of 20 trials; a `resolveOpenLoop` racing an `upsertMissionRuntime` left a stale loop in 15 of 20 and lost the mission record in 5 of 20. After the fix: 0 in every case; the sequential control is unchanged.
- **Tests:** `tests/core/phase17-runtime-state-concurrency.test.js` (+7; the four that exercise overlap — many registers, two parallel resolves, resolve against upsert, ten concurrent decision appends — failed before the fix). Full suite 1245/1245, three consecutive runs, baseline 1199.
- **Live state checked, read-only:** `state/runtime/state.json` holds 24 open loops, all from 8 FAILED missions (a failed mission keeps its loops by design) and none from a completed one, so there is no sign the race has hit a real run yet. Real runs are slow enough that overlap is rare; the exposure is parallel lanes finishing together and the spawner's final status write.
- **Not covered, stated:** two PROCESSES writing the same state file (a terminal run beside a plugin-dispatched one) would still need a file lock. The sibling index stores (`tasks-index.json`, `datasets-index.json`) read and write synchronously inside one synchronous function, so they cannot interleave in-process and were left alone.

## [2026-10-08] Refactor — the NCBI pacing and single-429-retry policy lives in one module (no behavior change)

The NCBI entry below added the same three things to two modules, each with a comment naming the other as its twin: the request spacing, the `Retry-After` parse (integer seconds; absent, an HTTP-date or garbage = 1 s; over the cap = no retry) and the retry-once-on-429 sequence. A tweak to one had to be remembered in the other.

- **`openclaw-bridge/core/ncbi-pacing.js`** (new) — `createNcbiPacing({ nowMs, sleep, minRequestIntervalMs, maxRetryAfterMs }).request(attempt, responseOf)` resolves to `{ out, attempts }`. Pacing state is per instance, so each consumer keeps its own spacing exactly as before; an attempt that throws propagates unchanged and is never retried.
- **`citation-reresolver.js`** and **`pubmed-retraction.js`** delegate to it (98 lines out, 39 in, between them). Their options, results (`attempts` in the manifest; `checked:false`) and fail-soft rules are unchanged, and the now-unused clock import in `pubmed-retraction.js` is gone.
- **Verified:** neither module's existing tests were edited, and all of them pass against the refactored code (re-resolver 30, retraction screen 62), plus the helper's own 18 in `tests/core/ncbi-pacing.test.js`. Full suite 1238/1238.

## [2026-10-08] The amendment-risk section can no longer vanish silently — "Not available for this run" is stated when the registry refuses version history

The same run's `deliverables/graveyard-memo.md` had no amendment-risk section and nothing said why. ClinicalTrials.gov's undocumented change-history endpoint (`/api/int/studies/{nct}/history`) now answers HTTP 403 to the engine's fetcher (reproduced read-only: one list request and three history requests, all three history requests refused). `getChangeHistory` swallowed the errors, `buildAmendmentRisk` filtered to trials carrying history, found none and returned an empty string, and the engine dropped the section — to a reader, indistinguishable from "this indication has low amendment risk".

- **`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`** — history requests are now ACCOUNTED for: `historyAttempted` / `historySucceeded` / `historyFailed` / `historyFirstError` ride on the result as non-enumerable metadata (nothing reaches a prompt). They replace `historySampled`, which reported what was attempted and so looked the same for 0 successes as for N. An answered-but-empty history counts as neither success nor failure. `getChangeHistory` keeps its public contract (summary or `null`). The fetcher does not try to get around the refusal.
- **`openclaw-bridge/monetization/graveyard-memo.js`** — `buildAmendmentRisk` has four states: `ok`; `partial` (the band is computed from what came back, with a "Retrieval gap" line); `unavailable` (history was requested and none came back: a "Not available for this run" section naming the cause — "an absent band is a gap in the data, not a LOW result"); `not_computed` (nothing requested: no section, as before). How many came back is counted from the data, so the notice cannot disagree with the band printed beside it.
- **`openclaw-bridge/core/workflow-engine.js`** — the section flows whenever it has markdown to print (it was gated on `sampled > 0`), and `workflow.json` `artifacts.graveyard` gains `amendment_status`.
- **Verified live, read-only (2026-10-08):** the real fetcher against the real registry gave `status=unavailable`, "3 request(s) failed (first error: HTTP 403)".
- **Tests:** +7 in `ctgov-supplemental.test.js`, +6 in `graveyard-memo.test.js`, +3 in `phase30-amendment-risk-disclosure.test.js` (the disclosure reaches the persisted memo AND the sealed bundle's `deliverables/graveyard-memo.md`, through the real packager). All 19 failed before the change.
- **Consequence for copy — not edited:** while the endpoint refuses, no shipped memo carries a LOW / MODERATE / HIGH band, and `OFFERINGS.md`, the Commercial Launch Playbook, `REVENUE_PLAYBOOK.md` and the AWS provider-qualification application still advertise one. Outward-facing copy is the operator's call.
- **Not changed, noted:** the sweep still sends all of its history requests (40 in census mode) to an endpoint that is refusing them; stopping after the first refused batch would be kinder to the registry and is a separate change.

## [2026-10-08] Customer-visible dates come from a real clock — `Generated: 1970-01-01` and `approved_at: 1970-01-01` no longer ship

The first fully passing real run (`workflow-c26cd56971f635a2535e8251`, `trial-design-benchmark`, non-small cell lung cancer, `DELIVER`) sealed a bundle whose `deliverables/report.md` read `**Generated**: 1970-01-01` and whose `release-approval.json` carried `"approved_at": "1970-01-01T00:00:00.000Z"` — exactly two files, found by scanning the whole bundle. Neither value was "unknown": each is a component's built-in DEFAULT clock — a frozen epoch, the convention that keeps unit tests deterministic — that no production composition root ever replaced.

- **`openclaw-bridge/core/workflow-engine.js`** — the mission envelope is stamped `created_at: timeProvider.nowIso()`. Left out, the schema fell back to its epoch default; the real spawner writes the envelope verbatim as `mission.json`, and a mission-sourced offer reads that field as the bundle's "Generated" date. That is every `biomedical_research_packs` bundle: the product line allows only mission sources, so the template's dataset-sourced offer falls back to the mission. The dataset step also hands its clock to the dataset output manager and builder it builds inline, so `build_started_at` / `build_completed_at` (the "Generated" date of a dataset-sourced offer) are real too.
- **`scripts/_monetization-runtime.js`** — `buildMonetizationRuntime` accepts `timeProvider` and DEFAULTS to the shared real clock (`core/time-provider.js`, the idiom the engine already uses), passing it to the release-approval manager, the dataset output manager and both evidence managers. Every operator script builds through this one factory (`approve-release`, `export-release`, `generate-offer`, `record-*-outcome`, `verify-*-evidence`), so each stamped a 1970 approval before. `scripts/_workflow-runtime.js` forwards an injected clock.
- **Tests:** `tests/core/phase30-customer-visible-clock.test.js` (+5) drives the REAL dataset builder, offer builder, packager and approval manager through a full mission → dataset → offer → approve run on a fixed clock (`tests/helpers/workflow-bundle-harness.js`) and asserts that no file in the sealed bundle carries `1970-01-01`. Before the fix it failed with exactly the two files seen in the real bundle.
- **Not changed, deliberately — recorded for a decision:** the RESEARCH runtime is still built without a clock (`scripts/run-workflow.js` calls `buildWorkflowRuntime({ logger })`), so its internal stamps (task metadata, mission checkpoints, agent inbox/outbox, the interaction log, and the dataset provenance copies of them) remain 1970. None of it ships in the bundle (scanned). Injecting a real clock there is not a pure stamp fix: `supervisor-authority.js` feeds its default clock (`nowMs: () => 0`) to a circuit breaker, which under a frozen clock opens after three failures and never half-opens (reproduced 2026-10-08), so a real clock would change breaker recovery inside the approval path.
- **Older bundles are not rewritten:** bundles sealed before this change still say 1970; their checksums are sealed and they are not edited.

## [2026-10-08] NCBI 429s no longer degrade the delivery record — a paced re-resolver and one bounded retry in both NCBI consumers

With the extractor fixed, a re-run of the first dispatch-lane run's data would still have shipped as `DELIVER_WITH_FLAGS`: NCBI answered 429 for 7 of the re-resolver's 12 PMID checks (fired about 100 ms apart), and the PubMed retraction screen was left `checked:false` ("INCOMPLETE" in the sealed manifest) in the same run. `max_unchecked_ratio: 0` is doctrine (Q8, `reproducibility-manifest.js`), so that module's own instruction applies: make the re-resolver more resilient, never lower the bar.

- **`openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js`** — NCBI requests are spaced by `minRequestIntervalMs` (the `pubmed-retraction.js` idiom: default 0 = off so offline tests stay instant, `nowMs`/`sleep` injectable); on a 429 it waits `Retry-After` (integer seconds; absent or unparseable = 1 s) and retries once, never waiting longer than `maxRetryAfterMs` (5 s). A second 429 or a longer wait stays `UNCHECKED rate_limited`, honestly. NCBI host only; `attempts` is now recorded per id in the manifest.
- **`openclaw-bridge/mcp/pubmed-retraction/pubmed-retraction.js`** — the same single retry, through one `eutilsGet` helper shared by both request sites (the esummary batch and the per-DOI esearch). Timeout, body parsing and fail-soft semantics are unchanged: the 57 pre-existing tests pass as written (three of them, which simulate a persistent 429, now inject a no-wait `sleep`).
- **`openclaw-bridge/core/workflow-engine.js`** — production wiring passes 350 ms (110 ms with `NCBI_API_KEY`) to the re-resolver, the numbers the retraction screen already used in `scripts/_workflow-runtime.js`.
- **Why a retry and not only pacing (measured live, 2026-10-08, anonymous, 350 ms spacing):** NCBI still answered 429 for about 1 request in 10 (2 of 21 DOI lookups; 2 of 12 PMID checks), so pacing alone leaves the record incomplete. With the retry, the stored ids of that run come back: re-resolver 12 of 12 VERIFIED (it was 5 of 12), retraction screen 21 of 21 DOI lookups and 12 of 12 PMIDs checked (it was `checked:false`). The retry is load-bearing, and an API key would not remove the need for it.
- **Tests:** `tests/citation-reresolver.test.js` +9 and `tests/core/pubmed-retraction.test.js` +5, all with an injected clock (no wall-clock delay). The behaviour tests fail against the previous modules (negative controls); the others pin what must not change: off by default, other hosts unpaced, no wait beyond the cap, no retry on a 5xx. Suite 1,185 → 1,199, 0 failures; 38 of the 39 `phase2:gates` scripts pass (the 39th, `verify-phase-workflow-policy.sh`, needs the operator's SSH).
- **Not changed:** an HTTP-date `Retry-After` is treated as unparseable (1 s); UniProt 404 stays `UNCHECKED`; the Crossref and ClinicalTrials.gov hosts are not paced; an `NCBI_API_KEY` stays optional.

## [2026-10-08] UniProt extractor accepts only real accessions (the first dispatch-lane run was blocked by the words "accessions" and "citation")

The first real run started through the Claude Code dispatch lane (`workflow-12c3ef8ba2021cf5d6a81516`, `trial-design-benchmark`, non-small cell lung cancer) passed grounding (61 of 64) and re-resolved every NCT and DOI, then was **blocked at delivery** (`PHASE30_CITATION_UNRESOLVED`) by two "UniProt ids" that were English words from the report's own honest-negative sentence. Nothing was fabricated.

- **`openclaw-bridge/core/citation-extractor.js`** — the UniProt pattern now requires UniProt's accession grammar (6 or 10 uppercase characters, `UniProtKB:` accepted, label any-case, `\b`-bounded) instead of capturing any 6-10 letter word after the label. Of the old pattern's 7 distinct ids across 1,368 stored reports and vault notes, 4 were English words (`accessions`, `citation`, `protein`, `validation`); all 3 real accessions are still extracted and nothing new is.
- **Trade-off, deliberate:** a malformed `UniProt <token>` is no longer extracted (it cannot resolve to anything, and previously only blocked a report by accident). A well-formed accession still goes through grounding and re-resolution. Lowercase accessions are not extracted; none exist in the stored corpus.
- **Replay of that run's stored data through the real code (read-only):** the old extractor finds the recorded 64 ids in its report, the new one 62 (the only difference is `ACCESSIONS` and `CITATION`, nothing gained); the real `buildReproducibilityManifest` reproduces the recorded BLOCK from the stored 64 entries (control), and without the two phantoms yields **`DELIVER_WITH_FLAGS`** (55 verified, 0 unresolved, 7 unchecked), not `DELIVER`. The 7 unchecked are PMIDs that NCBI answered 429; had they resolved the decision would be `DELIVER`. `max_unchecked_ratio: 0` is doctrine (Q8), so any unchecked id forfeits the full-strength claim; it ships with the count-scoped claim only. The block hid that flag in the original record because BLOCK is decided first.
- **Not changed, noted for follow-up:** (1) the re-resolver's NCBI calls were unpaced (about 100 ms apart), so PMID coverage was 5 of 12 and a re-run would again have landed as `DELIVER_WITH_FLAGS` — fixed in the entry above; (2) `citation-reresolver.js` maps only UniProt HTTP 400 to `UNRESOLVED` — verified live 2026-10-08: the word `accessions` answers 400, a well-formed non-existent accession (`Q00000`) answers 404 "Resource not found" and is `UNCHECKED` (non-blocking), unlike ChEMBL where 404 is `UNRESOLVED`; (3) `workflow-engine.js:783` is a separate, looser line-counting quality metric (`UniProt:\s*[A-Z]\w+` with `i`), not part of the gate.
- **Tests:** `tests/core/citation-extractor.test.js` +4 (real accession forms; the honest-negative sentence and six sibling shapes yield no UniProt id; token-boundary, fragment and lowercase cases; `crossCheckCitations` ratio unaffected). The four fail against the previous extractor (negative control) and pass against this one. Full suite captured before and after on the same tree: 1,181 → 1,185 tests, 0 failures, exit 0, no `--test-force-exit`.

## [2026-07-16] Option B — engine is 100% Claude; LM Studio decommissioned

The per-role routing was simplified to Claude-only and the local OSS-model helper/fallback layer was removed. Authoritative config: `config/role-provider-map.json` (schema `phase34-role-provider-map-v1`) + `config/llm-providers.json`.

- **Engine now 100% `claude-code`** — scout / analyst / synthesizer → `claude-opus-4-8`; `default` + unmapped roles → `claude-sonnet-4-6`. Every role `fallback` is `""` (empty), so a primary failure surfaces the real error instead of chasing a local backend.
- **LM Studio decommissioned** — removed its TLS proxy (`:1235`), the `com.trevorrobey.lm-studio-tls-proxy` launchd unit, the `lm-studio` provider in `llm-providers.json`, and its role route; the app + `~/.lmstudio` were moved to Trash. The live TLS-proxy set is now **3** (Ollama `:11435`, Miyo `:8743`, Qdrant `:6433`), not 4.
- **OSS helper pre-passes + local fallbacks removed from the engine** — no per-role local fallback (scout→Ollama, analyst/synthesizer→LM Studio), and no role declares a helper any more. *(Correction 2026-10-07: this entry said "no more `runHelperPrePass`"; the function and its `if (context.helper)` call site in `agent-engine.js` were not deleted and are dormant.)*
- **Ollama retained, Obsidian-side only** — `:11434` upstream via the `:11435` mkcert proxy still serves Obsidian Copilot + the vault-zettelkasten plugin (`qwen2.5:7b-instruct`); it is no longer an engine provider/fallback/helper. (Restorable: restore a `helper` block, set a role `fallback: "local"`, and set `providers.local.enabled=true`.)
- **Docs reconciled** to this reality: `CLAUDE.md`, `SYSTEM-REALITY.md`, `README.md`, `THE-WHOLE-SYSTEM.md`, `REVENUE_PLAYBOOK.md`, `TREVOR_ROBEY_INC_AGENTS_DOSSIER.md`, `ENGINE-CODEBASE-MAP.md` (verified against the live config via a fan-out finder→verify pass).

## [2026-06-12] Slice 3 v2 — structured kill-memo deliverables (graveyard memo + amendment-risk)

The cost-AVOIDANCE products from the cost-cutting research brief, shipped in the bundle and rendered **deterministically** from NCT-traced ClinicalTrials.gov records (no LLM — the fetched data IS the artifact, so every claim is verifiable). **Tests: 316/316 (+9).**

- **`openclaw-bridge/monetization/graveyard-memo.js` (NEW)** — `buildGraveyardMemo(stoppedTrials, {indication})` renders prior terminated/withdrawn/suspended programs in the indication, each with the sponsor's stated stop reason (or an explicit "_(none stated)_" — never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` source link. `buildAmendmentRisk(stoppedTrials)` derives a median/max amendment count + most-amended modules from the change-history and bands the protocol amendment-risk LOW/MODERATE/HIGH. (7 unit tests.)
- **`ctgov-supplemental.js`** — added a session cache (condition → records) on the fetcher so the deliverable-assembly re-fetch is a cache hit, not a second CT.gov round-trip.
- **`scripts/_workflow-runtime.js`** — exposes the *same* `ctgovSupplemental` instance on `researchRuntime` (used by both the scout prefetch and the engine), so the memo renders from the very records scout grounded on.
- **`workflow-engine.js` `executeMissionStep`** — on a mission that clears the citation gate, re-fetches the indication's stopped trials, builds both memos, persists `graveyard-memo.md` to the workflow dir, and attaches them to the step result. Fully fail-soft + bounded: an absent fetcher, empty indication, or fetch error simply omits the memos and never blocks a passing report. `executeOfferStep` threads them into `source_context`; `state.artifacts.graveyard` records the summary.
- **`deliverable-packager.js`** — ships `deliverables/graveyard-memo.md` (graveyard + amendment-risk) and registers `artifactRefs.graveyard_memo` when present; cleanly omitted when no stopped trials were found. (2 packager integration tests.)

## [2026-06-12] Fix (found by the Slice 3 v1 live run): DOI extraction captured trailing junk

A live armed run's `citation-integrity.md` exposed that the DOI regex captured trailing markdown/punctuation — `10.3389/fphar.2026.1787936]]`, `10.54097/5hr7dp28;`, `10.1038/nature12373.` — which (1) made fetched DOIs look *unverified* (deflating the gate's grounded ratio), (2) duplicated the same DOI as several "unverified" entries, and (3) littered the integrity ledger. **Tests: 307/307 (+3).**

### Fixed (`openclaw-bridge/core/citation-extractor.js`)
- Tightened the DOI pattern to stop at non-DOI terminators (`, ) ; ] [ } { < > " ' |`), so wiki-link/markdown artifacts aren't captured.
- In `extractCitations`, strip any TRAILING `. , ; :` from a captured DOI (DOIs contain internal dots so the pattern can't exclude `.`; a DOI never *ends* in one), keeping internal dots/slashes intact.
- Net: `10.54097/5hr7dp28]]` / `…]];` / `…;` all normalize to the one clean `10.54097/5hr7dp28` (dupes collapse), and a sentence-ending DOI loses its period. This raises the citation gate's grounded ratio + cleans the integrity ledger — directly serving the citation-accuracy brand. (3 new extractor tests.)

## [2026-06-11] Post-research engine — Slice 3 (v1): Citation Integrity & Provenance ledger

The deliverable bundle now ships its audit trail as a first-class artifact — the product's defensible spine ("the deliverable IS the audit trail"). **Tests: 304/304 (+6); deliverable-packager suite still green.**

### Added
- **`openclaw-bridge/monetization/integrity-rating.js`** — `buildIntegrityReport(citation_verification)`: a DETERMINISTIC (no LLM) render of the citation gate's verdict into an integrity grade + provenance table. Grade: a retracted citation → **F (BLOCKED)**; otherwise by grounded-ratio (A ≥0.9, B ≥0.75, C ≥0.5, D below); no citations → N/A. Lists the flagged unverified + retracted identifiers. +6 tests.
- **`deliverable-packager.js`** — when `sourceContext.citation_verification` is present, writes `deliverables/citation-integrity.md` into the bundle and records `artifactRefs.citation_integrity`.
- **`workflow-engine.js executeOfferStep`** — carries the mission step's `citation_verification` (from the Slice-1 gate) into `built.source_context`, so the packager can emit the ledger. Fail-soft (absent verification → no artifact; no new run wiring).

### Slice 3 status
v1 (the integrity/provenance ledger — the audit-trail spine) complete. **v2 (next): structured graveyard memo + amendment-risk score**, which need the raw stop-reason + change-history records persisted per mission so the memos render deterministically from data rather than LLM prose.

## [2026-06-11] Slice 2 complete — change-history mining + retraction integrity check

Added the remaining two corpora on the local-fetcher seam, completing Slice 2. **Tests: 298/298 (+10); confirmed live (armed run).**

### Added
- **Change-history mining** (`ctgov-supplemental.js getChangeHistory`): the `/api/int/studies/{nctId}/history` endpoint (the version-delta data AACT omits) enriches each stopped trial with version count, the most-amended modules, and the date span. `renderRecord` surfaces `**Protocol history:** N versions; most-amended: …`. Bounded (top-5), sequential, fail-soft per trial. Live-verified: NCT02123992 → 14 versions, modules parsed correctly.
- **Retraction integrity check** (`crossref-retraction.js` + `citation-gate.js checkRetractions`): checks the report's cited DOIs against Crossref (Retraction Watch dataset) via `relation.is-retracted-by` / `update-to:retraction`. **Fail-soft** — a network error/non-200 yields `checked:false`/`retracted:false`, so Crossref being down can never falsely flag a paper. **Wired into the gate as a hard stop**: a confirmed-retracted citation throws `PHASE30_CITATION_RETRACTED` (a report can never ship citing a retracted paper); retracted DOIs are recorded + annotated.

### Confirmed live (armed run, CV-disease-prevention topic)
- Stop-reason: 6 terminated/withdrawn trials fetched. Change-history: 0 failures (5 enrichment calls succeeded). Retraction: **9 report DOIs checked against Crossref live, 0 retracted**. Gate: `cited:28, grounded:23 (0.821), retracted:0, pass`; `fetched_id_count:62`; clean exit, no orphan.

### Slice 2 status: COMPLETE
Stop-reason archaeology + change-history mining + retraction integrity — all three under-exploited corpora from the cost-cutting brief are now live on the local-fetcher seam, grounding the report and feeding the Slice-1 citation gate. **Next: Slice 3 (kill-memo deliverable assembly).**

## [2026-06-11] Post-research engine — Slice 2 (v1): local-fetcher seam + ClinicalTrials.gov stop-reason archaeology

Added an extensible ingestion seam for corpora ToolUniverse doesn't surface, and the first fetcher on it — the cost-cutting brief's strongest deliverable-today play. **Tests: 288/288 (+4); confirmed live (armed run).**

### Added
- **Local-fetcher seam** (`tool-prefetch.js`): `createToolPrefetch` accepts `localFetchers` (tool_name → async(args) → records[]). A mapped tool found there routes to the local fetcher instead of ToolUniverse; its records flow through `renderRecord` → the agent prompt → `fetched_citation_ids` → the Slice-1 citation gate, identically to ToolUniverse results. (This is the "composite tool executor" ARCHITECTURE.md described but that never actually existed.)
- **`openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js`** — `searchStoppedTrials`: queries the public ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in the indication and returns their `whyStopped` reasons, citation-traced by NCT id ("graveyard memo"). Fail-soft (returns `[]` on any error), injectable `fetch`, polite User-Agent.
- Wired for `scout` + `competitive_intel_analyst` in `tool-prefetch-map.json` (`optional`), constructed in `_workflow-runtime.js`. `renderRecord` now surfaces `**Stopped:** <reason>`.

### Confirmed live (armed run, cardiovascular-disease-prevention topic)
- `ctgov_stopped_trials_ok` count **6** (real CT.gov call) → scout `doc_count` 4→5 → citation gate `fetched_id_count` 56→**64** (stopped-trial NCTs now grounded) → report cites **42 NCT** + 5 terminated/withdrawn mentions; gate 18/25 grounded (0.72), pass; clean exit, no orphan.

### Next on this seam
- Change-history mining (`/api/int/studies/{nctId}/history` — per-NCT version deltas; post-search enrichment of the fetched trials).
- Retraction check (Crossref `/works/{DOI}` — per-DOI; post-step over the report's cited DOIs, feeding the Slice-1 gate as an integrity flag).

## [2026-06-11] Fix (found by a live armed run): citation-gate ground truth was being dropped

A live armed workflow exercising the Slice-1 gate exposed a bug the unit tests couldn't: `research-output-manager.js` `saveOutput` writes a **fixed metadata whitelist**, so the new `fetched_citation_ids` + `citation_verification` fields were silently dropped on write. Effects: (1) the report-level gate saw `fetched_id_count:0` → no ground truth → could never hard-fail; (2) with zero ground truth it marked **all** report citations `[UNVERIFIED]` (false positives). The per-role checks worked (analyst 0.75, synthesizer 0.80 grounded), proving the data existed but wasn't reaching the gate.

### Fixed
- Added `fetched_citation_ids` + `citation_verification` to `saveOutput`'s `normalizedMetadata` whitelist. Proven by round-trip harness: `saveOutput` now persists both. The report-level gate will read real ground truth on the next run (correct grounded/ungrounded split, accurate hard-fail + annotation). **Tests: 284/284.**
- Noted (not yet fixed, doesn't affect the gate): `subtask_results` lack a `role` field (`role=?`).
- **Confirmed end-to-end (2026-06-11, second armed run):** `citation_gate` reported `fetched_id_count:56`, `grounded:13/15` (`grounded_ratio:0.867`), 2 ungrounded flagged + `[UNVERIFIED]`-annotated, `pass:true`; synthesizer 14/14 grounded; metadata now carries `fetched_citation_ids`; clean exit. The gate reads real ground truth and grounds correctly — the whitelist bug is fully resolved. (Real calibration data: 0.867 sits well above the 0.34 default, so legit runs pass while the model-introduced citations are caught.) _(superseded 2026-07-10: the 0.34 default was replaced by a required 0.75 fail-closed floor in `config/agent-config.json`; see SYSTEM-REALITY.md.)_

## [2026-06-11] Post-research engine — Slice 1: report-level citation gate (hard-fail)

The brand promise turned into mechanism: a report whose citations can't be traced to runtime-fetched evidence either ships clearly marked UNVERIFIED, or doesn't ship. **Tests: 284/284 (277 + 7 new gate tests), 0 regressions.**

### Added
- **`openclaw-bridge/core/citation-gate.js`** — `verifyReportCitations` (unions each role's `fetched_citation_ids` → cross-checks the assembled report → pass/fail), `annotateUngrounded` (inline `[UNVERIFIED]` marks + a "Citation Verification" summary), `annotateSubtaskOutputs` (rewrites shipped sections so the bundle carries the marks), `collectFetchedIds`/`collectReportText` (injectable readers → fully unit-tested). +7 tests.
- **`agent-engine.js`** now persists each role's **live ToolUniverse-fetched identifiers** (`fetched_citation_ids`) into its task metadata — the gate's ground truth (distinct from anything the model wrote).
- **`workflow-engine.js executeMissionStep`** runs the gate after every mission: logs `citation_gate`, records `artifacts.citation_verification`, writes `citation-verification.json` + `report-annotated.md`, and **hard-fails (`PHASE30_CITATION_UNVERIFIED`)** when the grounded ratio falls below the threshold. On a pass-with-warnings it annotates the shipped sections in place.

### Design safeguards
- **Fails only with real ground truth:** if no identifiers were fetched, the gate cannot (and will not) fail the run — an empty fetch is surfaced as `tool_prefetch_zero_docs`, not a citation failure (also keeps mocked tests safe). _(superseded 2026-07-10 — no longer true: under the never-hallucinate doctrine a zero-evidence run now BLOCKS with `PHASE30_CITATION_INSUFFICIENT_EVIDENCE` instead of auto-passing. This "empty fetch can't fail here" carve-out was the doctrine hole that ruling closed; the gate is now multi-state and only PASS ships. See SYSTEM-REALITY.md.)_
- **Tunable threshold** `config.minGroundedCitationRatio` (default **0.34** — blocks egregious mass-hallucination while tolerating a few real-but-unfetched landmark citations; tighten to 0.5/0.7 after calibrating on real runs). Annotation marks *every* ungrounded citation regardless of the pass/fail threshold. _(superseded 2026-07-10: the 0.34 default (and a dead 0.5 default) were reconciled into one required 0.75 fail-closed floor — the B-grade floor `DEFAULT_MIN_GROUNDED_RATIO` in `config/agent-config.json`, read fail-closed (missing/invalid → strict 0.75 + warning) — and the gate became multi-state: PASS / UNVERIFIED (`PHASE30_CITATION_UNVERIFIED`) / INSUFFICIENT_EVIDENCE (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE`, zero-evidence now BLOCKS) / NO_CITATIONS (`PHASE30_CITATION_NONE`); only PASS ships. See SYSTEM-REALITY.md.)_

### Still queued (post-research engine)
- Slice 2: ingest the under-exploited public corpora (ClinicalTrials.gov `whyStopped` + change-history archive, retraction feeds). Slice 3: deliverable assembly (kill memos / foundation-risk ratings). Slice 4: de-identified client-data lane (authorized connector/API, NON-PHI enforced) joined to the public failure graph. Direction set by `product-strategy/novel-cost-cutting-brief-2026-06-11.md`.

## [2026-06-11] Zero-fabrication hardening + per-task citation gate + cost-cutting research

Brand-critical: make the models structurally unable to "decide" to fabricate, add a verification gate that flags any ungrounded citation, and research the post-research-engine direction. **Tests: 277/277, 0 regressions.**

### Added / Changed
- **ZERO-FABRICATION mandate (every role):** `agent-engine.js buildPrompt` now carries an "ABSOLUTE RULE — ZERO FABRICATION" clause ("if no real retrievable source, write `[no verifiable citation found]` — never invent an identifier; saying you couldn't find it is always correct"). Mirrored in all four `config/agents/<role>/SOUL.md` hard-rules.
- **Per-task citation-verification gate (`agent-engine.js executeTask`):** cross-checks each role's output citations against the grounded identifier set (all inputDocs = live prefetch + upstream) via `crossCheckCitations`; logs `citation_verification` (cited/grounded/ungrounded/ratio) + warns `citation_verification_ungrounded`, and records it in the output metadata. **FLAG-level** (records + warns; does not hard-fail). Harness-proven: it flags a model-introduced PMID while keeping the real fetched ids.
- **Memory:** `trinc-never-hallucinate` — non-negotiable rule with all enforcement layers listed.
- **Research:** `product-strategy/novel-cost-cutting-brief-2026-06-11.md` — a 7-vector web-research synthesis (64 strategies, 12 novel) ranking cost-AVOIDANCE plays (literature-integrity audit, stop-reason archaeology, ClinicalTrials.gov change-history mining, buried-negative recovery, genetic-support × stop-reason, VOI evidence-spend) + the de-identified client-data join as the moat.

### Operator decisions captured (for the deferred post-research-engine build)
- Client data: **de-identified / aggregate only — NO PHI** (preserves the global infra-security-only rule).
- Report-level citation gate: **hard-fail above an ungrounded-ratio threshold** (the per-task flag shipped here is phase 1).
- Client-data ingestion: **authorized connector/API**.

## [2026-06-11] Live armed trace + the 5 proposed improvements

Ran one real **armed** workflow (`general-research-pack`, YubiKey-gated) end-to-end with `OPENCLAW_TRACE=1` instrumentation, then implemented all 5 items from the prior pass's "Proposed" list. Run was clean: **5/5, exit 0, process exited on its own, no orphaned ToolUniverse server**, report citation-dense (31 NCT + ~24 PMID/CID/DOI + 3 CHEMBL + 1 UniProt). **Tests: 277/277 core (275 + 2 new), 0 regressions.**

### Live-trace findings (only a real run reveals these)
- **The "doc_count-0" worry is resolved.** Trace showed `doc_count` 3 / 3 / 1 (scout/analyst/synth) — `result` arrives as the normalized records array (8 PubMed + 8 trials + 1 SemanticScholar for scout) and `formatToolResult` correctly tags docs `tooluniverse://…`, so the "PRIORITIZE live data" prompt instruction fires. The earlier `#normalizeResult`/topic-fallback fixes had already closed the empty-data path.
- **The real gap, quantified:** the report cites **31 NCT** but only ~8 trials were *fetched* per role → the model expands citations from parametric knowledge beyond the runtime-fetched set. This is a citation **verification** gap (not grounding), and is the true target of the validator.
- Verified non-issue: `OpenTargets_get_drug_id_description_by_name` was skipped (empty drug-name arg for an aspirin topic) — expected.

### Added / Changed
- **#1 (citation verification):** new `crossCheckCitations(reportText, fetchedIds)` in `citation-extractor.js` — splits a report's citations into runtime-verified vs model-introduced + `verified_ratio` (the validator's first building block; +2 tests). **Next step (documented):** persist the prefetch's fetched identifiers per mission, then gate on `verified_ratio` in the quality-audit step.
- **#2 (`workflow-engine.js` quality_report):** now carries `citation_density_raw`, `min_verified_citations`, `threshold` — **and fixes a real bug**: `pass` read `result.pass` (always `undefined`; the step returns the boolean as `ok`) so note-gen always saw `pass: undefined`. Now `result.ok ?? result.pass`.
- **#3 (`agent-engine.js`):** when tool-prefetch throws, a "DATA LIMITATION — do not fabricate identifiers" notice doc is injected into the prompt so the model knows it is running without live grounding.
- **#4 (`deliverable-packager.js`):** the 5 inline citation-dedup sites now reuse `deduplicateCitations()`.
- **#5 (`scripts/run-workflow.js`):** drain-aware exit — flush stdout via the write/drain callback before the forced `process.exit`, with a 2 s backstop (keeps the forced exit so it can never re-hang, but no longer risks truncating the final JSON under load).
- **Instrumentation:** `tool-prefetch.js` gained an `OPENCLAW_TRACE`-gated `trace_tu_call` log (raw ToolUniverse response shape per call) — off by default, retained as a permanent debug tool.

## [2026-06-11] Workflow debug pass — orchestrated audit + 6 fixes + false-positive triage

A 75-agent orchestrated audit (one read-only auditor per pipeline stage → adversarial verification of every finding) surfaced **67 candidates → 42 "verified"**. Engineering review then separated real bugs from stale-knowledge / by-design false positives. **Tests: 275/275 core + 61/61 touched suites green, 0 regressions.**

### Fixed (verified real, minimal, invariant-safe)
- **`deliverable-packager.js` `commitBundle`** — the EXDEV cross-device copy fallback now cleans a partial destination + rethrows with context on copy failure, so a half-written bundle can never be mistaken for a complete one.
- **`tooluniverse-mcp.js` `#normalizeResult`** — when a tool's result envelope nests the row list under a key outside the known set AND exactly one property is an array, use it instead of dropping to a single hollow record (which silently lost the payload + identifiers). Single-array-only, to avoid grabbing a metadata/warnings array.
- **`tu-process-manager.js`** — reset `restartCount` after a healthy handshake; a long-lived server no longer exhausts its restart budget from old transient restarts.
- **`agent-session-recorder.js`** — atomic writes (`.tmp` + rename) for the session record and the rolling `summary-latest.json`, so a crash mid-write can't corrupt the summary.
- **`operator-approve-gate.js`** — the verifier now returns `{ ok: true, bypassed: false }` on the real-token path (consistent contract across all success paths).
- **`tool-prefetch.js`** — emits a `tool_prefetch_zero_docs` warning when queries ran but returned 0 documents — making the #1 product gap (citations model-generated, not runtime-verified) observable in the logs.

### Audit findings deliberately NOT changed (rationale recorded so they aren't "re-found")
- OpenAI provider's `/v1/responses` + `input` is the legitimate **Responses API** (auditor assumed Chat Completions); also not in the active routing.
- `claude-sonnet-4-6` **is** the current model — the "model doesn't exist" finding would have *downgraded* it to an older one.
- Citation regexes kept strict (`CID\d{3,12}`, `CHEMBL\d{2,10}`): for a citation-**accuracy** product, precision > recall — widening to `\d{1,…}` would mint stray false-positive citations (e.g. "CID: 5").
- `assertMandatoryApprovals` context-injection "bypass" is the standard use-or-request idiom in a **local single-operator** engine (the supervisor check still throws if unapproved); altering it risks the working approval flow — flagged for a dedicated review, not silently weakened.
- "Duplicate `saveOutput`" is an intentional two-phase write (first call establishes `task_dir` for the RLHF step, second adds the rlhf path); `saveOutput` is synchronous so the "without await" concern is moot.
- The bare `node --test tests/core/` "1 test / 1 fail" was an **invocation quirk** — `npm test` / the glob (`tests/**/*.test.js`) give 275/275.

### Proposed (not yet done — worth doing, in priority order)
1. **Root-cause the doc_count-0 prefetch path** (ToolUniverse returning empty for some queries) — this is the #1 product-quality task: until fixed, some citations are model-generated, not runtime-verified. The new zero-doc warning makes it observable; a citation resolver/validator is the durable fix.
2. `workflow-engine` `artifacts.quality_report` could carry **all** fields `executeQualityAuditStep()` returns (note-gen currently sees a subset).
3. `agent-engine` could inject a "live-data limitation" notice into the prompt when tool-prefetch errors (so the model knows it's running without grounding).
4. `deliverable-packager` could reuse `deduplicateCitations()` instead of ~5 inline dedup sites.
5. `run-workflow.js` drain-aware exit (`process.exitCode` vs immediate `process.exit`) for very large stdout under load — low risk today.

## [2026-06-11] Gate PIN-before-touch + CA self-exec + post-wipe path-drift sweep

### Changed
- **Gate forces a fresh PIN every arm.** `~/Security Everything/openclaw-approve/bin/operator-approve-gate` `cmd_arm()` now runs `gpgconf --kill gpg-agent` before the `gpg --decrypt`, so pinentry prompts for the PIN **first** and the YubiKey touch request can't go unnoticed. (Side effect: clears the shared gpg-agent cache, so the other YubiKey gates — `cdp-gate`, `gh-mcp` — re-prompt for PIN on their next use too. Kept deliberately until an easier solution.)
- **`scripts/run-workflow.js` self-sets the CA.** A guarded re-exec shim at the top: if `NODE_EXTRA_CA_CERTS` is unset (direct `node` invocation, not via `run-workflow.sh`/the plugin) and the mkcert root CA exists, it re-execs node once with the var set (sentinel-guarded, no-op when already set or CA absent). Verified: unset→re-execs once; preset→no re-exec.

### Fixed — post-wipe path drift (`/Users/trevorrobey` → correct targets)
- Swept **20 active code/config/script files + 3 `.claude/settings` files**: repo paths → `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/...` (old `OpenClaw-Research-Agents` → `Trevor Robey Intelligence Network Citations`, `THE Copilot in Obsidian Everything` → `Copilot-Everything`); home-tool paths (`.nvm`/`.codex`/`.local`/`Library`/`Code`/…) → `/Users/myhome`. 0 residual in executable code. Backup: `/tmp/drift-backup-2026-06-11.tgz` + per-file `.bak-drift-2026-06-11`.
- **Instruction docs (2nd pass):** also corrected current-guidance paths in the instruction-doc CLAUDE.md files (root, `Claude/`, `obsidian-openclaw-command-center/`) + the research-memory MCP README, resolving the dead `trevor-robey-inc-agents` subdir name to `Trevor Robey Intelligence Network Citations`.
- **Config templates:** also fixed `obsidian-copilot-bridge/config/obsidian-cli-mcp.json.example` (vault root) + `scrape-sidecar/.env.example` (mkcert cert paths) so fresh copies don't inherit old paths. The full active code/config/script/template surface is now 0 `/Users/trevorrobey`.
- **`ARCHITECTURE.md` brought current:** repo-topology line (now `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus`, engine renamed to `Trevor Robey Intelligence Network Citations/`, relocation noted), the provider-routing banner / §1 table / overview diagram, and the currency statement (refreshed 2026-06-11). Its deeper Phase-35 body is left as the historical *design* reference it declares itself to be.
- **Deliberately spared:** the 21 `audit/`+`audit/evidence/` JSON files (historical provenance — must not be rewritten); the dated `.md` snapshots (RECOVERY-REPORT / tasks / handoffs / Copilot-Everything docs / `.specify` specs); and `Claude/CLAUDE.md` L115's "Path migrated from …" note (rewriting it would falsify history). All swept code/config files re-validated (JSON parse / `node --check` / `bash -n`); engine tests green.

## [2026-06-11] Local backends activated — LM Studio + Ollama boot-persistence + gated Obsidian launch

Brought LM Studio + Ollama out of retirement as live per-role backends, made Ollama survive reboots, added a CA wrapper, and routed the Obsidian launch through the same YubiKey gate as the CLI.

### Added / Changed
- **LM Studio** installed (`brew --cask`, 0.4.16); `qwen/qwen3.5-9b` (9B, Q4_K_M GGUF, ~6.1 GiB resident) downloaded + served on `:1234` via the `lms` CLI. **analyst → lm-studio** in `config/role-provider-map.json` (`qwen/qwen3.5-9b`, fallback claude-code); `config/llm-providers.json` `lm-studio.model` updated. Adapter-level verified end-to-end (`provider=lm-studio model=qwen/qwen3.5-9b text="OK"` through the `:1235` proxy).
- **Ollama boot-persistent**: `homebrew.mxcl.ollama` LaunchAgent bootstrapped (RunAtLoad + KeepAlive), serving `:11434` across reboots. (`brew services` was silently flaky; used `launchctl bootstrap gui/<uid>` directly — exit 0, state active.)
- **`scripts/run-workflow.sh`** wrapper — exports `NODE_EXTRA_CA_CERTS` (mkcert root CA) so the `local`/`lm-studio` TLS proxies validate; passes all args through to `run-workflow.js`.
- **Obsidian launch gated**: `Claude/obsidian-openclaw-command-center/src/subprocess/openclaw-runner.ts` now spawns with `--operator-approve` + `NODE_EXTRA_CA_CERTS`; plugin rebuilt (`npm run build`) + deployed to the vault plugin dir. Obsidian runs now require `operator-approve-gate arm` (PIN+touch) first — **resolves the Phase-4 §1 plugin-vs-gate escrow (option b)**.

### Routes (final — same-day operator decision: one local model for stability)
- `scout → local` (Ollama qwen2.5:7b-instruct), **`analyst → claude-code`** (reverted from lm-studio so Ollama is the *only* local model on 16 GB — stability over a second local model with the security stack running), `synthesizer → claude-code`. scout falls back to claude-code if Ollama errors.
- **LM Studio kept installed + configured** for an easy later flip: `qwen/qwen3.5-9b` stays on disk, the `lm-studio` provider entry is intact, and analyst's route is staged in `_recommended_after_install`. The model was **unloaded** (`lms unload --all`) to actually free ~6 GB (server still listening on :1234).
- Billing: claude-code is authenticated via the **Claude Max 20× subscription** (flat-rate, not per-token); `hasExtraUsageEnabled:true` means usage beyond Max limits bills as metered extra usage.

### Manual steps remaining
- **Reload the Command Center plugin in Obsidian** (disable/enable or restart) to load the new `main.js`.
- LM Studio's server is **not** boot-persistent (start via `lms server start --port 1234`, or set the app to launch at login). 16 GB note: scout(Ollama ~5 GB) + analyst(LM Studio ~6.1 GB) co-resident is near the RAM ceiling with the MISP/Wazuh/Falcon stack; the claude-code fallbacks cover an OOM.

## [2026-06-11] Multi-agent stateful routing — capability (backward-compatible)

Meshed a stateful multi-agent layer into the engine: role-based persistent identities + per-role backend routing + session recording. Additive and fail-soft — with the shipped config, every role still runs on `claude-code` (verified), independent of whether Ollama/LM Studio are installed. The `run-workflow.js` CLI/stdout contract and the Command Center plugin contract are untouched.

### Added
- `openclaw-bridge/core/role-provider-router.js` — resolves role→{provider,model,fallback}; precedence map[role] → context (template/global default) → map.default → claude-code.
- `openclaw-bridge/core/agent-context-loader.js` — loads `config/agents/<role>/{SOUL.md,AGENTS.md}` + recent-session digest into an `agentIdentityPrefix` (fail-soft: missing files → no-op).
- `openclaw-bridge/core/agent-session-recorder.js` — appends `config/agents/<role>/sessions/<id>.json` + rolling `summary-latest.json` (fail-soft).
- `config/role-provider-map.json` (empty `roles{}` = claude-code default; recommended local routes documented under `_recommended_after_install`).
- `config/agents/{scout,analyst,synthesizer}/{SOUL.md,AGENTS.md,agent.json}` — role-based persistent identities. `sessions/` gitignored.

### Changed
- `openclaw-bridge/core/role-router.js` `dispatch()` — resolves the role's route + loads its SOUL identity into the handler context, then records a session (autonomy/approval gate unchanged).
- `openclaw-bridge/core/agent-engine.js` — `buildPrompt` prepends `context.agentIdentityPrefix`; the `complete()` call passes `context.provider`.
- `openclaw-bridge/core/llm-adapter.js` — `complete()` accepts a per-call `provider` override (absent → bound provider = unchanged; `getProviderInfo()` still reports the bound default).
- `scripts/_research-runtime.js` — passes `rootDir` into `createRoleRouter`. `config/agent-config.json` → `phase34-agent-config-v2` (+ `agentStateDir`, `roleProviderMap`).

### Verified
- `tests/core/multi-agent-routing.test.js` 8/8 + 24/24 regression; SHIPPED map resolves every role to claude-code (backward-compat); a real `role-router.dispatch` wrote a session record.

### Activated + verified end-to-end (same day)
- **Ollama installed** (`brew`, 0.30.7), serving on `:11434`; pulled `qwen2.5:7b-instruct` (4.7 GB, the agents' model — clean instruct, no thinking-mode pollution) + `qwen3:8b`.
- **`scout` routed to the local Ollama backend** in `config/role-provider-map.json` (`provider:"local"`, `qwen2.5:7b-instruct`, fallback `claude-code`); `synthesizer`+`analyst` on claude-code (avoids two local models on 16 GB).
- **Role-level fallback** added: `llm-adapter.complete()` retries once on `completionOptions.fallbackProvider` when a routed backend errors (so a down Ollama degrades to claude-code). `agent-engine` passes `context.fallbackProvider`.
- **Armed end-to-end run** (`--operator-approve`, YubiKey consumed): scout `metadata.json`/session = `provider:local model:qwen2.5:7b-instruct`; SOUL identity prepended (`agent_identity_loaded has_soul:true`); session records written under `config/agents/{scout,analyst,synthesizer}/sessions/`; **0 fallbacks** (scout genuinely used Ollama); `workflow.json` 5/5 `completed`, contract intact; clean exit, no orphaned ToolUniverse server.
- **Env requirement:** the engine needs `NODE_EXTRA_CA_CERTS=~/Library/Application Support/mkcert/rootCA.pem` for the `local` provider's `:11435` TLS proxy.

### Still pending operator action
- `analyst → LM Studio`: install LM Studio (GUI), load a ~9 B Q4 model on `:1234`, then flip its `_recommended_after_install` entry into `roles`. Plugin-vs-gate mismatch remains escrowed (Obsidian-launched runs still blocked at the gate).

## [2026-06-11] operator-approve YubiKey consent gate + report cleanup

### Added
- **YubiKey PIN+touch gate on `--operator-approve`** (mirrors cdp-gate / gh-mcp). The flag is now only honored when a FRESH armed token exists.
  - Gate CLI `~/Security Everything/openclaw-approve/bin/operator-approve-gate` (setup/arm/disarm/status). `setup` seals a random nonce to the YubiKey OpenPGP ENC key `E7C4694D…` (same key as cdp-gate); `arm` does `gpg --decrypt` → pinentry PIN + physical touch → mints a one-shot token (TTL 300s, 0600) in `~/.local/state/openclaw-approve/`.
  - `openclaw-bridge/core/operator-approve-gate.js` — `run-workflow.js` verifies+consumes the armed token when `--operator-approve` is set: one-shot (unlink), hash-checked against the sealed nonce, TTL-bounded, nonce-rotated on use, **fail-closed**. Bypass `OPENCLAW_APPROVE_GATE=0` (tests/CI only).
  - `scripts/run-workflow.js` checks the gate before spawning anything; denial exits 1 with guidance.
- Verified: fail-closed denial when not armed (no engine spawn); verifier logic unit-tested (positive / tamper / not-armed / expired / bypass); 20/20 engine tests still green.

### Removed
- Cleaned all generated citation-report artifacts from `workspace/` (releases/missions/research-output/datasets/workflows) — gitignored runtime output.

## [2026-06-11] Live-data grounding — ToolUniverse result parsing (operator-authorized)

Citations were coming from Claude's training knowledge because fetched records never reached the agents. Two layers fixed; report now cites live-fetched records.

### Fixed
- `openclaw-bridge/core/tool-prefetch.js` — topic fallback so topic-only workflows actually query the connectors (empty drug-var templates → use `topic` for `query`/`query_term`; drop empty secondary args; skip only when nothing queryable remains). Test: `tests/core/tool-prefetch-topic-fallback.test.js`.
- `openclaw-bridge/mcp/tooluniverse-mcp/tooluniverse-mcp.js` — `#normalizeResult` now extracts records from ToolUniverse's actual envelope: `result.data` (PubMed/SemanticScholar/EuropePMC) and `result.data.studies`/`results`/`articles`/`records`/`hits` (ClinicalTrials); returns empty (not a hollow record) on `status:success` with no data.
- `openclaw-bridge/mcp/tooluniverse-mcp/tu-record-normalizer.js` — read real payload fields (`abstract`, `brief_summary`, `brief_title`) and **preserve identifiers** (pmid, `NCT ID`→nctId, doi, pmcid, journal, pub_year→year, phase, overall_status→status, chembl). Test: `tests/core/tu-record-normalizer-payload.test.js`.

### Verified
- Live re-run: scout/analyst/synthesizer prefetch `doc_count` 3/3/1; report cites fetched records (e.g. PMID 42238436 ASPREE SAP, NCT01776424); zero "training-knowledge" disclaimers; 45/45 relevant tests green.

### Fixed (teardown hang)
- `run-workflow.js` finished the workflow but never exited — the ToolUniverse SMCP server + its 30s health-check `setInterval` were never shut down, leaving orphaned `tooluniverse-smcp-stdio` processes and suppressing the completion signal. `scripts/_workflow-runtime.js` now exposes `shutdown()` (delegates to the existing `ToolUniverseMcp.shutdown()`), `scripts/run-workflow.js` calls it in a `finally` and forces a clean `process.exit(code)`. Verified: run exits code 0, logs `workflow_runtime_shutdown`, zero orphaned servers, completion notification fires.

## [2026-06-10] Engine fix — operator-approve wire + EXDEV packager fallback (first complete report produced)

A live run revealed the Phase-30 workflow engine could never complete a research mission: the Phase-15 autonomy gate (`openclaw-bridge/core/role-router.js`) requires `context.operatorApproved === true` for every research role's `execute_task`, and no production path ever set it (only a unit test did). Fixed without weakening the gate.

### Added
- `scripts/run-workflow.js` — opt-in `--operator-approve` flag (default OFF / fail-closed) that threads `operatorApproved` through `executeWorkflow` → `executeMissionStep` → `spawnMission` → dispatch context. Emits a `phase15_operator_approval_granted` audit log when used.
- `tests/core/phase30-operator-approve.test.js` — 5 regression cases: gate blocks when flag off / explicitly false, permits only when true; engine forwards the flag into `spawnMission`.

### Fixed
- `openclaw-bridge/core/workflow-engine.js` — `executeMissionStep` now forwards `operatorApproved` to `spawnMission` (the one threading point).
- `openclaw-bridge/monetization/deliverable-packager.js` — `commitBundle` now falls back to copy+remove on `EXDEV` (cross-device `rename` from `$TMPDIR` → `workspace/releases` when the repo is on an external volume).

### Verified
- Fail-closed: without `--operator-approve`, the real CLI still throws `PHASE15_HUMAN_APPROVAL_REQUIRED`.
- With the flag: workflow completed 5/5 steps; produced a 196-row dataset (219 citations) and exported an 88 KB report bundle (`deliverables/report.md` 61 KB). No existing tests regressed.

### Known gap (not addressed here)
- Tool-prefetch returned near-empty results (`doc_count` 0/1/2), so citations are model-generated, not runtime-verified. Citation resolver/validator remains the #1 product-quality task.

## [2026-06-10] Documentation reality-alignment pass

Audit of the whole business (engine, connectors, brand, GTM) reconciled docs to running config and the dated channel record. No code changed; nothing sent or published.

### Added
- `SYSTEM-REALITY.md` — single ground-truth "how the business works today" doc (engine, provider truth, citation-resolver gap, built-but-not-live inventory, channel/revenue reality).
- `CONNECTOR-ALIGNMENT.md` — maps the 3 connector execution surfaces (subprocess-mcp / tooluniverse-tool / claude-host-mcp) to business function; defers to `config/connector-registry.json` as machine truth.
- `audit/business-reality-2026-06/{00-audit-report,01-alignment-actions}.md` — the audit and its change-of-record.
- `12-pipeline-tracking/*` — replaced empty placeholders with a dated 2026-06-10 zero-baseline ($0 revenue, 0 listings/calls/NDAs/deals) + structured logging tables.

### Changed / corrected
- `../ARCHITECTURE.md` (repo root) — banner: Scout→Ollama/Analyst→LM Studio role routing is historical, not active (claude-code is default for all roles); container governance is un-invoked scaffold.
- `README.md` — Phase Status table extended to 29/30/31/33; "Phase 31 planned" corrected to "implemented + locally tested, not externally deployed"; Phases 24/25 marked disabled.
- `03-platforms/datarade/vendor-application.md` — stale "Submit by Apr-28" header replaced with submitted-2026-05-11 → declined-2026-05-20 status; DrugBank register line no longer advertises an unheld "DrugBank-licensed pack."
- `03-platforms/aws-data-exchange/correspondence-2026-05.md` — verify-first note: no AWS thread found in Zoho or Gmail (2026-06-10); escalation lapsed; check alias inbox + AWS console case history before sending.
- `09-source-licenses/drugbank-stop-ship-unless-licensed.md` + `drugbank-regex-gate.md` — placeholders filled (no license held, STOP-SHIP, `DB\d{5}` build gate).
- `REVENUE_PLAYBOOK.md` — appended `## Continuation — 2026-06-10` (corrected channels, $0 baseline, direct-sale-first correction).
- `trevor-robey-inc Commercial Launch Playbook.md` — appended post-mortem of the Apr 27–May 22 plan + a revised 30-day plan (artifact + outbound first; AWS verify-first).

## [2026-05-06] California LLC formation filed

- Articles of Organization filed at California Secretary of State (bizfileOnline) on 2026-05-06; receipt B20260217250; standard processing.
- Legal entity name (pending CA SOS approval, expected 2026-05-09 ± 1 day): **Trevor Robey Intelligence Network Citations LLC**, a California limited liability company.
- Brand wordmark adopted: **"Trevor Robey, INC."** where INC = Intelligence Network Citations (a backronym, not a corporate suffix). Customer-facing materials pair the wordmark with a disclosure of the underlying LLC entity per Cal. Bus. & Prof. Code §17910.5(a). The legal name spells the words out per Cal. Corp. Code §17701.08(e) (which bars "Inc." inside LLC names).
- Filing record: [`00-business-formation/llc/certificate-of-formation.md`](00-business-formation/llc/certificate-of-formation.md).
- Domain `trevorobeyinc.com`, email `trevor@trevorobeyinc.com`, AWS Marketplace seller display name `trevor-robey-inc`, repo slug `trevor-robey-inc-agents` — all unchanged (slugs/domains aren't regulated entity names).

## [Unreleased]

### Removed — rebrand baggage cleanup (P3)

Tracked deletions:

- Stale live-LLM evidence in `audit/evidence/live-llm/` older than 30 days (9 files, all dated 2026-03-05).
- Stale MCP-live evidence in `audit/evidence/mcp-live/` older than 30 days (3 files, all dated 2026-03-05).

Untracked filesystem cleanup (not in git history):

- Auto-generated mission run logs under `workspace/missions/` (~460 files, gitignored; regenerated per workflow run).
- Backup snapshot files matching `**/*.bak.cleanup.*` (15 files, untracked).
- Top-level `node_modules/` (~17 MB, regenerable via `npm install`).
- Test-output leakage under `var/folders/` (~1.8 MB, untracked; originated from a misdirected `$TMPDIR`).

### Reset

- `state/runtime/state.json` reset to `{}` (gitignored runtime checkpoint, was 302 KB).

### Recovery anchors

- Tag `pre-rebrand-2026-04-27` on `main` is the durable rollback point for the entire rebrand effort.
- Branch `wip-snapshot-2026-04-27` preserves the pre-P3 WIP commits on the feature branch.
