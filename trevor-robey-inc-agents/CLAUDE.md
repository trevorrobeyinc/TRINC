# trevor-robey-inc-agents

> **Naming disambiguation (2026-04-27)**: This subdirectory was renamed from `OpenClaw-Research-Agents` to `trevor-robey-inc-agents` on 2026-04-27. The homebrew `openclaw` cask and `openclaw-cli` formula at `openclaw.ai` are unrelated consumer "Personal AI assistant" products (the prior launchd entry on :18789 was that product, removed 2026-04-27). **This is the canonical Trevor Robey, INC. citation-traced biomedical due diligence engine — powered by OpenClaw (open-source agent framework).** It runs as on-demand subprocess via `node scripts/run-workflow.js` — there is no persistent gateway service for the biomedical workflow.

> **Repo topology (2026-05-07)**: this is no longer a standalone repo. It lives as a top-level directory inside the **TrevClaw-Obsidianodus monorepo** at [`https://github.com/trevoralexanderrobey/TrevClaw-Obsidianodus`](https://github.com/trevoralexanderrobey/TrevClaw-Obsidianodus) (private). The previous standalone GitHub remote `https://github.com/trevoralexanderrobey/trevor-robey-inc-agents` is the rollback anchor (tag `pre-monorepo-consolidation-2026-05-07` at SHA `8e782a0`); the repo is being archived. The `vendor/tooluniverse/` submodule is retained, pinned at SHA `3833b0e` (v1.1.10).

> **Legal entity (2026-05-07)**: brand wordmark **"Trevor Robey, INC."** is the trade name of **Trevor Robey Intelligence Network Citations LLC**, California limited liability company (filed 2026-05-06; bizfileOnline receipt B20260217250; CA SOS approval pending). See [`REVENUE_PLAYBOOK.md` §0a](REVENUE_PLAYBOOK.md) for the legal-status update flow and dependent surfaces.

## What This Is

A governed, local-first biomedical research and dataset packaging system. Architectural and governance patterns from the OpenClaw project line are preserved as a clean-room derivative (`cleanRoomDerivative: true` flag at `openclaw-bridge/openclaw.json:5`; `openclaw-bridge/` directory name retained as upstream attribution). It prepares, packages, and tracks research work into monetizable assets (datasets, release bundles) under strict approval and safety controls.

**Critical boundary**: External publishing, uploads, marketplace submissions, customer delivery, login automation, and browser automation are all **manual-only**. This system is a preparation tool, not an autonomous publisher.

## Tech Stack

- **Runtime**: Node.js 22.13.1 (strictly enforced — `.npmrc` has `engine-strict=true`)
- **Modules**: CommonJS (`require()` / `module.exports`)
- **Validation**: Zod 3.24.1
- **Testing**: Node's native `--test` runner (no external framework)
- **CI**: GitHub Actions (`.github/workflows/ci-enforcement.yml`)
- **LLM**: Claude Code (primary, active), LM Studio (local, fallback), Mock (testing)
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

# Run a research task
node scripts/run-research-task.js --task "..." --type summarize --input workspace/research-input/sample/ --output workspace/research-output/ --provider mock --confirm

# Run a dataset mission
node scripts/run-dataset-mission.js --task "..." --dataset-type retrieval_qa --input workspace/research-input/sample/ --confirm

# Single-command workflow (Phase 30 — runs mission → dataset → offer → approve → export)
node scripts/run-workflow.js --template drug-discovery-full --inputs '{"compound_name":"aspirin","indication":"pain"}' --confirm
node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --confirm
node scripts/run-workflow.js --template general-research-pack --inputs '{"topic":"AI governance"}' --confirm

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
# Generate a research pack for a client
node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --confirm
node scripts/generate-offer.js --source mission-XXX --product-line research_packs --tier standard --targets datarade --confirm
node scripts/approve-release.js --offer-id offer-XXX --confirm
node scripts/export-release.js --offer-id offer-XXX --format zip --confirm

# Deploy landing page updates to Cloudflare Workers (project: openclaw-landing-deploy)
# 1. Re-stage clean deploy folder
rm -rf /Users/trevorrobey/openclaw-landing-deploy && mkdir -p /Users/trevorrobey/openclaw-landing-deploy
cp workspace/collateral/landing-page/index.html /Users/trevorrobey/openclaw-landing-deploy/
# 2. Deploy via dashboard: https://dash.cloudflare.com/f3b10bacc7e94c72e445b078433aa1d4/workers/services/view/openclaw-landing-deploy/production
#    -> "New deployment" -> drag /Users/trevorrobey/openclaw-landing-deploy/ -> Deploy
# 3. Or via Wrangler (interactive): cd /Users/trevorrobey/openclaw-landing-deploy && npx --yes wrangler@latest deploy
#    (wrangler.jsonc already in folder pins name=openclaw-landing-deploy, assets=.)

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

**ToolUniverse Live Pre-Fetch**: When workflows run, the tool-prefetch module (`openclaw-bridge/core/tool-prefetch.js`) queries ToolUniverse SMCP for each agent role before prompt construction. Results are injected as synthetic input documents marked `tooluniverse://`. The LLM prompt includes a LIVE DATABASE CONTEXT instruction prioritizing live data over training knowledge. Role-to-tool mappings configured in `config/tool-prefetch-map.json`. Graceful degradation: if ToolUniverse is unavailable, workflows continue with parametric-only output.

**Scholar Gateway (Semantic Scholar) — first-class literature lane**: The `SemanticScholar_search_papers` tool from ToolUniverse is the canonical scholar-gateway connector. It is wired into the prefetch map for **scout**, **analyst**, **literature_reviewer**, and **competitive_intel_analyst** roles — every role that consumes peer-reviewed literature pulls Semantic Scholar abstracts and citation context alongside PubMed and EuropePMC, not as a fallback. Complementary scholar paths exist (`openclaw-bridge/mcp/semantic-scholar-mcp.js` in-process JS, `openclaw-bridge/mcp/arxiv-mcp.js`, plus 7 vendored ToolUniverse `SemanticScholar_*` tools at `vendor/tooluniverse/src/tooluniverse/tools/`); when adding new literature-aware roles, add Semantic Scholar to the prefetch entry by default rather than treating it as optional. Live-MCP smoke tests at `audit/evidence/mcp-live/semantic-scholar-*.json`.

**Multi-Platform Distribution**: `scripts/distribute.js` transforms workflow output into platform-specific formats for 5 data marketplaces (Datarade, Kaggle, HuggingFace, AWS Data Exchange, Data & Sons) plus AI training data for Outlier.ai and Mindrift.ai. Format adapters in `openclaw-bridge/distribution/`. Training data generator produces Q&A pairs, evaluation rubrics, and factuality assessments as JSONL. Distribution is local-only — files are prepared for manual upload.

Key phases for daily work:
- **14**: Supervisor-gated research execution
- **18**: Mission orchestration & spawning
- **19-20**: Dataset foundation & commercialization
- **21-22**: Publisher adapters & submission evidence
- **23**: Portfolio intelligence
- **24**: Operator sync & briefing
- **25**: Credential broker
- **26**: Bridge runtime and execution-router consolidation (fully consolidated)
- **28**: Direct-delivery evidence
- **29**: Harvard ToolUniverse biomedical MCP integration (active — 2,116 tools across 500 data files (vendor/tooluniverse v1.1.10), 6 mission templates, 5 dataset schemas)
- **30**: Workflow engine — single-command orchestration (`run-workflow.js`), 6 workflow templates, 6 specialized agent roles (literature_reviewer, safety_signal_detector, molecular_profiler, competitive_intel_analyst, quality_auditor, report_generator), quality auditor self-verification
- **31**: Enterprise delivery layer — Research REST API (`/api/v1/research`), scheduled workflows, usage metering, `api_client` bridge principal
- **33**: Claude Code as primary LLM provider — `claude -p` stdin pipe with JSON output, fallback chain (claude-code → lm-studio), per-template provider routing via `provider_preference`, citation density quality formula

### Design Principles

- **Fail-closed**: Unknown states default to `blocked` or `review_required`
- **Deterministic naming**: Stable IDs prefixed `mission-`, `dataset-`, `offer-`
- **Append-only ledgers**: Phase 22/28 evidence uses chain-hashing
- **Provenance tracking**: Every produced row includes source metadata
- **Immutable config after boot**
- **Fail-closed execution**: Missing router or missing principal context results in job denied
- **Enterprise brand consistency**: All buyer-facing materials use Bloomberg Terminal dark aesthetic (#0a0a0f bg, #4a90d9 accent), verified-citation messaging, "Trevor Robey, INC." wordmark (INC = Intelligence Network Citations) over the Trevor Robey Intelligence Network Citations LLC legal entity
- **Offering ladder (2026-04-30)**: Investor Pre-Mortem primary ($9,950 / $14,950 / $19,950), Failed Trial Archaeology flanking ($14,950), tactical SKUs ($4,950 Conference Synthesis Brief, $4,950 Trial Design Benchmark Pack, $9,950–$24,950 Cross-Silo Connector Report, $2,500 Plain-Language Patient Brief), Pharmacovigilance Pack tactical demoted ($2,500–$4,950). Tactical SKUs sold via landing-page mailto and manual ZIP; primary SKUs via direct outbound and discovery calls. Existing Datarade / HuggingFace / AWS marketplace listings preserved at tactical-tier prices.

### LLM Providers

| Provider | Config Key | Status | Endpoint |
|----------|-----------|--------|----------|
| Claude Code | `claude-code` | **Active** (default) | `claude -p` stdin pipe (claude-sonnet-4-6) |
| LM Studio | `lm-studio` | Active (fallback) | `http://localhost:1234/v1/chat/completions` |
| Mock | `mock` | Active (CI/testing) | N/A |
| Anthropic API | `anthropic` | Available (disabled) | `https://api.anthropic.com/v1/messages` |

Default provider is set in `config/agent-config.json` (`defaultProvider`). Provider configs in `config/llm-providers.json`. Phase 18 mission spawning is **enabled** (`config/agent-spawner.json`). Per-template provider routing via `provider_preference` in workflow templates (Phase 33).

### Code Patterns

**Restricted globals**: `Date.now()`, `new Date()`, `Math.random()`, and `randomUUID()` are forbidden in `openclaw-bridge/`. Use `timeProvider` (`openclaw-bridge/core/time-provider.js`) and `entropyProvider` (`openclaw-bridge/core/entropy-provider.js`) instead. Enforced by `scripts/lint-restricted-globals.sh` (runs in CI and `npm run phase2:gates`).

### Token Efficiency Contingency Plan

> **Status: CONTINGENCY ONLY** — The current setup (all 3 roles through Claude Code) is correct and should remain until rate limiting is actually detected. Do not implement any phase preemptively.

#### Problem Detection

Recognize that Claude Max Pro token burn is becoming a problem when:
- `claude -p` commands return HTTP 429 (rate limit) errors
- `claude -p` commands hang or take significantly longer than usual (throttling)
- Workflow runs that previously completed in 5-10 minutes start taking 20-30 minutes
- Trevor reports hitting the Claude Max Pro usage ceiling mid-month
- Multiple sequential workflow runs in a single day (6+ templates back-to-back)

**Diagnostic**: Check the interaction log for increased `duration_ms` values across sequential runs. Compare against baseline: scout ~60-120s, analyst ~120-300s, synthesizer ~120-300s per call. If durations are 3x+ baseline, throttling is likely active.

#### Solution: Hybrid Provider Routing (4 escalation phases)

**Phase 1 — Route scout to LM Studio** (saves ~33% of Claude tokens):
- The scout role performs tool discovery and initial data collection. It does NOT require Claude-level reasoning — it reads seed documents and ToolUniverse pre-fetch results, then produces a structured summary
- Change: In `config/agent-config.json` or via the role handler in `scripts/_research-runtime.js`, override the provider for the `scout` role to use `lm-studio` instead of `claude-code`
- The tool-prefetch module (`openclaw-bridge/core/tool-prefetch.js`) still runs before the scout prompt (it's independent of the LLM provider), so the scout still gets live ToolUniverse data
- Only the `analyst` and `synthesizer` roles continue using Claude Code
- Expected savings: ~33% reduction in Claude token usage per workflow

**Phase 2 — Context compression** (implement if Phase 1 insufficient):
- After the scout completes, summarize its output to the top 20% most citation-dense paragraphs before passing to the analyst
- Add a `summarizeForNextAgent()` function in `openclaw-bridge/core/agent-engine.js` that:
  - Extracts paragraphs containing database identifiers (PMID, CID, NCT, etc.)
  - Preserves the executive summary and key findings
  - Drops boilerplate, methodology descriptions, and repetitive content
  - Targets 30-40% of original scout output length
- Expected additional savings: ~20% reduction in analyst token usage

**Phase 3 — Response caching** (implement if Phases 1-2 insufficient):
- Cache Claude's responses keyed on a hash of the prompt content
- If the same template is run with the same inputs within 24 hours, return the cached response instead of calling Claude again
- Cache location: `workspace/cache/llm-responses/`
- Cache key: `SHA256(prompt_text + provider + model)`
- TTL: 24 hours (configurable in `config/llm-providers.json`)
- This prevents token waste when re-running the same research (e.g., regenerating distribution assets from unchanged research)

**Phase 4 — Batch scheduling** (implement for sustained high volume):
- Instead of running 6 templates sequentially in one session, spread them across the month using the workflow scheduler
- Configure `config/scheduled-workflows.json` with staggered schedules:
  - Drug discovery: 1st and 15th of each month
  - Pharmacovigilance: 3rd and 17th
  - Clinical trial: 5th and 19th
  - Target validation: 7th and 21st
  - Rare disease: 9th and 23rd
  - General research: 11th and 25th
- This distributes token usage evenly across the billing cycle

#### Implementation Priority

When rate limiting is detected, implement in this order:
1. **Phase 1** (scout to LM Studio) — 30 minutes, biggest immediate impact
2. **Phase 3** (response caching) — 1-2 hours, prevents duplicate work
3. **Phase 2** (context compression) — 1-2 hours, reduces per-call cost
4. **Phase 4** (batch scheduling) — 30 minutes, distributes load over time

Phase 1 alone should be sufficient for normal usage patterns. Only escalate to Phases 2-4 if running high-volume generation cycles (e.g., regenerating all 6 templates multiple times per week).

#### Monitoring

After implementing any phase, verify:
- Workflow still completes with quality confidence >= 1.0
- Quality gate still passes on all biomedical templates
- Scout output from LM Studio is still substantive enough for the analyst to synthesize (if Phase 1 active)
- Cache hit rate is meaningful (if Phase 3 active)

If scout quality drops below acceptable levels after routing to LM Studio, consider upgrading the LM Studio model to a larger parameter count (e.g., 14B+ instruction-tuned model with biomedical knowledge) rather than routing back to Claude Code.

#### Current Token Usage Baseline

Approximate baselines from validated workflow runs (update if prompt structure changes):

| Template | Total Tokens | Scout | Analyst | Synthesizer |
|----------|-------------|-------|---------|-------------|
| Pharmacovigilance | ~300K | ~80K | ~120K | ~100K |
| Drug discovery | ~350K | ~90K | ~140K | ~120K |
| Target validation | ~280K | ~70K | ~110K | ~100K |
| Clinical trial | ~320K | ~80K | ~130K | ~110K |
| Rare disease | ~290K | ~75K | ~115K | ~100K |
| General research | ~260K | ~65K | ~105K | ~90K |
| **Full 6-template cycle** | **~1.8M** | | | |

Typical monthly budget at current pace: 4-6 full cycles = 7-11M tokens. Check actual token counts in the interaction log (`token_count` field) for precise measurements.

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
- **Hosting**: Cloudflare Workers static-assets, project name `openclaw-landing-deploy` under Cloudflare account `f3b10bacc7e94c72e445b078433aa1d4`. Domain `trevorobeyinc.com` is on Cloudflare Registrar; custom domain attached via Worker Settings → Domains & Routes (cookie-auth Universal SSL, no API key, no GitHub). Verified serving production traffic 2026-05-06.
- **Old URL (retired)**: https://trevorrobeyinc.github.io — superseded by trevorobeyinc.com on 2026-04-26. The GitHub Pages repo can be archived.
- **Deployment**: Re-stage `/Users/trevorrobey/openclaw-landing-deploy/` from `workspace/collateral/landing-page/`, drag into Cloudflare dashboard's "New deployment" UI, or `cd /Users/trevorrobey/openclaw-landing-deploy && npx --yes wrangler@latest deploy` (the wrangler.jsonc in that folder pins `name = "openclaw-landing-deploy"` and `assets.directory = "."`). Site updates within ~30 seconds. The earlier reference to a `shy-grass-fccd` worker was stale — that name does not serve trevorobeyinc.com.
- **Workflow**: Edit source HTML in this repo, copy to Pages repo, push. Site updates within ~60 seconds.

### Brand Identity

- **Legal entity**: Trevor Robey Intelligence Network Citations LLC, a California limited liability company (filed at CA SOS 2026-05-06; receipt B20260217250)
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
| `workspace/collateral/outbound/` | Cold email sequences (4 personas), LinkedIn templates, prospect targeting guide |
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
| Tactical | Trial Design Benchmark Pack | $4,950 | Biotech R&D, pharma CI | PDF + Tableau workbook |
| Tactical | Cross-Silo Connector Report | $9,950 – $24,950 | Pharma R&D, biotech partnerships | Narrative + interactive knowledge-graph export |
| Tactical | Plain-Language Patient Brief | $2,500 | PAGs, trial sponsors | Word/PDF EMWA-aligned template |
| Tactical (demoted) | Pharmacovigilance Pack | $2,500 – $4,950 | Mid-market pharma safety | Existing Datarade / HuggingFace listings preserved |
