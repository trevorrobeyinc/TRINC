# Phase 16 MCP Ingestion

## Objective
Phase 16 adds research ingestion connectors and deterministic normalization/indexing pipelines for local knowledge processing.

## Connectors
- `integrations/mcp/mcp-client.js`
- `integrations/mcp/arxiv-client.js`
- `integrations/mcp/semantic-scholar-client.js`

## Ingestion Workflow
- `workflows/research-ingestion/ingestion-pipeline.js`
- `workflows/research-ingestion/normalizer.js`
- `workflows/research-ingestion/citation-metrics.js`
- `workflows/research-ingestion/source-ledger.js`

Output paths:
- `workspace/research-raw/`
- `workspace/research-normalized/`
- `workspace/research-index/`

## Local-Fetcher Ingestion Seam (post-research engine, 2026-06-12)
Separate from the connectors above, the active workflow research path
(`openclaw-bridge/core/tool-prefetch.js`) gained a generic local-fetcher seam
(`createToolPrefetch` `options.localFetchers`: `tool_name` → async fetcher) that runs alongside the
ToolUniverse SMCP, so a local source plugs into role prefetch as a normal tool. Two local fetchers ship:
- `openclaw-bridge/mcp/ctgov-supplemental/ctgov-supplemental.js` (tool `ctgov_stopped_trials`) —
  searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition and
  returns each trial's sponsor-stated `whyStopped` plus protocol change-history (version count +
  most-amended modules, from the internal `/api/int/.../history` endpoint); session-cached; every
  record NCT-traced. Fail-soft (network/parse error → `[]`, never breaks a run).
- `openclaw-bridge/mcp/crossref-retraction/crossref-retraction.js` — checks each cited DOI against
  Crossref `/works/{DOI}` for retraction; consumed by the report-level citation gate.

These feed (a) the zero-fabrication citation gate (`core/citation-gate.js` `verifyReportCitations`, run
in `workflow-engine.executeMissionStep`; hard-fails `PHASE30_CITATION_UNVERIFIED`, or
`PHASE30_CITATION_RETRACTED` on a retracted DOI), and (b) the two new mission-bundle deliverables —
`deliverables/citation-integrity.md` (graded provenance ledger) and `deliverables/graveyard-memo.md`
(NCT-traced stopped-program memo + LOW/MODERATE/HIGH amendment-risk band) — both rendered
deterministically from the fetched records (no LLM). Cited identifiers are thereby grounded in the
source records actually retrieved at runtime + DOI retraction-screened; they are NOT independently
re-resolved against a live external database.

## Determinism and Integrity
- Canonical paper keys for stable dedupe.
- Stable sorting of normalized records.
- Source ledger append-only chain hash.
- Tamper detection through `verifyChainIntegrity()`.

## Network Isolation
Allowed network paths for Phase 14–17 code:
- `openclaw-bridge/core/llm-adapter.js`
- `integrations/mcp/*`

All other newly added modules are network-free.

## Supervisor and Governance Boundaries
- Ingestion remains orchestrated under supervisor/governance pipelines.
- Export/publish actions remain dry-run unless explicit operator confirmation is provided.

## Verification
```bash
bash scripts/verify-phase16-policy.sh
node --test tests/core/phase16-ingestion-pipeline.test.js
node --test tests/security/phase16-policy-gate.test.js
```
