# CONNECTOR-ALIGNMENT — which connector serves which business function

> **Snapshot (2026-06-10).** A human-readable map of every connector to its business function, and — the part that trips people up — **which connectors the research engine can actually use vs. which only work in chat.** The machine-readable source of truth is [`config/connector-registry.json`](config/connector-registry.json) (38 connectors, schema-versioned, with `bound_roles` and `bound_workflow_steps` per connector); this doc summarizes and explains it. When the two diverge, the registry wins. Recommendations are tagged *(recommendation)*.

## The one thing to understand: three execution surfaces

The registry sorts every connector into one of three "surfaces." This is the single most important distinction and the source of most confusion:

| Surface | Count | Can the `run-workflow.js` engine use it? | Meaning |
|---|---|---|---|
| **subprocess-mcp** | 12 | ✅ Yes | A real project MCP under `openclaw-bridge/mcp/<slug>-mcp/`. This is what actually feeds your reports. |
| **tooluniverse-tool** | 4 | ✅ Yes (via ToolUniverse prefetch) | Exposed through the vendored Harvard ToolUniverse (~2,116 tools). |
| **claude-host-mcp** | 22 | ❌ No | Authenticated at the Claude.ai / Claude Code session level. **Chat-supervisory only** — useful when *you* are in a chat, but invisible to the automated workflow engine unless someone builds a subprocess adapter. |

So when you see "PubMed" or "ChEMBL" available in your Claude chat, that does **not** mean the report engine is using that same connector. The engine uses its own subprocess copies. Several sources exist at **both** layers (a lean subprocess version for the engine, a richer host version for chat) — that overlap is intentional and documented per-connector in the registry.

## Table A — Connectors the engine actually uses (16 product data sources)

These are the `subprocess-mcp` (12) + `tooluniverse-tool` (4) connectors. They are the only ones that flow into deliverables.

| Connector | Business function | Auth |
|---|---|---|
| **pubmed** | Peer-reviewed literature with PMID provenance — every workflow | optional NCBI_API_KEY |
| **scholar-gateway-semantic-scholar** | Citation-context literature lane — every workflow | optional Semantic Scholar key |
| **clinicaltrials-gov** | Trial discovery / eligibility / status | none |
| **chembl** | Compound, target, bioactivity (molecular profiling, target validation) | none |
| **faers-tooluniverse** | FDA adverse-event signals — load-bearing for Pharmacovigilance | optional FDA_API_KEY |
| **opentargets-tooluniverse** | Drug-ID resolution | none |
| **europepmc** | Broader open-access literature than PubMed | none |
| **arxiv** | Preprints (comp-bio, bioinformatics, ML) | none |
| **npi-registry** | HCP / investigator identity verification | none |
| **icd10** | Indication mapping for Patient Brief deliverables | none |
| **huggingface-metadata** | Dataset/model-card metadata (metadata only) | optional HF_TOKEN |
| **owkin** | Digital-pathology biomarker context | vendor-issued |
| **scrape** | Whitelisted-host scraping when no API exists | none |
| **newsletter-publisher** | Marketing-pack distribution — **Phase 24, disabled** | vendor-issued |
| **notion-sync** | Prospect-tracking handoff — **Phase 24, disabled** | OAuth (done) |

> *Note:* `newsletter-publisher` and `notion-sync` are wired as subprocess connectors but belong to Phase 24, which is **disabled** — they are not active in the research flow. See [`SYSTEM-REALITY.md`](SYSTEM-REALITY.md) §4.

## Table B — Chat-only connectors (22, `claude-host-mcp`)

Available to you in a Claude chat, **not** to the workflow engine. Many are richer versions of Table A sources (use them for hands-on research; don't assume a report used them).

- **Richer biomedical duplicates of Table A:** pubmed-fulltext (PMC full text), clinicaltrials-enriched (endpoint analysis), open-targets-graphql, drug-search-admet (ADMET + mechanism), biorxiv-medrxiv, icd10-host-enriched, npi-host-validate, huggingface-host-rich, tooluniverse-host, semantic-search-host.
- **Specialty research:** synthesize-bio (generative genomics GEM-1), tavily (open-web search past training cutoff), research-memory (Qdrant pack memory `:6433`).
- **Pipeline plumbing:** obsidian-bridge (`:8798` vault read/write — how notes get written), scheduled-tasks, mcp-registry.
- **Operator tools (not product data):** github, gmail (manual-confirm outbound drafts), filesystem-sandboxed, sequential-thinking, context7-library-docs.

## Table A.1 — Citation-integrity engine fetchers (2026-06-12, not in the surface table)

The post-research citation-integrity layer added two engine-internal data lanes that sit
outside the three-surface model above (they are neither claude-host nor ToolUniverse tools):

| Lane | Business function | Source | Auth |
|---|---|---|---|
| **ctgov-supplemental** | STOP-REASON ARCHAEOLOGY — searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules). A **local fetcher** (not ToolUniverse), routed into role prefetch via a new local-fetcher seam in `tool-prefetch.js` (tool name `ctgov_stopped_trials`); session-cached; each record NCT-traced. | ClinicalTrials.gov API v2 + internal history endpoint | none |
| **crossref-retraction** | DOI RETRACTION SCREEN — checks each cited DOI against Crossref `/works/{DOI}` for retraction (`relation.is-retracted-by` / update-to type `retraction`). Fail-soft: Crossref errors yield no retractions, so a network blip can never wrongly block a report. | Crossref REST | none |

These feed the report-level citation gate (see SYSTEM-REALITY.md). The gate cross-checks every
identifier cited in the assembled report against the union of identifiers **actually retrieved at
runtime**: a cited id is "grounded" if it was present in fetched evidence, else "ungrounded." The
report hard-fails (`PHASE30_CITATION_UNVERIFIED`) below the `minGroundedCitationRatio` threshold,
and hard-stops (`PHASE30_CITATION_RETRACTED`) if any cited DOI is retracted. Citations are thus
**grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)**
— not independently re-resolved against each external source database.

The layer also adds two mission-bundle deliverables: `deliverables/citation-integrity.md` (a graded
provenance ledger A/B/C/D from the grounded ratio; F/BLOCKED on retraction) and
`deliverables/graveyard-memo.md` (terminated/withdrawn/suspended prior programs in the indication,
each NCT-traced with the sponsor's stated stop reason — never invented — and a protocol
amendment-risk band rendered deterministically from the fetched records).

## Table C — Infra / ops connectors (registered in `~/.claude.json`, not product)

| Server | Role |
|---|---|
| **falcon** | CrowdStrike Falcon — security recon/hardening (read + propose-only). Not a product data source. |
| **github** | Repo access (read-only, YubiKey-gated). Dev/ops. |
| **cdp-pipe** | Headless Chrome browser automation (YubiKey consent gate). Used for guided console navigation, e.g. AWS. |
| **zoho-mail** | The business mailbox `trevor@trevorobeyinc.com` — outbound/inbound for sales & marketplace correspondence. |

The AWS Management Console itself is driven via the **Claude-for-Chrome extension in a dedicated AWS-only profile**, not through the product pipeline.

## Gaps & recommendations

1. **Five unauthenticated claude.ai connectors** (AdisInsight, BioRender, DataHub, Owkin host-side, Synthesize Bio) appear in the Claude.ai connector list but are not authenticated. *(Recommendation)* authenticate the ones with a real research use (Owkin, Synthesize Bio are the strongest biomedical fits) or stop listing them so the surface stays honest.
2. **Overlap is intentional but undocumented for buyers.** A deliverable should state which lane produced a citation if you ever expose the pipeline to a buyer; the engine uses the lean subprocess lane. *(Update 2026-06-12: partially addressed — every mission bundle now ships `deliverables/citation-integrity.md`, a graded provenance ledger attesting that cited identifiers are grounded in the source records actually retrieved at runtime and DOI retraction-screened against Crossref. It does not yet name which connector lane produced each citation.)*
3. **Phase 24 connectors (notion-sync, newsletter-publisher) are wired but disabled.** Leave disabled until there's a reason to publish; revisit alongside the Phase 31 deployment decision.
4. No rogue, duplicate, or dead-path registrations were found — the alignment work here is **documentation**, not reconfiguration.
