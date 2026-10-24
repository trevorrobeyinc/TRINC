# Implementation Plan: trevor-robey-inc-agents

**Branch**: `001-trevor-robey-inc-agents` | **Date**: 2026-05-13 | **Spec**: [`spec.md`](./spec.md) | **Checklists**: [`checklists/release-readiness.md`](./checklists/release-readiness.md)

## Technical Context

- **Language / runtime**: Node 22.13.1 (engine-strict in `trevor-robey-inc-agents/package.json`).
- **Module system**: CommonJS in `trevor-robey-inc-agents` (NOT ESM — historical decision, do not migrate without explicit phase plan). TypeScript only in `Copilot-Everything/bridges/` and `Claude/` Obsidian plugins. Python for the vendored ToolUniverse subprocess.
- **Workspace orchestrator**: None. No root `package.json`, no turbo, no nx, no pnpm-workspace, no `.github/workflows/`. Each workspace is independently scripted; the monorepo is loose-coupled by convention.
- **Test framework**: Node's built-in test runner with custom harness; 906 tests organized under `trevor-robey-inc-agents/tests/{core,integration}/`.

## Architecture

See `ARCHITECTURE.md` (Phase-35 reference, 2026-04-12 — accurate for engine internals but lists retired components) and `CLAUDE.md` "Multi-Operator Topology" section (current source of truth).

Three independent operators share the stack via the canonical MCP bridge on `:8798`:

1. **Claude Desktop** — heavy-lift code/file operator. Connects via MCP stdio to claude-code CLI, obsidian-bridge adapter (→ `:8798`), filesystem server.
2. **Command Center plugin** (`Claude/obsidian-openclaw-command-center/`) — workflow dispatch + monitoring. Spawns `trevor-robey-inc-agents/scripts/run-workflow.js` via `child_process.spawn()`. Owns the additive `:8799` bridge (HTTPS, biomedical workflow tools).
3. **Observability sidecar** (optional, Docker Compose) — Traefik :11480/:11481 → Ollama/LM Studio failover; Prometheus :9090; Grafana :3001.

**Workflows run as on-demand subprocesses.** There is NO persistent HTTP gateway. The previous `:18789` launchd entry was retired 2026-04-27 — that was an unrelated homebrew `openclaw.ai` consumer product.

**Structured IPC**: stdout emits JSON events; stderr reserved for logs. The Command Center plugin parses stdout deterministically.

**Parallel execution**: `computeTopologicalLevels()` groups workflow steps by dependency level; each level runs concurrently via `Promise.allSettled()`. (Phase 35 design.)

## Port Map (current, per `CLAUDE.md`)

| Port | Service | Protocol | Owner | Manager |
|---|---|---|---|---|
| 8798 | Canonical Obsidian MCP Bridge | HTTPS | Copilot-Everything | `obsidian-bridge-launcher` plugin (Obsidian lifecycle) |
| 8799 | Command Center Bridge (additive) | HTTPS | Claude (plugin) | `obsidian-openclaw-command-center` (Obsidian lifecycle) |
| 8743 | Miyo TLS proxy → :8742 | HTTPS | Copilot-Everything | launchd `com.trevorrobey.miyo-tls-proxy` |
| 8742 | Miyo Semantic Search (plaintext upstream) | HTTP | external | /Applications/Miyo.app |
| 6433 | Qdrant TLS proxy → :6333 | HTTPS | Copilot-Everything | launchd `com.trevorrobey.qdrant-tls-proxy` |
| 6333 | Qdrant Vector DB (plaintext upstream) | HTTP | external | Miyo-bundled child process |
| 1235 | LM Studio TLS proxy → :1234 | HTTPS | Copilot-Everything | launchd `com.trevorrobey.lm-studio-tls-proxy` |
| 1234 | LM Studio (plaintext upstream) | HTTP | external | /Applications/LM Studio.app |
| 11435 | Ollama TLS proxy → :11434 | HTTPS | Copilot-Everything | launchd `com.trevorrobey.ollama-tls-proxy` (slot DISABLED in config) |
| 11434 | Ollama (plaintext upstream) | HTTP | external | Ollama app |
| 11480 | Traefik scout proxy (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 11481 | Traefik analyst proxy (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 9090 | Prometheus (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |
| 3001 | Grafana (optional) | HTTP | trevor-robey-inc-agents | Docker Compose |

## Data Model

- **Vault notes** (markdown + YAML frontmatter + wikilinks): persisted under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/{template}/{date}/`. Six notes per completed workflow.
- **Workflow audit logs**: `trevor-robey-inc-agents/workspace/audit/{workflow_id}/`. Per-step trace, citation index, agent transcripts.
- **Qdrant vector collections**: accessed via the `:6433` HTTPS proxy. Used by the Research Memory MCP for semantic pack storage.
- **Zettelkasten graph**: algorithmic, in-process inside Medical Zettelkasten MCP. No persistent DB — recomputed per analysis.
- **Workflow JSON state**: `workspace/workflows/{workflow_id}/workflow.json` — `status`, `template_id`, step results. Polled by `WorkflowTracker` every 2s + directory-scan fallback every 3s.

## External Integrations

- **Primary LLM**: Claude Code CLI (`claude-sonnet-4-6`), invoked via `claude -p`.
- **Fallback LLM**: LM Studio on `https://127.0.0.1:1235` (TLS proxy → upstream :1234). Models: `qwen2.5-coder-7b-instruct` (default), `mistral-nemo-12b` (alt).
- **CI / deterministic-test LLM**: `mock` provider.
- **Biomedical APIs** (8 project MCP servers under `openclaw-bridge/mcp/`):
  - ChEMBL — bioactivity, drug data
  - ClinicalTrials.gov — trial registry
  - PubMed — literature
  - HuggingFace Hub — metadata only (no model weight downloads)
  - NPI Registry — provider lookup
  - ICD-10 — diagnosis codes
  - Owkin — pathology
  - Google Drive — document ingest
  - **Citation-integrity components** (added 2026-06-12, under `openclaw-bridge/mcp/`): `crossref-retraction` — screens cited DOIs against Crossref `/works/{DOI}` for retractions (fail-soft); `ctgov-supplemental` — a local fetcher (not ToolUniverse) for ClinicalTrials.gov API v2 TERMINATED/WITHDRAWN/SUSPENDED trials, returning `whyStopped` stop-reason text + protocol change-history, session-cached, routed in via the `tool-prefetch.js` local-fetcher seam (tool_name `ctgov_stopped_trials`).
- **Tool library**: ToolUniverse subprocess at `vendor/tooluniverse/` — ~2,116 biomedical tools (MIMS-Harvard / Zitnik Lab, Apache-2.0, pinned v1.1.10 at SHA `3833b0e`).
- **Vector DB**: Qdrant — accessed via `:6433` TLS proxy; bundled as a child process of Miyo.
- **Semantic search**: Miyo v4 at `/Applications/Miyo.app`, accessed via `:8743` TLS proxy.
- **Vault**: Obsidian at `/Volumes/ExtraCurricular/My Digital Garden`.

## Constraints

- **HTTPS-only** (Constitution Principle I). No plaintext-fallback paths. Enforced by `scripts/lint-transport-monorepo.sh --strict`.
- **Subprocess-only workflow execution.** No persistent gateway. No re-introduction of `:18789` or similar.
- **Obsidian-tied bridge lifecycle.** `:8798` and `:8799` die when Obsidian quits — accepted trade-off.
- **mkcert TLS expiry**: 2028-07-07. Renewal must precede expiry; rotate via `mkcert localhost 127.0.0.1`.
- **`NODE_EXTRA_CA_CERTS` required in every spawned Node subprocess** (per spec 001 FR-010). Must point at `~/Library/Application Support/mkcert/rootCA.pem` in the env block of every Node process — including the engine's own spawned subprocesses, the Obsidian plugin host (so the Command Center plugin's spawn-of-`run-workflow.js` inherits it), and any launchd unit running Node. Missing this var is the #1 cause of `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` against the canonical bridge on `:8798` and the four HTTPS proxies.
- **Node 22.13.1 engine-strict.** No silent upgrades.
- **CommonJS in agents.** Module system change requires explicit phase plan.
- **Restricted globals in `openclaw-bridge/`**: `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` — use injected `timeProvider`/`entropyProvider`.
- **Single-repo invariant.** Do NOT re-create separate sub-repos. Rollback anchor: tag `pre-monorepo-consolidation-2026-05-07` on the archived predecessor repo.
- **Submodule discipline**: only `vendor/tooluniverse`. Vendor with UPSTREAM.md for everything else.

## Phase Status (reverse-engineered)

- **Phase 35** baseline (2026-04-12 snapshot in `ARCHITECTURE.md`):
  - Structured IPC (JSON events on stdout)
  - Parallel step execution via `Promise.allSettled()`
  - Intentional role-to-backend LLM routing (NOT round-robin)
  - Traefik failover topology (primary/backup, not load balancing)
  - Prometheus metrics on retired `:18789/metrics` (note: gateway retired 2026-04-27, observability sidecar has no scrape target until restoration is designed)
- **906 tests passing** in `tests/{core,integration}/` as of Phase 35.
- **Post-research citation-integrity layer** (2026-06-12, shipped + unit-tested): a zero-fabrication citation-integrity layer plus two cost-avoidance deliverables were added on top of the Phase-35 baseline.
  - **Citation gate**: `agent-engine.js` persists the identifiers actually retrieved at runtime by tool-prefetch (`fetched_citation_ids`) plus a per-task `citation_verification` block into research-output metadata; `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI — emit `[no verifiable citation found]` instead). `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`, in `openclaw-bridge/core/citation-gate.js`) that cross-checks every identifier cited in the assembled report against the union of runtime-fetched ids: a cited id is "grounded" if it was present in fetched evidence, else "ungrounded". The gate HARD-FAILS (`PHASE30_CITATION_UNVERIFIED`) when the grounded ratio is below `minGroundedCitationRatio` (agent-config default 0.34), writes `citation-verification.json` + `report-annotated.md` (surviving ungrounded cites annotated inline `[UNVERIFIED]`) to the workflow dir, and engages only when there is fetched ground truth. Citations are thus grounded in the source records actually retrieved at runtime; they are NOT independently re-resolved against a live external database.
  - **Retraction screen**: `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js` checks each cited DOI against Crossref `/works/{DOI}` (`relation.is-retracted-by` or `update-to` type `retraction`); any retracted citation HARD-STOPS the report (`PHASE30_CITATION_RETRACTED`). Fail-soft — a Crossref error yields no retractions and can never wrongly block a report. Wired into the gate via `researchRuntime`.
  - **Stop-reason / change-history ingestion**: `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js` is a local fetcher (not ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` stop-reason text plus protocol change-history (version count + most-amended modules); session-cached. Routed into role prefetch via a new local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`, tool_name `ctgov_stopped_trials`); each record is NCT-traced.
  - **DOI extraction fix**: `openclaw-bridge/core/citation-extractor.js` — the DOI regex now stops at non-DOI terminators and strips trailing sentence punctuation, which had deflated the grounded ratio and duplicated DOIs.
  - **New mission-bundle deliverables**: `deliverables/citation-integrity.md` (graded provenance ledger A/B/C/D from the grounded ratio; F + "BLOCKED" on any retraction; N/A if nothing cited — built by `openclaw-bridge/monetization/integrity-rating.js`, registered in `manifest.json`, sealed in `checksums.txt`) and `deliverables/graveyard-memo.md` (prior terminated/withdrawn/suspended programs in the indication, each NCT-traced, with the sponsor's stated stop reason or an explicit "(none stated by sponsor)" — never invented — protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link, plus a LOW/MODERATE/HIGH protocol amendment-risk band — built deterministically, NO LLM, by `openclaw-bridge/monetization/graveyard-memo.js`). On a gate-passing mission `executeMissionStep` re-fetches the indication's stopped trials (session-cache hit, no extra CT.gov call) and builds both memos fail-soft + bounded (an absent fetcher / empty indication / fetch error simply omits them and never blocks a passing report); `deliverable-packager` ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`.
- **Engine credit**: OpenClaw open-source agent framework — NOT a brand owned by Trevor Robey Intelligence Network Citations LLC. The retired homebrew `openclaw.ai` consumer "Personal AI assistant" is unrelated and should not be conflated with the engine framework.

## Open Questions / NEEDS CLARIFICATION

> **Note on marker semantics.** `[NEEDS CLARIFICATION]` = spec/plan ambiguity that blocks implementation; resolve before building. `[DEFERRED]` = explicit operator decision to leave open until a separate workstream; engineering may proceed against the documented current state. The three items below were resolved as DEFERRED via `/speckit-clarify` on 2026-05-13.

- **[DEFERRED]** Customer intake flow (intake form → SOW → dispatch). Not yet codified anywhere in this monorepo. Resolved 2026-05-13 via `/speckit-clarify`: operator deferred — this is a real open commercial question for a future workstream, not a /speckit-clarify-resolvable gap. **Current de-facto state**: founder-direct, ad-hoc (email + manual SOW + manual workflow dispatch via the Command Center plugin). **Engineering implication**: the dispatch surface (`scripts/run-workflow.js` + Command Center plugin :8799) MUST remain operator-triggered manually; do NOT add autonomous customer-facing intake automation until this decision is made (Constitution Principle IV — Manual-Only External Actions — covers this even without a codified intake flow).
- **[DEFERRED]** Coverage % target. Resolved 2026-05-13 via `/speckit-clarify`: operator deferred — no coverage-percentage policy yet; the gate remains "the 906-test baseline must stay green and new phases must extend, not regress" (SC-004). A coverage % target may be added in a future infra phase. **Engineering implication**: contributors should not introduce coverage tooling (nyc, c8, jest --coverage thresholds) as a build gate yet; the gate is binary (tests pass / fail) until the policy is set.
- **[DEFERRED]** Prometheus restoration plan after `:18789` OpenClaw Gateway retirement (2026-04-27). Resolved 2026-05-13 via `/speckit-clarify`: operator deferred — no decision yet on whether to add a new `/metrics` endpoint, deprecate the sidecar entirely, or accept it as dormant. **Current state**: the optional Docker Compose observability sidecar (Traefik :11480/:11481, Prometheus :9090, Grafana :3001) exists in the topology but has no scrape target. **Engineering implication**: do NOT remove the sidecar files yet (the deferral may resolve as "restore"); do NOT add a `/metrics` endpoint speculatively either (the deferral may resolve as "deprecate"). Treat the sidecar as documented-but-dormant infrastructure until the operator decides.

## Verification

1. **Phase-29 ToolUniverse policy intact** (SC-006): `cd /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents && bash scripts/verify-phase29-policy.sh | tail -1` — exits 0.
2. **906-test baseline** (SC-004): `cd /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents && npm test 2>&1 | tail -5` — full suite green; new phases must extend, not regress.
3. **Transport invariant** (SC-005, Constitution Principle I): `cd /Users/trevorrobey/TrevClaw-Obsidianodus && bash scripts/lint-transport-monorepo.sh --strict` — exits 0.
4. **ToolUniverse submodule pinned** (Constitution Tech Constraints): `cd /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents/vendor/tooluniverse && git rev-parse HEAD` returns SHA prefix `3833b0e` (v1.1.10, Apache-2.0, MIMS-Harvard / Zitnik Lab).
5. **LLM provider configuration intact** (FR-001): `node -e 'console.log(JSON.stringify(require("/Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents/config/llm-providers.json"), null, 2))' | grep -E '"id"|"enabled"'` — confirm four slots (`claude-code` primary enabled, `lm-studio` fallback enabled, `mock` CI enabled, `ollama` configured + disabled).
6. **Workflow dispatch end-to-end** (FR-002, FR-003, User Story 1 Acceptance Scenario 1): `node /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents/scripts/run-workflow.js --template general-research-pack --topic "<test asset name>"` — stdout emits `{"type":"workflow_created",...}` within 2 seconds and `{"type":"workflow_result",...}` at completion; six markdown notes land under `/Volumes/ExtraCurricular/My Digital Garden/OpenClaw/general-research-pack/{date}/`.
7. **Citation provenance gate** (FR-005, SC-002): inspect any workflow's `workspace/audit/{workflow_id}/citation-index.json` — every row carries a non-null `pmid` | `nct` | `chembl_cid` | `doi` field. `quality_auditor` agent transcript shows zero rejected rows passed through.
7a. **Report-level citation gate** (post-research citation-integrity layer, 2026-06-12): for a workflow that had fetched ground truth, inspect `citation-verification.json` in the workflow dir — every cited identifier is classified `grounded` (present in the runtime-fetched ids) or `ungrounded`; the grounded ratio is at or above `minGroundedCitationRatio` (agent-config default 0.34) or the step HARD-FAILED with `PHASE30_CITATION_UNVERIFIED`. Any cited DOI flagged retracted by the Crossref screen HARD-STOPS the report with `PHASE30_CITATION_RETRACTED` (fail-soft on Crossref errors). The bundle ships `deliverables/citation-integrity.md` (graded provenance ledger) and `deliverables/graveyard-memo.md` (NCT-traced prior stopped programs + amendment-risk band), both registered in `manifest.json` and sealed in `checksums.txt`. Note: this gate confirms citations are grounded in the source records actually retrieved at runtime + DOI retraction-screened — it does NOT independently re-resolve each citation against its live source database.
8. **Restricted-globals lint** (FR-008, Constitution Tech Constraints): `grep -rn "Date\.now()\|new Date()\|Math\.random()\|randomUUID()" /Users/trevorrobey/TrevClaw-Obsidianodus/trevor-robey-inc-agents/openclaw-bridge/ --include='*.js' --include='*.ts'` returns ZERO hits (all time/entropy access goes through injected providers).
9. **HTTPS-only at runtime** (FR-004, Principle I): `curl --cacert "$HOME/Library/Application Support/mkcert/rootCA.pem" https://127.0.0.1:8798/healthz` returns 200 while Obsidian is open; spawn `run-workflow.js` with an unreadable cert path and confirm it throws + refuses to run (no plaintext fallback path executed).
10. **NODE_EXTRA_CA_CERTS propagation** (FR-010): `node -e 'console.log(process.env.NODE_EXTRA_CA_CERTS)'` from inside a Command-Center-spawned workflow subprocess returns `/Users/trevorrobey/Library/Application Support/mkcert/rootCA.pem` (env inherited from Obsidian's plugin host).
