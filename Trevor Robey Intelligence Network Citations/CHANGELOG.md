# Changelog

All notable changes to this repository are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026-07-16] Option B — engine is 100% Claude; LM Studio decommissioned

The per-role routing was simplified to Claude-only and the local OSS-model helper/fallback layer was removed. Authoritative config: `config/role-provider-map.json` (schema `phase34-role-provider-map-v1`) + `config/llm-providers.json`.

- **Engine now 100% `claude-code`** — scout / analyst / synthesizer → `claude-opus-4-8`; `default` + unmapped roles → `claude-sonnet-4-6`. Every role `fallback` is `""` (empty), so a primary failure surfaces the real error instead of chasing a local backend.
- **LM Studio decommissioned** — removed its TLS proxy (`:1235`), the `com.trevorrobey.lm-studio-tls-proxy` launchd unit, the `lm-studio` provider in `llm-providers.json`, and its role route; the app + `~/.lmstudio` were moved to Trash. The live TLS-proxy set is now **3** (Ollama `:11435`, Miyo `:8743`, Qdrant `:6433`), not 4.
- **OSS helper pre-passes + local fallbacks removed from the engine** — no more `runHelperPrePass`, no per-role local fallback (scout→Ollama, analyst/synthesizer→LM Studio).
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
