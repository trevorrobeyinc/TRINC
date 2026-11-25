# trevor-robey-inc-agents

> **Naming disambiguation (2026-04-27)**: This subdirectory was renamed from `OpenClaw-Research-Agents` to `trevor-robey-inc-agents` on 2026-04-27. The homebrew `openclaw` cask and `openclaw-cli` formula at `openclaw.ai` are unrelated consumer "Personal AI assistant" products (the prior launchd entry on :18789 was that product, removed 2026-04-27). **This is the canonical Trevor Robey, INC. citation-traced biomedical due diligence engine — powered by OpenClaw (open-source agent framework).** It runs as on-demand subprocess via `node scripts/run-workflow.js` — there is no persistent gateway service for the biomedical workflow.

> **Repo topology**: a top-level folder of the **TRINC monorepo** at `/Users/myhome/TRINC`, pushed to the private GitHub repo `trevorrobeyinc/TRINC` (pushes are the operator's, with a YubiKey); the offline backup is a verified `git bundle --all` in `~/Documents/`. Before 2026-05-07 this was the standalone repo `trevoralexanderrobey/trevor-robey-inc-agents` (rollback tag `pre-monorepo-consolidation-2026-05-07` at `8e782a0`). The `vendor/tooluniverse/` submodule is pinned at `f2006162` (v1.5.7, bumped 2026-10-24). Its venv is built from the repo-owned, hashed `security/tooluniverse-venv.lock.txt` by `scripts/setup-tooluniverse.sh`; never run `uv sync` there (upstream's `uv.lock` is stale against its own pyproject, and a sync would rewrite it inside the submodule). Plain-language story of the business: the root `HOW-IT-WORKS.md`; verified technical record: the root `ARCHITECTURE.md`.

> **Legal entity (updated 2026-07-22)**: brand wordmark **"Trevor Robey, INC."** is the trade name of **Trevor Robey Intelligence Network Citations LLC**, California limited liability company (filed 2026-05-06; **CA SOS Entity No. B20260217250**; **APPROVED 2026-06-18**, confirmed by certified SOS copy Certificate No. 457169837). See [`REVENUE_PLAYBOOK.md` §0a](REVENUE_PLAYBOOK.md) for the legal-status update flow and dependent surfaces.

## What This Is

A governed, local-first biomedical research and dataset packaging system. Architectural and governance patterns from the OpenClaw project line are preserved as a clean-room derivative (`cleanRoomDerivative: true` flag at `openclaw-bridge/openclaw.json:5`; `openclaw-bridge/` directory name retained as upstream attribution). It prepares, packages, and tracks research work into monetizable assets (datasets, release bundles) under strict approval and safety controls.

**Critical boundary**: External publishing, uploads, marketplace submissions, customer delivery, login automation, and browser automation are all **manual-only**. This system is a preparation tool, not an autonomous publisher.

## Tech Stack

- **Runtime**: Node.js 22.13.1 (strictly enforced — `.npmrc` has `engine-strict=true`)
- **Modules**: CommonJS (`require()` / `module.exports`)
- **Validation**: Zod 4.6.7 (from 3.24.1 on 2026-11-01; `CHANGELOG.md`. Under zod 4, `.default()` on an object skips its inner defaults and only shallow-copies a value default: use `.prefault({})` or a function default)
- **Testing**: Node's native `--test` runner (no external framework)
- **CI**: none runs. `.github/workflows/ci-enforcement.yml` sits in this subfolder, where GitHub never runs it; the policy-gate scripts read it, so it stays. The local gates below are the pipeline.
- **LLM**: Claude Code (primary, active — scout/analyst/synthesizer on claude-opus-4-8, default on claude-sonnet-4-6), Mock (testing). The engine is 100% Claude; local models were removed from the engine (restorable).
- **Biomedical Tools**: Harvard ToolUniverse via MCP (2,719 tools, vendor/tooluniverse v1.5.7, Phase 29 active)

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

# Run a research task (mock — ungated, safe to copy/paste). Its mission never goes through the citation
# gate, so generate-offer.js refuses to package it (PHASE19_MISSION_CITATION_RECORD_MISSING, 2026-11-14).
node scripts/run-research-task.js --task "..." --type summarize --input workspace/research-input/sample/ --output workspace/research-output/ --provider mock --confirm

# Run a dataset mission — REFUSED as of 2026-07-29. This lane never threads operator approval into
# the dispatch context (repo-wide, only run-workflow.js does), so role-router refused it with
# PHASE15_HUMAN_APPROVAL_REQUIRED anyway. It now says so immediately instead of consuming a YubiKey
# touch first. Use run-workflow.js below for mission work.
#   node scripts/run-dataset-mission.js ...   # -> exits 1 with an explanation

# Single-command workflow (Phase 30 — runs mission → dataset → offer → approve → export)
node scripts/run-workflow.js --template drug-discovery-full --inputs '{"compound_name":"aspirin","indication":"pain"}' --operator-approve --confirm
node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --operator-approve --confirm
node scripts/run-workflow.js --template general-research-pack --inputs '{"topic":"AI governance"}' --operator-approve --confirm

# Monetization flow (manual step-by-step). generate-offer.js packages only a run-workflow.js mission whose
# citation gate passed: it requires the engine's record at workspace/missions/<id>/artifacts/
# citation-verification.json and re-hashes the sections it pins (T1-1, 2026-11-14). Never hand-write one.
# It also refuses a mission whose workflow's quality audit has not passed (record quality_audit "pending":
# the run stopped between the gate and the audit; Tier 1 review, 2026-11-14).
# Re-packaging never deletes evidence (T2-12, 2026-11-16): it refuses while the release holds its approval,
# submission evidence or delivery evidence (PHASE19_RELEASE_HAS_EVIDENCE); add --supersede to move the old
# release whole to workspace/releases/_superseded/<offer>-<n>/ first. export-release.js (and, since T2-14,
# the workflow's own export step) refuses a research bundle without a passing manifest or with a ChEMBL id.
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
# Generate a research pack for a client (arm the gate first: operator-approve-gate arm).
# A paying client's run ALWAYS adds --customer-run (2026-11-06, core/customer-run.js): no prior-run
# context in, no vault notes, memory pack or session record out. CLI only, never the Obsidian door.
node scripts/run-workflow.js --template pharmacovigilance-report --inputs '{"drug_class":"NSAID"}' --operator-approve --customer-run --confirm
# Build what the buyer receives: the order form's section-4 files + a fresh checksums.txt, refused on
# a missing/altered file, BLOCK/UNRESOLVED, any ChEMBL id, or retired wording (2026-11-06).
node scripts/build-buyer-zip.js --offer-id offer-XXX --out ~/Desktop/<client>-<date>.zip
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
| `vendor/tooluniverse/` | Harvard ToolUniverse submodule v1.5.7 (Phase 29 — active) |
| `workspace/research-input/biomedical/` | Biomedical seed documents (drug repurposing, PPI, pharmacovigilance, genomics) |
| `config/workflow-templates/` | Phase 30 workflow templates (10: seven biomedical — drug-discovery, pharmacovigilance, clinical-trial, target-validation, rare-disease, general, trial-design-benchmark — and three business-lane: business-research-pack, cost-reduction-analysis, market-landscape; see "Business research lane" below) |
| `workspace/workflows/` | Workflow execution state (Phase 30 — created at runtime) |
| `docs/` | Phase-specific documentation (phases 1-28; Phase 29 docs retained for re-integration reference) |
| `security/` | Policy files, RBAC definitions |
| `workspace/collateral/` | Sales collateral, landing page, email sequences, prospect targeting, sample deliverables |
| `openclaw-bridge/distribution/` | Format adapters (Datarade, Kaggle, HuggingFace, AWS, Data & Sons) and training data generator |
| `workspace/collateral/platform-guides/` | Setup guides for 4 distribution platforms (Datarade, Kaggle, HuggingFace, AWS). The Outlier and Mindrift contributor guides were removed in the 2026-10 reorg (both are rejected channels — `03-platforms/rejected-channels/`). |
| `workspace/distribution/` | Distribution output (created at runtime by `scripts/distribute.js`) |

## Architecture

### Phase System (1-33 active)

Phases 1-33 are implemented. Phase 26 bridge consolidation is complete (execution router, principal context, fail-closed enforcement). Phase 29 (Harvard ToolUniverse biomedical MCP) is active — startup integrity hooked into MCP init chain (warn-on-failure, non-blocking), 58/58 tests passing, 2,719 biomedical tools (vendor/tooluniverse v1.5.7) accessible via MCP. Phase 30 (Workflow Engine) provides single-command end-to-end orchestration with 10 workflow templates (seven biomedical, three business-lane), 6 specialized agent roles, and quality auditor. Phase 31 (Enterprise Delivery) adds Research REST API, scheduled workflows, and usage metering. Phase 33 (Claude Code MCP Provider) replaces LM Studio as the primary LLM provider — Claude Code runs via `claude -p` stdin pipe using the user's authenticated session (Claude Max Pro), producing biomedical output with real verifiable citations that pass quality gates.

**Role-call isolation (2026-09-22, found by the first gated run started from Copilot chat):** every
role call is `claude -p --output-format json --allowedTools "" --tools "" --strict-mcp-config --mcp-config
config/claude-code-print-mcp.json` (`openclaw-bridge/core/llm-adapter.js` `buildClaudeCodeArgs`, pinned
by `tests/core/phase33-claude-code-provider.test.js`). Without the two MCP flags the CLI booted **every**
user/project/plugin MCP server per role call; the pdf-viewer plugin's server is an `npx` package and,
because the child's cwd is this folder, its `.npmrc` (`cache=.ci/npm-cache`) made npx pull 209 packages
into the LOCKED supply-chain cache mid-run — caught by `tests/supply-chain`, cache restored, lock
unchanged. **Hermetic prompt (same day, later):** print mode also loaded the operator's instruction
files — `~/.claude/CLAUDE.md`, the monorepo `CLAUDE.md`, this folder's `CLAUDE.md`/`AGENTS.md` — into
every role call; a control probe from this folder answered YES YES YES at ~10x the token cost of a
clean call. Fixed without an API key: `buildClaudeCodeEnv` sets `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`
(memory files off — an env switch read from the CLI binary, not in `--help`) and the argv adds
`--setting-sources ""` (user/project/local settings and their hooks off) plus
`--no-session-persistence` (no transcript per role call under `~/.claude/projects/`). Probed from
this folder under the operator's OAuth session: NO NO NO. `--bare` is NOT usable (API-key auth only);
`--system-prompt` alone does not help; `--setting-sources ""` alone still left `AGENTS.md`. **No tools
(2026-11-23):** `--allowedTools ""` is only the permission allow-list, so on CLI 2.1.327 a role call's
init event still listed 28 built-in tools (Bash, Edit, Write, Read, WebSearch, Task, Workflow…).
`--tools ""` is the flag that makes none available; with it the init event lists 0 tools. It still lists
six built-in `cc-plugin-*` plugins (19 skills, 6 agents), which no flag here removes; the model reaches
skills and agents only through the Skill and Task tools, which are gone. Both tool flags are list
options, so the prompt goes on stdin, never as a positional argument after them. **Re-verify after any
CLI upgrade** (Haiku, under $0.02 a call, run from the scratchpad so nothing touches the repo cache,
under `env -i` with only HOME, USER, the engine's PATH order — `~/.local/bin`, the nvm node bin,
`/opt/homebrew/bin`, `/usr/local/bin`, then the system dirs — `NODE_EXTRA_CA_CERTS` and
`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`): `claude -p "Answer YES or NO: do your session instructions mention
a YubiKey?" --model claude-haiku-4-5-20251001 --output-format stream-json --verbose --allowedTools ""
--tools "" --strict-mcp-config --mcp-config <absolute path of this folder's
config/claude-code-print-mcp.json> --setting-sources "" --no-session-persistence`. Its first line, the
init event, must have `tools` and `mcp_servers` both `[]`, and the result must answer NO. Then run it
once with `--output-format json` in place of `stream-json --verbose`: `subtype` `success`, `is_error`
false, the answer in `result` (the envelope `callClaudeCode` parses). Last run 2026-11-23, CLI 2.1.327:
0 tools, 0 MCP servers, NO both times ($0.015 and $0.0015).

**ToolUniverse Live Pre-Fetch**: When workflows run, the tool-prefetch module (`openclaw-bridge/core/tool-prefetch.js`) queries ToolUniverse SMCP for each agent role before prompt construction. Results are injected as synthetic input documents marked `tooluniverse://`. The LLM prompt includes a LIVE DATABASE CONTEXT instruction prioritizing live data over training knowledge. Role-to-tool mappings configured in `config/tool-prefetch-map.json`. Graceful degradation: if ToolUniverse is unavailable, workflows continue with parametric-only output. In addition to ToolUniverse, `createToolPrefetch` accepts a `localFetchers` seam for in-process fetchers that are not ToolUniverse tools (see Citation Integrity Layer below).

### Engine → Obsidian vault (post-run publish, 2026-09-22)

After `executeWorkflow` returns `ok`, `scripts/run-workflow.js` calls
`openclaw-bridge/vault/workflow-vault-publisher.js`, which writes the run's notes into the Obsidian
vault **itself** — `OpenClaw/<template_id>/<YYYY-MM-DD> <first two inputs>/` (byte-for-byte the
Command Center plugin's folder formula): `Overview.md`, one note per agent role, `Quality Audit.md`,
`Dataset Card.md`, the deliverables listed in `config/vault-publish.json` copied verbatim from the
sealed bundle (sha256 in frontmatter), and a deterministic `Graph Analysis.md`
(`openclaw-bridge/vault/graph-analysis.js` → Medical Zettelkasten MCP in-process, no LLM). Only a
`completed` + citation-`PASS` + non-mock run is written; a path guard keeps every write under the
allow-listed vault root; the result is recorded as `artifacts.vault_notes` in `workflow.json`, which
the plugin reads to REHYDRATE its enrichment stages instead of writing a second time. Headless by
design — Obsidian need not be open. Backfill / dry-run: `node scripts/publish-workflow-to-vault.js
--all [--dry-run] [--json]`. Switch: `config/vault-publish.json` `enabled`, or `OPENCLAW_VAULT_PUBLISH=0`.
The same step then runs the research-memory ingest (`openclaw-bridge/mcp/research-memory-mcp/`,
thin client of the pack store's CLI over `:6433`; switch `researchMemory.enabled`, **on since
2026-09-22**). Every automated spawn runs the store offline (`EMBED_ALLOW_REMOTE=0`; a cache miss is a
loud `EMBED_MODEL_NOT_CACHED`, never a download) — only the operator's `scripts/research-memory.js
ingest --allow-remote-model` may pull the embedding model. Vault read-back (`obsidian_prior_research`,
Miyo-direct over `:8743`, then the canonical vault bridge's Unix socket `vault-bridge.sock` as the fallback:
local IPC through `openclaw-bridge/mcp/base-mcp.js`, never TCP, since 2026-11-24) and memory priors (`research_memory_priors`) are
**context-only**: rendered with identifiers withheld (since T2-18, 2026-11-16, every form the extractor reads,
then every remaining run of 5 to 10 digits) and excluded from `fetched_citation_ids`
(`tool-prefetch.js` / `agent-engine.js` `collectEvidenceContent`); `npm run audit:connectors` reports
any vault-lane prefetch entry that is not. Lifecycle contract per touchpoint: root `CLAUDE.md`
"Obsidian pipeline lifecycle". **Customer runs (2026-11-06):** `run-workflow.js --customer-run` turns all of
this off for one run, in both directions. Since T2-7 (2026-11-16) its prompts also ask only for PMIDs, NCT
numbers and DOIs (a PubChem CID or a UniProt accession only where one appears verbatim in the live data, never
a ChEMBL, RxNorm or ENSG id), and its prefetch renders no ChEMBL id, because every delivery path refuses one;
the phrase swaps live in `CUSTOMER_RUN_PHRASES`, pinned by a drift test. No read-back, no memory priors and no "Recent sessions" digest go
in. No vault notes, no memory pack and no session record come out, and `workflow.json` `customer_run: true`
makes `assessShippability` refuse the run for every later backfill (`core/customer-run.js`,
`tests/core/customer-run.test.js`). Never dispatch a client's run through the door. Tombstoned: `scripts/publish-to-vault.js`, `scripts/atlas-stub-creator.js`,
the bridge's `Research-Output/` scheme.

### Citation Integrity Layer

Cited identifiers are **checked against the source records actually retrieved at runtime** (at least 75% must trace; each one that does not is flagged `[UNVERIFIED]` at every mention), **retraction-screened (DOIs against Crossref and, through a DOI→PMID cross-check, PubMed; PMIDs against PubMed; since T2-16 PMCIDs through the PMID or DOI their PMC record lists; any paper the screen could not reach is named)**, and — since the post-research integrity layer, validated 2026-07-10 — **independently re-resolved per identifier against the issuing public registry when the report is assembled** (corrected 2026-11-14: "at delivery time" was never true; `openclaw-bridge/mcp/citation-reresolver/citation-reresolver.js`: PMID → NCBI E-utilities, NCT → ClinicalTrials.gov v2 (in batches of 200 since T2-6), DOI → Crossref, and since T2-16 PMCID → NCBI (db=pmc), ISRCTN → the ISRCTN query API, EudraCT → the EU register (an empty answer is UNCHECKED); since T2-6 the graveyard memo's and the design benchmark's NCT numbers are re-resolved in the same pass, each manifest row tagged with the deliverables it appears in; since T2-1 a lookup a registry did not answer is asked once more after 2,000 ms; each id stamped VERIFIED / UNRESOLVED / UNCHECKED in the reproducibility manifest; any UNRESOLVED id blocks delivery). Re-resolution confirms that an identifier resolves to a source record, not that the source's conclusions are correct. NCBI calls (the re-resolver and the PubMed retraction screen) are paced and retried ONCE on a 429 (`Retry-After`, at most 5 s), because any UNCHECKED id forfeits the full-strength `DELIVER` claim (`max_unchecked_ratio` is 0 by doctrine, Q8) and NCBI throttles about 1 request in 10 even at 3 req/sec; a test that simulates a persistent 429 against the real modules must inject `sleep`. The pacing and retry policy lives in one module, `openclaw-bridge/core/ncbi-pacing.js` (a pacing instance per consumer; refactored out of two hand-kept copies on 2026-10-08). Ground truth for any copy sweep: `SYSTEM-REALITY.md` → "GAP CLOSED" — never soften this to "grounding only" (this sentence said the opposite until 2026-09-22 and was the instruction-file trap recorded on the board 2026-09-20). The layer has these components:

- **Citation gate** (`openclaw-bridge/core/citation-gate.js`, wired into `agent-engine.js` and `workflow-engine.js`): `agent-engine` persists `fetched_citation_ids` (the identifiers actually retrieved at runtime by tool-prefetch) plus a per-task `citation_verification` block into research-output metadata, and `buildPrompt` carries an ABSOLUTE-RULE "ZERO FABRICATION" clause (never invent a PMID/NCT/DOI — say `[no verifiable citation found]` instead). `workflow-engine.executeMissionStep` runs a report-level gate (`verifyReportCitations`) that cross-checks every identifier cited in the assembled report against the union of runtime-fetched ids: a cited id is "grounded" if it was present in fetched evidence, else "ungrounded" (likely model-introduced). Per the never-hallucinate doctrine (operator ruling 2026-07-10) it returns a **three-state verdict**, not a silent pass: **PASS** (grounded ratio ≥ `minGroundedCitationRatio`, a required value in `config/agent-config.json` = **0.75**); **UNVERIFIED** (`PHASE30_CITATION_UNVERIFIED`); **INSUFFICIENT_EVIDENCE** (`PHASE30_CITATION_INSUFFICIENT_EVIDENCE` — zero runtime evidence fetched, an honest-zero that now BLOCKS instead of auto-passing); **NO_CITATIONS** (`PHASE30_CITATION_NONE`). Only PASS ships. The floor is read fail-closed (missing/invalid → strict `0.75` + warning), replacing the old hardcoded `0.34`. It writes `citation-verification.json` + `report-annotated.md` (an internal annotated copy) to the workflow dir; since T1-3 (2026-11-14) the shipped sections themselves carry an `[UNVERIFIED]` mark at every mention of an untraced identifier (SYSTEM-REALITY.md §3 says exactly where the marks land).
- **Retraction screen — Crossref + PubMed cross-checked (widened + escalated + notice-disambiguated 2026-07-10).** Cited **DOIs** → Crossref (`crossref-retraction.js`); cited **PMIDs** → PubMed `esummary` (`pubmed-retraction.js`, pubtype **exactly** `Retracted Publication`); and every cited **DOI is reverse-resolved DOI→PMID** (`esearch <doi>[AID]`) and cross-checked against PubMed. Per-DOI rule: `retracted = pubmedRetracted OR (crossrefFlagged AND NOT pubmedNotice)`. Any retracted paper hard-stops (`PHASE30_CITATION_RETRACTED`). All legs fail-soft; wired via `researchRuntime.{crossrefRetraction,pubmedRetraction}`.
  - **Do not collapse to DOI-only or drop a leg.** Verified live 2026-07-10: (1) Crossref returns `relation:{}`/no `update-to` for `10.1016/S0140-6736(97)11096-0` (Wakefield 1998) — clean to the DOI screen — while PubMed marks it `Retracted Publication` (the escalation catches it). (2) Crossref's `update-to:[retraction]` is AMBIGUOUS — it flags both the Surgisphere original AND the Wakefield **retraction notice** `10.1016/S0140-6736(10)60175-4`; PubMed pubtype disambiguates, and a Crossref flag is overridden ONLY when PubMed positively says `Retraction Notice`. (3) PMID-only citations (GeneReviews, PMID 20301295) never reach Crossref.
  - **Exact-match, never a regex.** Both `Retracted Publication` and `Retraction Notice` matched exactly; citing a notice is legitimate and must not hard-fail a report.
  - **Parenthesized DOIs.** The extractor now captures balanced internal parens (Elsevier/Lancet SICI DOIs) and trims only unbalanced prose-wrapping `)`. Previously `10.1016/S0140-6736(97)11096-0` was truncated to `…(97` — unscreenable.
  - **Fail-closed on retractions, fail-soft on coverage.** Under a PubMed outage a Crossref flag stands (block rather than risk shipping a retraction); `checked:false` (rendered `INCOMPLETE` in the Reproducibility Manifest) signals incomplete coverage but never blocks delivery on its own.
  - **Since T1-7 (2026-11-14)** the Crossref leg also reads a work's own `updated-by` (the Wakefield original's retraction is there, served from Retraction Watch) and treats an `update-to` retraction naming ANOTHER work as a notice, which never blocks on its own. Keep every leg anyway: SYSTEM-REALITY.md §3 has the field rules and the coverage rule.
  - **Since T2-16 and T2-2 (2026-11-16)** a cited PMCID is screened through the PMID (or, with none, the DOI) its PMC record lists and blocks as `retracted_pmcid`; and the PubMed leg reads a docsum's reference types, so an expression of concern, or a "Retraction in" link on a record not marked retracted, is a ledger flag that never blocks (Tier 1's operator default D3 and Tier 2's D14). A screen request a registry did not answer is asked once more after 2,000 ms (T2-1).
  - **Residual gap:** a retracted paper cited by **DOI only AND not indexed in PubMed**, whose Crossref record carries no retraction entry (no `is-retracted-by`, no `updated-by` retraction, no in-place `update-to`), is still missed, and so is a retraction recorded only in Crossref for a paper cited by PMID alone (PMIDs go to PubMed only). Closing either would need the Retraction Watch bulk dataset (storage + refresh) or a PMID→DOI leg.
- **Attribution check** (`openclaw-bridge/core/citation-attribution.js`, 2026-11-04): after re-resolution, `reresolver.checkAttributions` compares the single author (and adjacent year) a report writes beside each VERIFIED DOI/PMID with the registry record — Crossref `/works/{doi}` (one extra call, only for DOIs with an author beside them, skipped for doi.org-fallback DOIs) and the NCBI docsum `resolvePMID` already reads. A name on no author list for that work → manifest `flag_reasons: ["attribution_mismatch"]` → `DELIVER_WITH_FLAGS` (operator decision: flag + inline mark, never block) and `[ATTRIBUTION MISMATCH: registry lists …]` written after the identifier (after the whole wiki-link / link / URL) in the shipped sections, re-checked per line. Conservative by design — one work and one author per line, year-anchored pairs, a stop-list of company/journal/region words, token-wise surname matching; anything else is `not_checked` with a reason. It does not check what the report says about the work. Found because run #7 (ALS) credited 6 of 7 reference-table papers to the wrong authors.
- **Author bylines reach the model** (root cause of the above, fixed 2026-11-04): `tu-record-normalizer.js` keeps a row's REAL author list as `author_names` (+ `author_count`, `author_count_is_minimum` when a source may have cut the list; placeholders such as OpenAlex's "Unknown Author" dropped) — never the legacy `authors` field, which falls back to a category, the source or "tooluniverse". `tool-prefetch.js` `renderAuthors` prints `**Authors:** a, b, c, d, e et al. (N authors)` (also a local fetcher's `authors` string, and the business lane's OpenAlex `author_names`); `buildPrompt`'s ZERO FABRICATION clause says to name an author only as that line gives it; the literature_reviewer and report_generator role prompts say the same; context-only prior-run text has its bylines withheld (`redactBylines`) as well as its identifiers.
- **DOI extraction** (`openclaw-bridge/core/citation-extractor.js`): the DOI regex stops at non-DOI terminators and strips trailing sentence punctuation after capture (a DOI never ends in `.`/`,`/`;`/`:`), preventing trailing `]]`/`;`/`.` from inflating/duplicating DOIs and deflating the grounded ratio.

**Stop-reason archaeology + change-history corpus**: `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js` is a local fetcher (not ToolUniverse) that searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules) from the internal history endpoint. It has a session cache and is routed into role prefetch through the `localFetchers` seam in `tool-prefetch.js` under tool name `ctgov_stopped_trials`; each record is NCT-traced (grounded cite). Every history request is accounted for (`historyAttempted` / `historySucceeded` / `historyFailed` / `historyFirstError` ride on the result): as of 2026-10-08 the history endpoint answers HTTP 403 to this fetcher, so a real run's amendment-risk section reads "Not available for this run" (below). The fetcher does not try to get around the refusal.

**Integrity-driven deliverables** (shipped in every mission bundle, registered in `manifest.json` and sealed in `checksums.txt`):
- `deliverables/citation-integrity.md` — `openclaw-bridge/monetization/integrity-rating.js` `buildIntegrityReport(citation_verification)` renders a graded provenance ledger (grade A/B/C/D from the grounded ratio; F + "BLOCKED" if any retraction; N/A if nothing cited). It is the report's audit-trail spine. Since T2-4 (2026-11-16) it prints the rubric with the floor the record states (a higher configured floor raises B's bound; a lower recorded one never loosens a grade) and, under the grade, the registry result with reasons, the delivery decision and the attribution counts, because the grade measures grounding only.
- `deliverables/graveyard-memo.md` — `openclaw-bridge/monetization/graveyard-memo.js` `buildGraveyardMemo(stoppedTrials, {indication})` renders a memo of prior terminated/withdrawn/suspended programs in the indication, each NCT-traced, with the sponsor's stated stop reason (or an explicit "(none stated by sponsor)" — never invented), protocol churn, and a resolvable `clinicaltrials.gov/study/<NCT>` link. `buildAmendmentRisk(stoppedTrials)` adds a protocol amendment-risk band (LOW/MODERATE/HIGH) from the change-history median/max version count + most-amended modules, and it never goes silent: its states are `ok`, `partial` (a "Retrieval gap" line), `unavailable` (a "Not available for this run" section naming the cause — the live state while every history request is refused with HTTP 403, as of 2026-10-08) and `not_computed` (nothing was requested). Both are rendered deterministically from the fetched records (no LLM), so every claim is verifiable.

Wiring: on a gate-passing mission, `workflow-engine.executeMissionStep` re-fetches the indication's stopped trials (session-cache hit, no extra CT.gov call), builds both memos (fully fail-soft + bounded — an absent fetcher / empty indication / fetch error simply omits them and never blocks a passing report), persists `graveyard-memo.md` to the workflow dir, and attaches them to the result. Since T2-6 (2026-11-16) the memo and the design benchmark are built just before re-resolution (`buildPostGateArtifacts`), so every NCT number they list is re-resolved with the report's identifiers and recorded in the manifest (`sections`, `summary.by_section`); an UNRESOLVED one blocks like any other id (operator default D15), and the packager's report-level sentences read the report's own counts; `executeOfferStep` threads them into `source_context`; the deliverable-packager ships `graveyard-memo.md` and registers `artifactRefs.graveyard_memo`. `_workflow-runtime` exposes the same `ctgovSupplemental` + `crossrefRetraction` instances on `researchRuntime`.

**Scholar Gateway (Semantic Scholar) — first-class literature lane**: The `SemanticScholar_search_papers` tool from ToolUniverse is the canonical scholar-gateway connector. It is wired into the prefetch map for **scout**, **analyst**, **literature_reviewer**, and **competitive_intel_analyst** roles — every role that consumes peer-reviewed literature pulls Semantic Scholar abstracts and citation context alongside PubMed and EuropePMC, not as a fallback. Complementary scholar paths exist (`openclaw-bridge/mcp/semantic-scholar-mcp.js` in-process JS, `openclaw-bridge/mcp/arxiv-mcp.js`, plus 7 vendored ToolUniverse `SemanticScholar_*` tools at `vendor/tooluniverse/src/tooluniverse/tools/`); when adding new literature-aware roles, add Semantic Scholar to the prefetch entry by default rather than treating it as optional. Live-MCP smoke tests at `audit/evidence/mcp-live/semantic-scholar-*.json`. **Without an API key it does not deliver (2026-10-24):** every call drew HTTP 429 from the anonymous pool and is recorded as a failed search; ToolUniverse reads `SEMANTIC_SCHOLAR_API_KEY` from the engine's environment, and the operator option is written up in `ops/security/dependency-audit-2026-10.md`, decision 5.

**Open Targets Platform (GraphQL) — target/disease evidence lane (2026-07-24)**: `openclaw-bridge/mcp/open-targets-graphql/open-targets-graphql.js` closed the registry's only HIGH-priority adapter gap. It was previously a `claude-host-mcp` connector, which per the registry is **"NOT reachable from subprocess"** — so `run-workflow.js` could never call it. Two local fetchers routed through the `localFetchers` seam: `opentargets_target_intel` (bound to `molecular_profiler`; needs `target_gene`) returns clinical/approved drug candidates, top disease associations, and recent literature; `opentargets_disease_intel` (bound to `scout`, `molecular_profiler`, `competitive_intel_analyst`) returns in-clinic drug candidates and top associated targets for an indication. **Both return records carrying `chemblId` / `pmid`**, so their evidence flows through `renderRecord` into `fetched_citation_ids` and raises the grounded-citation ratio rather than only adding prose (verified end-to-end: 11 records → 9 grounded ids, 6 ChEMBL + 3 PMID). Fail-soft like every prefetch source — a GraphQL/network error returns `[]`.
- **Schema gotchas, verified by live introspection and NOT assumed** (an initial guess returned HTTP 400): the drug field is **`drugAndClinicalCandidates`** on BOTH `Target` and `Disease` — `knownDrugs` exists on neither — and it takes **no arguments** (page client-side). Literature is **`literatureOcurrences`** (the API's own one-`c` spelling; do not "fix" it). `Disease.associatedTargets` uses `page:{index,size}`; `ClinicalDiseaseListItem` has no `id` field.
- Disease/target ids (`ENSG…`, `MONDO…`, `EFO…`) are **not** citation identifiers and are deliberately carried as context only, never dressed up as cites.
- `opentargets_target_intel` deliberately does **not** fall back to `compound_name`: searching the target index by a drug name returns nothing or a spurious gene, which would then read as target evidence.

**Connector lanes (2026-07-24)**: every registry entry now carries a `lane` — `research` (the ONLY lane permitted into `tool-prefetch-map.json`), `vault`, `business`, `security`, `infra`. Non-research connectors are recorded in the registry's `operator_surfaces` ledger so "what is connected" is answerable without guessing, while staying explicitly OUT of the engine: injecting mail/marketing/security payloads into a citation-graded pipeline would dilute the grounded-citation ratio and inflate a token budget already at ~300K/template. The audit understands `binding_status` (`intentionally-unbound`, `gate-consumed-not-prefetched`), `adapter_status: declined-no-public-api`, and `prefetch_exempt_roles` (`report_generator`, `quality_auditor` consume assembled output and correctly fetch nothing) — so a clean run now means genuinely clean rather than a catch-all "unclassified" bucket.

**AdisInsight — DECLINED, do not attempt to connect**: no MCP server exists (zero results in the connector directory, absent from every local MCP config, Springer Nature subscription-only with no public API). Its failed-trial value is already covered by `ctgov-supplemental` → `deliverables/graveyard-memo.md`. Tombstoned in the registry as `declined-no-public-api`; see `docs/mcp-connector-gap-analysis-2026-07-10.md` §2b.

**Connector Registry — Authoritative Map**: [`config/connector-registry.json`](config/connector-registry.json) (schema `connector-registry-v1`) is the single source of truth for every MCP connector used by this engine. Each entry declares `execution_surface` (`subprocess-mcp` / `tooluniverse-tool` / `claude-host-mcp`), `bound_roles`, `bound_workflow_steps` (tuples of `workflow_template_id` × `step_id`), `adapter_status` (`wired` / `missing` / `scaffold-only`), and a one-sentence `purpose`. The registry covers three classes of tooling: (1) the subprocess MCPs under `openclaw-bridge/mcp/` already wired into `tool-prefetch-map.json`, (2) the ~2,719 ToolUniverse tools at `vendor/tooluniverse/`, and (3) Claude-host-only connectors (e.g. synthesize.bio, pubmed-fulltext, open-targets-graphql) that exist in Claude Code sessions but have no subprocess adapter yet. Run [`npm run audit:connectors`](scripts/audit-connector-coverage.js) to cross-check the registry against `tool-prefetch-map.json` and report drift; the audit also accepts `--write-drift-tickets` to append `FEAT-YYYYMMDD-XXX` adapter-missing entries to `.learnings/FEATURE_REQUESTS.md` (idempotent — skips connectors that already have tickets). **Rule**: every new MCP connector authenticated at the Claude-host level must be added to the registry within 7 days of authentication; run `npm run audit:connectors` after every onboarding to confirm coverage. The subprocess world (`tool-prefetch-map.json`) defers to the registry for binding intent — when the two diverge, the registry is the source of truth and the prefetch map gets updated to match.

**Multi-Platform Distribution**: `scripts/distribute.js` transforms workflow output into platform-specific formats for 5 data marketplaces (Datarade, Kaggle, HuggingFace, AWS Data Exchange, Data & Sons) plus AI training data for Outlier.ai and Mindrift.ai. Format adapters in `openclaw-bridge/distribution/`. Training data generator produces Q&A pairs, evaluation rubrics, and factuality assessments as JSONL. Distribution is local-only — files are prepared for manual upload. It stages files only from the workflow's sealed, gate-passed release, and refuses one whose seal or manifest check fails or (since T2-15, 2026-11-16) that carries a ChEMBL id, for every target (SYSTEM-REALITY.md §3, "What each delivery path refuses").

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
- **29**: Harvard ToolUniverse biomedical MCP integration (active — 2,719 tools (vendor/tooluniverse v1.5.7), 6 mission templates, 5 dataset schemas)
- **30**: Workflow engine — single-command orchestration (`run-workflow.js`), 10 workflow templates, 6 specialized agent roles (literature_reviewer, safety_signal_detector, molecular_profiler, competitive_intel_analyst, quality_auditor, report_generator), quality auditor self-verification
- **31**: Enterprise delivery layer — Research REST API (`/api/v1/research`), scheduled workflows, usage metering, `api_client` bridge principal
- **33**: Claude Code as primary LLM provider — `claude -p` stdin pipe with JSON output, no local fallback (each role's `fallback` = "" — a claude-code failure surfaces the real error rather than chasing a local backend), per-template provider routing via `provider_preference`, citation density quality formula

### Business research lane (2026-10-21) — one engine, two lanes

Operator decision (2026-10-21): ONE engine with two lanes sharing the same citation gate, never a
second engine. A template opts in with `"research_profile": "business"` (`business-research-pack`,
`cost-reduction-analysis`, `market-landscape`); with no profile every biomedical path is unchanged.
The lane adds citable identifiers the existing gate grounds and the re-resolver checks: `WEB: <12 hex>`
(a stored snapshot of the exact page text the model saw — re-resolution re-hashes the snapshot, which
proves "what was read, from this URL, at this time", **not** that the page is live or correct),
`SEC: <cik>/<accession>`, `WB: <indicator>` and OpenAlex DOIs. Profile table
`openclaw-bridge/core/research-profiles.js`; sources `openclaw-bridge/mcp/business-sources/`; map
`config/tool-prefetch-map.business.json`; `config/agents/*/SOUL.business.md`; tests
`tests/core/business-research-lane.test.js`. Design and run command: `docs/business-research-lane.md`.

**State: built, unit-tested, ZERO live runs.** The first live run was **PARKED by the operator on
2026-10-21** until a specialized evidence back end existed. **That back end, the Evidence Desk, was built
the same day (P1 + dormant P2; `docs/business-research-lane.md` "Evidence Desk")**: official statistics
with re-resolvable ids `BLS:` / `EUROSTAT:` (keyless) and `CENSUS:` / `EIA:` (free keys, dormant until
`CENSUS_API_KEY` / `EIA_API_KEY` exist), chosen by the reviewed `config/business-series-map.json`; an
extractive BM25 passage condenser that shows the top web passages verbatim as `WEB: <id> ¶<n>`; and the
business **scout replaced by a deterministic Evidence Brief** (`mcp/business-sources/evidence-desk.js`,
no model call). Operator decisions: the citation gate and the density audit **judge model-written text
only** (metadata `authored_by: "evidence-desk"`); the business section gate searches the `science` topic
until a general-web engine exists (Brave's Search API, P3, now needs a card: its free tier ended in
2026). **Since 2026-11-15 the `science` topic of every section gate is Europe PMC + Crossref, queried
directly** (`openclaw-bridge/mcp/scholarly-search/`, free and keyless), not SearXNG, whose science
engines all stalled at once; SearXNG still serves the business lane's general-web evidence search. A
genuine zero there is only both sources answering with no hits: one source down while the other found
nothing marks the section UNCHECKED, and a section counted from one source is marked † in
`citation-integrity.md` (S1 review, 2026-11-15).
Tests: `tests/core/evidence-desk.test.js` and `tests/core/scholarly-search.test.js`. The live run
still needs the operator's explicit go and a freshly armed `operator-approve` token; the recommended
inputs are in the lane doc. What the pre-flight found and fixed:
- **SearXNG general web is unusable for this lane.** Only Bing answers in the `general` category
  (DuckDuckGo/Startpage CAPTCHA, Brave rate-limited, Google/Mojeek empty) and Bing answers a
  multi-word query for one word ("can", "mid", "warehouse"). Never evade it.
- **Keyword query shaping** (`business-sources/search-terms.js`): the templates pass the operator's
  question as `{{topic}}`; OpenAlex returned ZERO works for the verbatim question and relevant ones for
  its content words. `web-evidence.js` and `openalex.js` now search with `toSearchQuery(subject, focus)`;
  the question stays the mission text.
- **Relevance guard** (`web-evidence.js` `isOnTopic`): a page must mention at least half the subject's
  content words (4-character stem at a word start, so labour~labor) or it is neither stored nor shown.
  The gate proves a WEB id was fetched, not that the page is about the question — this check does.
- Command Center's template list now carries `researchProfile` and `optionalInputs` (the business
  inputs `company`/`competitors` decide whether SEC filings fire), and the run tool's input hint covers
  the business templates — live since the 2026-10-23 Command Center redeploy.
**Prices**: five business tiers in `OFFERINGS.md` → "Business research (any field)" (approved
2026-10-23). **Booking stays closed until the first live business run passes the gate.**

### Design Principles

- **Fail-closed**: Unknown states default to `blocked` or `review_required`
- **Deterministic naming**: Stable IDs prefixed `mission-`, `dataset-`, `offer-`
- **Append-only ledgers**: Phase 22/28 evidence uses chain-hashing
- **Provenance tracking**: Every produced row includes source metadata
- **Immutable config after boot**
- **Fail-closed execution**: Missing router or missing principal context results in job denied
- **Fail-closed citations**: A report whose grounded-citation ratio is below `minGroundedCitationRatio` refuses to ship (`PHASE30_CITATION_UNVERIFIED`); a report citing any retracted DOI hard-stops (`PHASE30_CITATION_RETRACTED`). The retraction screen is fail-soft (a Crossref error never wrongly blocks). See Citation Integrity Layer.
- **Enterprise brand consistency**: All buyer-facing materials use Bloomberg Terminal dark aesthetic (#0a0a0f bg, #4a90d9 accent), verified-citation messaging, "Trevor Robey, INC." wordmark (INC = Intelligence Network Citations) over the Trevor Robey Intelligence Network Citations LLC legal entity
- **Offering ladder**: SKUs and prices live only in `OFFERINGS.md` (canonical). Do not copy them into this file, where they drift.

### LLM Providers

| Provider | Config Key | Status | Endpoint |
|----------|-----------|--------|----------|
| Claude Code | `claude-code` | **Active** (default) | `claude -p` stdin pipe (scout, analyst, synthesizer on `claude-opus-4-8`; everything else `claude-sonnet-4-6`) |
| Mock | `mock` | Active (CI/testing) | N/A |
| Anthropic API | `anthropic` | Available (disabled) | `https://api.anthropic.com/v1/messages` |

Default provider is set in `config/agent-config.json` (`defaultProvider`). Provider configs in `config/llm-providers.json`. Phase 18 mission spawning is **enabled** (`config/agent-spawner.json`). Per-template provider routing via `provider_preference` in workflow templates (Phase 33).

### Code Patterns

**Restricted globals**: `Date.now()`, `new Date()`, `Math.random()`, and `randomUUID()` are forbidden in `openclaw-bridge/`. Use `timeProvider` (`openclaw-bridge/core/time-provider.js`) and `entropyProvider` (`openclaw-bridge/core/entropy-provider.js`) instead. Enforced by `scripts/lint-restricted-globals.sh` (runs in CI and `npm run phase2:gates`).

**Default clocks are frozen epochs (found 2026-10-08; both roots fixed the same day).** A component handed no `timeProvider` stamps `1970-01-01T00:00:00.000Z` — that is what keeps unit tests deterministic — so every production composition root must inject a real one. Both roots now do, with the same idiom (`options.timeProvider || core/time-provider.js`): `buildMonetizationRuntime` (it stamps the customer-visible `approved_at` and `build_completed_at`) and `buildResearchRuntime` (reached through `buildWorkflowRuntime({ logger })` and the legacy `buildPhase14Runtime`), which hands the clock to the ten components it builds; the workflow engine stamps the mission envelope and dataset builds with its own. `tests/core/phase30-customer-visible-clock.test.js` fails if a sealed bundle carries an epoch date; `tests/core/phase14-research-runtime-clock.test.js` fails if the research root hands the supervisor a frozen clock. The research root mattered even though none of its stamps ship: `supervisor-authority.js` runs a circuit breaker on that clock, and under a frozen one a tripped breaker could never leave OPEN (reproduced 2026-10-08 — latent, since nothing on either lane reaches `runApprovedTask` three times in one process), and the interaction log recorded every role call as 1970 with `duration_ms` 0. A new composition root must default its clock the same way; a component built directly with no clock is still on the epoch, by design. See `CHANGELOG.md` 2026-10-08.

**Instructions must not contradict the shipment gate (found 2026-10-08, run #4).** `openclaw-bridge/distribution/license-allowlist.js` rejects the bare word for a source we hold no redistribution licence for (DrugBank) and any `DB#####` id anywhere in shipped content, including a truthful "No DrugBank fields used." closing line. So nothing the model is instructed with may contain that word: tell it which identifier types it MAY use (a positive allowlist), never which source to avoid — a model that reads the word can echo it, and a bundle that echoes it cannot ship (run #4 completed the mission, quality check and dataset, then died at `package`; the cause was `config/role-prompts.json` asking for DrugBank IDs while `config/agents/*/SOUL.md` said "no DrugBank"). `tests/core/instruction-gate-consistency.test.js` scans the role prompts, the mission and workflow templates and every `SOUL.md` / `AGENTS.md`. The gate itself is a hard constraint and is not relaxed; the model volunteering the word from its own memory still blocks delivery, by design. See `CHANGELOG.md` 2026-10-08.

**A fetcher's field reaches a model only if `renderRecord` prints it (found 2026-11-04, run #6).** `tool-prefetch.js` turns every prefetch record into prompt text through `renderRecord`, which prints a fixed set of named fields. `ctgov_design_benchmark` returned sponsor, design, enrollment and outcome fields that the renderer silently dropped, so the analyst asked to compare them guessed sponsors from drug names, while the deterministic `design-benchmark.csv` built from the same records was right. Now `renderRegistryDesignFields` prints them, and the cohort's non-enumerable `eligibleTotal` is rendered as an N-of-M line. When you add a field to a fetcher for a model to use, add it to the renderer and pin it in `tests/core/tool-prefetch.test.js`. A deterministic deliverable and the narrative must read the same records. See `CHANGELOG.md` 2026-11-04.

**The orchestrator's time guards nest (found 2026-10-08, run #5).** Giving the research root a real clock switched on two watchdogs that had been dead code under the frozen one: `missionExecution.stallIntervalMs` and `maxRuntimeMs` in `config/agent-spawner.json`, measured by `spawn-orchestrator.js` through the injected clock. At 120 s the stall guard paused run #5 mid-way through a healthy role call (role calls run 60-300 s). The ladder, innermost first, is: model call 10 min (`llm-providers.json`) < `defaultSubtaskTimeoutMs` 15 min < `stallIntervalMs` 20 min < `maxRuntimeMs` 30 min, and each must outlast the one inside it; `tests/core/phase18-runtime-guard-config.test.js` pins it. When you give a component a real clock, audit every time-dependent branch it contains first. A throttled run (20-30 min) can approach the 30-minute mission cap. See `CHANGELOG.md` 2026-10-08.

### Token Efficiency Contingency Plan

> **Status: CONTINGENCY ONLY** — The current setup (all 3 roles through Claude Code) is correct and should remain until rate limiting is actually detected. Do not implement any phase preemptively.

#### Problem Detection

Recognize that Claude Max Pro token burn is becoming a problem when:
- `claude -p` commands return HTTP 429 (rate limit) errors
- `claude -p` commands hang or take significantly longer than usual (throttling)
- Workflow runs that previously completed in 5-10 minutes start taking 20-30 minutes
- Trevor reports hitting the Claude Max Pro usage ceiling mid-month
- Multiple sequential workflow runs in a single day (6+ templates back-to-back)

**Diagnostic**: Check the interaction log for increased `duration_ms` values across sequential runs. Compare against baseline: scout ~60-120s, analyst ~120-300s, synthesizer ~120-300s per call. If durations are 3x+ baseline, throttling is likely active. (Entries written before the 2026-10-08 research-clock fix read `duration_ms: 0` and `timestamp: 1970-01-01` — the runtime stamped them from a frozen default clock — so they are not a baseline; measure from runs after it.)

#### Solution: Hybrid Provider Routing (4 escalation phases)

**Phase 1 — Route scout to a local model (Ollama, restorable)** (saves ~33% of Claude tokens):
- The scout role performs tool discovery and initial data collection. It does NOT require Claude-level reasoning — it reads seed documents and ToolUniverse pre-fetch results, then produces a structured summary
- Change: re-enable the removed-but-restorable local lane — restore a `helper` block, set the `scout` role's `fallback` to `local`, and set `providers.local.enabled=true` in `config/llm-providers.json` (providers.local = Ollama at :11435) so scout runs on the local model instead of `claude-code`. As of 2026-10-23 Ollama runs but has **no model installed**, so this phase would first need one pulled — the operator's call
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
1. **Phase 1** (scout to local model / Ollama, restorable) — 30 minutes, biggest immediate impact
2. **Phase 3** (response caching) — 1-2 hours, prevents duplicate work
3. **Phase 2** (context compression) — 1-2 hours, reduces per-call cost
4. **Phase 4** (batch scheduling) — 30 minutes, distributes load over time

Phase 1 alone should be sufficient for normal usage patterns. Only escalate to Phases 2-4 if running high-volume generation cycles (e.g., regenerating all 6 templates multiple times per week).

#### Monitoring

After implementing any phase, verify:
- Workflow still completes with quality confidence >= 1.0
- Quality gate still passes on all biomedical templates
- Scout output from the local model (Ollama) is still substantive enough for the analyst to synthesize (if Phase 1 active)
- Cache hit rate is meaningful (if Phase 3 active)

If scout quality drops below acceptable levels after routing to the local model (Ollama), consider upgrading to a larger parameter count (e.g., 14B+ instruction-tuned model with biomedical knowledge) rather than routing back to Claude Code.

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

- Phase work on `codex/phaseNN-slug` branches (`scripts/start-phase-branch.sh`), merged to main once the local gates pass
- The workflow file's job names (`policy-and-tests`, `deterministic-build-verify`) are checked by the policy gates; nothing runs them on GitHub
- Commit messages should describe the phase and change type

## Source of Truth Order

1. Current repo code and git state (primary)
2. Current repo docs and scripts
3. Vault notes (historical context only)
4. The Phase 1-era `workspace/MEMORY.md`, `workspace/HEARTBEAT.md` and `workspace/memory/*.md` notes were deleted 2026-11-04; nothing reads them

## Secret Scanning

```bash
npm run secrets:verify   # Regex-based, no external dependencies
```

GitHub's built-in secret scanning provides push protection for provider-specific patterns (API keys, tokens, etc.).

## Marketing and Brand Infrastructure

### Website

- **Live URL**: https://trevorobeyinc.com (also https://www.trevorobeyinc.com)
- **Source**: `workspace/collateral/landing-page/index.html` (self-contained, zero dependencies)
- **Hosting**: Cloudflare Workers static-assets. **Live worker = `shy-grass-fccd`** (Cloudflare account `f3b10bacc7e94c72e445b078433aa1d4`), deployed from the local staging folder `/Users/myhome/openclaw-landing-deploy/` (served assets live in its `public/` subdir). The folder's legacy name `openclaw-landing-deploy` is NOT the worker name — the folder's `wrangler.jsonc` pins `name = "shy-grass-fccd"` (verified 2026-06-30 against the live file; a separate worker literally named `openclaw-landing-deploy`, if any, is for something else). Domain `trevorobeyinc.com` is on Cloudflare Registrar; custom domain attached via Worker Settings → Domains & Routes (cookie-auth Universal SSL, no API key, no GitHub). Verified serving production traffic 2026-05-06.
- **Old URL (retired)**: https://trevorrobeyinc.github.io — superseded by trevorobeyinc.com on 2026-04-26. The GitHub Pages repo can be archived.
- **Deployment**: Copy the page source(s) from `workspace/collateral/landing-page/` into `/Users/myhome/openclaw-landing-deploy/public/`, then drag the `/Users/myhome/openclaw-landing-deploy/` folder into the **`shy-grass-fccd`** project's "New deployment" UI, or `cd /Users/myhome/openclaw-landing-deploy && npx --yes wrangler@latest deploy` (the wrangler.jsonc pins `name = "shy-grass-fccd"` and `assets.directory = "./public"`). Site updates within ~30 seconds. **Correction (2026-06-30):** the live worker IS `shy-grass-fccd` — an earlier note here wrongly called it "stale" and credited `openclaw-landing-deploy` (that is only the folder name). Confirmed against the live `wrangler.jsonc`; this also matches `README.brand.md`, `brand-system.md`, and the brand spec.

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
| `07-outbound/` | Cold email sequences (4 personas), LinkedIn openers, prospect targeting guide, 9-touch cadence, response triage, SDR contractor brief. **Corrected 2026-07-29** — this table previously pointed at `workspace/collateral/outbound/`, which does not exist. |
| `workspace/collateral/samples/` | Redacted sample deliverable, 2-page email teaser |
| `workspace/collateral/catalog/` | Product catalog with all product lines |
| `workspace/collateral/one-pagers/` | One-page product summaries |
| `workspace/collateral/data-dictionaries/` | Target validation matrix schema |

### Offering ladder

SKUs, prices, buyers and delivery formats live only in [`OFFERINGS.md`](OFFERINGS.md), the canonical list (this file's copy was removed 2026-10-23 after it drifted). Never compute or invent a price.
