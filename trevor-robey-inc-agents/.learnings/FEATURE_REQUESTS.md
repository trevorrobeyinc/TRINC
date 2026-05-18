# Feature Requests

Tracked by audit-connector-coverage.js and operator notes.

## [FEAT-20260511-001] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for synthesize-bio (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `synthesize-bio` is bound in `config/connector-registry.json` to roles analyst, molecular_profiler, competitive_intel_analyst and workflow steps rare-disease-brief#research, target-validation-pack#research, drug-discovery-full#research, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: load-bearing. Purpose: Generative genomics (GEM-1) — predicts gene expression for in-silico cohorts; the ONLY generative-rather-than-retrieval lane in the stack. Underwrites the rare-disease cohort-expansion section of Investor Pre-Mortem and the synthetic-control-arm section of Trial Design Benchmark Pack.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/synthesize-bio-mcp/ (follow chembl-mcp/ scaffold: index.js + schema.js + tool-descriptions.js)` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: annotate_genes(['ENSG00000141510']) returns TP53/p53 symbol.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/synthesize-bio-mcp/ (follow chembl-mcp/ scaffold: index.js + schema.js + tool-descriptions.js)
- Tags: connector, adapter, mcp, load-bearing
- connector-id: synthesize-bio
- tool-prefix: mcp__c61b22f1-bde2-44d1-8e91-8e2fe4082ba6__

## [FEAT-20260511-002] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for tavily (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `tavily` is bound in `config/connector-registry.json` to roles scout, quality_auditor, report_generator and workflow steps drug-discovery-full#quality_check, pharmacovigilance-report#quality_check, target-validation-pack#quality_check, rare-disease-brief#quality_check, clinical-trial-landscape#quality_check, general-research-pack#quality_check, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: load-bearing. Purpose: AI-optimized open-web search and extraction past Claude training cutoff. Required for the no-hallucinations gate — every claim that references an external product/company/URL/process is verified through Tavily before being asserted.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/tavily-mcp/` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: tavily_search({query: 'FDA approval pembrolizumab 2024', max_results: 1}) returns at least one result with URL.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/tavily-mcp/
- Tags: connector, adapter, mcp, load-bearing
- connector-id: tavily
- tool-prefix: mcp__11a574c2-a267-4a04-863c-78ae1342fc0d__

## [FEAT-20260511-003] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: high
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for open-targets-graphql (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `open-targets-graphql` is bound in `config/connector-registry.json` to roles scout, molecular_profiler, competitive_intel_analyst and workflow steps target-validation-pack#research, drug-discovery-full#research, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: load-bearing. Purpose: Target-disease association evidence with GraphQL flexibility — load-bearing for Target Validation Pack and Cross-Silo Connector Report. Existing tool-prefetch-map.json references OpenTargets_get_drug_id_description_by_name (ToolUniverse) — this richer GraphQL adapter would replace/complement it.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/open-targets-graphql-mcp/` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: search_entities({query: 'TP53'}) returns ENSG00000141510.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/open-targets-graphql-mcp/
- Tags: connector, adapter, mcp, load-bearing
- connector-id: open-targets-graphql
- tool-prefix: mcp__deb8af66-16fd-4ea2-a9ad-8a2f7add60b7__

## [FEAT-20260511-004] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for pubmed-fulltext (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `pubmed-fulltext` is bound in `config/connector-registry.json` to roles literature_reviewer, synthesizer and workflow steps drug-discovery-full#quality_check, general-research-pack#research, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: high. Purpose: PubMed Central full-text retrieval (richer than subprocess pubmed-mcp which is metadata-first). Required for citation-density quality formula on Failed Trial Archaeology and Investor Pre-Mortem.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/pubmed-fulltext-mcp/` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: search_articles({query: 'KRAS G12C', limit: 1}) returns PMID with full-text URL.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/pubmed-fulltext-mcp/
- Tags: connector, adapter, mcp, high
- connector-id: pubmed-fulltext
- tool-prefix: mcp__6cb39404-df07-4b18-8c1e-84348b5903de__

## [FEAT-20260511-005] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for drug-search-admet (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `drug-search-admet` is bound in `config/connector-registry.json` to roles molecular_profiler and workflow steps drug-discovery-full#research, target-validation-pack#research, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: high. Purpose: ADMET predictions + mechanism-of-action lookup — load-bearing for Trial Design Benchmark Pack physicochemical sections. Complements ChEMBL bioactivity with predicted vs. measured.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/drug-admet-mcp/` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: compound_search('imatinib') returns PubChem CID 5291.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/drug-admet-mcp/
- Tags: connector, adapter, mcp, high
- connector-id: drug-search-admet
- tool-prefix: mcp__efb88440-c38c-4fba-aeb7-f3270490e9dc__

## [FEAT-20260511-006] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for clinicaltrials-enriched (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `clinicaltrials-enriched` is bound in `config/connector-registry.json` to roles competitive_intel_analyst, report_generator and workflow steps clinical-trial-landscape#research, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: high. Purpose: ClinicalTrials.gov enrichment with endpoint analysis, eligibility filtering, sponsor + investigator search — replaces basic clinicaltrials-mcp lookup for Trial Design Benchmark Pack and Failed Trial Archaeology.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/clinicaltrials-enriched-mcp/` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: analyze_endpoints with a known NCT id returns endpoint breakdown.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/clinicaltrials-enriched-mcp/
- Tags: connector, adapter, mcp, high
- connector-id: clinicaltrials-enriched
- tool-prefix: mcp__e1fbcace-eff5-41e6-95c2-69e2dedf64b3__

## [FEAT-20260511-007] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for biorxiv-medrxiv (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `biorxiv-medrxiv` is bound in `config/connector-registry.json` to roles literature_reviewer, competitive_intel_analyst and workflow steps general-research-pack#research, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: high. Purpose: bioRxiv/medRxiv preprint discovery — critical for Conference Synthesis Brief deliverables where peer-reviewed publication is months away. Load-bearing for early-signal detection in Failed Trial Archaeology.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/biorxiv-medrxiv-mcp/` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: search_preprints({query: 'KRAS G12C', limit: 1}) returns DOI.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/biorxiv-medrxiv-mcp/
- Tags: connector, adapter, mcp, high
- connector-id: biorxiv-medrxiv
- tool-prefix: mcp__d3109d6a-2eec-4d76-b38b-e7e707fff0e7__

## [FEAT-20260511-008] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for research-memory (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `research-memory` is bound in `config/connector-registry.json` to roles synthesizer, report_generator and workflow steps drug-discovery-full#build_dataset, pharmacovigilance-report#build_dataset, target-validation-pack#build_dataset, rare-disease-brief#build_dataset, clinical-trial-landscape#build_dataset, general-research-pack#build_dataset, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: high. Purpose: Persistent Qdrant-backed research-pack memory. Lets the synthesizer/report_generator pull priors from previous workflow runs (similar indications, prior KOL findings) instead of re-discovering them. Cross-workflow continuity.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/research-memory-mcp/ (uses existing qdrant-tls-proxy on :6433 — see HTTPS-only invariant in root CLAUDE.md)` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: pack_list returns at least one pack id from prior workflow runs.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/research-memory-mcp/ (uses existing qdrant-tls-proxy on :6433 — see HTTPS-only invariant in root CLAUDE.md)
- Tags: connector, adapter, mcp, high
- connector-id: research-memory
- tool-prefix: mcp__trevorobeyinc-research-memory__

## [FEAT-20260511-009] adapter-missing

**Logged**: 2026-05-11T01:41:59.063Z
**Priority**: medium
**Status**: pending
**Area**: backend

### Summary
Build subprocess adapter for obsidian-bridge (currently claude-host-mcp only; invisible to run-workflow.js).

### Details
Connector `obsidian-bridge` is bound in `config/connector-registry.json` to roles report_generator and workflow steps drug-discovery-full#export, pharmacovigilance-report#export, target-validation-pack#export, rare-disease-brief#export, clinical-trial-landscape#export, general-research-pack#export, but has `adapter_status: missing` — it is reachable only at the Claude-host level and cannot be called from `run-workflow.js` subprocess. Business value: high. Purpose: Vault read/write for delivery-pack note generation and post-workflow Zettelkasten analysis handoff. The Command Center plugin already invokes these on workflow completion — registry binding documents intent so subprocess adapter (if built) maintains parity.

### Suggested Action
Scaffold adapter at `openclaw-bridge/mcp/obsidian-bridge-mcp/ (would proxy to the canonical bridge on :8798 — DO NOT create a parallel vault listener; see HTTPS-only invariant)` following the `openclaw-bridge/mcp/chembl-mcp/` pattern (index.js + schema.js + tool-descriptions.js). Wire into `config/tool-prefetch-map.json` for the roles listed above. Add health check: obsidian_health returns ok.

### Metadata
- Source: connector-registry-audit
- Related Files: config/connector-registry.json, config/tool-prefetch-map.json, openclaw-bridge/mcp/obsidian-bridge-mcp/ (would proxy to the canonical bridge on :8798 — DO NOT create a parallel vault listener; see HTTPS-only invariant)
- Tags: connector, adapter, mcp, high
- connector-id: obsidian-bridge
- tool-prefix: mcp__obsidian-bridge__

