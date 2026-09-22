# trevor-robey-inc-agents — opencode instructions

> **opencode mirror (created 2026-08-09).** This is the opencode counterpart to the `CLAUDE.md`
> next to it: same rules, worded for opencode. Claude surfaces read `CLAUDE.md`; opencode reads
> this file. If both twins are in your context, treat them as ONE description of the same stack
> and let this file's wording govern opencode behavior. When you change a rule, update both.

> **Naming disambiguation (2026-04-27)**: This subdirectory was renamed from `OpenClaw-Research-Agents` to `trevor-robey-inc-agents` on 2026-04-27. The homebrew `openclaw` cask and `openclaw-cli` formula at `openclaw.ai` are unrelated consumer "Personal AI assistant" products (the prior launchd entry on :18789 was that product, removed 2026-04-27). **This is the canonical Trevor Robey, INC. citation-traced biomedical due diligence engine — powered by OpenClaw (open-source agent framework).** It runs as on-demand subprocess via `node scripts/run-workflow.js` — there is no persistent gateway service for the biomedical workflow.

> **Repo topology (2026-05-07)**: this is no longer a standalone repo. It lives as a top-level directory inside the **TrevClaw-Obsidianodus monorepo**, now **local-only** at `/Users/myhome/TrevClaw-Obsidianodus` (the private GitHub remote was **deleted 2026-05-26**; **no git remotes** — durable backup is a `git bundle --all` in `~/Documents/`). The previous standalone GitHub remote `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` is the rollback anchor (tag `pre-monorepo-consolidation-2026-05-07` at SHA `8e782a0`); the repo is archived. The `vendor/tooluniverse/` submodule is retained, pinned at SHA `3833b0e` (v1.1.10).

> **Legal entity (updated 2026-07-22)**: brand wordmark **"Trevor Robey, INC."** is the trade name of **Trevor Robey Intelligence Network Citations LLC**, California limited liability company (filed 2026-05-06; **CA SOS Entity No. B20260217250**; **APPROVED 2026-06-18**, confirmed by certified SOS copy Certificate No. 457169837). See [`REVENUE_PLAYBOOK.md` §0a](REVENUE_PLAYBOOK.md) for the legal-status update flow and dependent surfaces.

## What This Is

A governed, local-first biomedical research and dataset packaging system. Architectural and governance patterns from the OpenClaw project line are preserved as a clean-room derivative (`cleanRoomDerivative: true` flag at `openclaw-bridge/openclaw.json:5`; `openclaw-bridge/` directory name retained as upstream attribution). It prepares, packages, and tracks research work into monetizable assets (datasets, release bundles) under strict approval and safety controls.

**Critical boundary**: External publishing, uploads, marketplace submissions, customer delivery, login automation, and browser automation are all **manual-only**. This system is a preparation tool, not an autonomous publisher.

## Tech Stack

- **Runtime**: Node.js 22.13.1 (strictly enforced — `.npmrc` has `engine-strict=true`)
- **Modules**: CommonJS (`require()` / `module.exports`)
- **Validation**: Zod 3.24.1
- **Testing**: Node's native `--test` runner (no external framework)
- **CI**: GitHub Actions (`.github/workflows/ci-enforcement.yml`)
- **LLM**: Claude Code (primary, active — scout/analyst/synthesizer on claude-opus-4-8, default on claude-sonnet-4-6), Mock (testing). The engine is 100% Claude; local models were removed from the engine (restorable).
- **Biomedical Tools**: Harvard ToolUniverse via MCP (2,116 tools across 500 data files (vendor/tooluniverse v1.1.10), Phase 29 active)

## Quick Reference

```bash
# Setup
git submodule update --init --recursive
nvm use 22.13.1 && npm ci

# Run tests
npm test

# Full governance validation
npm run phase2:gates
npm run build:verify

# OPERATOR AUTHORIZATION (2026-07-29): any run on a non-mock provider requires --operator-approve
# with a live armed token. Arm it first — this is a YubiKey PIN + physical touch, 300s TTL, one-shot:
#   operator-approve-gate arm
# --confirm alone is NOT authorization to spend model capacity: it only satisfies the supervisor
# receipt. A `--provider mock` run stays ungated (it cannot spend anything), which is why the
# research-task example below needs no ceremony. Enforced in scripts/_operator-gate-cli.js.

# Run a research task (mock — ungated, safe to copy/paste)
node scripts/run-research-task.js --task "..." --type summarize --input workspace/research-input/sample/ --output workspace/research-output/ --provider mock --confirm

# Run a dataset mission — REFUSED as of 2026-07-29. This lane never threads operator approval into
# the dispatch context (repo-wide, only run-workflow.js does), so role-router refused it with
# PHASE15_HUMAN_APPROVAL_REQUIRED anyway. Use run-workflow.js below for mission work.
#   node scripts/run-dataset-mission.js ...   # -> exits 1 with an explanation

# Single-command workflow (Phase 30 — runs mission → dataset → offer → approve → export)
node scripts/run-workflow.js --template drug-discovery-full --inputs '{"compound_name":"aspirin","indication":"pain"}' --operator-approve --confirm
node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --operator-approve --confirm
node scripts/run-workflow.js --template general-research-pack --inputs '{"topic":"AI governance"}' --operator-approve --confirm

# Monetization flow (manual step-by-step)
node scripts/generate-offer.js --source mission-XXX --product-line research_packs --tier standard --targets datarade --confirm
node scripts/approve-release.js --offer-id offer-XXX --confirm
node scripts/export-release.js --offer-id offer-XXX --format zip --confirm

# Phase-specific verification
npm run phase19:verify   # Dataset foundation & release packaging
npm run phase20:verify   # Dataset commercialization
npm run phase21:verify   # Publisher adapters & release approval
npm run phase22:verify   # Submission evidence
npm run phase24:verify   # Operator sync & briefing
npm run phase25:verify   # Credential broker
npm run phase26:verify   # Bridge runtime
npm run phase28:verify   # Delivery evidence
npm run phase29:verify   # ToolUniverse MCP (active — 58/58 tests passing)
npm run phase30:verify   # Workflow engine (26/26 tests passing)
npm run phase31:verify   # Enterprise delivery layer (34/34 tests passing)
npm run phase33:verify   # Claude Code MCP provider (27/27 tests passing)
npm run monetization:verify  # All monetization phases
```

### Commercial Operations

```bash
# Generate a research pack for a client (arm the gate first: operator-approve-gate arm)
node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --operator-approve --confirm
node scripts/generate-offer.js --source mission-XXX --product-line research_packs --tier standard --targets datarade --confirm
node scripts/approve-release.js --offer-id offer-XXX --confirm
node scripts/export-release.js --offer-id offer-XXX --format zip --confirm

# Deploy landing page updates to Cloudflare Workers — LIVE WORKER = shy-grass-fccd
# (The staging FOLDER is named "openclaw-landing-deploy" — a legacy prefix — but its wrangler.jsonc
#  pins name="shy-grass-fccd", which is the worker that serves trevorobeyinc.com. Verified 2026-06-30
#  against the live wrangler.jsonc. A separate Cloudflare worker literally named "openclaw-landing-deploy",
#  if it exists, is NOT the live site — it is for something else.)
# 1. Copy the page source(s) into the served assets dir (assets.directory = ./public):
cp workspace/collateral/landing-page/index.html  /Users/myhome/openclaw-landing-deploy/public/
cp workspace/collateral/landing-page/intake.html /Users/myhome/openclaw-landing-deploy/public/   # -> /intake.html
# 2. Deploy via dashboard: https://dash.cloudflare.com/f3b10bacc7e94c72e445b078433aa1d4/workers/services/view/shy-grass-fccd/production
#    -> "New deployment" -> drag /Users/myhome/openclaw-landing-deploy/ -> Deploy
# 3. Or via Wrangler: cd /Users/myhome/openclaw-landing-deploy && npx --yes wrangler@latest deploy
#    (wrangler.jsonc pins name="shy-grass-fccd", assets.directory="./public")

# Distribute workflow output to all platforms
node scripts/distribute.js --workflow-id <id> --targets all --confirm
node scripts/distribute.js --workflow-id <id> --targets datarade,kaggle,training-data --confirm
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `openclaw-bridge/core/` | Research runtime, agent engine, governance, mission orchestration |
| `openclaw-bridge/bridge/` | HTTP bridge server, auth, MCP transport (`/mcp`) |
| `openclaw-bridge/dataset/` | Dataset builder, validator, deduper, scorer, provenance |
| `openclaw-bridge/monetization/` | Offer/release packaging, evidence ledgers |
| `openclaw-bridge/security/` | Runtime policy, RBAC, mutation control, credential broker |
| `openclaw-bridge/mcp/` | MCP service implementations |
| `workflows/` | Governance automation, observability, recovery, ingestion |
| `analytics/` | Portfolio intelligence (Phase 23) |
| `scripts/` | 100+ operator-facing CLI scripts |
| `workspace/` | All runtime state and artifacts (research I/O, datasets, releases, evidence) |
| `tests/` | Unit, integration, security, supply-chain tests |
| `openclaw-bridge/mcp/tooluniverse-mcp/` | Harvard ToolUniverse biomedical MCP adapter (Phase 29 — active, startup integrity hooked into init chain) |
| `openclaw-bridge/mcp/claude-code-mcp/` | Claude Code MCP schemas and utilities (Phase 33 — `cc-schema.js` only; process manager removed, replaced by `claude -p` stdin pipe in `llm-adapter.js`) |
| `logging/` | Logger module |
| `audit/evidence/` | Phase-specific audit evidence bundles (phases 24-29) |
| `vendor/tooluniverse/` | Harvard ToolUniverse submodule v1.1.10 (Phase 29 — active) |
| `workspace/research-input/biomedical/` | Biomedical seed documents (drug repurposing, PPI, pharmacovigilance, genomics) |
| `config/workflow-templates/` | Phase 30 workflow templates (6 templates: drug-discovery, pharmacovigilance, clinical-trial, target-validation, rare-disease, general) |
| `workspace/workflows/` | Workflow execution state (Phase 30 — created at runtime) |
| `docs/` | Phase-specific documentation (phases 1-28; Phase 29 docs retained for re-integration reference) |
| `security/` | Policy files, RBAC definitions |
| `workspace/collateral/` | Sales collateral, landing page, email sequences, prospect targeting, sample deliverables |
| `openclaw-bridge/distribution/` | Format adapters (Datarade, Kaggle, HuggingFace, AWS, Data & Sons) and training data generator |
| `workspace/collateral/platform-guides/` | Setup guides for 6 distribution platforms (Datarade, Kaggle, HuggingFace, AWS, Outlier, Mindrift) |
| `workspace/distribution/` | Distribution output (created at runtime by `scripts/distribute.js`) |

## Architecture

### Phase System (1-33 active)

Phases 1-33 are implemented. Phase 26 bridge consolidation is complete (execution router, principal context, fail-closed enforcement). Phase 29 (Harvard ToolUniverse biomedical MCP) is active — startup integrity hooked into MCP init chain (warn-on-failure, non-blocking), 58/58 tests passing, 2,116 biomedical tools (vendor/tooluniverse v1.1.10) accessible via MCP. Phase 30 (Workflow Engine) provides single-command end-to-end orchestration with 6 workflow templates, 6 specialized agent roles, and quality auditor. Phase 31 (Enterprise Delivery) adds Research REST API, scheduled workflows, and usage metering. Phase 33 (Claude Code MCP Provider) replaces LM Studio as the primary LLM provider — Claude Code runs via `claude -p` stdin pipe using the user's authenticated session (Claude Max Pro), producing biomedical output with real verifiable citations that pass quality gates.

**ToolUniverse Live Pre-Fetch**: When workflows run, the tool-prefetch module (`openclaw-bridge/core/tool-prefetch.js`) queries ToolUniverse SMCP for each agent role before prompt construction. Results are injected as synthetic input documents marked `tooluniverse://`. The LLM prompt includes a LIVE DATABASE CONTEXT instruction prioritizing live data over training knowledge. Role-to-tool mappings configured in `config/tool-prefetch-map.json`. Graceful degradation: if ToolUniverse is unavailable, workflows continue with parametric-only output. In addition to ToolUniverse, `createToolPrefetch` accepts a `localFetchers` seam for in-process fetchers that are not ToolUniverse tools (see Citation Integrity Layer below).

### Citation Integrity Layer

Citations are **grounded in the source records actually retrieved at runtime**, **DOI retraction-screened (Crossref)**, and — since the post-research integrity layer, validated 2026-07-10 — **independently re-resolved per identifier against the issuing public registry at delivery time** (PMID → NCBI E-utilities, NCT → ClinicalTrials.gov v2, DOI → Crossref; each id stamped VERIFIED / UNRESOLVED / UNCHECKED in the reproducibility manifest; any UNRESOLVED id blocks delivery). Re-resolution confirms that an identifier resolves to a source record, not that the source's conclusions are correct (ground truth: `SYSTEM-REALITY.md` → "GAP CLOSED"). The layer has these components:

- **Citation gate** (`openclaw-bridge/core/citation-gate.js`, wired into `agent-engine.js` and `workflow-engine.js`): `agent-engine` persists `fetched_citation_ids` (the identifiers actually retrieved at runtime by tool-prefetch) plus a per-task `citation_verification` block into research-output metadata, and `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI — say `[no verifiable citation found]` instead). `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`) that cross-checks every identifier cited in the assembled report against the union of runtime-fetched ids: a cited id is "grounded" if it was present in fetched evidence, else "ungrounded" (likely model-introduced). Per the never-hallucinate doctrine (operator ruling 2026-07-10) it returns a **three-state verdict**, not a silent pass: **PASS** (grounded ratio ≥ `minGroundedCitationRatio`, a required value in `config/agent-config.json` = **0.75**); **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`); **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — zero runtime evidence fetched, an honest-zero that now BLOCKS instead of auto-passing); **NO_CITATIONS** (`PHASE30_CITATION_NONE`). Only PASS ships. The floor is read fail-closed (missing/invalid → strict `0.75` + warning). It writes `citation-verification.json` + `report-annotated.md` to the workflow dir, annotating surviving ungrounded cites inline `[UNVERIFIED]`.
- **Retraction screen — Crossref + PubMed cross-checked (widened + escalated + notice-disambiguated 2026-07-10).** Cited **DOIs** → Crossref (`crossref-retraction.js`); cited **PMIDs** → PubMed `esummary` (`pubmed-retraction.js`, pubtype **exactly** `Retracted Publication`); and every cited **DOI is reverse-resolved DOI→PMID** (`esearch <doi>[AID]`) and cross-checked against PubMed. Per-DOI rule: `retracted = pubmedRetracted OR (crossrefFlagged AND NOT pubmedNotice)`. Any retracted paper hard-stops (`PHASE30_CITATION_RETRACTED`). All legs fail-soft.
  - **Do not collapse to DOI-only or drop a leg.** Verified live 2026-07-10: (1) Crossref returns `relation:{}`/no `update-to` for `10.1016/S0140-6736(97)11096-0` (Wakefield 1998) while PubMed marks it `Retracted Publication`. (2) Crossref's `update-to:[retraction]` is AMBIGUOUS — it flags both the Surgisphere original AND the Wakefield **retraction notice**; PubMed pubtype disambiguates, and a Crossref flag is overridden ONLY when PubMed positively says `Retraction Notice`. (3) PMID-only citations (GeneReviews, PMID 20301295) never reach Crossref.
  - **Exact-match, never a regex.** Both `Retracted Publication` and `Retraction Notice` matched exactly; citing a notice is legitimate and must not hard-fail a report.
  - **Parenthesized DOIs.** The extractor captures balanced internal parens (Elsevier/Lancet SICI DOIs) and trims only unbalanced prose-wrapping `)`.
  - **Fail-closed on retractions, fail-soft on coverage.** Under a PubMed outage a Crossref flag stands (block rather than risk shipping a retraction); `checked:false` signals incomplete coverage but never blocks delivery on its own.
  - **Residual gap:** a retracted paper cited by **DOI only AND not indexed in PubMed**, with no Crossref `update-to`, is still missed. Would need the Retraction Watch bulk dataset.
- **DOI extraction** (`openclaw-bridge/core/citation-extractor.js`): the DOI regex stops at non-DOI terminators and strips trailing sentence punctuation after capture (a DOI never ends in `.`/`,`/`;`/`:`).

**Stop-reason archaeology + change-history corpus**: `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js` is a local fetcher (not ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history. It is routed into role prefetch through the `localFetchers` seam under tool name `ctgov_stopped_trials`; each record is NCT-traced (grounded cite).

**Integrity-driven deliverables** (shipped in every mission bundle, registered in `manifest.json` and sealed in `checksums.txt`):
- `deliverables/citation-integrity.md` — graded provenance ledger (grade A/B/C/D from the grounded ratio; F + "BLOCKED" if any retraction; N/A if nothing cited). The report's audit-trail spine.
- `deliverables/graveyard-memo.md` — memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced, with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, a resolvable `clinicaltrials.gov/study/<NCT>` link, and a LOW/MODERATE/HIGH amendment-risk band. Both are rendered deterministically from the fetched records (no LLM), so every claim is verifiable.

**Scholar Gateway (Semantic Scholar) — first-class literature lane**: The `SemanticScholar_search_papers` tool from ToolUniverse is the canonical scholar-gateway connector, wired into the prefetch map for **scout**, **analyst**, **literature_reviewer**, and **competitive_intel_analyst** roles. When adding new literature-aware roles, add Semantic Scholar to the prefetch entry by default.

**Open Targets Platform (GraphQL) — target/disease evidence lane (2026-07-24)**: `openclaw-bridge/mcp/open-targets-graphql/open-targets-graphql.js`. Two local fetchers routed through the `localFetchers` seam: `opentargets_target_intel` (bound to `molecular_profiler`; needs `target_gene`) and `opentargets_disease_intel` (bound to `scout`, `molecular_profiler`, `competitive_intel_analyst`). **Both return records carrying `chemblId` / `pmid`**, so their evidence flows into `fetched_citation_ids` and raises the grounded-citation ratio. Fail-soft like every prefetch source.
- **Schema gotchas, verified by live introspection**: the drug field is **`drugAndClinicalCandidates`** on BOTH `Target` and `Disease` (`knownDrugs` exists on neither), and it takes **no arguments**. Literature is **`literatureOcurrences`** (the API's own one-`c` spelling; do not "fix" it). `Disease.associatedTargets` uses `page:{index,size}`; `ClinicalDiseaseListItem` has no `id` field.
- Disease/target ids (`ENSG…`, `MONDO…`, `EFO…`) are **not** citation identifiers and are carried as context only, never dressed up as cites.
- `opentargets_target_intel` deliberately does **not** fall back to `compound_name`.

**Connector lanes (2026-07-24)**: every registry entry carries a `lane` — `research` (the ONLY lane permitted into `tool-prefetch-map.json`), `vault`, `business`, `security`, `infra`. Non-research connectors stay explicitly OUT of the engine: injecting mail/marketing/security payloads into a citation-graded pipeline would dilute the grounded-citation ratio and inflate a token budget already at ~300K/template.

**AdisInsight — DECLINED, do not attempt to connect**: no MCP server exists, Springer Nature subscription-only with no public API. Its failed-trial value is already covered by `ctgov-supplemental` → `deliverables/graveyard-memo.md`. Tombstoned in the registry as `declined-no-public-api`.

**Connector Registry — Authoritative Map**: [`config/connector-registry.json`](config/connector-registry.json) (schema `connector-registry-v1`) is the single source of truth for every MCP connector used by this engine. Run [`npm run audit:connectors`](scripts/audit-connector-coverage.js) to cross-check the registry against `tool-prefetch-map.json` and report drift. **Rule**: every new MCP connector authenticated at the Claude-host level must be added to the registry within 7 days of authentication. When the registry and prefetch map diverge, the registry is the source of truth.

**Multi-Platform Distribution**: `scripts/distribute.js` transforms workflow output into platform-specific formats for 5 data marketplaces (Datarade, Kaggle, HuggingFace, AWS Data Exchange, Data & Sons) plus AI training data for Outlier.ai and Mindrift.ai. Distribution is local-only — files are prepared for manual upload.

Key phases for daily work: **14** supervisor-gated research execution · **18** mission orchestration · **19-20** dataset foundation & commercialization · **21-22** publisher adapters & submission evidence · **23** portfolio intelligence · **24** operator sync · **25** credential broker · **26** bridge runtime (consolidated) · **28** direct-delivery evidence · **29** ToolUniverse MCP · **30** workflow engine · **31** enterprise delivery · **33** Claude Code as primary LLM provider.

### Design Principles

- **Fail-closed**: Unknown states default to `blocked` or `review_required`
- **Deterministic naming**: Stable IDs prefixed `mission-`, `dataset-`, `offer-`
- **Append-only ledgers**: Phase 22/28 evidence uses chain-hashing
- **Provenance tracking**: Every produced row includes source metadata
- **Immutable config after boot**
- **Fail-closed execution**: Missing router or missing principal context results in job denied
- **Fail-closed citations**: A report whose grounded-citation ratio is below `minGroundedCitationRatio` refuses to ship (`PHASE30_CITATION_UNVERIFIED`); a report citing any retracted DOI hard-stops (`PHASE30_CITATION_RETRACTED`). The retraction screen is fail-soft (a Crossref error never wrongly blocks). See Citation Integrity Layer.
- **Enterprise brand consistency**: All buyer-facing materials use Bloomberg Terminal dark aesthetic (#0a0a0f bg, #4a90d9 accent), verified-citation messaging, "Trevor Robey, INC." wordmark (INC = Intelligence Network Citations) over the Trevor Robey Intelligence Network Citations LLC legal entity
- **Offering ladder (2026-04-30)**: Investor Pre-Mortem primary ($9,950 / $14,950 / $19,950), Failed Trial Archaeology flanking ($14,950), tactical SKUs ($4,950 Conference Synthesis Brief, $4,950 Trial Design Benchmark Pack, $9,950–$24,950 Cross-Silo Connector Report, $2,500 Plain-Language Patient Brief), Pharmacovigilance Pack tactical demoted ($2,500–$4,950). Tactical SKUs sold via landing-page mailto and manual ZIP; primary SKUs via direct outbound and discovery calls. Existing marketplace listings preserved at tactical-tier prices.

### LLM Providers

| Provider | Config Key | Status | Endpoint |
|----------|-----------|--------|----------|
| Claude Code | `claude-code` | **Active** (default) | `claude -p` stdin pipe (claude-sonnet-4-6) |
| LM Studio | — | **Decommissioned (2026-07-16)** — removed from the engine | — |
| Mock | `mock` | Active (CI/testing) | N/A |
| Anthropic API | `anthropic` | Available (disabled) | `https://api.anthropic.com/v1/messages` |

Default provider is set in `config/agent-config.json` (`defaultProvider`). Provider configs in `config/llm-providers.json`. Phase 18 mission spawning is **enabled** (`config/agent-spawner.json`). Per-template provider routing via `provider_preference` in workflow templates (Phase 33).

### Code Patterns

**Restricted globals**: `Date.now()`, `new Date()`, `Math.random()`, and `randomUUID()` are forbidden in `openclaw-bridge/`. Use `timeProvider` (`openclaw-bridge/core/time-provider.js`) and `entropyProvider` (`openclaw-bridge/core/entropy-provider.js`) instead. Enforced by `scripts/lint-restricted-globals.sh` (runs in CI and `npm run phase2:gates`).

### Token Efficiency Contingency Plan

> **Status: CONTINGENCY ONLY** — The current setup (all 3 roles through Claude Code) is correct and should remain until rate limiting is actually detected. Do not implement any phase preemptively.

**Problem detection**: `claude -p` HTTP 429 errors; hangs/throttling; workflow runs that previously took 5-10 minutes now taking 20-30; operator reports hitting the Claude Max ceiling mid-month; 6+ templates back-to-back in a day. Diagnostic: interaction-log `duration_ms` vs baseline (scout ~60-120s, analyst ~120-300s, synthesizer ~120-300s per call); 3x+ baseline ⇒ throttling likely.

**Escalation phases** (implement in order 1 → 3 → 2 → 4):
1. **Route scout to a local model (Ollama, restorable)** (~33% Claude token savings): restore a `helper` block, set the `scout` role's `fallback` to `local`, `providers.local.enabled=true` (Ollama at :11435). Tool-prefetch still runs before the scout prompt.
2. **Context compression** (~20% analyst savings): `summarizeForNextAgent()` in `agent-engine.js` — keep paragraphs with database identifiers + executive summary, drop boilerplate, target 30-40% of scout output.
3. **Response caching**: `workspace/cache/llm-responses/`, key `SHA256(prompt_text + provider + model)`, TTL 24h.
4. **Batch scheduling**: stagger the 6 templates across the month via `config/scheduled-workflows.json`.

**Monitoring**: quality confidence >= 1.0, quality gate green on all biomedical templates, scout output still substantive (Phase 1), meaningful cache hit rate (Phase 3). If scout quality drops, upgrade the local model size rather than routing back to Claude.

**Token baseline** (update if prompt structure changes): Pharmacovigilance ~300K · Drug discovery ~350K · Target validation ~280K · Clinical trial ~320K · Rare disease ~290K · General research ~260K · full 6-template cycle ~1.8M. Typical monthly budget: 4-6 full cycles = 7-11M tokens.

## Git Conventions

- Phase work on `codex/phaseNN-slug` branches, merged to main after CI passes
- Required CI status checks: `policy-and-tests`, `deterministic-build-verify`
- Commit messages should describe the phase and change type

## Source of Truth Order

1. Current repo code and git state (primary)
2. Current repo docs and scripts
3. Vault notes (historical context only)
4. `workspace/MEMORY.md`, `workspace/HEARTBEAT.md` are Phase 1-era artifacts — **no longer tracked**

## Secret Scanning

```bash
npm run secrets:verify   # Regex-based, no external dependencies
```

GitHub's built-in secret scanning provides push protection for provider-specific patterns (API keys, tokens, etc.).

## Marketing and Brand Infrastructure

### Website

- **Live URL**: https://trevorobeyinc.com (also https://www.trevorobeyinc.com)
- **Source**: `workspace/collateral/landing-page/index.html` (self-contained, zero dependencies)
- **Hosting**: Cloudflare Workers static-assets. **Live worker = `shy-grass-fccd`** (Cloudflare account `f3b10bacc7e94c72e445b078433aa1d4`), deployed from the local staging folder `/Users/myhome/openclaw-landing-deploy/` (served assets live in its `public/` subdir). The folder's legacy name is NOT the worker name — its `wrangler.jsonc` pins `name = "shy-grass-fccd"` (verified 2026-06-30). Domain `trevorobeyinc.com` is on Cloudflare Registrar; custom domain attached via Worker Settings → Domains & Routes.
- **Old URL (retired)**: https://trevorrobeyinc.github.io — superseded by trevorobeyinc.com on 2026-04-26.
- **Deployment**: Copy the page source(s) from `workspace/collateral/landing-page/` into `/Users/myhome/openclaw-landing-deploy/public/`, then drag the folder into the **`shy-grass-fccd`** project's "New deployment" UI, or `cd /Users/myhome/openclaw-landing-deploy && npx --yes wrangler@latest deploy`. Site updates within ~30 seconds.

### Brand Identity

- **Legal entity**: Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed at CA SOS 2026-05-06; **Entity No. B20260217250**; approved 2026-06-18)
- **Wordmark**: "Trevor Robey, INC." where INC = Intelligence Network Citations
- **Disclosure used in customer-facing materials**: *"Trevor Robey, INC. is the wordmark of Trevor Robey Intelligence Network Citations LLC, a California limited liability company. INC = Intelligence Network Citations."*
- **Product**: Trevor Robey Inc Agents (biomedical research and dataset packaging code stack — repo slug `trevor-robey-inc-agents`)
- **Contact**: trevor@trevorobeyinc.com
- **Aesthetic**: Dark-mode (#0a0a0f bg), monospace data typography (SF Mono/Fira Code), sans-serif body (Inter), blue accent (#4a90d9). No gradients, no rounded corners on data elements, sharp/rectangular/dense.
- **Voice**: Technical, citation-dense, zero marketing hyperbole. Lead with verifiability, not AI.

### Collateral Directory

| Directory | Contents |
|-----------|----------|
| `workspace/collateral/landing-page/` | Self-contained HTML landing page (source of truth) |
| `07-outbound/` | Cold email sequences (4 personas), LinkedIn openers, prospect targeting guide, 9-touch cadence, response triage, SDR contractor brief. |
| `workspace/collateral/samples/` | Redacted sample deliverable, 2-page email teaser |
| `workspace/collateral/catalog/` | Product catalog with all product lines |
| `workspace/collateral/one-pagers/` | One-page product summaries |
| `workspace/collateral/data-dictionaries/` | Target validation matrix schema |

### Offering Ladder (2026-04-30)

| Tier | SKU | Price | Buyer | Delivery |
|------|-----|-------|-------|----------|
| **Primary** | Investor Pre-Mortem | $9,950 / $14,950 / $19,950 (+ KOL primary) | Biotech investors, pharma BD/licensing | Manual ZIP + Snowflake / AWS / BigQuery handoff for enterprise |
| **Flanking primary** | Failed Trial Archaeology | $14,950 | Pharma R&D CI, biotech VC diligence | Manual ZIP via secure email |
| Tactical | Conference Synthesis Brief | $4,950 / conference | Pharma R&D, investors, BD | HTML executive summary + filterable table |
| Tactical | Trial Design Benchmark Pack | $4,950 | Biotech R&D, pharma CI | Manual ZIP — `design-benchmark.md` comparison matrix + `design-benchmark.csv` |
| Tactical | Cross-Silo Connector Report | $9,950 – $24,950 | Pharma R&D, biotech partnerships | Narrative + interactive knowledge-graph export |
| Tactical | Plain-Language Patient Brief | $2,500 | PAGs, trial sponsors | Word/PDF EMWA-aligned template |
| Tactical (demoted) | Pharmacovigilance Pack | $2,500 – $4,950 | Mid-market pharma safety | Existing Datarade / HuggingFace listings preserved |
