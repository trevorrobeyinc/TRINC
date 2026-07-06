# Trevor Robey, INC. — Shared Continuity Board

> **ONE living board, shared by all four Claude surfaces.** This is the single source of
> truth for *what is being worked on right now* across the whole `TrevClaw-Obsidianodus`
> business stack. Every surface — **CLI Claude Code**, **Desktop Claude Code**, **Cowork**,
> and **Claude Chat (Desktop)** — reads this file at the start of a session and appends to it
> when it makes meaningful progress or hands off.
>
> **Read this top-to-bottom before you touch anything.** How the system works, how each
> surface reaches this file, and the write-safety rules are in **[`README.md`](README.md)**.

- **Canonical path:** `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/_continuity/CONTINUITY.md`
- **Repo-canonical, single file** — there is no mirror and no copy. All four surfaces edit *this* file on disk.
- **Business canon (do not duplicate here — point to it):** repo `CLAUDE.md`,
  `Trevor Robey Intelligence Network Citations/{THE-WHOLE-SYSTEM.md, SYSTEM-REALITY.md}`.

---

## 🧭 30-second protocol

1. **On start** → read **Current focus** + the top 3–5 **Log** entries. That is the live state.
2. **On meaningful progress or handoff** → **prepend** a Log entry (newest at top) using the
   template at the bottom. Keep it short and factual.
3. **Keep "Current focus" true to *now*** — update it (don't just append) so it always answers
   "what are we working on this minute?"
4. **Append, don't rewrite** other surfaces' Log entries. History is the point.
5. **External-volume write caveat (especially Claude Chat):** this file lives on the
   `/Volumes/ExtraCurricular` external SSD. Writes can hang or `EPERM` (disksleep / a wedged
   Filesystem MCP). **Probe-first, verify-after, and if a write hangs restart the Filesystem
   MCP connector** — full procedure in [`README.md`](README.md#write-safety-external-volume).

> **Scope gate — business only:** write to this board **only when the work relates to the Trevor
> Robey, INC. business** — the citation engine, offerings/revenue/brand/legal, or this repo's own
> infra/topology (the `:8798` bridge, the vault, connectors, plugins). Unrelated work (home
> network, Security Everything, personal) belongs elsewhere, **not here.**

---

## 🖥️ Surfaces sharing this board

| Surface | How it reaches this file | Auto-discovers the board via |
|---|---|---|
| **CLI Claude Code** (`claude` in Terminal) | direct filesystem | repo `CLAUDE.md` pointer + repo skill `continuity-board` |
| **Desktop Claude Code** (Desktop Code tab) | direct filesystem (Filesystem MCP) | repo `CLAUDE.md` pointer + repo skill `continuity-board` |
| **Cowork** | direct filesystem | repo `CLAUDE.md` board pointer (top of file) |
| **Claude Chat (Desktop app)** | direct filesystem — Filesystem MCP connector, allowed roots `/Users/myhome` + `/Volumes/ExtraCurricular` | user points it here; see `README.md` |

> Not the web version of Chat — the **Desktop** app, which has the Filesystem MCP connector.
> `:8798` (Obsidian bridge → `My Digital Garden`) is an *additional* semantic path, **not**
> Chat's only route to disk.

---

## 🔒 Operating posture (inherited — enforce every task, all surfaces)

- **Research artifacts only** — not validated for clinical decision support.
- **No PHI** — public biomedical sources only.
- **Manual-only external actions** — no autonomous publish / post / login / transact.
- **Citation-traceability gate** — every citation resolves to a real PMID / NCT / ChEMBL ID /
  DOI. **Never fabricate a citation**; if none exists, say `[no verifiable citation found]`.
- Canon for the above: repo `CLAUDE.md` → "Rules" + "Security Orchestration";
  `Trevor Robey Intelligence Network Citations/SYSTEM-REALITY.md`.

---

## 🔴 Current focus

> The single source of "what are we working on right now." Overwrite this to keep it true.
> If nothing is in flight, leave the placeholder so the next surface knows the board is idle.

**Claude Chat — SearXNG citation-gate v1 handed off to Code (2026-07-06).** The v2.1 connector annotates results with `citations[]` but nothing yet ENFORCES fail-closed (review gap G1). Chat has written a full build spec for Code as the newest Log entry below — the `openclaw-bridge/mcp/searxng-mcp/` subprocess adapter + a fail-closed `quality_check` gate in `run-workflow.js`, on the **fail-closed-only-at-zero** philosophy (refuse to synthesize only when zero distinct resolvable primary sources survive grading; sparse-but-real evidence ships with a visible coverage tier; never fabricate). **Next (Code):** implement per that entry — adapter (grade A/B/C/D → dedup/count → coverage tier → gate → one breadth reformulation retry), wire the gate fail-closed, flip `connector-registry.json` `adapter_status: missing → present`, tests green. **Still open on other surfaces (see Active workstreams / Parking lot):** Cowork's remaining connector authorizations (Owkin / Wiley-if-licensed / BigQuery, operator-only OAuth); the E1 citation-overclaim sweep (10 `03-platforms/` dirs left); the drive-stall-blocked `REVENUE_PLAYBOOK.md` tidy-up.

---

## 🟢 Active workstreams

> Named threads currently open, with a one-line status each. Move finished ones to the Log.

- **Citation-overclaim sweep (E1)** — _mostly done._ All collateral surfaces reframed + verified (see newest Log entry). **Remaining:** the 10 un-swept `03-platforms/` dirs — `databricks-marketplace`, `gumroad`, `kaggle-seo-breadcrumb`, `ocean-protocol`, `snowflake-marketplace`, `substack-patreon`, `tier1-aggregators-{marketresearch-com,reportlinker,research-and-markets}`, `rejected-channels`.
- **`REVENUE_PLAYBOOK.md` reality-alignment** — _blocked (drive stall)._ Tidy-up spec is ready (routing table → Opus 4.8; tools 700+ → ~2,116; §3 template names → canonical six; Phase 31 API → built-not-deployed; stale plans → current Commercial Launch Playbook). Apply via **CLI / Desktop Code** (bypasses the wedging connector) or copy to `/Users/myhome`, edit, copy back.

---

## ⚪ Parking lot / open threads

> Ideas, blocked items, and "someday" work — not active, but don't lose them.

**3 operator items (only the operator can resolve):**
- **AWS Data Exchange true status** — `SYSTEM-REALITY.md` says "approved, blocked at disbursement"; `REVENUE_PLAYBOOK.md` says "rejected 2026-05-03." The AWS files lean approved-but-blocked (`03-platforms/aws-data-exchange/public-seller-profile.md` = "pending" 2026-05-26; `product-creation.md` = nothing uploaded, payouts blocked). **Authoritative answer is likely in `03-platforms/aws-data-exchange/correspondence-2026-05.md` (unread).**
- **CA LLC SOS entity number** — filed 2026-05-06; docs still say "pending"/"populated upon approval." The landing-page footer "Entity No. B20260217250" is the **filing receipt**, not the real SOS entity #; fix once the real number is confirmed.
- **Live-site deploy source** — `~/openclaw-landing-deploy/` was on the wiped Mac, not the current machine. Confirm where `trevorobeyinc.com` deploys from now. The landing-page + HF-card citation fixes are **repo copies, not live-published** — they need a redeploy/push.

**Non-citation flags surfaced during the sweep (NOT fixed — operator's call):**
- 3 of 4 cold emails link `https://trevorrobeyinc.github.io` (dead) instead of `trevorobeyinc.com`.
- `email-target-discovery` "We do not generate AI content" contradicts the AI-assisted-synthesis reality (Opus 4.8).
- `email-quant-analyst` "I operate OpenClaw" misstates the OSS-upstream relationship; "absolute mathematical proof…for every signal" overstates the SHA-256 ledger.
- "1.0 confidence" / "1.0 Quality Confidence Score" perfect-score claims (`email-ci-director`, `email-target-discovery`) — verify or soften.
- `email-academic-researcher` Day-3 typo "formerly AEMS" → "formerly FAERS."
- `product-catalog.md` names the engine `trevor-robey-inc-agents` (stale folder alias, or an intentional engine name — confirm).

---

## 📋 Log — newest first

> Prepend new entries here. One entry per meaningful chunk of work or handoff.
> Copy the **Entry template** at the bottom.

### 2026-07-06T12:20Z · CLI Claude Code · Phase 3 — scaffolding-leak INVESTIGATION (proposal only, no pipeline edits) + local commit
- **Investigation (4-agent read-only trace):** Confirmed prompt/tool-prefetch scaffolding leaks into agent DELIVERABLES. **SOURCE (3 classes):** (1) a verbatim meta-instruction — the `LIVE DATABASE CONTEXT: … PRIORITIZE this live data over your training knowledge …` string, hard-coded in `openclaw-bridge/core/agent-engine.js` `buildPrompt()` (~L135-144), pushed onto `headerParts` whenever an input doc is `tooluniverse://`-sourced; (2) tool-prefetch synthetic-doc labels — `tool-prefetch.js` `formatToolResult()`/`renderRecord()` (~L111-160) render prefetch results as markdown (`## Live Data:`, `### {title}`, `**Stopped:**`, `Source: ToolUniverse SMCP / Query: / Retrieved:`) pushed into the SAME `inputDocs` array as real seed docs, undistinguished; (3) **model-INVENTED headers** — `Synthesis Confidence Statement` / `Action Required Before Delivery` / `Live Data Quality Assessment` exist in NO template/config (grepped role-prompts, mission-templates, workflow-templates, agent-config); the analyst/synthesizer roles have NO dedicated `role-prompts.json` entry, so they run on base `buildPrompt` scaffolding and paraphrase its confidence/live-data/zero-fabrication concepts into their own report headers. **MECHANISM:** `output.md` is written PURELY from `completion.text` (`agent-engine.js:414` → `saveOutput`; `research-output-manager.renderOutputContent` is `String(output).trim()+"\n"`, no prompt ref; llm-adapter pipes prompt to stdin, extracts only `parsed.result`) — so this is a **MODEL-ECHO problem, not a string-concat bug**. Root cause: `buildPrompt` assembles ONE undelimited block (role + citation rules + zero-fabrication + LIVE DATABASE CONTEXT + `--- DOC N: <path> ---` doc bodies) joined by plain `\n` with **no fence** separating instructions from the deliverable and **no anti-echo directive**; the deliverable-packager copies the raw markdown forward with no strip. Inter-agent handoff (`spawn-orchestrator.js:132`) feeds a subtask's raw output as a plain input doc → compounds the echo. (The section-gate `STOPWORDS` workaround only stops these words polluting SEARCH QUERIES; it does NOT clean deliverables.)
- **PROPOSAL (not implemented — for review):** **(A, root fix, recommended)** in `buildPrompt` (`agent-engine.js`), fence meta-instructions (`<instructions>…</instructions>`) + input docs (`<context><document>…`), and add an explicit anti-echo directive ("produce ONLY the deliverable; do not restate these instructions, the LIVE DATABASE CONTEXT note, DOC banners, or confidence/quality/fabrication self-assessment — those belong in metadata"). Blast radius: ONE function, but it's the core prompt path for ALL roles → needs re-validation of citation-density/quality gates + a live run. **(C, complementary, low-risk)** give analyst/synthesizer dedicated `config/role-prompts.json` entries with the same "deliverable-only" framing. **(B, belt-and-suspenders, conservative)** a fail-soft post-generation strip of ONLY the VERBATIM artifacts (the LIVE DATABASE CONTEXT sentence, `--- DOC N ---` banners, `Source:/Query:/Retrieved:` footers) — NOT the paraphrased headers (regex-stripping those risks deleting legitimate analysis: **`Failure Mode Signals`/graveyard content is REAL domain analysis**, per the engine's stop-reason-archaeology feature). Recommend A (+C); B only for the exact-match artifacts. Files that would change: `openclaw-bridge/core/agent-engine.js` (primary), `config/role-prompts.json` (optional). **PAUSED — awaiting review before any implementation.**
- **Committed (local, this session's SearXNG work):** per operator request, committed the coherent SearXNG citation-gate body of work locally on branch `docs-and-post-research-engine-2026-06-12` — the connector (`Claude/searxng-search-mcp/`), the engine adapter (`openclaw-bridge/mcp/searxng-mcp/`), the gate wiring (`workflow-engine.js`), registry, composition test, diagnostic, and these docs. **Deliberately NOT swept in** the large set of UNRELATED pre-existing working-tree changes (36 `Claude/obsidian-openclaw-command-center/` deletions + `CLAUDE.md`/Copilot-Everything bridge/obsidian-bridge-launcher mods) — a separate concern I didn't author; left for the operator to commit separately.
- **Touches (this pass):** read-only investigation (no engine edits); `_continuity/CONTINUITY.md` + `tasks/lessons.md`; a local git commit (scoped).

### 2026-07-06T11:59Z · CLI Claude Code · SearXNG gate — Phases 1–2 done (composition test + preprint grade), PAUSED at checkpoint
- **Phase 1 — composition test (gate wiring):** Extended `tests/core/phase30-workflow-engine.test.js` (reused its harness) with 4 subtests that run a `quality_audit` step through the REAL `executeWorkflow`, stubbing the connector `searchFn` **offline via a `require.cache` override of `searchfn.js`** (no production seam). Asserts: **(a) density-first** — a density-fail short-circuits, section gate NOT invoked (searchFn 0×), `PHASE30_QUALITY_BELOW_THRESHOLD`; **(b) pass** — completes, `artifacts.quality_report.section_coverage` populated w/ per-section tiers, searchFn 1×/section; **(c) fail-closed** — one section's zero-coverage → `error.code === "PHASE30_CITATION_COVERAGE_ZERO"` (throw propagates through the dispatch); **(d) subject derivation** — the query passed to searchFn carries `inputs.therapeutic_area`. **RT (stubbing):** used a require.cache override (not module-mocking, not a `createWorkflowEngine` seam) — the engine lazily `require`s `searchfn.js`, so overriding its cached export is the minimal test-only seam. **Gotcha found + isolated:** the mission step's grounded-ratio + re-resolution gates BLOCK on synthetic real-looking PMIDs/NCTs (`PHASE30_CITATION_UNRESOLVED`) before quality-audit — so the density-pass fixtures use `FAERS` lines, which trip the density regex but are NOT extractable citation ids, isolating the test to the section gate.
- **Phase 2 — preprint grade fix (`grade.js` only):** a url-derived **preprint id no longer earns grade A** (a preprint is not peer-reviewed). New order: **A** = url-source AND NOT preprint; **B** = (url-source preprint) OR (text-source); C = primary-domain; D = else. Preprint predicate = `subtype === "preprint"` (bioRxiv/medRxiv 10.1101 / Research Square / ChemRxiv DOIs) **OR** `type === "arxiv"` — read from the connector grammar, NOT re-ported (no third drift pair). **RT (predicate):** arXiv is tagged by `type` (no subtype) while preprint DOIs are tagged by `subtype`, so both checks are required. A preprint stays a counted source at B (still contributes to hasAB/Comprehensive — grade-label accuracy only, tier behavior unchanged).
- **State:** done + verified — adapter T1–T9 **+ new preprint test = 11/11**; section-gate **5/5**; phase30-workflow-engine **14/14** (incl. the 4 composition subtests); restricted-globals **still exactly the 4 pre-existing** (grade.js clean; `workflow-engine.js` untouched this pass). Footprint: `grade.js`, `test/gate.test.mjs`, `tests/core/phase30-workflow-engine.test.js`, `tasks/todo.md`. Nothing committed. **⛔ PAUSED at the checkpoint — Phase 3 (scaffolding-leak investigation, mission pipeline) NOT started; awaiting operator "continue".**
- **DEFER (board flag, Phase-2 spinout):** **off-domain preprints** (e.g. an arXiv CS paper surfacing for a clinical query) are a **relevance** problem, not a grading one — a keyword gate can't judge domain fit. Future item; not attempted. (Relatedly, the live e2e earlier showed grade-A skewing arxiv-heavy for clinical topics — same root: relevance/authority weighting is a separate lever from the A/B/C/D label.)
- **For Phase 3 (queued, after "continue"):** INVESTIGATION + written PROPOSAL only (do NOT modify the mission pipeline). Trace where leaked scaffolding (`TRAINING KNOWLEDGE`, `LIVE DATABASE CONTEXT`, `Action Required Before Delivery`, `Synthesis Confidence Statement`) originates (tool-prefetch "LIVE DATABASE CONTEXT" injection + role prompt scaffolding in `agent-engine.js`/`tool-prefetch.js`), WHY it reaches output files, a fix proposal + blast radius, then PAUSE.

### 2026-07-06T08:19Z · CLI Claude Code · SearXNG section-gate — key-term extractor SHARPENED (live-verified win)
- **Did:** Tuned `topKeyTerms`/`deriveSectionQuery` in `openclaw-bridge/mcp/searxng-mcp/section-gate.js` ONLY (additive, deterministic): (1) **strip citation-ID-shaped tokens** before ranking via a SMALL local regex set (NCT/PMID/PMC/CID/CHEMBL/DB/ENSG/GSE/GSM/SRR/DOI/UniProt) — deliberately NOT a re-port of the connector grammar (no new drift pair); (2) **expanded stoplist** — CT-table/status vocab (COMPLETED/TERMINATED/Phase/Purpose/Sponsor/Endpoint/…), ID type-names, and the leaked prompt scaffolding (LIVE/DATABASE/CONTEXT/TRAINING/KNOWLEDGE — the engine injects a "LIVE DATABASE CONTEXT … prioritize live data over TRAINING KNOWLEDGE" instruction) + pure roman numerals ("Phase III"→gone); (3) **ranking = net-distinctive tokens first** (`meaningful.length`), then word-count, then frequency as a TIEBREAK-ONLY. **RT:** ranked by net-distinctive-token-count rather than raw word-count-first because word-count-first would let a 4-word mostly-common phrase beat a 1-word distinctive drug — this way "SGLT2 inhibitor empagliflozin"(3) wins, "COMPLETED"(0, stoplisted) is gone.
- **State:** done + **live-verified** on the SAME heart-failure mission sections (`node scripts/diag/searxng-section-gate-e2e.mjs`, SearXNG up). **BEFORE→AFTER:** scout `heart failure Purpose NCT ID COMPLETED Phase II` → `heart failure HeartNet Ventricular Support System … Coronary Artery Disease … Polypills`; analyst `heart failure DOC NCT COMPLETED NCT02686749` → `… Kansas City Cardiomyopathy Questionnaire …`; synthesizer `heart failure PMID NCT NCT00382863 TRAINING KNOWLEDGE` → `… Passive Cardiac Support …`. Queries now carry **real domain sub-topics**; IDs/status-headers/TRAINING-KNOWLEDGE **gone**. **Tiers now DISCRIMINATE:** Moderate(2)/Comprehensive(4)/Comprehensive(3) (was all-Comprehensive 8/5/4). **Still ZERO false-fails.** Latency ~7.2–7.5 s/section, 22 s/3. Tests: section-gate **5/5** (added a boilerplate+ID+domain-term unit test), adapter **10/10**, restricted-globals clean.
- **Residual (next tuning increment, not fixed — kept in scope):** whole-phrase emission still lets an adjacent stoplisted token ride along ("Live Data Quality Assessment", trailing "This"/"Two"), and some **multi-word report-workflow phrases** ("Action Required Before Delivery", "Synthesis Confidence Statement", "Failure Mode Signals") escape the stoplist and now rank high (mc-first rewards multi-word). Fixes when wanted: emit meaningful-only tokens; stoplist report-workflow phrases + number-words. Core domain terms still lead, so retrieval/tiers are unaffected. (Also observed: grade-A is arxiv-heavy for clinical topics — arxiv id → A even when tangential; a separate grading-weight question, not this task.)
- **⚑ SEPARATE FINDING (flagged, do NOT fix here — report-quality bug, independent of the gate):** the mission's section OUTPUTS contain **leaked agent/prompt scaffolding** — not just `TRAINING KNOWLEDGE` but workflow language like `Action Required Before Delivery`, `Synthesis Confidence Statement`, `Live Data Quality Assessment`. Instruction/scaffolding text is bleeding into the agent's deliverable (source: the tool-prefetch "LIVE DATABASE CONTEXT" injection + role prompt scaffolding in `agent-engine.js`/`tool-prefetch.js`). Investigate later as a mission/report-quality item; the gate tuning only stops it from polluting *queries*, it doesn't fix the *deliverable*.
- **Touches:** `openclaw-bridge/mcp/searxng-mcp/section-gate.js` (extractor only), `test/section-gate.test.mjs` (+1 test), `tasks/lessons.md`. Diagnostic script unchanged. Nothing else; nothing committed.

### 2026-07-06T07:57Z · CLI Claude Code · SearXNG section-gate LIVE e2e diagnostic — SAFE but key-term extractor is BLUNT
- **Did:** Ran a read-only harness (`scripts/diag/searxng-section-gate-e2e.mjs`, wired into nothing) against **live SearXNG** (127.0.0.1:8890, UP) using **real** LLM section text — reused an existing on-disk mission (`mission-7ea38920…`, template `clinical_trial_intelligence`, subject **heart failure** from a `clinical-trial-landscape` run; scout/analyst/synthesizer `output.md` under `workspace/research-output/task-*/`). Zero LLM cost. Called `deriveSectionQuery` + real `runCitationGate` + real connector `searchFn` exactly as the engine's `executeQualityAuditStep` does; **did NOT** call `assertCoverageOrThrow` (a "fail" is data, not a throw).
- **Finding (safety holds; teeth are blunt):** On a known-good subject, **no false-fail** — all 3 sections `pass`, 4–8 distinct primary sources each; queries technically distinct (3/3). BUT the section discriminators are **boilerplate noise, not sub-topics**: the key-term extractor grabbed table-headers/status labels (`COMPLETED`, `Phase II`, `Purpose`, `NCT ID`, `DOC`), **literal citation IDs** (`NCT02686749`, `NCT00382863`), and **injected-prompt boilerplate** (`TRAINING KNOWLEDGE`, from the tool-prefetch "prioritize live over TRAINING KNOWLEDGE" instruction). Queries pass only because they lead with the primary subject "heart failure" (which carries retrieval); strip that and they're near-garbage. Symptom: **tier flattening — all 3 → Comprehensive** (every section effectively searches the broad subject, so the tier reflects subject richness, not per-section content). Net: the gate is currently ~topic-level-with-noise in effect, not truly section-level. Latency ~7–9 s/section, **23 s / 3 sections** sequential (a 6-role report ≈ 45–70 s added, no-retry).
- **Next (tuning, not a blocker):** make `topKeyTerms` selective before section-level delivers real teeth — (1) exclude citation-ID-shaped tokens (reuse the connector citation grammar to strip NCT/PMID/DOI/CID), (2) exclude clinical-table/status + prompt boilerplate (`COMPLETED/TERMINATED/Phase/Purpose/Status/Sponsor/TRAINING KNOWLEDGE/LIVE DATABASE CONTEXT`), (3) prefer rare multi-word domain phrases (drug/mechanism/endpoint, e.g. "SGLT2 inhibitor empagliflozin") over frequency-ranked structural tokens — frequency-ranking on a structured report rewards repeated headers over distinctive terms. The fail-closed-only-at-zero SAFETY is validated; the discrimination quality is the open item.
- **Touches:** new `scripts/diag/searxng-section-gate-e2e.mjs` (diagnostic only). Nothing in the engine/gate/registry touched; nothing committed.
- **For whoever's next:** re-run `node scripts/diag/searxng-section-gate-e2e.mjs` (SearXNG must be up) after any `topKeyTerms` change to re-check distinctness + tier discrimination on the same real heart-failure sections.

### 2026-07-06T03:35Z · CLI Claude Code · SearXNG citation-gate v1 — STEPS 2 & 3 wired (section gate + registry), PAUSED for review
- **Did:** Wired the Step-1 adapter into the engine as a **section-level, fail-closed-only-at-zero** citation-coverage gate (granularity decided section-level; per operator). New `openclaw-bridge/mcp/searxng-mcp/searchfn.js` (lazy-`require`s the connector's `search()` — no module-load risk; consumes the connector's already-cited output for grade A/B provenance) + `section-gate.js` (`deriveSectionQuery` = primary-subject `indication||condition||disease||therapeutic_area||topic` + deterministic top capitalized key-terms **from each section's output text** — since `subtask_results[]` carries NO subject field and descriptions collapse to `(role)`; `runSectionGate` → per-section `runCitationGate({step_type:"breadth", topic:"science"})`, infra-throw = `checked:false` UNCHECKED, returned `gate_status:"fail"` = genuine zero-coverage; `assertCoverageOrThrow` → `PHASE30_CITATION_COVERAGE_ZERO`). **Additive** edit to `core/workflow-engine.js` `executeQualityAuditStep`: existing density check runs FIRST & UNCHANGED (still `PHASE30_QUALITY_BELOW_THRESHOLD`, no searches spent on a density-fail); section gate runs only on density-pass; per-section `coverage_tier`/`distinct_source_count` surfaced into the return + `state.artifacts.quality_report`. Step 3: registry `searxng-search` → `adapter_status:"wired"`, `execution_surface:"subprocess-mcp"`, stale citation-grammar note dropped.
- **State:** done + verified — **section-gate integration tests 4/4** (sourced→tier, genuine zero→fail-closed, infra→UNCHECKED, queries distinct); **Step-1 adapter T1–T9 still 10/10** (adapter untouched); **existing `tests/core/phase30-workflow-engine.test.js` 10/10** (density/dispatch regression clean); `workflow-engine.js` still loads (lazy require); **no NEW restricted-globals violations** (my files clean; `workflow-engine.js` stays at its 2 pre-existing hits); registry JSON valid + `npm run audit:connectors` exit 0.
- **Next (operator's call):** the gate is now LIVE on any density-passing `quality_audit` step — it makes real SearXNG calls per section at verification time (bounded: ~sections × 1–2 searches). Optional follow-ups: render `section_coverage` tiers into the deliverable; a live end-to-end run against SearXNG to sanity-check real query derivation; extend `PRIMARY_SOURCE_DOMAINS` against domains seen in real source sets.
- **Touches:** new `openclaw-bridge/mcp/searxng-mcp/{searchfn,section-gate}.js` + `test/section-gate.test.mjs`; edited `openclaw-bridge/core/workflow-engine.js` (additive, 2 spots) + `config/connector-registry.json` (searxng-search entry); `tasks/lessons.md` appended.
- **For whoever's next:** the gate is COMPLEMENTARY to `verifyReportCitations` (that grounds cited IDs vs fetched IDs on the mission step; this measures external primary-source coverage per section). Pre-existing repo notes: the restricted-globals lint is already red from 4 untouched files, and `connector-registry.json` carried prior-session uncommitted changes — neither is from this work. Nothing committed (working tree only).

### 2026-07-06T02:29Z · CLI Claude Code · SearXNG citation-gate v1 — STEP 1 built (adapter + T1–T9), PAUSED at checkpoint
- **Did:** Built Build-Order **Step 1 only** per the 01:15Z spec — new `openclaw-bridge/mcp/searxng-mcp/`: `gate.config.js` (§3 verbatim), `cluster.js` (ported connector `canonicalUrl`+G4-preserving union-find clustering — no shared util existed in the engine), `grade.js` (A/B/C/D + subdomain-aware primary-domain match + coverage tier), `reformulate.js` (deterministic v1 broaden heuristic), `index.js` (`runCitationGate(input,{searchFn,reformulateFn,config})` — zod GateInput/GradedResult/GateOutput, grade→cluster→count→gate→one breadth-only fail-soft retry), `test/gate.test.mjs`. Adapter is **pure/deterministic** (cluster ids = canonical keys) to satisfy the `openclaw-bridge/` restricted-globals lint. Connector call is **injected + stubbed** → tests are offline/deterministic.
- **State:** done + verified for Step 1 — **T1–T9 (incl T1b) = 10/10 green**; adapter dir greps **clean** of `Date.now/new Date/Math.random/randomUUID`; modules load, exports present. Did **NOT** touch `run-workflow.js` or `connector-registry.json` (steps 2–3, paused for operator review).
- **Next (Step 2, needs operator "continue"):** wire the gate in. Real seam = the `localFetchers` registration in `scripts/_workflow-runtime.js` (like `ctgov_stopped_trials`) and/or `executeQualityAuditStep`; fail-closed = **throw a coded Error** (engine pattern, cf. `verifyReportCitations`→`PHASE30_*`). Then Step 3: flip registry `adapter_status: missing → **wired**` (enum is wired/missing, NOT "present"). Decide the real `searchFn` (proposed: direct `require` of the connector's `search()` — both on the external volume; pulls only 4 pure files).
- **⚠️ Surfaced for review (spec-vs-reality, all Step-2):** (1) **`step_type: breadth|depth` does not exist** in the engine (`mission|quality_audit|dataset|offer|approve|export`) — Step 2 must decide how `step_type` is supplied. (2) `connector-registry.json` is **audit-only at runtime** — flipping `adapter_status` wires nothing by itself. (3) The whole-tree restricted-globals lint is **already RED on this branch** from 4 PRE-EXISTING violations (`core/workflow-engine.js` ×2, `core/role-router.js`, `core/operator-approve-gate.js`, `mcp/citation-reresolver/…`) — unmodified by me; flagged, not fixed. (4) `cluster.js` re-ports the connector's dedup → a new drift-watch pair.
- **Touches:** new `Trevor Robey Intelligence Network Citations/openclaw-bridge/mcp/searxng-mcp/{gate.config,cluster,grade,reformulate,index}.js` + `test/gate.test.mjs`; `tasks/lessons.md` (appended). Nothing else modified.
- **For whoever's next:** run `cd "Trevor Robey Intelligence Network Citations" && node --test openclaw-bridge/mcp/searxng-mcp/test/gate.test.mjs`. The adapter's contract is the spec's §1 zod schemas; the connector is injected as `deps.searchFn`. Do Step 2 wiring only after the operator says continue.

### 2026-07-06T01:15Z · Claude Chat · HANDOFF → Code: SearXNG citation-gate v1 (fail-closed-only-at-zero) for the quality_check step
- **What this is:** The implementation spec that closes review gap **G1**. The v2.1 `searxng-search` connector *annotates* every result with `citations[]` (type/id/source/subtype) but nothing yet *enforces* the no-hallucinations gate. This builds the engine-side gate. **Governing philosophy — fail-closed ONLY at zero:** a step refuses to synthesize *only* when **zero distinct resolvable primary sources** survive grading. Sparse-but-real evidence (e.g. 2 terminated trials) is reported with a visible **coverage tier**, never dropped and never fabricated. Mirrors the engine's existing dual posture — graceful at retrieval, fail-closed at output. **Do NOT raise `min_distinct_sources` above 1 or add a breadth floor** — explicitly rejected, because sparse fields *are* the Failed Trial Archaeology finding.
- **Architecture (build it this way):** `run-workflow.js` (quality_check) → **`openclaw-bridge/mcp/searxng-mcp/` adapter** → the existing `searxng-search` connector (already emits `citations[]`) → SearXNG. The adapter **consumes the connector's already-cited output** and adds: grade (A/B/C/D) → dedup + distinct-count → coverage tier → gate decision → one breadth reformulation retry. **It does NOT re-extract citations and does NOT `require()` the connector's `citation-grammar.js`** — the cross-volume runtime constraint (staged internal-volume copy can't read the external-volume engine package, and vice-versa) makes that fragile. Consuming the connector's *output* keeps a single source of citation truth and sidesteps drift entirely.
- **Schema note (correcting the brief):** the brief said "Pydantic" — **not applicable.** This is a Node ≥22.13.1 **CommonJS** engine, zero TypeScript, no build step. Schemas below are **zod** (matches the connector's existing `@modelcontextprotocol/sdk` + `zod` stack) + illustrative JSON. Do not introduce Python/Pydantic.

**§1 — Adapter I/O Contract**

Input (zod):
```js
const GateInput = z.object({
  query: z.string(),
  step_type: z.enum(["breadth", "depth"]),        // drives retry policy
  section_id: z.string(),                          // labels the report section this feeds
  topic: z.string().default("science"),            // MUST be "science" to hit scholarly engines
  max_results: z.number().int().default(10),
  min_distinct_sources: z.number().int().default(1),
  search_params: z.record(z.any()).optional()      // passthrough: include_domains, time_range, …
});
```

Output — step-level envelope; Tavily shape preserved *inside* `results[]` (zod):
```js
const GradedResult = z.object({
  // existing connector/Tavily fields — DO NOT rename or drop:
  title: z.string(), url: z.string(), content: z.string(),
  score: z.number(), engine: z.string(),
  citations: z.array(z.object({
    type: z.string(), id: z.string(),
    source: z.enum(["url", "text"]),               // provenance — MANDATORY on every citation
    subtype: z.string().optional()                 // e.g. "preprint"
  })),
  // additive gate fields:
  grade: z.enum(["A", "B", "C", "D"]),             // MANDATORY on every result
  source_locator: z.string(),                      // canonical URL (connector canonicalUrl)
  primary_domain_match: z.boolean(),               // host ∈ PRIMARY_SOURCE_DOMAINS → drives grade C
  dedup_cluster_id: z.string()                     // results sharing a cluster = ONE distinct source
});

const GateOutput = z.object({
  gate_status: z.enum(["pass", "fail"]),           // "fail" = fail-closed, step MUST NOT synthesize
  gate_reason: z.enum(["no_results", "no_citable_sources"]).nullable(),  // set iff status="fail"
  coverage_tier: z.enum(["Sparse", "Moderate", "Comprehensive"]).nullable(), // non-null iff status="pass"
  distinct_source_count: z.number().int(),
  retried: z.boolean(),
  reformulated_query: z.string().nullable(),
  section_id: z.string(),
  results: z.array(GradedResult),                  // surviving grade A/B/C only
  dropped: z.array(GradedResult)                   // grade D — kept for audit, NOT fed to synthesis
});
```
> Naming: `gate_status` string is used instead of a bare `gated` boolean to kill polarity ambiguity. `gate_status:"fail"` == the discussion's "gated:false". **Mandates:** every surviving result carries `grade` + each citation's `source`; `coverage_tier` is present whenever `gate_status:"pass"`; the synthesis layer MUST propagate `grade` + `source` onto every rendered claim.

**§2 — Grading & Gate Policy**

**Grade (per result):**
- **A** — ≥1 citation with `source:"url"` (structured biomedical ID in the canonical locator: PMID / PMCID / NCT / DOI / ChEMBL / DrugBank, incl. the connector's extended types).
- **B** — no url-derived ID, but ≥1 citation with `source:"text"`.
- **C** — no structured citation, **but** `source_locator` host ∈ `PRIMARY_SOURCE_DOMAINS` (the URL is itself a resolvable primary/authoritative source — FDA label, EMA report, ClinicalTrials.gov record, EDGAR filing, …). **This tier keeps regulatory / trial gray-literature evidence alive.**
- **D** — neither. Dropped from synthesis; excluded from the distinct count; retained in `dropped[]` for audit.

**Distinct-source counting:** dedup surviving A/B/C results using the connector's existing dedup semantics (canonicalUrl fold + **url-derived-id merge only** — preserves the G4 no-over-merge fix: a review that merely cites a paper's PMID *in text* stays a distinct source from the paper). `distinct_source_count` = number of dedup clusters containing ≥1 grade-A/B/C member.

**Gate rule (uniform, all step types):**
- `gate_status:"fail"` **iff** `distinct_source_count == 0` after grading (and after the breadth retry, if any). `gate_reason` = `"no_results"` when the connector returned zero raw results, else `"no_citable_sources"` (raw results existed but all graded D).
- `gate_status:"pass"` **iff** `distinct_source_count >= min_distinct_sources` (v1 = 1).

**Coverage tier (only when pass).** Let `n = distinct_source_count`, `hasAB` = any cluster is grade A or B:
- `n == 1` → **Sparse**
- `n == 2` → **Moderate**
- `n >= 3 && hasAB` → **Comprehensive**
- `n >= 3 && !hasAB` (all grade C) → **Moderate**

**Breadth reformulation retry:**
- THIN = `distinct_source_count < 2` (i.e. 0 or 1) after the initial pass.
- `step_type:"breadth"` + `breadth_retries:1`: if the initial pass is THIN, run **exactly one** `reformulateQuery()`, re-search, **merge + dedup** with pass 1, re-grade, recount, then gate on the merged result.
- `step_type:"depth"` + `depth_retries:0`: **never** retry; grade → gate directly.
- Reformulation is **fail-soft**: if it errors or yields nothing new, keep pass-1 results. `retried:true` records that an attempt was made.

**§3 — v1 Pipeline Configuration**

```js
// openclaw-bridge/mcp/searxng-mcp/gate.config.js   (CommonJS)
module.exports = {
  fail_closed: true,
  min_distinct_sources: 1,      // global, ALL step types (v1)
  breadth_retries: 1,           // one automatic query reformulation on THIN breadth steps
  depth_retries: 0,             // depth steps never retry
  thin_threshold: 2,            // THIN = distinct A/B/C count < 2  (0 or 1)
  rerank: false,                // stays OFF in v1
  topic_default: "science",
  // Grade-C allowlist — hosts whose URL is itself a resolvable primary/authoritative source.
  // Subdomains match. LOAD-BEARING for Failed Trial Archaeology / Investor Pre-Mortem:
  // a domain wrongly ABSENT here = a real primary source silently downgraded to D and dropped.
  primary_source_domains: [
    "ncbi.nlm.nih.gov", "clinicaltrials.gov", "fda.gov", "accessdata.fda.gov",
    "ema.europa.eu", "who.int", "cdc.gov", "europepmc.org",
    "sec.gov",                      // EDGAR
    "patents.google.com", "patentscope.wipo.int",
    "ebi.ac.uk", "doi.org"          // DOI resolver → publisher primary
    // v1 starting point — extend against domains that actually appear in real source sets.
  ]
};
```
> **Deferred to v2 (explicit):** per-template citation-type rules (e.g. `clinical-trial-landscape` MUST carry ≥1 NCT; `pharmacovigilance-report` MUST carry ≥1 PMID/DOI). v1 is one uniform gate.

**§4 — Acceptance Tests** (behavioral; fixtures STUB the connector output → offline/deterministic; `openclaw-bridge/mcp/searxng-mcp/test/gate.test.mjs`, node:test, no live SearXNG)
```
T1  Breadth, zero citable → FAIL
    GIVEN step_type="breadth"; connector stub returns 0 raw results; reformulation stub also 0
    THEN  gate_status="fail", gate_reason="no_results", coverage_tier=null,
          distinct_source_count=0, retried=true
    T1b GIVEN raw results exist but ALL grade D; reformulation finds nothing citable
        THEN gate_status="fail", gate_reason="no_citable_sources", retried=true
T2  Breadth returning 2 failed trials → MODERATE, no fail, no retry
    GIVEN step_type="breadth"; stub → 2 distinct grade-C clinicaltrials.gov/FDA results
    THEN  gate_status="pass", coverage_tier="Moderate", distinct_source_count=2,
          results has both, dropped empty, retried=false   (2 is not < thin_threshold 2)
T3  Thin breadth → EXACTLY ONE reformulation
    GIVEN step_type="breadth"; pass-1 → 1 distinct (Sparse); reformulation → +2 distinct
    THEN  reformulateQuery called exactly ONCE (assert callCount===1); final = merged/deduped
          (3 → Comprehensive if ≥1 A/B else Moderate); retried=true
T4  Thin depth → NO retry
    GIVEN step_type="depth"; pass-1 → 1 distinct
    THEN  reformulateQuery NOT called (callCount===0); gate_status="pass";
          coverage_tier="Sparse"; retried=false
T5  Every surviving result bundles source + grade
    THEN  every results[] item has grade∈{A,B,C}; every citation has source∈{url,text};
          no surviving result is grade D; every grade-D result in dropped[]; coverage_tier non-null
T6  Distinct counting dedups multi-hits from one source
    GIVEN 5 raw results all canonicalizing to the SAME clinicaltrials.gov study URL
    THEN  distinct_source_count=1 → coverage_tier="Sparse" (NOT Comprehensive)
T7  G4 no-over-merge preserved
    GIVEN A = the paper (PMID in URL, grade A); B = a review whose TEXT cites the same PMID
          (source="text", different host)
    THEN  2 distinct clusters → distinct_source_count=2 → Moderate (NOT merged to 1)
T8  Grade boundaries
    url-derived PMID → A; text-only DOI on non-allowlist host → B;
    no-citation on clinicaltrials.gov → C; no-citation on some-blog.example → D (dropped)
T9  Reformulation is fail-soft
    GIVEN thin breadth pass-1 (count=1); reformulated search THROWS
    THEN  error swallowed; pass-1 kept; gate proceeds on count=1 → Sparse; retried=true; no throw
```
- **Build order:** (1) `openclaw-bridge/mcp/searxng-mcp/` — `index.js` (adapter), `gate.config.js`, `grade.js` (grade fn + allowlist match), `reformulate.js` (v1 heuristic: drop the most-restrictive qualifier / add domain synonyms; fail-soft), `test/gate.test.mjs`. (2) `run-workflow.js` — wire quality_check to the adapter; HONOR `gate_status:"fail"` as fail-closed (withhold/flag the section, surface `gate_reason`); propagate `coverage_tier` + per-claim `grade`/`source` into the section. (3) `config/connector-registry.json` — flip searxng-search `adapter_status: missing → present` (path `openclaw-bridge/mcp/searxng-mcp/`); re-run registry audit (expect exit 0). (4) Verify: adapter tests green; a sparse-target breadth step returns a Sparse/Moderate section *with the tier label* and no fabricated citations; a nonsense-query breadth step fails closed with a reason.
- **State:** handed-off (spec only — no code written from Chat; Chat can't run/test the engine).
- **Flags for Code:** (a) Pydantic→zod (CJS engine, no Python). (b) Adapter consumes connector output; no cross-volume `require()` of the grammar. (c) `PRIMARY_SOURCE_DOMAINS` is load-bearing — an absent domain silently drops a real source; extend deliberately. (d) `gate_status` string, not a bare boolean. (e) per-template rules = v2. Rerank stays off.
- **Touches (to be created/edited by Code):** new `openclaw-bridge/mcp/searxng-mcp/**`; `run-workflow.js`; `config/connector-registry.json`.
- **For whoever's next:** this is the piece that makes "every claim sourced" true in the *pipeline*, not just in policy. Fail-closed ONLY at zero; sparse ships with a tier; nothing is ever fabricated. Do not add a breadth floor.

### 2026-07-04T11:21Z · CLI Claude Code · SearXNG connector v2.1 — review-driven hardening (repo infra)
- **Did:** Acted on a Claude-Chat design review of the v2 connector (see 10:30Z entry). Verified its "check the source" claims against the code (the highest-severity one — that the NUL field-join could be bridged by a regex `.` — was **rejected**: the cue gap is `\s*`, and `\s` does not match NUL, verified live). Then built the real gaps it surfaced: (a) **provenance** — each citation now carries `source:"url"|"text"` (+ preprint DOIs get `subtype:"preprint"`), via a **per-field** extraction refactor that also makes cross-field cue bridging impossible by construction (no join at all); (b) **G4 over-merge fix** — `dedupe()` only merges on url-derived ids, so a review citing a paper's PMID is no longer collapsed into that paper; (c) **Europe PMC** engine added via `json_engine` + `url_prefix: https://doi.org/` (live, contributing — gotcha: `launchctl kickstart -k` serves stale settings, `bootout`/`bootstrap` required); (d) **grammar-drift CI guard** (`test/citation-grammar.drift.test.mjs`) that runs canonical ids through BOTH the connector grammar and the engine gate grammar and fails on divergence (passes → they agree); (e) **negative-cache guard** (never cache 0-result); (f) **`min_citations`** opt-in connector gate; (g) new id types **arxiv/geo/sra/bioproject/biosample/rrid**; (h) canonicalUrl now folds `www.`/default ports. Ran a **second** 8-agent adversarial review → **4 more confirmed, all fixed** (geo/sra unbounded `\d+` → `GPL2` license / `SRP54` gene false positives → digit floors GEO≥2/SRA≥6/BioProj·Sample≥5; arXiv `\d{4,5}` silently truncating a 6-digit id → `(?!\d)` reject-not-truncate; RRID case-sensitive prefix → `i` flag).
- **State:** done + verified — **29/29 unit tests** (adversarial false-positive fixtures + 2 rounds of regressions + drift guard, 0 skipped) + full live smoke green; live science query returns 10/10 cited results across all 6 engines incl. Europe PMC, with correct `url`/`text` provenance; adversarial precision spot-checks (GPL2/SRP54/arXiv-overflow rejected; real accessions + lowercase rrid accepted) all pass. Connector re-staged to `~/.claude/mcp-servers/searxng-search/`.
- **Next:** unchanged from v2 — the trivial subprocess adapter `openclaw-bridge/mcp/searxng-mcp/` is still the way to wire this into `run-workflow.js`'s fail-closed gate. Rerank still off by default.
- **Touches:** `Claude/searxng-search-mcp/src/{citation-grammar,robust,searxng,tools}.js`, `test/{citation-grammar,citation-grammar.drift,robust}.test.mjs`, `package.json`, `README.md`, `searxng/settings.example.yml`; live `~/.config/searxng/settings.yml` (Europe PMC engine) + staged copy.
- **For whoever's next:** the connector citation grammar is now richer than the engine's `openclaw-bridge/core/citation-extractor.js` (per-field, provenance, arxiv/geo/sra/…). The drift test only guards the CANONICAL shared ids (pmid/nct/doi/chembl/drugbank) — it will NOT fail on the connector's extra types, by design. If you later align the engine extractor up to the connector's grammar, extend the drift fixtures too.

### 2026-07-04T10:30Z · CLI Claude Code · SearXNG connector v2 — citation-traceable biomedical tuning (repo infra)
- **Did:** Followed a research brief (`~/Downloads/Making-SearXNG-Better.md`) to harden `Claude/searxng-search-mcp/` for citation-traceable biomedical work, in the brief's order. (1) **Config:** curated `~/.config/searxng/settings.yml` (+ repo `settings.example.yml`) to weighted scholarly engines — PubMed ×3 / Semantic Scholar ×2.5 / Crossref ×2 (enabled) / OpenAlex ×2 (enabled) / OpenAIRE `openairepublications` ×1.5 / arXiv ×1 — and disabled Brave + Google Scholar. **Corrected the brief**, which named `pubmedcentral`/`openaire` engines that don't exist in this SearXNG build; verified real engine names against `~/.local/share/searxng/searxng-src/searx/engines/` + stock `settings.yml`. (2) **Citation layer:** new `src/citation-grammar.js` extracts pmid/doi/nct/pmcid/chembl/drugbank/uniprot; each `search` result now carries an additive `citations[]`. (3) **Robustness:** new `src/robust.js` — TTL cache + transient-only retry (timeouts NOT retried, bounded latency) + cross-engine dedup, wired into `src/searxng.js`. (4) **Rerank:** new `src/rerank.js` — local-LLM listwise rerank, **off by default**, HTTPS-loopback-only, fail-soft. (5) **Registry:** moved the no-hallucinations-gate role from the never-built key-gated `tavily` to `searxng-search` in the engine's `config/connector-registry.json` (audit exit 0). Ran a 10-agent adversarial review workflow → **5 confirmed findings, all fixed** (UniProt proximity gate vs. global presence; PMID cross-field cue bridging via NUL join; canonicalUrl path-case bug; rerank endpoint HTTPS-loopback validation; PMID docstring).
- **State:** done + verified — 23/23 unit tests (adversarial false-positive fixtures + 5-fix regressions) + full live smoke green; live science query returns 6/6 results carrying citations in ~4.5s; connector re-staged to `~/.claude/mcp-servers/searxng-search/`. SearXNG restarted clean (only unrelated ahmia/torch Tor engines fail to load).
- **Next:** surfaces pick up the new grammar/robustness on next restart (already staged). Optional: build the trivial subprocess adapter `openclaw-bridge/mcp/searxng-mcp/` so `run-workflow.js` can call SearXNG as the gate (registry entry `adapter_status: missing` flags this). Rerank stays off until top-k relevance is measurably weak; enabling it needs `NODE_EXTRA_CA_CERTS` in the connector env.
- **Touches:** `Claude/searxng-search-mcp/src/{citation-grammar,robust,rerank,config,searxng,tools}.js`, `test/{citation-grammar,robust,rerank}.test.mjs`, `test/smoke.mjs`, `package.json`, `README.md`, `searxng/settings.example.yml`; `Trevor Robey Intelligence Network Citations/config/connector-registry.json`; operator-side live `~/.config/searxng/settings.yml` + staged `~/.claude/mcp-servers/searxng-search/`.
- **For whoever's next:** the citation grammar is a **self-contained copy** in the connector (NOT a cross-require of the engine's `openclaw-bridge/core/citation-extractor.js`) — deliberate, because the connector runs from the staged internal-volume dir and can't read the external-volume engine package at runtime. Keep the two grammars aligned; adversarial fixtures in `test/citation-grammar.test.mjs` lock the connector side. Biomedical callers must pass `topic:"science"` to hit the scholarly engines.

### 2026-07-04T01:27Z · CLI Claude Code · Built local SearXNG web-search connector (Tavily replacement, repo infra)
- **Did:** Built a free, **Docker-free** Tavily replacement so all four Claude surfaces get web search without Tavily's paid API (student free-tier fell through). New stdio MCP server `Claude/searxng-search-mcp/` (Node/CommonJS, mirrors the `Medical-Zettelkasten-MCP` pattern; deps `@modelcontextprotocol/sdk` + `@mozilla/readability` + `jsdom` + `turndown` + `zod`) exposing 3 Tavily-shaped tools: **`search`** (→ local SearXNG JSON API, normalized `results[]` w/ title/url/content/score/engine, optional `include_raw_content`), **`extract`** (fetch → Readability → markdown/text, `results[]`+`failed_results[]`), **`map`** (same-domain link scrape + optional site-scoped search). Backed by a private SearXNG instance installed **without Docker** via `uv` venv (Python 3.12) at `~/.local/share/searxng/` (internal volume, per the launchd/TCC rule), config at `~/.config/searxng/settings.yml` (JSON format on, `limiter:false`, loopback `127.0.0.1:8890`, generated secret), run by boot-persistent launchd unit **`com.trevorrobey.searxng`** (KeepAlive verified — respawns on kill). Ran an 8-agent adversarial code-review workflow; fixed all 4 confirmed findings (concurrency clamp, atom+xml content-type, dropped `oneOf` from the extract schema for MCP-client interop, `time_range` week-coercion made observable via `applied_time_range`).
- **State:** done + verified — SearXNG JSON API HTTP 200; connector smoke test + real MCP stdio handshake/list/call all green; `claude mcp list` shows `searxng-search ✔ Connected`. Registered on **all 4 surfaces**: Claude Code CLI + Desktop Code tab (`~/.claude.json` user scope), Claude Desktop chat + Cowork (`claude_desktop_config.json`, backed up first), plus repo `.mcp.json`. Port **8890** added to the monorepo port map in root `CLAUDE.md`.
- **Next:** user restarts each surface to load the connector (MCP servers load at startup). Optional future: Playwright-scrape fallback for 403-bot-blocked sites (ScienceDirect etc.); real 7-day `time_range` if wanted.
- **Touches:** new `Claude/searxng-search-mcp/**`, new repo `.mcp.json`, root `CLAUDE.md` (port row); operator-side `~/Library/Application Support/Claude/claude_desktop_config.json` + `~/.claude.json` + `~/Library/LaunchAgents/com.trevorrobey.searxng.plist` + `~/.local/share/searxng/` + `~/.config/searxng/`.
- **For whoever's next:** it's HTTPS-invariant-clean — SearXNG is a **third-party loopback upstream** (like Miyo/Qdrant/Ollama), plaintext `127.0.0.1:8890`; the stdio MCP server binds no TCP port. Service mgmt: `launchctl kickstart -k gui/$(id -u)/com.trevorrobey.searxng`; health `curl -s 'http://127.0.0.1:8890/search?q=test&format=json'`. Node path in the configs is nvm-pinned (`v22.13.1`) — if node is upgraded, update the `command` in the 3 config files.
- **UPDATE (same session):** Hit the expected **`EPERM` / TCC "Removable Volumes"** wall on Desktop restart — nvm `node` can't read the connector's `src/server.js` off `/Volumes/ExtraCurricular` (same class as the FilesystemPlus/TLS-proxy gotcha). **Fixed** with the repo-canonical staging pattern: new `install-connector.sh` stages `src/`+deps to **`~/.claude/mcp-servers/searxng-search/`** (internal volume); all 3 configs repointed there. Live tool call through the real MCP layer now returns Tavily-shaped results (`claude mcp list` ✔ Connected). **Repo copy stays source-of-truth — re-run `install-connector.sh` after editing `src/`.** Desktop/Cowork need a restart to pick up the repointed path.

### 2026-07-03T12:20Z · CLI Claude Code · Raycast↔GitHub coupling audit (repo infra)
- **Did:** Answered "why is GitHub involved in my Raycast config, and can I revoke Raycast's GitHub access?" Ran a 3-sweep + adversarial-verify audit (vendored extension / monorepo-wide refs / live machine state). **Finding: zero runtime GitHub dependency anywhere in the Raycast→Obsidian lane.** Raycast's live path is `extension → stdio adapter (raycast profile) → HTTPS :8798 bridge → Obsidian`, plus the Local REST API plugin on :27124 — no GitHub API/OAuth/publish call in it. GitHub appears only as: (a) upstream fork lineage + README doc links (`KevinBatdorf/obsidian-raycast`), (b) an unused `npx ray publish` script + two `.github/workflows/*.yml` that are structurally inert (repo has **no git remotes** since 2026-05-26; both also reference a nonexistent `mcp-server/` subdir), and (c) a **stale** `repository`/`homepage`/`publishConfig` block in `bridges/obsidian-stdio-adapter/package.json` pointing at the deleted `trevoralexanderrobey/TrevClaw-Obsidianodus` remote. The `~/.config/raycast/config.json` `accesstoken`/`token` pair is an `rca_`-prefixed **Raycast** cloud-sync token, not a GitHub token.
- **State:** done — audit was read-only; operator then approved the dead-plumbing cleanup, applied same session (uncommitted in working tree): removed the `publish` (`npx ray publish`) script + deleted `.github/workflows/` (`e2e-obsidian.yml`, `mcp-server.yml`) from `raycast-obsidian-extension/`; stripped the stale `repository`/`homepage`/`publishConfig` block from `obsidian-stdio-adapter/package.json`. Both JSONs re-validated.
- **Next:** operator revokes the "Raycast"/"Raycast Store" GitHub OAuth grants at github.com/settings/applications — safe for this stack (they trace to Raycast account login / store, not to anything here). Cleanup edits await commit with the branch's other work.
- **Touches:** `Copilot-Everything/bridges/raycast-obsidian-extension/{package.json,.github/}` (deleted), `Copilot-Everything/bridges/obsidian-stdio-adapter/package.json`; read-only: live `~/.config/raycast/` + `com.raycast.macos` prefs.
- **For whoever's next:** the `obsidian-bridge-fork` extension registered in Raycast is a **local dev extension** (`raycast develop`) built from `Copilot-Everything/bridges/raycast-obsidian-extension/`, not a Store install — so it never authenticates to GitHub to run.

### 2026-07-03T09:08Z · Claude Chat · Connector swap to FilesystemPlus (bundled node) + resuming connector/repo thread
- **Did:** (1) Chat's Filesystem connector is now **FilesystemPlus** running on a **private bundled `node`** (not nvm's) — verified live from this chat: external-drive reads/lists return instantly. Root cause of the prior 4-min "hangs" is now understood: (a) the `EPERM` on `/Volumes/ExtraCurricular` came from a **June-1 macOS "Removable Volumes" denial on the nvm `node` binary** (TCC tracks permissions by executable path); the bundled-node copy gets a fresh TCC identity **and** decouples the connector from nvm upgrades; (b) the separate 4-min read "hang" was the **app's client-side dispatch wedge** (server logs showed 5/5 calls answered, the wedged read never arrived) — recovered by an app restart, not a server fix. (2) Confirmed the shared-repo top-level layout is clean. (3) Re-grounded the connector picture from `CONNECTOR-ALIGNMENT.md`.
- **State:** working — connector infra fixed; resuming the connector-verification + repo-cleanup thread from the Chat side.
- **Next:** (a) live-verify the **chat-side (`claude-host-mcp`) connectors** to see which of the 5 unauthenticated ones (AdisInsight, BioRender, DataHub, Owkin-host, Synthesize Bio) are worth OAuthing — **key point:** these are chat-only and do **not** feed the workflow engine; the engine's Table-A subprocess/ToolUniverse connectors are separate and mostly no-auth, already wired. (b) REVENUE_PLAYBOOK tidy-up (now unblocked — FilesystemPlus reads the 40 KB file fine) + the 10 `03-platforms/` dirs.
- **Touches:** read-only this entry (`CONNECTOR-ALIGNMENT.md`, repo-root + business-folder listings); FilesystemPlus config is operator-side.
- **For whoever's next:** **Chat now = FilesystemPlus on bundled `node`.** First external-drive touch may show a one-time macOS "allow removable volume" prompt — click **Allow** and retry (server has an 8 s `EPERM` retry loop). Fallback: System Settings ▸ Privacy & Security ▸ Files & Folders ▸ node ▸ Removable Volumes (no restart needed). **Also: `~/openclaw-landing-deploy/` DOES exist on this machine** → likely closes the Parking-lot "deploy source" operator item (board had it as gone with the wiped Mac). **Continuity-gap finding: Cowork's `claudeco_*` cubicle files are NOT in the shared repo** (searched — zero matches), so other surfaces can't read Cowork's connector checklist; only Cowork's board *entries* sync. Consider having Cowork mirror key `claudeco_*` docs into the repo.

### 2026-07-01T11:37Z · Cowork · Cubicle setup, monorepo index, connector triage + full gdrive removal
- **Did:**
  - **Stood up the Cowork cubicle:** `claudeco_project.md` (scope anchor → points to canon), `claudeco_vault-index.md` (monorepo orientation — topology, engine state, 16 workstreams, open threads, connector coverage), `claudeco_connector-setup.md` (per-connector authorization checklist).
  - **Connector audit:** live-verified **PubMed** (2,845 hits, glioblastoma+temozolomide+resistance) and **ClinicalTrials.gov** (275 TERMINATED glioblastoma trials) return real data; catalogued live vs needs-auth vs engine-internal.
  - **Removed Google Drive end-to-end (operator request):** deleted both gdrive entries (`gdrive-subprocess` + `gdrive-host`) from `config/connector-registry.json`; removed the `google_drive` block from `config/data-source-credentials.json`; deleted the `openclaw-bridge/mcp/gdrive-mcp/` adapter dir; scrubbed doc refs in README / DOSSIER / NOTICE / CONNECTOR-ALIGNMENT + root `CLAUDE.md` ("8 project MCP servers" → 7); **annotated** the dated `audit/business-reality-2026-06/00-audit-report.md` rather than rewrite history. **Kept** the `GOOGLE_DRIVE_*` / `GOOGLE_CLIENT_SECRET` env-strip guards in `llm-adapter.js` / `scrape-sidecar-lifecycle.js` / `tu-process-manager.js` (protective, not gdrive functionality). Both JSON configs re-validated.
  - **Owkin:** confirmed already engine-wired (`owkin-mcp` + `OWKIN_API_KEY`) — left intact.
  - **Connector scope from repo evidence:** **BigQuery** matches the enterprise-delivery model (REVENUE_PLAYBOOK, product catalog, platform listings) → set up; **Amplitude / Atlassian / Definite / Hex** have zero repo footprint → skip; corrected the **Wiley = scholar-gateway** conflation (engine `scholar-gateway` is **Semantic Scholar**; Wiley is a separate license-gated Cowork-only connector with no engine adapter).
  - **Did NOT fabricate** engine registry/credential entries for connectors without adapters (Wiley / Synapse / BioRender / BigQuery) — that would create the exact connector-drift the 2026-06-10 audit warns about.
- **State:** done for the Cowork pass · connector OAuth authorizations are operator-only (interactive) and pending.
- **Next:** operator authorizes Owkin + Wiley (if licensed) + BigQuery via **claude.ai → Settings → Connectors** or `/mcp`; then optionally (a) draft engine-side `wiley-mcp` / `bigquery-mcp` adapters, or (b) point the engine at a first research project. Full steps: `claudeco_connector-setup.md`.
- **Touches:** `claudeco_project.md`, `claudeco_vault-index.md`, `claudeco_connector-setup.md`; `Trevor Robey Intelligence Network Citations/config/{connector-registry.json, data-source-credentials.json}`, `.../openclaw-bridge/mcp/gdrive-mcp/` (deleted), `.../{README.md, TREVOR_ROBEY_INC_AGENTS_DOSSIER.md, NOTICE.md, CONNECTOR-ALIGNMENT.md}`, `audit/business-reality-2026-06/00-audit-report.md`, root `CLAUDE.md`.
- **For whoever's next:** gdrive is fully gone **but the `GOOGLE_DRIVE_*` env-strip guards in the 3 subprocess spawners are intentionally kept — don't "tidy" them away.** Of the connectors the operator installed, **only Owkin is wired into the engine**; the rest are Cowork/operator-side until adapters are built. OAuth can't be completed from Cowork — those steps are operator-only.

### 2026-07-01T11:26Z · CLI Claude Code · Security-verified the `:8798` Obsidian bridge
- **Did:** Live-verified the canonical Obsidian MCP bridge on `127.0.0.1:8798` is serving **and** hardened. **Serving:** `GET /healthz` → `200 {"ok":true,"status":"ready"}`, valid mkcert cert (SAN `localhost`+`127.0.0.1`, expires 2028-09). **Safe:** binds **loopback-only** (config-load *throws* unless `OBSIDIAN_BRIDGE_ALLOW_NONLOOPBACK=1` — audit TB-1); plaintext HTTP refused; mkcert keys locked (`localhost-key.pem` 600, `rootCA-key.pem` 400). **Protected:** every real route requires a strong bearer/`x-mcp-token` — proved live: `POST /mcp/tool` no-token & wrong-token → **401**, `GET /metrics` & `/mcp/events` no-token → **401**, `OPTIONS` → **405 (CORS disabled)**. Also present in src: replay guard (ts+nonce+body-sha256), dual rate-limit (pre-auth + per-token), path guard, audit log of AUTH_FAIL/REPLAY_REJECT.
- **State:** done — bridge is serving, loopback-only, TLS-enforced, token-gated. No issues found.
- **Next:** none required. Bridge dies when Obsidian quits (by design); the continuity board does **not** depend on it (all four surfaces reach the repo on disk).
- **Touches:** read-only — `Copilot-Everything/bridges/obsidian-copilot-bridge/src/server/httpCommon.ts`, `config/loader.ts`; no mutations.
- **For whoever's next:** the mkcert root is a machine-trusted CA (System Keychain), so a system-trust TLS client validates the bridge cert *by design* — that's mkcert working, not missing verification. The one standing mkcert caveat: guard `~/Library/Application Support/mkcert/rootCA-key.pem` (already 400) — whoever holds it can mint trusted certs for this host.

### 2026-07-01T11:22Z · Claude Chat · Doc reality-alignment: citation-overclaim sweep + stale-path fixes
- **Did:** Reality-aligned the customer-facing + internal business docs against `SYSTEM-REALITY.md` + `README.md`.
  - **E1 citation-overclaim sweep (done + verified):** reframed "per-citation external re-resolution / Reproducibility Manifest / resolved / zero-hallucination" → the true capability (**grounded against the source records retrieved at runtime + Crossref DOI retraction-screen + graded A/B/C/D citation-integrity ledger; ungrounded flagged `[UNVERIFIED]`; NOT per-citation external re-resolution**) across: `OFFERINGS.md`; `03-platforms/datarade/vendor-application.md`; landing-page HTML in **both** copies (`01-brand-system/landing-page/index.html` + `workspace/collateral/landing-page/index.html`); `07-outbound/cold-email-templates/` (4 `email-*.md`; the 4 `persona-*.md` are empty); `02-product-packs/product-catalog.md` (only the Product-7 straggler; the rest was already honest); `03-platforms/aws-data-exchange/` (`listing/product-description.md` provider line + `product-creation.md` ×3 "resolves in source DB" — `refund-policy.md` was already correctly framed); `03-platforms/huggingface/gated-teaser/README.md` (the big one — production "hundreds of resolved citations + per-delivery Reproducibility Manifest" → grounded+retraction-screened+graded ledger). **Left as defensible:** the static 29-row curated-sample claims on the AWS/HF cards (they ship resolution URLs — checkable, and invite buyer verification, not an engine re-resolution claim).
  - **Earlier this session (before this board existed):** verified the `obsidian-command-center` plugin rename (source-side; `constants.ts` DEFAULT_SETTINGS paths fixed; deployed manifest id `command-center`); reconciled root + Hub `CLAUDE.md` folder pointers to `Trevor Robey Intelligence Network Citations/`; ran the A2/A3 stale-path/dead-folder sweep (`README.md`, `OFFERINGS.md`, `README.brand.md` [Cloudflare deploy pointers flagged stale], `REVENUE_PLAYBOOK.md` §0); produced a severity-tiered business-doc audit.
- **State:** working (E1 collateral sweep complete) · `REVENUE_PLAYBOOK.md` tidy-up **blocked** (drive stall).
- **Next:** (1) **`REVENUE_PLAYBOOK.md` tidy-up spec** — §1 routing table "Ollama-as-scout" → scout/analyst/synthesizer all **Opus 4.8 via claude-code** (OSS `qwen2.5:7b` / `qwen3.5-9b` = helper pre-pass + fallback); tools "700+" → **"~2,116"**; §3 template names → canonical six (`drug-discovery-full, pharmacovigilance-report, clinical-trial-landscape, target-validation-pack, rare-disease-brief, general-research-pack`); §8/§9 Phase 31 REST API → "built + tested, **not deployed**" (not a live revenue channel); stale April/May 30-day plans → point to `trevor-robey-inc Commercial Launch Playbook.md` (REVISED 30-DAY PLAN 2026-06-10→07-10). (2) Sweep the 10 remaining `03-platforms/` dirs (Active workstreams). (3) Operator items + non-citation flags (Parking lot).
- **Touches:** `OFFERINGS.md`, `03-platforms/datarade/vendor-application.md`, `01-brand-system/landing-page/index.html`, `workspace/collateral/landing-page/index.html`, `07-outbound/cold-email-templates/email-*.md`, `02-product-packs/product-catalog.md`, `03-platforms/aws-data-exchange/{listing/product-description.md, product-creation.md}`, `03-platforms/huggingface/gated-teaser/README.md`; earlier: `Claude/obsidian-command-center/src/constants.ts`, `CLAUDE.md`, `Claude/CLAUDE.md`, `README.md`, `README.brand.md`, `REVENUE_PLAYBOOK.md`.
- **For whoever's next:** **`REVENUE_PLAYBOOK.md` (40 KB) repeatedly wedges the Filesystem MCP on read/copy off the external SSD** (metadata + smaller files are fine — one large sequential read blocks the single-threaded server). Do that file via **CLI / Desktop Code** (native FS, bypasses the connector) or copy it to `/Users/myhome`, edit, copy back. Also: the landing-page + HF-card fixes are **repo copies, not the live site** — they need a redeploy/push once the deploy source (Parking lot) is settled.

### 2026-07-01T11:09Z · CLI Claude Code · Continuity system created
- **Did:** Built this shared continuity file system in `_continuity/` (board + `README.md` +
  `log/` archive) and wired discovery pointers into repo `CLAUDE.md`, `claudeco_project.md`,
  and `Claude/CLAUDE.md`; added the repo-scoped `continuity-board` skill for the Code surfaces;
  corrected the `CLAUDE.md` Multi-Operator Topology to record Chat's Filesystem MCP connector
  (roots `/Users/myhome` + `/Volumes/ExtraCurricular`).
- **State:** working — system is live and empty, ready for real work.
- **Next:** First real workstream. Whoever picks up business work sets **Current focus** and
  logs here.
- **Touches:** `_continuity/*`, `CLAUDE.md`, `claudeco_project.md`, `Claude/CLAUDE.md`,
  `.claude/skills/continuity-board/SKILL.md`.
- **For whoever's next:** This board replaces "each surface guesses what the others did."
  Read it first, update **Current focus**, and leave a Log entry before you stop.

---

## ➕ Entry template (copy me)

```markdown
### <UTC timestamp, e.g. 2026-07-01T11:09Z> · <surface> · <short title>
- **Did:** <what changed — decisions + actions, not just "worked on X">
- **State:** working | blocked | handed-off | done
- **Next:** <the concrete next action, with file:line where it helps>
- **Touches:** <key files / paths>
- **For whoever's next:** <the one thing the next surface must know — gotcha, constraint, or nothing>
```

*Surfaces:* `CLI Claude Code` · `Desktop Claude Code` · `Cowork` · `Claude Chat`.
*Timestamps:* UTC, `date -u +%Y-%m-%dT%H:%MZ` (Chat: use the current UTC time).
