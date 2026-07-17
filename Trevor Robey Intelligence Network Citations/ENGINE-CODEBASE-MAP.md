# ENGINE-CODEBASE-MAP — a co-developer's index of the OpenClaw research engine

> **What this is (2026-07-01).** The missing peer to `SYSTEM-REALITY.md` (what the business *is*),
> `THE-WHOLE-SYSTEM.md` (how the stack fits together), and `CONNECTOR-ALIGNMENT.md` (which connector
> does what). This file is the **module-by-module map for someone modifying the engine** — where each
> responsibility lives, how data flows through the pipeline, the invariants you cannot break, and the
> seams for extending it. It exists so an AI co-developer (or a future you) can safely maintain and
> upgrade `scripts/run-workflow.js` and everything it drives.
>
> **This is a map, not the territory.** The **source of truth is the code and git state**, then repo
> docs/scripts, then vault notes (historical only). When this doc and the code disagree, the code
> wins — `grep` to confirm a path before you rely on it, and update this file in the same PR.

---

## 0. Read-me-first realities (drift a co-developer WILL trip on)

- **Repo root:** `/Volumes/ExtraCurricular/TrevClaw-Obsidianodus/` (external volume must be mounted).
  Home is `/Users/myhome`. **`/Users/trevorrobey/…` is a wiped-Mac path — obsolete; ignore it.**
  ⚠️ This subfolder's own `CLAUDE.md` header still shows the stale `/Users/trevorrobey/TrevClaw-Obsidianodus`
  root; that line is wrong. This file's root above is correct.
- **Model drift:** `config/agent-config.json` still declares `defaultModel: "claude-sonnet-4-6"`, but
  the **live** per-role routing (`config/role-provider-map.json`, updated 2026-06-22) runs **Claude
  Opus 4.8 (`claude-opus-4-8`, 1M context)** for scout/analyst/synthesizer. The OSS models
  (Ollama, LM Studio) were **removed from the engine** (2026-07-16, Option B; restorable): LM Studio is **decommissioned**, and Ollama is retained for the **Obsidian side only** (Copilot + vault-zettelkasten), not an engine helper or fallback. Every engine role's `fallback` is now empty (`""`).
  SoT for who-runs-what = `role-provider-map.json`, not the `defaultModel` field.
- **Stale docs:** the repo-root `README.md` and this subfolder's `README.md` still use the old folder
  names (`trevor-robey-inc/`, `trevor-robey-inc-agents/`) from before the 2026-05-19 flat-merge.
  `SYSTEM-REALITY.md` / `THE-WHOLE-SYSTEM.md` / this file win over them.
- **CI-enforced invariants are not optional** (see §7). A PR that trips restricted-globals or the
  HTTPS-only linter fails `policy-and-tests`. The fix is to conform, never to disable the linter.
- **Nothing runs in Docker.** `openclaw-bridge/execution/` is scaffold, never invoked — workflows are
  plain Node child processes.

---

## 1. The pipeline in one picture

```
run-workflow.js  --template <id>  --inputs '{...}'  --confirm   [--operator-approve]
      │
      ├─ operator-approve-gate.js ....... YubiKey PIN+touch consumes a one-shot armed token (fail-closed)
      │
      ▼
workflow-engine  (orchestrates the mission → dataset → offer → approve → export chain)
      │   for each of 6 agent roles:
      │     tool-prefetch.js ........... pulls live evidence (ToolUniverse ~2,116 tools + localFetchers),
      │     │                            injects synthetic `tooluniverse://` docs, records fetched_citation_ids
      │     role-provider-router.js .... picks the LLM per role (map → template pref → default=claude-code)
      │     agent-context-loader.js .... prepends config/agents/<role>/SOUL.md + AGENTS.md + session memory
      │     agent-engine.js ............ Opus reasons over prefetched evidence → session recorded
      │     llm-adapter.complete() ..... claude -p stdin pipe (claude-code; `mock` for tests) — no live fallback (every role's `fallback` is empty)
      │     role-router.js ............. FAIL-CLOSED human-approval gate (needs operatorApproved === true)
      │
      ▼
citation-extractor.js ................. regex pulls PMID / NCT / ChEMBL / DOI / UniProt / CID out of text
      │
      ▼
citation-gate.js (verifyReportCitations)
      │   grounded = cited id ∈ union(fetched_citation_ids); else ungrounded
      │   grounded ratio ≥ minGroundedCitationRatio (0.75)  → PASS (the ONLY shippable state)
      │   grounded ratio < minGroundedCitationRatio  → HARD-FAIL  PHASE30_CITATION_UNVERIFIED
      │   zero runtime evidence fetched (honest-zero, now BLOCKS) → HARD-FAIL  PHASE30_CITATION_INSUFFICIENT_EVIDENCE
      │   evidence fetched but report cited nothing → HARD-FAIL  PHASE30_CITATION_NONE
      │   any cited DOI retracted (crossref-retraction.js) → HARD-STOP  PHASE30_CITATION_RETRACTED
      │   writes citation-verification.json + report-annotated.md ([UNVERIFIED] inline)
      │
      ▼
deliverable-packager.commitBundle() ... report.md + tables.csv + deliverables/* → manifest.json + checksums.txt
      │   integrity-rating.js  → deliverables/citation-integrity.md  (graded A/B/C/D provenance ledger)
      │   graveyard-memo.js    → deliverables/graveyard-memo.md      (NCT-traced stopped-trial memo)
      │
      ▼
workspace/releases/offer-…-export.zip  +  6 linked notes → vault OpenClaw/{template}/{date}/
```

Everything is a plain Node process. There is **no persistent gateway** for the research engine.

---

## 2. Directory map

| Path | Role |
|------|------|
| `scripts/` | 100+ operator CLIs. Entry point: `run-workflow.js` (+ `run-workflow.sh` wrapper that sets `NODE_EXTRA_CA_CERTS`). |
| `openclaw-bridge/core/` | The engine: research runtime, agent engine, providers, mission orchestration, **citation integrity**. |
| `openclaw-bridge/mcp/` | Subprocess MCP implementations (project connectors) + the two citation-integrity local fetchers. |
| `openclaw-bridge/dataset/` | Dataset builder, validator, deduper, scorer, provenance. |
| `openclaw-bridge/monetization/` | Offer/release packaging, deliverable rendering, evidence ledgers. |
| `openclaw-bridge/bridge/` | HTTP bridge server, auth, MCP transport (`/mcp`); Phase 31 Research REST API. |
| `openclaw-bridge/security/` | Runtime policy, RBAC, mutation control, credential broker. |
| `openclaw-bridge/distribution/` | Marketplace format adapters (Datarade, Kaggle, HuggingFace, AWS, Data & Sons) + training-data gen. |
| `openclaw-bridge/execution/` | ⚠️ Container-execution governance — **scaffold, never invoked**. |
| `config/` | All runtime config (JSON) + `workflow-templates/` + per-role `agents/`. See §5. |
| `workflows/` | Governance automation, observability, recovery, ingestion. |
| `analytics/` | Portfolio intelligence (Phase 23): `portfolio-intelligence/`, `rlhf-quality/`, `compliance-explainability/`, `experiment-explainability/`, `monetization-engine.js`. |
| `workspace/` | **All runtime state + artifacts**: `research-input/`, `research-output/`, `missions/`, `workflows/`, `releases/`, `distribution/`, `cache/`, `collateral/`. Created at runtime; often empty when idle. |
| `vendor/tooluniverse/` | Harvard ToolUniverse submodule, pinned SHA `3833b0e` (v1.1.10, ~2,116 tools). Only submodule. |
| `tests/` | Unit, integration, security, supply-chain (Node native `--test`). |
| `security/` | Policy files, RBAC, `interaction-log.json` (token/duration telemetry). |
| `00-…`–`15-…`, `OFFERINGS.md`, `REVENUE_PLAYBOOK.md`, etc. | Brand/commercial canon (not engine code). |

---

## 3. Key modules (the ones you'll actually touch)

Paths are under `openclaw-bridge/` unless noted. Confirm with `grep -rn <symbol>` before relying on a path.

| Module | Responsibility | Key symbols / notes |
|---|---|---|
| `core/tool-prefetch.js` | Pulls live evidence before prompt construction; the ground-truth source for grounding. | `createToolPrefetch({ localFetchers })`; role→tool map in `config/tool-prefetch-map.json`; injects `tooluniverse://` docs; **graceful degradation** if ToolUniverse down. |
| `core/agent-engine.js` | Runs each role's LLM call; persists what was fetched. | Records `fetched_citation_ids` + per-task `citation_verification`; `buildPrompt` carries the ABSOLUTE-RULE **ZERO FABRICATION** clause; The `runHelperPrePass` OSS pre-pass was **removed** 2026-07-16 (engine is 100% Claude; restorable). |
| `core/workflow-engine.js` | Orchestrates the mission chain and wires the integrity layer. | `executeMissionStep` (runs the citation gate; builds both integrity deliverables), `executeOfferStep` (threads memos into `source_context`). |
| `core/role-provider-router.js` | Per-role LLM selection. | Precedence: `roles[role]` → template `provider_preference` → `default = claude-code`; every non-claude route falls back to claude-code. |
| `core/role-router.js` | **Fail-closed human-approval gate.** | Requires `context.operatorApproved === true` for every research role; else `PHASE15_HUMAN_APPROVAL_REQUIRED`. `run-workflow.js --operator-approve` is the only production path that sets it. |
| `core/operator-approve-gate.js` | YubiKey consent for `--operator-approve`. | One-shot, TTL 300s, nonce-rotated, fail-closed; arm via `operator-approve-gate arm`. Test bypass: `OPENCLAW_APPROVE_GATE=0`. |
| `core/agent-context-loader.js` / `core/agent-session-recorder.js` | Load/persist per-role identity + memory. | Reads/writes `config/agents/<role>/{SOUL.md, AGENTS.md, sessions/}`. |
| `core/citation-extractor.js` | Regex extraction of identifiers. | PMID / NCT / ChEMBL / DOI / UniProt / CID. DOI regex stops at non-DOI terminators + strips trailing punctuation (don't regress this). |
| `core/citation-gate.js` | **Report-level grounding gate (multi-state verdict — only PASS ships).** | `verifyReportCitations`: cited ids vs union(fetched). PASS (ratio ≥ `minGroundedCitationRatio`); `PHASE30_CITATION_UNVERIFIED` (below floor); `PHASE30_CITATION_INSUFFICIENT_EVIDENCE` (zero runtime evidence — an honest-zero that now **BLOCKS**, no longer silently auto-passes); `PHASE30_CITATION_NONE` (evidence fetched but report cited nothing). Writes `citation-verification.json` + `report-annotated.md`. |
| `mcp/crossref-retraction/crossref-retraction.js` | DOI retraction screen. | Crossref `/works/{DOI}` (`is-retracted-by` / update-to `retraction`) → `PHASE30_CITATION_RETRACTED`. **Fail-soft** (a network blip yields no retractions). |
| `mcp/ctgov-supplemental/ctgov-supplemental.js` | Stop-reason archaeology (local fetcher, NOT ToolUniverse). | Tool `ctgov_stopped_trials`; CT.gov API v2 TERMINATED/WITHDRAWN/SUSPENDED + `whyStopped` + change-history; session-cached; wired via `tool-prefetch.js` `localFetchers` seam. |
| `monetization/integrity-rating.js` | Renders the provenance ledger. | `buildIntegrityReport(citation_verification)` → `deliverables/citation-integrity.md` (A/B/C/D; F+BLOCKED on retraction; N/A if nothing cited). |
| `monetization/graveyard-memo.js` | Renders the stopped-trial memo. | `buildGraveyardMemo(stoppedTrials,{indication})` + `buildAmendmentRisk(...)` → `deliverables/graveyard-memo.md` (deterministic, no LLM, fail-soft). |
| `monetization/deliverable-packager.js` | Seals the bundle. | `commitBundle` (has the **EXDEV copy-fallback** for the external volume); writes `manifest.json` + `checksums.txt`; registers `artifactRefs`. |
| `llm-adapter.js` | The provider abstraction. | `complete()` takes a per-call provider override w/ role-level fallback; `claude -p` stdin pipe. |
| `core/time-provider.js` / `core/entropy-provider.js` | Determinism providers. | `timeProvider` / `entropyProvider` — the ONLY sanctioned source of time/randomness in `openclaw-bridge/` (see §7). |
| `bridge/research-api.js` | Phase 31 REST API `/api/v1/research`. | ⚠️ Built + 34/34 tests, **not deployed**, serves no one. |
| `dataset/` (builder/validator/deduper/scorer/provenance) | Turns research output into the `tables.csv` dataset with provenance on every row. | Governed by `config/dataset-{schemas,quality-rules,license-rules}.json`. |

---

## 4. Report bundle schema (what a passing run emits)

A gate-passing mission exports `workspace/releases/offer-…-export.zip` containing:

- `deliverables/report.md` — the narrative report (the 2026-06-10 proof run was 61 KB).
- `tables.csv` — the structured dataset (proof run: 196 rows, 219 citation hits).
- `deliverables/citation-integrity.md` — graded provenance ledger (§3, `integrity-rating.js`).
- `deliverables/graveyard-memo.md` — NCT-traced stopped-trial memo (§3, `graveyard-memo.js`).
- `citation-verification.json` + `report-annotated.md` — gate output (grounded/ungrounded detail).
- `manifest.json` + `checksums.txt` — bundle inventory + integrity seal.
- store copy + a marketplace submission pack (per the distribution adapter).

When debugging data issues, read a real bundle under `workspace/releases/` — the schema above is the
contract; the code that produces each file is in `dataset/` and `monetization/`.

---

## 5. Config files (what each controls)

| File | Controls |
|---|---|
| `config/agent-config.json` | `defaultProvider` (claude-code), `defaultModel` (⚠️ stale sonnet — see §0), dirs, `taskTimeoutMs`, `maxTokensPerRequest`, `requireSupervisorApproval`, `minGroundedCitationRatio` (**0.75** — `config/agent-config.json`; required, read fail-closed → strict `0.75` default + warning if missing/invalid; the citation-gate threshold / B-grade floor). |
| `config/role-provider-map.json` | **Live** per-role LLM routing (SoT for who runs what). |
| `config/llm-providers.json` | Provider endpoints — engine is 100% `claude-code` as of 2026-07-16 (Option B); `local`/ollama `:11435`, `mock`, `anthropic`, `openai`, `openrouter` are present but disabled. LM Studio was decommissioned 2026-07-16 (removed from this file). Plus cache TTL. |
| `config/tool-prefetch-map.json` | Role → which tools/connectors are prefetched. Defers to the connector registry for binding intent. |
| `config/connector-registry.json` | **Authoritative connector map** (schema `connector-registry-v1`, 39 entries): `execution_surface`, `bound_roles`, `bound_workflow_steps`, `adapter_status`, `purpose`. |
| `config/workflow-templates/` | The 6 workflow template definitions (+ `mission-templates.json`). |
| `config/agents/<role>/` | `SOUL.md`, `AGENTS.md`, `sessions/` — per-role identity + memory. |
| `config/role-prompts.json` | Per-role prompt scaffolding. |
| `config/dataset-{schemas,quality-rules,license-rules}.json` | Dataset shape, quality gates, license rules. |
| `config/scheduled-workflows.json`, `agent-spawner.json`, `agent-topology.json`, `autonomy-ladder.json`, `monetization-map.json`, `platform-targets.json`, `direct-delivery-targets.json`, `data-source-credentials.json` | Scheduling, spawning, topology, autonomy, monetization + platform routing, credentials. |

---

## 6. Workflow templates & agent roles

**6 templates** (IDs live in `config/workflow-templates/`; examples used in the CLI): `drug-discovery-full`,
`pharmacovigilance-report`, `clinical-trial-landscape`, `target-validation`, `rare-disease`,
`general-research-pack`.

**6 specialized roles (Phase 30):** `literature_reviewer`, `safety_signal_detector`, `molecular_profiler`,
`competitive_intel_analyst`, `quality_auditor`, `report_generator` — plus the pipeline roles
`scout` / `analyst` / `synthesizer` that carry provider routing. **Semantic Scholar** (`SemanticScholar_search_papers`)
is wired as a first-class literature lane for scout, analyst, literature_reviewer, and
competitive_intel_analyst — add it by default to any new literature-aware role.

---

## 7. Invariants you MUST honor (breaking these fails CI or ships a bad report)

1. **Restricted globals.** `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` are **forbidden**
   in `openclaw-bridge/`. Use `timeProvider` / `entropyProvider`. Enforced by
   `scripts/lint-restricted-globals.sh` (CI + `npm run phase2:gates`).
2. **HTTPS-only (monorepo-wide).** No `http.createServer` binding a TCP port, no TLS-disable env vars,
   no `tls ? https : http` degradation. Throw on cert-load failure and refuse to listen. Enforced by
   `scripts/lint-transport-monorepo.sh --strict`. (UDS/pipe transports and the browser-automation
   carve-out are the only exceptions.)
3. **Fail-closed everywhere.** Unknown state → `blocked` / `review_required`. Missing router or principal
   context → job denied. Grounded ratio below threshold → report refuses to ship. Retracted DOI →
   hard-stop. New gates default OFF.
4. **Zero fabrication.** Never let a code path invent a PMID/NCT/DOI. Cited ids must be grounded in
   fetched evidence; no code path (including any later-restored helper/pre-pass) may ever inject a citation.
5. **Deterministic naming + provenance.** IDs are prefixed `mission-` / `dataset-` / `offer-`; every
   produced row carries source metadata; Phase 22/28 evidence ledgers are append-only + chain-hashed.
6. **Immutable config after boot.** Load config once; don't mutate at runtime.
7. **Manual-only external actions + no PHI.** No autonomous publish/upload/login/transact. Sources are
   public biomedical databases only. **DrugBank = STOP-SHIP** (no commercial license held).

---

## 8. Test / verify / run commands

```bash
# Setup
git submodule update --init --recursive
nvm use 22.13.1 && npm ci          # Node 22.13.1 strictly enforced (engine-strict=true)

# Tests + governance
npm test                            # Node native --test
npm run phase2:gates                # governance gates (incl. restricted-globals lint)
npm run build:verify
npm run lint:transport              # HTTPS-only guard (bridge packages)
npm run secrets:verify
npm run audit:connectors            # registry vs prefetch-map drift (--write-drift-tickets to file FEAT-… tickets)

# Per-phase verifies
npm run phase29:verify   # ToolUniverse MCP (58/58)
npm run phase30:verify   # Workflow engine (26/26)
npm run phase31:verify   # Enterprise delivery (34/34; not deployed)
npm run phase33:verify   # Claude Code provider (27/27)
npm run monetization:verify

# Run the engine end-to-end (YubiKey-gated)
operator-approve-gate arm           # PIN + touch → one-shot armed token
scripts/run-workflow.sh --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --confirm --operator-approve
#   run-workflow.sh sets NODE_EXTRA_CA_CERTS (mkcert CA) so local TLS proxies are trusted.
```

---

## 9. Git conventions

- Phase work on `codex/phaseNN-slug` branches, merged to `main` after CI passes.
- Required status checks: **`policy-and-tests`**, **`deterministic-build-verify`**.
- Commit messages describe the phase and change type.
- **Local-only** repo: no git remotes. Durable backup = `git bundle --all` in `~/Downloads/`. Do not
  re-add a remote or push without an explicit decision to reverse the local-only posture.

---

## 10. Extension seams (how to add X the sanctioned way)

- **A new connector.** Add a subprocess MCP under `openclaw-bridge/mcp/<slug>-mcp/`; register it in
  `config/connector-registry.json` (set `execution_surface`, `bound_roles`, `bound_workflow_steps`,
  `adapter_status`, `purpose`); wire it into `config/tool-prefetch-map.json` for the relevant roles;
  run `npm run audit:connectors`. **Rule:** any connector authenticated at the Claude-host level must
  be added to the registry within 7 days. For a **non-ToolUniverse local fetcher**, use the
  `localFetchers` seam in `tool-prefetch.js` (pattern: `ctgov-supplemental`).
- **A new workflow template.** Add a JSON definition under `config/workflow-templates/` (+ register in
  `mission-templates.json`); set `provider_preference`; roles pull tools per `tool-prefetch-map.json`.
- **A new agent role.** Define prompts in `config/role-prompts.json`; create `config/agents/<role>/{SOUL.md,AGENTS.md}`;
  map its provider in `config/role-provider-map.json`; add prefetch bindings in `tool-prefetch-map.json`
  (include Semantic Scholar by default for literature-aware roles).
- **A new bundle deliverable.** Render it **deterministically (no LLM)** in `openclaw-bridge/monetization/`;
  register it in `manifest.json` + `checksums.txt` + `artifactRefs`; wire it into
  `workflow-engine.executeMissionStep` and keep it **fail-soft + bounded** (an absent input omits it,
  never blocks a passing report). Pattern: `graveyard-memo.js` / `integrity-rating.js`.

---

## 11. Danger zones & known gaps (the co-developer's mental hazard map)

1. **The resolver gap (the one real product hole).** Citations are **grounded in the source records
   actually retrieved at runtime + DOI retraction-screened** — they are **NOT** independently
   re-resolved against each live external database, and there is no clickable-link "Reproducibility
   Manifest" yet. **Grounded ≠ re-resolved.** Do NOT let code or copy claim per-citation external
   re-resolution until it's built. Building a deterministic resolver/validator (NCBI E-utilities for
   PMID, CT.gov for NCT, ChEMBL, Crossref/Unpaywall for DOI) is the highest-leverage engine investment.
2. **Built-but-not-live** (don't treat as working): Phase 31 REST API (deployed = no), Phase 24
   notion-sync/newsletter (disabled), Phase 25 credential broker (inactive), `execution/` container
   governance (never invoked).
3. **Path + model + doc drift** — see §0. Trust `role-provider-map.json` over `defaultModel`, this
   root over the subfolder CLAUDE.md header, and the reality docs over both READMEs.
4. **CI-enforced invariants** (§7) — a PR that trips restricted-globals or HTTPS-only fails
   `policy-and-tests`. Conform; never disable the linter.
5. **Teardown discipline.** `run-workflow.js` must shut down ToolUniverse SMCP + its health-check
   interval and force a clean `process.exit()` (a prior bug orphaned servers for hours). Preserve the
   `finally { runtime.shutdown() }` + explicit exit.

---

## 12. Canonical docs index

| For… | Read |
|---|---|
| Ground-truth engine narrative | `SYSTEM-REALITY.md` |
| Whole-stack map + live status | `THE-WHOLE-SYSTEM.md` |
| Connector → business function | `CONNECTOR-ALIGNMENT.md` (+ machine source `config/connector-registry.json`) |
| Operator runbook, phase list, conventions | `CLAUDE.md` (this folder) + repo-root `CLAUDE.md` (ports/topology) |
| Products / pricing / strategy | `OFFERINGS.md`, `REVENUE_PLAYBOOK.md` |
| Scoreboard / KPIs | `12-pipeline-tracking/kpis-end-of-month.md` |
| The audit this all came from | `audit/business-reality-2026-06/` |
| How the Claude `data` + `bio-research` plugins are wired to this engine | `CLAUDE-PLUGINS-WIRING.md` |

---

*Maintenance rule: when you change a module path, an invariant, a config file, or an extension seam,
update this map in the same PR. It is only useful while it is true.*
