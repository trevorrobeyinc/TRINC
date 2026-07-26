# Recovery lessons (Phase 1)

- **Machine identity differs from the plan.** The handoff prompt hardcoded `/Users/trevorrobey`; this
  machine is user `myhome` with the repo at `/Users/myhome/TrevClaw-Obsidianodus` on the internal FileVault disk (it lived on the external volume `/Volumes/ExtraCurricular` until 2026-07-26).
  Every absolute path (launchd plist node binary, mkcert CA, logs) must be adapted to `/Users/myhome`.
  The repo's own docs (CLAUDE.md health-check block, LEARNINGS) still contain `/Users/trevorrobey` paths —
  left as-is (historical / minimal-diff); only operational artifacts we create use the adapted paths.

- **Fetched `git stash` doesn't show in `git stash list`.** `git fetch <bundle> '+refs/stash:refs/stash'`
  restores the ref, but `git stash list` reads the stash *reflog*, which a fetched ref lacks — and
  `git stash store` reported success without creating the reflog. Fix that worked: delete the ref then
  recreate with a reflog —
  `git update-ref -d refs/stash && git update-ref --create-reflog -m "..." refs/stash <sha>`.
  (A same-value `update-ref` is a no-op that doesn't log; the null-old-value form `... <sha> 0000…`
  fails with "reference already exists".) The stash content (`a7fc6a0`) was always recoverable via
  `git stash apply refs/stash` regardless.

- **macOS has no `timeout(1)`.** Don't wrap commands in `timeout …`; it's "command not found". Use the
  Bash tool's own timeout, or `gtimeout` from coreutils if installed.

- **Task 1 annotation strategy.** The acceptance asked for "no live reference," but the bridge is
  referenced across CLAUDE.md prose and two historical `.specify` spec docs. Deleting all of it would be
  a large lossy diff against the senior-dev minimal-diff / no-drive-by-refactor bar. Resolution:
  rewrite the **topology blocks** (the explicit acceptance items) cleanly, and **annotate** every other
  reference with a RETIRED banner pointing to `Claude/.archive/` + the deletion log. Surfaced as a
  reasoned deviation.

- **`obsidian-stdio-adapter/node_modules` is a committed symlink**, not a dir — it points to
  `../obsidian-copilot-bridge/node_modules` (the adapter shares the bridge's install; that's why it has
  no lockfile). Running `npm install` there clobbers the symlink with a real dir + generates a lockfile.
  Fix: `rm -rf node_modules package-lock.json && git checkout -- <path>` to restore the symlink. The dep
  (`@modelcontextprotocol/sdk`) resolves through it once the bridge is installed. **Don't `npm install`
  the adapter** — install the bridge and the symlink does the rest.

- **ARCHITECTURE.md is already stale** (still lists TrevNodus, chrome-devtools, backend emulator :8789)
  and self-declares the root `CLAUDE.md` as the source of truth. Only the targeted topology line was
  edited; unrelated drift was intentionally left alone (out of scope).

# SearXNG citation-gate v1 — Step 1 (adapter) lessons — 2026-07-06

- **The handoff spec (written by Chat) diverges from the real engine — but only Step-2 wiring cares.**
  The spec's `step_type: "breadth"|"depth"` **does not exist** in the workflow engine (step types are
  `mission|quality_audit|dataset|offer|approve|export`); `connector-registry.json` is **audit-only at
  runtime** (never `require`d — `adapter_status` is bookkeeping); and there is **no generic
  "spawn adapter by registry path"** seam. None of that blocks Step 1: the adapter is a self-contained
  `GateInput→GateOutput` module whose connector call is injected + stubbed, so it builds/tests in full
  isolation. These divergences are **Step-2 wiring decisions** — resolve before touching run-workflow.

- **Real wiring seam = `localFetchers`, not a subprocess.** Engine adapters (`chembl-mcp`, `pubmed-mcp`)
  are in-process CJS factories `createXMcp()→{execute,isAvailable}`, and non-ToolUniverse fetchers are
  registered as `localFetchers: { tool_name: (args)=>result }` in `scripts/_workflow-runtime.js` (see
  `ctgov_stopped_trials`). Step 2 should wire the gate through that seam / into `executeQualityAuditStep`,
  which today is a pure in-process file-regex check (returns `{ok,...}`; caller throws
  `PHASE30_QUALITY_BELOW_THRESHOLD`). Fail-closed in this engine = **throw a coded Error** → the per-step
  try/catch marks the workflow failed. Mirror that (`verifyReportCitations` in `citation-gate.js` is the
  pattern), don't invent a new failure channel.

- **Restricted-globals lint scans COMMENTS too** (`rg` over `openclaw-bridge/`, pattern
  `Date.now(|new Date(|Math.random(|randomUUID(`). Two of my JSDoc lines *documented* the ban by writing
  the literal tokens → false-positive lint hits. Fix: describe the ban as "no wall-clock / RNG globals"
  without the literal `X(` forms. The adapter itself is genuinely pure (cluster ids from canonical keys,
  union-find with `Math.min/max` — both allowed).

- **The whole-tree restricted-globals lint is ALREADY RED on this branch** — 4 PRE-EXISTING violations in
  `core/workflow-engine.js` (`new Date()` ×2), `core/role-router.js`, `core/operator-approve-gate.js`
  (`Date.now()`), `mcp/citation-reresolver/citation-reresolver.js` (`new Date()`). All unmodified by me
  (empty `git status`). Flagged for the operator; NOT fixed (out of Step-1 scope; `workflow-engine.js` is
  high-blast-radius). My adapter dir greps clean.

- **G4 no-over-merge is the load-bearing dedup invariant** and had to be re-ported (no shared
  `canonicalUrl`/`dedupe` exists in `openclaw-bridge/` — only in the connector's `robust.js`). Cluster
  keys = canonical URL **+ url-derived citation ids only**; text-derived ids never merge. Kept in
  `cluster.js` with a "keep in sync with the connector" note — a future drift risk to watch (same class
  as the connector↔engine citation-grammar drift).

- **`adapter_status` enum is `wired`/`missing`/`scaffold-only`, not `present`** (spec said "present").
  Step 3 sets searxng-search `missing → wired`.

# SearXNG citation-gate v1 — Steps 2 & 3 (section-gate wiring) lessons — 2026-07-06

- **A `subtask_results[]` element carries NO subject/label field.** Keys are `ok, task_id, status,
  output_path, metadata_path, manifest_path, token_count, provider, model, subtask_id, agent_id,
  mission_id`. `task_definition.description` lives in the `metadata_path` sidecar, but subtask
  descriptions come from a pluggable `spawnPlanner.buildPlan` whose fallback is `` `${mission} (${role})` ``
  — **role-suffix only**, an unreliable per-section differentiator. So per-section queries are derived
  from each section's **output text** (top capitalized key-terms, deterministic) + the workflow primary
  subject (`indication||condition||disease||therapeutic_area||topic`). Output text genuinely differs per
  role-section → distinct, section-specific queries. Watch: a future `spawnPlanner` that sets real
  per-step descriptions would let us prefer `metadata.description`; for now text-derivation is the teeth.

- **The engine step type is `quality_audit` (step_id `quality_check`), and `executeQualityAuditStep` is a
  factory closure** — `logger`, `safeString`, `applyInputSchemaDefaults`, `fs` are all in scope; it is NOT
  module-exported, so the section-gate logic lives in a separate, injectable `section-gate.js`
  (`runSectionGate`/`assertCoverageOrThrow`/`deriveSectionQuery`) that the engine calls — that's what
  makes it offline-testable with a stubbed `searchFn`.

- **Density-first composition is load-bearing for cost.** The existing regex density check runs UNCHANGED
  and FIRST; the section gate (which makes live SearXNG calls) runs ONLY on density-pass. A report that
  already fails density throws `PHASE30_QUALITY_BELOW_THRESHOLD` with zero searches spent.

- **Infra-vs-zero-coverage hinges on the adapter's error contract.** `runCitationGate` throws if the
  **pass-1** `searchFn` throws (its retry-only fail-soft is unchanged), and RETURNS `gate_status:"fail"`
  on a genuine zero-result. So in `runSectionGate`: caught throw = infra → section `checked:false` (never
  fails the step); returned `"fail"` = real zero-coverage → collect → `assertCoverageOrThrow` throws
  `PHASE30_CITATION_COVERAGE_ZERO`. This exactly mirrors the engine's fail-soft-on-infra /
  fail-closed-on-fabrication posture.

- **Lazy-require the connector at the seam, never at module top.** `searchfn.js` lazy-`require`s the
  connector's `search()` on first call, so a connector problem surfaces as a caught infra error (section
  UNCHECKED) instead of breaking `workflow-engine.js` module load for ALL workflows. Verified the module
  still loads after the edit. The require resolves the external-volume SOURCE copy (not the staged copy);
  interactive-node/`claude -p` safe, NOT launchd-safe.

- **The restricted-globals lint scans comments AND is already red from 4 PRE-EXISTING hits**
  (`workflow-engine.js` ×2 at lines 333/354, `role-router.js`, `operator-approve-gate.js`,
  `citation-reresolver.js`). My additive edit to `workflow-engine.js` added ZERO new hits (still exactly 2,
  both pre-existing). New adapter files are clean. Kept comments free of the literal `X(` token forms.

# Live validation of the fence fix + HTTPS gate — 2026-07-07

- **A live run proves what units can't — and it confirmed the fence works.** The fenced `buildPrompt`
  actually stopped the model echoing scaffolding: a real `clinical-trial-landscape`/heart-failure
  mission's deliverables had ZERO hits for `TRAINING KNOWLEDGE` / `LIVE DATABASE CONTEXT` /
  `Action Required Before Delivery` / `Synthesis Confidence Statement` / `--- DOC N ---`, and the report
  headers were all legitimate domain sections. Citation density did NOT regress (34/34 grounded, ratio
  1.0; quality density pass) — the fence's "provenance lives in inline citations" framing reinforced,
  not suppressed, citations.

- **"Make sure the gate holds over HTTPS" = prove the searchFn actually reaches :8891 with the CA, and
  count sections CHECKED — a silent UNCHECKED means the gate no-op'd.** Pre-flight ran the gate's REAL
  path (connector `searchFn`) and showed it succeeds over `:8891` WITH `NODE_EXTRA_CA_CERTS`=mkcert CA
  and fails cleanly WITHOUT it (no plaintext fallback). `run-workflow.js` self-execs with that CA, so no
  fix was needed. The live run's `section_coverage` had all 3 sections `checked:true` (zero UNCHECKED) —
  that, plus zero `:8890` in the log, is what "the gate held over HTTPS" actually means.

- **BSD `find -newermt` silently returns nothing on macOS** — don't use it to prove file freshness; it
  gave a false "0 fresh files". Use `stat -f %Sm` for real mtimes.

# Scaffolding-leak fix (Option A: prompt fence) — 2026-07-06

- **Fix a model-echo leak at the prompt structure, not with a post-hoc strip.** In `agent-engine.js`
  `buildPrompt`, the cure was: fence the scaffolding (`===== INSTRUCTIONS … END INSTRUCTIONS =====`),
  add an explicit OUTPUT CONTRACT ("deliverable only; don't reproduce these instructions / the
  evidence banners / process-confidence-quality self-assessment"), and — crucially — repeat the
  contract as a CLOSING directive AFTER the evidence (recency: the evidence is the last thing the
  model reads before generating). Keep it additive: change NO instruction string, only add fences +
  directives, so the diff is +N/−1 and existing ordering-assert tests keep passing.

- **A core-prompt change is unit-testable for STRUCTURE, not for BEHAVIOR.** `helper-prepass.test.js`
  locks the substring ORDER (ZERO FABRICATION → BEGIN/END ADVISORY DIGEST → Input Documents:), so a
  reorg is safe to verify offline. But whether the model actually stops leaking, and whether citation
  DENSITY still clears the gate, needs a live mission run — flag that explicitly; don't claim "fixed"
  off unit tests alone.

# SearXNG gate — Phase 3 scaffolding-leak investigation (proposal only) — 2026-07-06

- **The scaffolding leak is a MODEL-ECHO problem, not a string-concat bug.** `output.md` is written
  purely from `completion.text` (`agent-engine.js:414` → `saveOutput`; `research-output-manager`
  renders `String(output).trim()+"\n"`, no prompt ref; llm-adapter pipes prompt to stdin, reads only
  `parsed.result`). The engine never stitches prompt text into the file. The model echoes it because
  `buildPrompt` (`agent-engine.js:107-171`) assembles ONE undelimited block — role + citation rules +
  zero-fabrication + `LIVE DATABASE CONTEXT` + `--- DOC N: <path> ---` doc bodies, joined by plain
  `\n` — with no fence separating instructions from the deliverable and no anti-echo directive.

- **Two leak classes need different fixes.** (1) VERBATIM artifacts (`LIVE DATABASE CONTEXT` sentence,
  DOC banners, tool-prefetch `Source:/Query:/Retrieved:` footers) CAN be exact-matched → a conservative
  post-gen strip is safe. (2) PARAPHRASED headers (`Synthesis Confidence Statement`, `Action Required
  Before Delivery`, `Live Data Quality Assessment`) exist in NO template/config — the model invented
  them from the prompt's concepts → a regex strip would risk deleting REAL analysis (`Failure Mode
  Signals`/graveyard content is a legitimate stop-reason-archaeology topic). So the ROOT fix is the
  prompt structure (fence + anti-echo directive in `buildPrompt`), NOT a strip. Proposal paused for review.

- **A downstream workaround is not a source fix.** The section-gate `STOPWORDS` list stops leaked words
  polluting SEARCH QUERIES but never touches the deliverable — the defect lived one layer up the whole time.

# SearXNG gate — Phases 1–2 (composition test + preprint grade) lessons — 2026-07-06

- **Stub the lazily-required dependency via `require.cache`, not a production seam.**
  `executeQualityAuditStep` does `require("../mcp/searxng-mcp/searchfn.js")` lazily; a test overrides
  `require.cache[require.resolve(".../searchfn.js")].exports = { searchFn: stub }` (save + restore in
  before/afterEach). Same resolved absolute path → the engine gets the stub. No `createWorkflowEngine`
  injection seam needed. This is how to offline-test wiring buried inside a factory closure.

- **The mission step's OTHER citation gates block synthetic ids before the quality step.**
  `executeMissionStep` runs grounded-ratio (`PHASE30_CITATION_UNVERIFIED`) AND re-resolution
  (`PHASE30_CITATION_UNRESOLVED`, which resolves cited PMIDs/NCTs/DOIs against a LIVE registry). A
  composition test that feeds real-looking ids to reach density-pass gets blocked there first. Fix:
  use density-matching tokens that are NOT extractable citation ids — `FAERS`/`PubChem` trip the
  density regex but carry no resolvable id, isolating the test to the section-coverage gate.

- **A preprint is a real source but not peer-reviewed → grade B, never A.** The connector grammar
  tags preprints two ways: `type === "arxiv"` (no subtype) and `subtype === "preprint"` (bioRxiv/
  medRxiv 10.1101 / Research Square / ChemRxiv DOIs) — BOTH checks required. Grade-label accuracy
  only; a B preprint still counts toward hasAB/Comprehensive (tier behavior unchanged). Do NOT
  re-port the grammar to detect this — read the tags, check `subtype`/`type` on the already-emitted
  citation object.

- **Off-domain preprint = relevance, not grading.** An arXiv CS paper surfacing for a clinical query
  is a domain-fit problem a keyword gate can't solve; it's a separate lever from the A/B/C/D label.
  Flagged as a future item, not folded into the grade fix.

# SearXNG section-gate — key-term extractor sharpening lessons — 2026-07-06

- **Stubs can't catch a blunt extractor; a live run on REAL structured text did.** The section-gate
  tests all passed on clean domain-term fixtures, but a live e2e run against real LLM section text
  exposed that `topKeyTerms` grabbed table-headers (COMPLETED/Phase II), literal citation IDs
  (NCT02686749), and leaked prompt scaffolding (TRAINING KNOWLEDGE) over real domain terms. Lesson:
  for text-processing heuristics, a real-data diagnostic is worth more than any number of clean-fixture
  unit tests — keep `scripts/diag/searxng-section-gate-e2e.mjs` and re-run it after any extractor change.

- **Rank by NET-DISTINCTIVE token count, not raw word-count.** "Prefer multi-word phrases" taken
  literally lets a 4-word mostly-boilerplate phrase beat a 1-word distinctive drug name. Ranking by
  `meaningful.length` (tokens surviving stopword/ID/subject filters) achieves "rare multi-word wins"
  (SGLT2 inhibitor empagliflozin = 3) without being fooled by common-word padding; frequency becomes a
  tiebreak only. Fully deterministic — no wall-clock/RNG (still under the openclaw-bridge/ lint).

- **A small LOCAL id-regex set beats re-porting the connector grammar.** Stripping citation-ID tokens
  (NCT/PMID/DOI/CHEMBL/…) needs only a handful of anchored token shapes; re-porting the connector's
  grammar would create another cluster.js-style drift pair. Keep it small and local.

- **Whole-phrase emission leaks adjacent stoplisted tokens.** Emitting the whole capitalized phrase means
  a stoplisted token next to a distinctive one still rides into the query ("Live Data Quality Assessment",
  trailing "This"). Emitting meaningful-only tokens is the fix (deferred — next increment). And mc-first
  ranking surfaces multi-word *report-workflow* phrases ("Action Required Before Delivery") that escape a
  vocab stoplist — a phrase-level stoplist or a "looks like a workflow instruction" filter is the follow-up.

- **The gate tuning is downstream of a real report-quality bug:** agent/prompt scaffolding
  (LIVE DATABASE CONTEXT / TRAINING KNOWLEDGE / "Action Required Before Delivery" / "Synthesis Confidence
  Statement") is bleeding into the mission's *deliverable* text (from the tool-prefetch injection + role
  prompt scaffolding). Sharpening the extractor stops it polluting *queries* but not the *report*. Flagged
  on the board as a separate mission-pipeline finding.

- **Registry is declarative** — flipping searxng-search to `adapter_status:"wired"` +
  `execution_surface:"subprocess-mcp"` + bare `suggested_adapter_path` wires nothing at runtime (the file
  is audit-only); the real wiring is the `executeQualityAuditStep` edit. `npm run audit:connectors` always
  exits 0 (informational).
