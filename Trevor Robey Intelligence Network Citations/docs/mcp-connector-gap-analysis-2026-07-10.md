# MCP Connector Gap Analysis — 2026-07-10

**Scope:** every MCP connector / desktop extension / plugin reachable from Claude Desktop that is
relevant to citation-traced biomedical due diligence or to running the business, **excluding what
is already wired**.

**Method:** empirical local inventory (configs + `config/connector-registry.json`) → enumeration of
the official Connectors Directory → independent sweep of the MCP Registry, GitHub, and the two
major awesome-lists → direct SearXNG verification of the highest-stakes claims. Three read-only
subagents fanned out; every flagship claim below was re-checked from the main loop.

**Posture:** recommend-only. Nothing was installed and no connector state was mutated.

---

## 0. The three install surfaces are not interchangeable

Per Anthropic's own docs (`claude.com/docs/connectors/building/what-to-build`):

| | **Connector** (Directory) | **Desktop extension** (MCPB) | **Plugin** |
|---|---|---|---|
| What it is | An MCP server Claude calls, remote by default | A *local* MCP server packaged as a one-click `.mcpb` | A bundle of skills + connector references + slash commands + subagents |
| Works in | Claude.ai, Desktop, mobile, Cowork, Claude Code | Claude Desktop only | Claude Code and Cowork only |
| Installed via | Settings → Connectors | Enterprise software management (Team/Enterprise plans) | Plugin marketplace (`plugin.json` manifest) |

Two mechanics worth internalizing:

- A plugin references a remote MCP **by URL**. If you install both the plugin and the same
  Directory connector, Claude sees **one** tool set — they point at the same server. That is why
  `bio-research:pubmed` and the `6cb39404…` PubMed connector do not double up in practice.
- A plugin referencing an MCP URL that is *not* in the Directory makes that connector appear as
  **Custom** in settings.

**Caveat on enumeration:** `claude.com/docs/connectors/directory` and `claude.com/connectors`
render their grids client-side, so neither is machine-enumerable. The only enumerable catalog is
the community mirror [`rdmgator12/awesome-claude-connectors`](https://github.com/rdmgator12/awesome-claude-connectors)
(554 connectors / 30 categories, self-dated 2026-07-02), which **explicitly disclaims Anthropic
affiliation**. Category counts below are internally consistent with its own totals but are
**unverified against the live Directory**. Do not cite these counts in a client deliverable
without a logged-in check against `claude.ai/settings/connectors`.

Directory categories most relevant here: Healthcare and Life Sciences (34), Research and Academic
(8), Legal (22), Finance and Trading (69), Data and Analytics (43), Documents and Files (25).

---

## 1. Exclude list — what is already wired

Consolidated across all surfaces. This is what the gap analysis subtracts.

**Biomedical data (claude.ai connectors):** PubMed/PMC full-text, ClinicalTrials.gov (enriched:
endpoints, eligibility, sponsor, investigator), ChEMBL + ADMET + mechanism, bioRxiv/medRxiv,
Open Targets GraphQL, ICD-10-CM/PCS, NPI Registry, HuggingFace Hub (metadata-only),
Synthesize Bio (generative gene expression).

**Plugin `bio-research`:** biorxiv, c-trials, chembl, consensus, pubmed, ot, plus biorender,
owkin, synapse, wiley (all four in `needs-auth`).

**Engine subprocess MCPs (`openclaw-bridge/mcp/`):** chembl, clinicaltrials, pubmed, huggingface,
icd10, npi, owkin, arxiv, searxng, **crossref-retraction**, **ctgov-supplemental**,
**citation-reresolver**, tooluniverse wrapper, scrape adapter.

**Via vendored ToolUniverse (~2,116 tools, v1.1.10):** Europe PMC, FDA FAERS (PRR/ROR),
Open Targets, Semantic Scholar gateway.

**Infrastructure:** SearXNG (local, HTTPS `:8891`), FilesystemPlus, Falcon, Firewalla, term-bridge,
gmail (local + cloud), zoho-mail, zoho-trinc, github, cdp-pipe, Miyo/Qdrant semantic search. *(Note 2026-07-22: mail host migrated Zoho→Google Workspace Gmail; zoho-mail/zoho-trinc are archive-readers now — see `03-platforms/google-workspace/google-workspace.md`.)*

**Plugins:** `data` (amplitude, atlassian, bigquery, definite, hex — already in the engine's own
`excluded_infrastructure`), `cowork-plugin-management`, `anthropic-skills`, swift-lsp, clangd-lsp.

---

## 2. Tier 1 — official connectors worth adding (click-install)

Ranked by marginal value to the six SKUs. All are absent from the stack today.

### 2a. Citation integrity and literature — the highest-leverage additions

| Connector | What it adds | SKU mapping | Cost |
|---|---|---|---|
| **Scholar Sidekick** ✅ *installed 2026-07-10* | Resolves DOI / PMID / PMCID / ISBN / ISSN / arXiv / ADS bibcode → clean citation in 10,000+ CSL styles; **retraction check (Crossref + Retraction Watch)**, open-access check, bibliography export, `verifyCitation` fabrication check | Hardens the **Phase-30 citation-integrity gate** and `deliverables/citation-integrity.md` on *every* SKU | Anonymous works, MIT. **Free tier = 500 req/month**; overage billed per-request. See §8. |
| **Scite** | Smart citations: does a citing paper **support or contrast** the claim? Citation-context analysis | Investor Pre-Mortem, Failed Trial Archaeology — turns "N papers cite this" into "N cite it, 4 dispute it" | Freemium |
| **Elicit** | Cross-paper evidence synthesis, literature-review automation | Conference Synthesis Brief, Cross-Silo Connector Report | Freemium |
| **alphaXiv** ⚠️ *config added, OAuth pending* | Full-text search over arXiv preprints | Fills the gap your `arxiv-scholar-mcp` stub was scaffolded for and never wired | **NOT free-as-in-anonymous — full OAuth2/OIDC required.** Possible "personal use only" ToS clause, unresolved. See §8. |

Scholar Sidekick is the single best value here. Your retraction gate already screens DOIs against
Crossref; Scholar Sidekick adds **PMID/PMCID/arXiv-native** resolution plus an OA check on the same
call, which is exactly the identifier spread your citation indexes carry.

### 2b. Regulatory and pipeline intelligence

| Connector | What it adds | Note |
|---|---|---|
| **AdisInsight** (Springer/Clarivate) | Drug, trial, and pharma-pipeline intelligence | ❌ **DECIDED — DROPPED 2026-07-24; decline REAFFIRMED 2026-07-31 on different grounds.** ⚠️ **CORRECTION 2026-07-31:** the original reason — *no AdisInsight MCP server to connect to; zero results in the connector directory* — is **no longer true**. `claude mcp list` now shows `claude.ai AdisInsight: https://adisinsight-mcp.springer.com/mcp - ! Needs authentication`. This was **not** a research failure: the dated 2026-07-16 correction below names the exact live needs-auth set with AdisInsight explicitly absent, so it genuinely was not there on 07-16 or 07-24 — it appeared between 2026-07-24 and 2026-07-30 (not datable more precisely; all `mcp-needs-auth-cache.json` timestamps read 23:36–23:37 on 07-30, one refresh event). **The decline stands on its other leg:** authenticating requires a Springer Nature **institutional subscription** — only site-license terms and 'contact your licensing representative' are published, no free or self-serve tier found. **Do not re-open on the grounds that the connector exists**; revisit only if a Springer subscription is bought for another reason. It is a Springer Nature **subscription-only web database with no public MCP server and no free API**. The local `adisinsight-mcp` was deleted 2026-04-29 and its `.bak` purged 2026-05-08. **Coverage rationale:** the failed-trial intelligence it was wanted for is already delivered, citation-graded, by `ctgov-supplemental` → `ctgov_stopped_trials` → `deliverables/graveyard-memo.md` (NCT-traced stop reasons, protocol churn, LOW/MODERATE/HIGH amendment-risk). Residual delta = curated non-registry discontinuations + ex-US registries (EU-CTR/jRCT/CTRI); if ever needed, **add an EU-CTR fetcher — far cheaper than a Springer enterprise contract.** (Prior correction 2026-07-16: never was in the live needs-auth set — that set is `owkin` / `biorender` / `synapse` / `wiley` / `alphaxiv`; see §9.) |
| **Cortellis Regulatory Intelligence** (Clarivate) | Global pharma regulatory intelligence — the closest thing to multi-region EMA/MHRA/PMDA/Health Canada coverage that exists as a connector | Paid/enterprise. See §5: no free MCP covers these regulators at all. |
| **CMS Coverage Database** | Medicare national and local coverage determinations | Directly feeds payer/market-access sections; you already have ICD-10 and NPI, this completes the reimbursement triad |
| **Turquoise Health** | Hospital and payer negotiated-price transparency data | Market-access evidence generation |
| ~~**Enrichr** (Ma'ayan Lab)~~ ❌ **NOT INSTALLED — claim was wrong** | Gene-set enrichment analysis | **The Ma'ayan Lab publishes no MCP server.** Both candidates are unaffiliated third parties. See §8. |

### 2c. Expert networks — maps to a specific price tier

Your Investor Pre-Mortem **$19,950 custom tier is defined by "with KOL primary research."** Two
Directory connectors exist for exactly that and you have neither:

- **Guidepoint** — on-demand expert network, 1.6M+ advisors.
- **Third Bridge** — 100,000+ vetted transcripts across 65,000+ companies.

This is the clearest revenue-side gap in the entire analysis: the connector that operationalizes
your highest-priced SKU is one click away and unconnected. **(Update 2026-07-16: both
`guidepoint-expert-network` and `third-bridge-expert-network` were added to the registry as
documentation-only, procurement-gated entries — `identified-procurement-gated`, `tools:[]`; still
unsubscribed by design. Connect on the first signed KOL deal, pick one. See §9.)**

### 2d. Company, financial, and deal intelligence

Relevant to Investor Pre-Mortem (who else is in this indication, who funded them, what did the
sponsor tell the street) and Failed Trial Archaeology (what did the 8-K say when the trial died).

- **Quartr** — earnings-call transcripts and investor presentations.
- **Aiera** — financial events, filings, publications.
- **Daloopa** — financial KPIs extracted from 10-K/10-Q.
- **FMP** / **Fiscal.ai** — public-equity fundamentals.
- **PitchBook**, **CB Insights**, **Harmonic**, **Affinity** — private-market and deal data.
- **Bigdata.com** — also ships as a Claude Code plugin (`bigdata-com`).

All paid. There is **no official Crunchbase connector** — only a community server last pushed
2025-05 (stale, see §4).

### 2e. Legal, IP, and litigation

- **Solve Intelligence** (Legal) — patent prior-art search, claim drafting, prosecution history,
  portfolio charting. **This is the only maintained, click-install answer to your patent/FTO gap.**
- **Trellis** — state trial-court data, judge analytics.

### 2f. Business operations

You are selling $2,500–$24,950 engagements with no contract, invoicing, or data-room lane wired.

- **Docusign** / **PandaDoc** / **SignWell** / **DocuSeal** — engagement letters and SOWs.
- **Intuit QuickBooks** / **Xero** / **Stripe** — invoicing and payment for the SKU ladder.
- **Datasite** / **Entropia** — virtual data rooms for M&A diligence. Directly adjacent to what you
  sell; plausibly a *delivery* surface for client-facing report bundles.
- **AWS Marketplace** — you already sell through AWS Data Exchange (seller account `833390816446`).
  Note the existing AWS API MCP authenticates as `ReadOnlyAccess` by invariant; a Marketplace
  connector does not change that.
- **Candid** / **Instrumentl** / **Granted** — grant discovery (SBIR/STTR-adjacent, non-dilutive).

### 2g. Wet-lab / enterprise — surfaced, ranked low

**Benchling**, **Medidata**, **10x Genomics Cloud**, **LatchBio**, **Revvity Signals**, **Ketryx**,
**Boltz API**, **Inductive Bio** (ADMET — you already have ADMET via the ChEMBL host connector),
**protocols.io**, **SandboxAQ**, **EDEN by Basecamp Research**, **Biomni Lab**, **Helix GenoSphere**.

You do not run a lab. These matter only if the business moves from desk research into generating
primary data.

---

## 3. Tier 2 — self-host community MCP (no official connector exists)

These fill the gaps the Directory does not. **All of them land inside the monorepo's HTTPS-only
invariant** if run as HTTP servers — every one below defaults to stdio, which is exempt, but any
HTTP mode would need a launchd-owned TLS proxy on the pattern of the five existing ones
(`Copilot-Everything/scripts/*-tls-proxy.mjs`).

### 3a. The single highest-value find

**`biomcp`** — [github.com/genomoncology/biomcp](https://github.com/genomoncology/biomcp) · MIT ·
~547★ · pushed 2026-07-09 · docs at [biomcp.org](https://biomcp.org/)

One server fronting ~30 biomedical sources: PubTator3, Europe PMC, Semantic Scholar, UniProt, PDB,
AlphaFold, Reactome, KEGG, STRING, GWAS Catalog, cBioPortal, Human Protein Atlas, ClinVar, gnomAD,
GTEx, PharmGKB/CPIC, Drugs@FDA, openFDA (FAERS / MAUDE / recalls / labels), WHO Prequalification,
OncoKB, DisGeNET, Monarch/MONDO, NCI CTS.

> **Install gotcha (verified):** `pip install biomcp-cli` — **not** `biomcp`. The bare `biomcp`
> PyPI name is an unrelated squatted package. The repo README carries this warning itself. The
> legacy library package is `biomcp-python`.

**What is genuinely net-new to you**, after subtracting ToolUniverse and your existing connectors:
Drugs@FDA, openFDA **recalls / labels / MAUDE** (you only have FAERS), ClinVar, gnomAD, GTEx,
PharmGKB/CPIC, OncoKB, DisGeNET. Europe PMC, Semantic Scholar, Open Targets, and FAERS are
duplicates of ToolUniverse lanes.

Most commands need no key. Optional keys (`NCBI_API_KEY`, `S2_API_KEY`, `OPENFDA_API_KEY`,
`NCI_API_KEY`, `ONCOKB_TOKEN`) only lift rate limits.

### 3b. Regulatory

| Server | Gives you | Licence · freshness |
|---|---|---|
| [`cyanheads/openfda-mcp-server`](https://github.com/cyanheads/openfda-mcp-server) | Drugs@FDA, FAERS, recalls, device, food | Apache-2.0 · 2026-07-03 |
| [`QuentinCody/fda-orange-book-mcp-server`](https://github.com/QuentinCody/fda-orange-book-mcp-server) | **Orange Book patent + exclusivity listings** — loss-of-exclusivity analysis for Investor Pre-Mortem | no licence declared · 0★ · 2026-06-19 · **UNVERIFIED maturity** |
| [`openpharma-org/ema-mcp`](https://github.com/openpharma-org/ema-mcp) | EMA approvals, EPARs, orphan designations | MIT · 1★ · 2026-01-27 (~6mo stale) |

Orange Book is the highest-value item in this sub-table and the least proven. Budget a spike to
validate it before depending on it.

### 3c. SEC filings — a licensing fork in the road

| Server | Stars · freshness | Licence |
|---|---|---|
| [`stefanoamorelli/sec-edgar-mcp`](https://github.com/stefanoamorelli/sec-edgar-mcp) | 331★ · 2026-06-29 | **AGPL-3.0** |
| [`cyanheads/secedgar-mcp-server`](https://github.com/cyanheads/secedgar-mcp-server) | 6★ · 2026-07-10 | Apache-2.0 |

The popular one is AGPL. Running it locally to produce a PDF you hand a client is almost certainly
fine — AGPL's network clause triggers on *offering the software itself* as a network service, not
on distributing its output. But you sell paid deliverables, the analysis is not free, and the
Apache-2.0 alternative exists. **Prefer `cyanheads/secedgar-mcp-server`** unless you need the
maturity of the 331★ option, and get an actual read on the obligations before you do.

### 3d. Scholarly infrastructure

- [`cyanheads/pubmed-mcp-server`](https://github.com/cyanheads/pubmed-mcp-server) — 121★, Apache-2.0,
  2026-06-30. **PubMed + Europe PMC + Unpaywall in one server.** Most-starred single-purpose
  literature server found.
- [`cyanheads/openalex-mcp-server`](https://github.com/cyanheads/openalex-mcp-server) — Apache-2.0,
  2026-07-10. 270M+ works.
- [`cyanheads/crossref-mcp-server`](https://github.com/cyanheads/crossref-mcp-server) — Apache-2.0.
  DOI resolution over ~155M works.
- [`smaniches/semantic-scholar-mcp`](https://github.com/smaniches/semantic-scholar-mcp) — MIT, 11★,
  2026-07-08. 200M+ papers, citation graphs.

> **Retraction note.** Retraction Watch's dataset was absorbed into Crossref in 2023. Your existing
> Phase-30 Crossref gate is already checking at the source of truth. `retraction-watch-mcp` (0★) is
> a document-scanning UX layer, not new data. **Skip it.**

### 3e. Target biology — the two institution-maintained finds

These are not Anthropic connectors, but they are maintained by the source institutions themselves,
which is a stronger provenance signal than either:

- [`rcsb/rcsb-mcp`](https://github.com/rcsb/rcsb-mcp) — MIT, 2026-07-09. Owned by the **RCSB PDB**
  GitHub org.
- [`meringlab/string-mcp`](https://github.com/meringlab/string-mcp) — MIT, 2026-06-12. DNS-verified
  `org.string-db` MCP-registry namespace; the von Mering lab that runs STRING-db.

Also worth a look given your posture: [`smaniches/uniprot-mcp`](https://github.com/smaniches/uniprot-mcp)
(Apache-2.0, 2026-07-06) emits **per-response SHA-256 provenance hashes and pins the UniProt release**.
That is the same idea as your citation-grounding gate, applied at the source-record level.

### 3f. Chemistry

- [`cyanheads/pubchem-mcp-server`](https://github.com/cyanheads/pubchem-mcp-server) — Apache-2.0, 9★.
- [`openpharma-org/drugbank-mcp-server`](https://github.com/openpharma-org/drugbank-mcp-server) — 10★,
  no licence declared. **DrugBank's own API is paid/licensed** — this is a client only. Verify
  DrugBank's terms before any commercial use.

### 3g. Patents

- [`smythmyke/patent-search-mcp-server`](https://github.com/smythmyke/patent-search-mcp-server) — MIT,
  2★, 2026-06-08. Google Patents + USPTO, prosecution history, PTAB, family/citation graph.
- [`tushariitr-19/patents-mcp`](https://github.com/tushariitr-19/patents-mcp) — MIT, 3★. Google
  Patents public BigQuery dataset, free.

Both are small. **Solve Intelligence** (§2e) is the maintained answer if you can pay for it.

---

## 4. Do not install

- **The `pipeworx-io` factory suite** (~100 repos: `mcp-kegg`, `mcp-reactome`, `mcp-crossref`,
  `mcp-unpaywall`, `mcp-lens-org`, `mcp-europepmc`, `mcp-rcsb-pdb`, `mcp-alphafold`, …). Nearly all
  0★, MIT, committed in tight same-hour batches across dozens of repos, feeding a commercial hosted
  gateway ("4,600+ tools… one MCP"). Auto-generated stubs. Treat every individual repo as
  **unverified functional quality** until you have personally run it. Several of these are the
  *only* MCP option for a given source — that is a reason for caution, not for trust.
- [`malkreide/MCP-Server-for-patent-research`](https://github.com/malkreide/MCP-Server-for-patent-research-)
  (Espacenet/EPO OPS) — **repo is ARCHIVED**. Do not build on it.
- `Cyreslab-AI/crunchbase-mcp-server` — last push 2025-05, **>12 months stale**.
- `JackKuo666/PubTator-MCP-Server` — last push 2025-03, **>12 months stale**. Use `biomcp`'s
  PubTator3 leg instead.
- `Augmented-Nature/OpenFDA-MCP-Server` and `Augmented-Nature/SureChEMBL-MCP-Server` — both
  2025-12 (~7 months, borderline), both `NOASSERTION` licence (no licence file).

---

## 5. Confirmed nonexistent — nobody has built these

Searched the MCP Registry, GitHub repo/code search, `punkpeye/awesome-mcp-servers`,
`wong2/awesome-mcp-servers`, and the Directory. **Zero verified results.** Do not assume these
exist somewhere and keep looking:

**MHRA** · **PMDA** · **WHO ICTRP** · **EudraCT / EU CTR** · **FDA Purple Book (biologics)** ·
**FDA warning letters** (as a standalone; only touched obliquely via openFDA wrappers) ·
**UMLS** (also requires an NLM Metathesaurus licence regardless of tooling) · **ZINC** ·
a maintained **Espacenet / EPO OPS** server · **Lens.org** (the only option lives inside the
low-trust pipeworx-io suite and needs a paid academic key).

For the non-US regulators specifically, **Cortellis (§2b) is the only real answer**, and it is paid.

---

## 6. Duplicates worth pruning

The stack reaches the same data source through up to three lanes. Each lane is a maintenance
surface and a divergence risk when a schema changes.

| Source | Lanes |
|---|---|
| PubMed | subprocess `pubmed-mcp` + host `pubmed-fulltext` (`6cb39404…`) + plugin `bio-research:pubmed` |
| ClinicalTrials.gov | subprocess `clinicaltrials-mcp` + host `clinicaltrials-enriched` (`e1fbcace…`) + plugin `bio-research:c-trials` |
| ChEMBL | subprocess `chembl-mcp` + host `drug-search-admet` (`efb88440…`) + plugin `bio-research:chembl` |
| Open Targets | ToolUniverse leg + host `open-targets-graphql` (`deb8af66…`) + plugin `bio-research:ot` |
| ICD-10, NPI, HuggingFace | subprocess + a richer host connector each |
| ToolUniverse | vendored subprocess (primary) + host connector the engine's own registry labels `duplicate-of-subprocess-tooluniverse` |
| Gmail | local YubiKey-gated `gmail_mcp.py` + cloud Gmail connector (`ef0bc6fb…`) — two independent auths |
| Web search | local `searxng-search` (canonical) + **Tavily** (`11a574c2…`), marked `superseded` in-repo since 2026-07-04 and likely inert |

**Tavily is dead weight.** It is explicitly superseded in your own registry. Removing it removes an
API-key-bearing cloud connector for nothing.

---

## 7. One open security item

`7bb47381…` mounts a single tool named **`semanticSearch`**. Your own
`config/connector-registry.json` already flags it:

> `"purpose": "Generic semantic search connector. Underspecified at host level — needs
> investigation before binding."` · `adapter_status: "needs-investigation"`

An independent grep found the literal name `semanticSearch` in exactly one place in the monorepo —
a LangChain tool *inside* the Obsidian Copilot plugin process
(`Copilot-Everything/repos/obsidian-copilot-mcp/src/tools/SearchTools.ts`) — which is **not exposed
as a network-reachable MCP server**. Since claude.ai-hosted cloud connectors cannot reach this
machine's loopback, **this is very unlikely to be Miyo/Qdrant.** It is most plausibly an unrelated
third-party SaaS connector installed and never labeled.

An unlabeled cloud connector with an opaque search tool, mounted into every session, is an
unresolved data-egress question. Recommend: identify it in `claude.ai/settings/connectors`, or
remove it. This is a propose-only finding; no action was taken.

---

## Recommended sequence

1. ~~**Free, high-leverage, today:** Scholar Sidekick, alphaXiv, Enrichr.~~ **Superseded — see §8.** Adversarial verification on 2026-07-10 showed only Scholar Sidekick is free-and-anonymous; alphaXiv is OAuth-gated; Enrichr has no authentic server.
2. **Resolve the security item:** identify or remove `7bb47381… semanticSearch`; drop Tavily.
3. **Revenue-unblocking:** evaluate Guidepoint or Third Bridge — the $19,950 KOL tier depends on it. *(Both now in the registry as procurement-gated placeholders, added 2026-07-16 — connect one on the first signed KOL deal. See §9.)*
4. **Spike `biomcp`** (`pip install biomcp-cli`) behind the role-prefetch path; measure what it adds
   over ToolUniverse before wiring it into a gate.
5. **Then:** `cyanheads/secedgar-mcp-server` (Apache-2.0) and the FDA Orange Book server, both for
   Investor Pre-Mortem; validate Orange Book before depending on it.
6. **Paid, deliberate:** Cortellis (non-US regulators), Solve Intelligence (patents/FTO), AdisInsight.

---

---

## 8. Install record + corrections — 2026-07-10 (adversarial verification pass)

Before installing, each of the four "free, high-leverage" picks from §Recommended-sequence step 1 was
put through a research agent plus **three adversarial verifiers** (liveness / name-squatting /
auth-and-terms), then every load-bearing endpoint was re-probed by hand. **The verification refuted
several claims made earlier in this very document.** Corrections are folded in above; the reasoning
is here.

### Installed and working

**`scholar-sidekick`** → `https://scholar-sidekick.com/api/mcp` (remote HTTP MCP, user scope).

Probed directly: `POST initialize` → `HTTP 200`, `serverInfo {name: scholar-sidekick, version: 0.8.0}`,
protocol `2025-06-18`. `claude mcp list` → **✔ Connected**. Six tools: `formatCitation`,
`exportCitation`, `resolveIdentifier`, `checkRetraction`, `checkOpenAccess`, `verifyCitation`.

Exercised end-to-end against controls:

| Control | Call | Result |
|---|---|---|
| Wakefield 1998 Lancet MMR, `10.1016/S0140-6736(97)11096-0` (retracted 2010) | `checkRetraction` | `isRetracted: true`, `hasCorrections: true`, notices = 2004 correction + **2010 retraction**, source `retraction-watch` |
| NEJM COVID paper, PMID `31978945` | `checkRetraction` | `isRetracted: false`, `notices: []` |
| Same PMID | `checkOpenAccess` | `isOa: true`, `oaStatus: green`, best location resolved |

> **The load-bearing finding.** `checkRetraction` accepts a bare **PMID**, resolves it to a DOI
> (`resolvedFrom: {type: "pmid"}`), and *then* screens it. The Phase-30 gate today screens only
> **DOIs** against Crossref — meaning every citation that carries a PMID but no DOI currently passes
> retraction screening unchecked. In biomedical citation indexes that is the majority of rows. This
> is a real hole in the citation-integrity gate and Scholar Sidekick closes it.

Authenticity: MIT (confirmed on both npm and the GitHub API), maintainer `mlava`, npm
`scholar-sidekick-mcp` (v0.8.0) and the remote endpoint trace to the same first-party source. No
squatter found. Note `https://scholar-sidekick.com/mcp` (without `/api/`) is a **marketing page**,
not a protocol endpoint — the working URL is `/api/mcp`.

**⚠️ Volume caveat (this refuted the "free, no key for light use" line above).** The vendor's
documented free BASIC tier is **500 requests/month (~16/day)**, described as being for "hobby
scripts, low-volume agents." Pure anonymous access is never quantified anywhere in their docs. Past
the quota, "requests are billed per-request." A single citation-heavy report could exhaust 500/month.
**Action:** register a free `ssk_` bearer key at `scholar-sidekick.com/account` and add it as an
`Authorization: Bearer` header; budget a paid tier before this goes into the production gate. Their
API terms also carry an **attribution clause** ("include a visible reference to Scholar Sidekick") —
relevant because these are paid client deliverables.

### Config added, OAuth pending (you must complete these interactively)

**`alphaxiv`** → `https://api.alphaxiv.org/mcp/v1` — `claude mcp list` → `! Needs authentication`.

Authentic (OAuth discovery chain resolves to alphaXiv's own `api.alphaxiv.org/auth`). But it is
**not "Free"** as this document originally claimed: it requires a full OAuth2/OIDC account grant
(`authorization_code`, `client_credentials`, PKCE S256), not an optional key.

**⚠️ Unresolved commercial-use question.** Research surfaced a "personal use only" clause in
alphaXiv's terms. The verifier could **not** re-confirm it — `alphaxiv.org/terms` and even the bare
homepage return `403` to every fetcher (bot-detection middleware; `robots.txt` is permissive). So the
clause is **plausible-but-unverified, not disproven**. Before any output from alphaXiv reaches a paid
deliverable, read the terms in a browser. If "personal use only" is real, this connector is
disqualified for the business and should be removed.

### NOT installed — the premise was false

**Enrichr.** This document previously described it as "Free, institution-maintained." **That was
wrong**, and the impersonation verifier refuted it outright:

- The **Ma'ayan Lab publishes no MCP server.** Their GitHub org (`MaayanLab`, 30+ repos) contains
  zero repos matching "mcp" or "model context protocol". `maayanlab.cloud/Enrichr` never mentions
  MCP, Claude, or Anthropic.
- Both existing candidates are **unaffiliated third parties squatting a generic name**:
  - `tianqitang1/enrichr-mcp-server` — 15★, **148 npm downloads/month**, README claims MIT but
    GitHub detects **no LICENSE file**.
  - `QuentinCody/enrichr-mcp-server` — **0★, 0 forks, no LICENSE at all**, one of ~100
    mass-produced single-purpose bio-MCP wrappers by the same author. This is the identical pattern
    §4 of this document already told you not to install.

Installing either would mean `npx -y`-executing an unlicensed, low-adoption package from an
unaffiliated author on a machine whose Falcon Custom-IOA rule 1 exists precisely to block
download-and-execute chains. **Declined.**

If you still want Enrichr: the safe route is to click the **"Enrichr MCP Server"** entry in the
Claude Connectors Directory, where Anthropic's review applies and nothing executes locally — while
understanding it is a community wrapper over the free public Enrichr REST API, not a Ma'ayan Lab
product. The genuinely authentic source is the Enrichr REST API itself (`maayanlab.cloud/Enrichr`),
which needs no key and could be wrapped in-house as a subprocess MCP alongside the existing seven.

### Rollback

Configs were snapshotted first: `~/.claude.json.bak-20260710-054416` and
`~/Library/Application Support/Claude/claude_desktop_config.json.bak-20260710-054416`.
To undo: `claude mcp remove scholar-sidekick -s user` (likewise `alphaxiv`).

All three are HTTPS remote endpoints, so the monorepo's HTTPS-only invariant is satisfied and no
TLS proxy is needed — none of them is a TCP listener owned by repo code.

---

## 9. Addendum — 2026-07-16 (registry reconciliation)

State changes since this 2026-07-10 analysis, reconciled against the live
`config/connector-registry.json` (now **39 connectors**):

- **Guidepoint + Third Bridge are now in the registry** (§2c superseded). Added as
  **documentation-only, procurement-gated** entries: `execution_surface: claude-host-mcp`,
  `tools: []`, `adapter_status: identified-procurement-gated`. Nothing is subscribed — the recorded
  posture is "connect on the first signed $19,950 KOL deal, pick one." §2c's "you have neither / one
  click away and unconnected" is now a recorded decision, not an open gap.
- **Synthesize Bio is authenticated and its adapter design was corrected.** Its claude.ai host OAuth
  is complete and its tools are live. The earlier "build a chembl-style REST adapter + wire it into
  the prefetch map" intent was **wrong**: verified against the live tool schemas +
  docs.synthesize.bio, its API is itself a remote MCP server (`app.synthesize.bio/api/mcp`, Bearer,
  env `SYNTHESIZE_API_KEY`) and every capability is async / stateful / generation-budget-metered
  (`resolve → analyze[job] → poll → counts`); `get_metadata_schema` is the only static/free call and
  `annotate_genes` does not exist on the live surface. Correct design = a supervised remote-MCP
  client (a deliberate generative workflow step), **never** the deterministic prefetch seam. Blocked
  on the operator's API key + a per-run generation-budget decision. (Registry entry +
  `.learnings/FEATURE_REQUESTS.md [FEAT-20260511-001]` updated.)
- **AdisInsight is not a live needs-auth connector** (§2b corrected). The live unauthenticated
  biomedical set is exactly `owkin` (host-side) / `biorender` / `synapse` / `wiley` / `alphaxiv`;
  AdisInsight is not registered.
- **Tavily** remains a superseded (2026-07-04) registry tombstone bound to nothing — §6's "drop
  Tavily" recommendation still stands and is unactioned.

---

*Generated 2026-07-10; addended 2026-07-16 (§9 — Guidepoint/Third Bridge now registered as procurement-gated; Synthesize Bio authenticated + adapter design corrected; AdisInsight is not a live needs-auth connector; registry now holds 39 connectors). §1–7 were recommend-only. §8 records the 2026-07-10 install pass, in which
adversarial verification refuted four claims made in §2 of this same document — those claims have
been struck or corrected in place. Directory counts derive from an unofficial community mirror and
are unverified against the live Directory.*
