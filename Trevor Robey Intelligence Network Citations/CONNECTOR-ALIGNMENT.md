# CONNECTOR-ALIGNMENT — which connector serves which business function

> **Snapshot (2026-07-16).** A human-readable map of every connector to its business function, and — the part that trips people up — **which connectors the research engine can actually use vs. which only work in chat.** The machine-readable source of truth is [`config/connector-registry.json`](config/connector-registry.json) (39 connectors, schema-versioned, with `bound_roles` and `bound_workflow_steps` per connector); this doc summarizes and explains it. When the two diverge, the registry wins. Recommendations are tagged *(recommendation)*.

> **Update (2026-10-21).** The registry now holds **62** connectors (27 subprocess-mcp · 11
> tooluniverse-tool · 24 claude-host-mcp) and a second prefetch map: the engine's business research
> profile (Table A.2). Its `operator_surfaces` ledger was checked against all three host configs
> (`~/.claude.json`, the repo `.mcp.json`, `claude_desktop_config.json`) and is complete (Table C).
> Counts in the tables below are their 2026-07-16 snapshot unless marked; `npm run audit:connectors`
> gives the live ones.

## The one thing to understand: three execution surfaces

The registry sorts every connector into one of three "surfaces." This is the single most important distinction and the source of most confusion:

| Surface | Count | Can the `run-workflow.js` engine use it? | Meaning |
|---|---|---|---|
| **subprocess-mcp** | 12 | ✅ Yes | A real project MCP under `openclaw-bridge/mcp/<slug>-mcp/`. This is what actually feeds your reports. |
| **tooluniverse-tool** | 4 | ✅ Yes (via ToolUniverse prefetch) | Exposed through the vendored Harvard ToolUniverse (~2,116 tools). |
| **claude-host-mcp** | 23 | ❌ No | Authenticated at the Claude.ai / Claude Code session level. **Chat-supervisory only** — useful when *you* are in a chat, but invisible to the automated workflow engine unless someone builds a subprocess adapter. |

So when you see "PubMed" or "ChEMBL" available in your Claude chat, that does **not** mean the report engine is using that same connector. The engine uses its own subprocess copies. Several sources exist at **both** layers (a lean subprocess version for the engine, a richer host version for chat) — that overlap is intentional and documented per-connector in the registry.

## Table A — Connectors the engine actually uses (15 product data sources)

> Was 16 until `scrape` was removed on 2026-09-18. The live count is authoritative from
> `config/connector-registry.json` via `npm run audit:connectors`, not from this heading.

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
| ~~**scrape**~~ | **REMOVED 2026-09-18** — the whitelisted-host adapter and its sidecar are deleted, not disabled. Its one working source (eLife) was restored 2026-09-19 as a key-free SearXNG `json_engine` against the public eLife API. Do not rebuild; the verify-phase gates fail the build if browser automation returns. | — |
| **newsletter-publisher** | Marketing-pack distribution — **Phase 24, disabled** | vendor-issued |
| **notion-sync** | Prospect-tracking handoff — **Phase 24, disabled** | OAuth (done) |
| **searxng-search** | Private web metasearch (key-free; superseded tavily 2026-07-04) — beyond-cutoff open-web lane | none |

> *Note:* `newsletter-publisher` and `notion-sync` are wired as subprocess connectors but belong to Phase 24, which is **disabled** — they are not active in the research flow. See [`SYSTEM-REALITY.md`](SYSTEM-REALITY.md) §4.
>
> *Added after this table was written (all engine-reachable, see the registry for each):*
> `open-targets-graphql` (07-24), `ctgov-design-benchmark` (NCT-traced, the Trial Design Benchmark
> Pack's cohort), `sec-edgar` and `nih-reporter` (09-19, context-only — they cannot ground a
> citation), `europepmc-preprints` (09-19, DOI-bearing), the
> ToolUniverse tools `dailymed`, `openfda-enforcement`, `fda-drug-labeling`, `fda-orange-book`,
> `openalex`, `doaj` (and `rxnorm`, needs investigation), plus the business-profile sources in Table A.2.

## Table B — Chat-only connectors (23, `claude-host-mcp`)

Available to you in a Claude chat, **not** to the workflow engine. Many are richer versions of Table A sources (use them for hands-on research; don't assume a report used them).

- **Richer biomedical duplicates of Table A:** pubmed-fulltext (PMC full text), clinicaltrials-enriched (endpoint analysis), open-targets-graphql, drug-search-admet (ADMET + mechanism), biorxiv-medrxiv, icd10-host-enriched, npi-host-validate, huggingface-host-rich, tooluniverse-host, semantic-search-host.
- **Specialty research:** synthesize-bio (generative genomics GEM-1 — authenticated/live; adapter `missing(design-corrected)`, a supervised remote-MCP client, **not** a prefetch source), tavily (**SUPERSEDED 2026-07-04** by searxng-search — registry tombstone, bound to nothing), research-memory (Qdrant pack memory `:6433`).
- **Pipeline plumbing:** obsidian-bridge (vault READ-BACK, context-only — Miyo `:8743` direct, `:8798` bridge fallback; **notes are written by the engine's own post-run publisher, not through this connector**, since 2026-09-22), research-memory (WIRED 2026-09-22: engine-side ingest + `research_memory_priors`, context-only; switched ON 2026-09-22 in `config/vault-publish.json`, offline embedder), scheduled-tasks, mcp-registry.
- **Operator tools (not product data):** github, gmail (no MCP path is live as of 2026-10-21: the claude.ai Gmail connector did not load and the local gated `gmail` server is out of service by operator decision since 2026-09-05), filesystem-sandboxed, sequential-thinking, context7-library-docs.
- **Procurement-gated KOL (documentation-only, added 2026-07-16):** guidepoint-expert-network, third-bridge-expert-network — `tools:[]`, adapter_status `identified-procurement-gated`; connect on the first signed KOL deal ($19,950 tier), pick one.

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
**grounded in the source records actually retrieved at runtime + DOI retraction-screened (Crossref)**,
and — since the post-research integrity layer (validated 2026-07-10) — **re-resolved per identifier
against the issuing public registry at delivery** (`citation-reresolver.js`: PMID → NCBI, NCT →
ClinicalTrials.gov v2, DOI → Crossref; VERIFIED / UNRESOLVED / UNCHECKED in the reproducibility
manifest, any UNRESOLVED id blocks delivery). Ground truth: `SYSTEM-REALITY.md` → "GAP CLOSED".

The layer also adds two mission-bundle deliverables: `deliverables/citation-integrity.md` (a graded
provenance ledger A/B/C/D from the grounded ratio; F/BLOCKED on retraction) and
`deliverables/graveyard-memo.md` (terminated/withdrawn/suspended prior programs in the indication,
each NCT-traced with the sponsor's stated stop reason — never invented — and a protocol
amendment-risk band rendered deterministically from the fetched records).

## Table A.2 — Business research profile sources (2026-10-21)

A workflow template with `"research_profile": "business"` (`business-research-pack`,
`cost-reduction-analysis`, `market-landscape`) reads `config/tool-prefetch-map.business.json` instead
of the biomedical map. Same roles, same citation gate, same re-resolution manifest; these four sources
supply identifiers the gate can ground and the re-resolver can check. Registry lane **`research`**
(with `research_profile: business`) — not the `business` lane of Table C. Detail:
[`docs/business-research-lane.md`](docs/business-research-lane.md).

| Connector | Cite as | Re-resolved at delivery by | Auth |
|---|---|---|---|
| **web-evidence** | `WEB: <12 hex>` (hash of the exact page text the model saw) | re-reading and re-hashing the run's stored snapshot — proves *what was read, from where, when*, not that the page is live or correct | none (through `searxng-search`) |
| **sec-filings-citable** | `SEC: <CIK>/<accession>` | the filing's EDGAR `index.json` (403 = UNCHECKED) | none |
| **world-bank-indicators** | `WB: <indicator>` | `/v2/indicator/<id>` — the series exists; the value is quoted as returned | none |
| **openalex-works** | `doi: …` (works without a DOI are dropped) | Crossref, plus the retraction screen | none |

No business-profile run exists on disk yet (2026-10-21); the lane is proven by its offline test suite
only. No plugin server and no Table C surface is in either prefetch map.

## Table C — Infra / ops / operator surfaces (not product)

Every server registered in `~/.claude.json` (user scope), the repo [`.mcp.json`](.mcp.json) and
`claude_desktop_config.json`, checked 2026-10-21. Full records: the registry's `operator_surfaces`.

| Server | Role |
|---|---|
| ~~**falcon**~~ | **Local falcon MCP RETIRED 2026-10-09.** Falcon is reached only from the Security Everything repo, through its Falcon-Strike lane (hosted Falcon MCP; read identity, YubiKey-armed write identity). Read + propose-only. Not a product data source. |
| **firewalla** · **sudo-gate** · **phone-gate** · **klsense-btt** | Security lane, each behind its own gate (firewalla's fw session, per-command sudo-gate touch, phone-gate's YubiKey decrypt; klsense-btt is a read-only BetterTouchTool broker). Never reachable from the engine. |
| **trinc-content** | Content creation for the business channels (YouTube · TikTok · Instagram · Facebook Page · AWS Data Exchange). Registered in the repo [`.mcp.json`](.mcp.json) 2026-09-19. **Source in the monorepo at [`Claude/trinc-content-mcp/`](../Claude/trinc-content-mcp/) since 2026-10-21**; `.mcp.json` launches the staged copy `~/.claude/mcp-servers/trinc-content/` (re-run its `install-connector.sh` after editing). **Gated since 2026-10-21:** every call needs `operator-approved-gate arm trinc-content` (verified: an unarmed call is refused). Drafts and gates copy from release-bundle deliverables and the brand canon. **Business lane — must never enter either prefetch map.** Publishing is inert: no channel has a credential and there is no send path in the code. |
| **openclaw-obsidian** | Claude Code's dispatch lane into the Command Center bridge `:8799` (repo `.mcp.json`, 2026-10-07; a closed 13-tool allowlist). It starts and watches engine runs; it is never an evidence source. Dies with Obsidian. |
| **opencode** | $0 delegation of small tasks to opencode's free models, read-only allowlist guardrail ([`_opencode-bridge/README.md`](../_opencode-bridge/README.md)). |
| **perseus-vault** · **perseus-business** | Agent memory (machine-global, and this business's repo-scoped vault). YubiKey-gated since 2026-09-15. Memory, not evidence. |
| **miyo** · **FilesystemPlus** | Claude Desktop's vault search/edit and filesystem servers. Miyo is exempt from the session gate by the operator's call. The engine's own Miyo read-back is separate and context-only. |
| **github** | Repo access (read-only, YubiKey-gated). Dev/ops. |
| **gmail** | The business mailbox is Gmail, but the local gated `gmail` server is **out of service since 2026-09-05** by operator decision (disabled, not retired — do not repair it). No MCP path to the mailbox is live. |
| ~~**cdp-pipe**~~ | **GONE 2026-09-18.** No browser automation exists on this machine and none may be installed. The only browser surface is the in-app **Claude Browser pane** (`mcp__Claude_Browser__*`, `cb` gate scope), which the operator drives interactively — it is not a product data source. |
| ~~**zoho-mail**~~ · ~~**zoho-trinc**~~ | **RETIRED 2026-10-21** (operator decision): everything is on Google Workspace. **Zoho account closed 2026-10-21; DNS checked clean the same day** (SPF Google-only, no Zoho DKIM or verification record). Never register or bind either again; the session gate no longer lists them, so a new registration would be ungated. Gmail does not hold the Zoho-era history (only 17 pre-cutover conversations were found before the delete), so the 2026-07-22 "1,251/1,251 imported" count is not evidence that it does. Canonical record: `03-platforms/google-workspace/google-workspace.md`. |

The AWS Management Console is reached through the in-app **Claude Browser pane**, operator-driven and
YubiKey-gated (`cb` scope) — not through the product pipeline. *(Corrected 2026-09-19: this line
previously described a Claude-for-Chrome extension profile. That lane was retired 2026-09-18 and no
Chrome extension lane exists or may be installed.)*

## Gaps & recommendations

1. **Unauthenticated connectors — corrected 2026-10-21** (this item used to recommend Owkin first; the
   2026-07-29/31 verification in `PLUGIN-BINDINGS.md` reversed that). Still unauthenticated: BioRender,
   Synapse, Wiley and Owkin (bio-research plugin copies) and alphaXiv (host). *(Recommendation, as
   recorded in `config/plugin-bindings.json` → `oauth_posture`)* authorize **BioRender only**, through
   claude.ai connector settings; Synapse only if its datasets are wanted; **do not** authorize Wiley
   (already reachable through the connected Scholar Gateway connector) or Owkin (duplicates the engine's
   `owkin-mcp`); read alphaXiv's terms before its first OAuth, then register it within 7 days. The
   `data` plugin's six needs-auth servers all map to NONE — leave them. Synthesize Bio is recorded as
   `blocked-operator-decision` in the registry and did not load in the 2026-10-21 session.
2. **Overlap is intentional but undocumented for buyers.** A deliverable should state which lane produced a citation if you ever expose the pipeline to a buyer; the engine uses the lean subprocess lane. *(Update 2026-06-12: partially addressed — every mission bundle now ships `deliverables/citation-integrity.md`, a graded provenance ledger attesting that cited identifiers are grounded in the source records actually retrieved at runtime and DOI retraction-screened against Crossref. It does not yet name which connector lane produced each citation.)*
3. **Phase 24 connectors (notion-sync, newsletter-publisher) are wired but disabled.** Leave disabled until there's a reason to publish; revisit alongside the Phase 31 deployment decision.
4. No rogue, duplicate, or dead-path registrations were found — the alignment work here is **documentation**, not reconfiguration. *(Re-checked 2026-10-21 against all three host configs: still true. Two audit blind spots were found instead — the script reads only the biomedical prefetch map and scans only rpm plugin packages; both were checked by hand, and a tested patch is proposed to the hub session.)*
