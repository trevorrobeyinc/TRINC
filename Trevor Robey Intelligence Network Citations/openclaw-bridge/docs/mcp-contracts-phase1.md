# MCP Contracts (Phase 3)

## Active contract scaffolds
- `arxiv-scholar-mcp`
- `semantic-scholar-mcp`

## Citation-integrity contracts
- `ctgov-supplemental` — local fetcher (not ToolUniverse) for stopped-trial archaeology: searches ClinicalTrials.gov API v2 for TERMINATED/WITHDRAWN/SUSPENDED trials in a condition, returning each trial's `whyStopped` text plus protocol change-history (version count + most-amended modules) with a session cache. Routed into role prefetch through the local-fetcher seam in `tool-prefetch.js` (`createToolPrefetch` `options.localFetchers`) under tool name `ctgov_stopped_trials`; each record is NCT-traced.
- `crossref-retraction` — DOI retraction screen against Crossref `/works/{DOI}` (`relation.is-retracted-by` / update type `retraction`). Fail-soft (a Crossref error yields no retractions, so a network blip never wrongly blocks a report). Wired into the report-level citation gate via `researchRuntime`.

## Operator-gated publisher and sync contracts
- `newsletter-publisher-mcp`
- `notion-sync-mcp`

## Validation requirements
- Strict Zod object schemas.
- Unknown fields rejected.
- Bounded pagination/depth.
- Deterministic canonical record schema with version-salted hash.

## Runtime boundary
Publisher/sync MCPs remain unavailable through `research.search` and `research.getPaper`, which must return `MCP_NOT_IMPLEMENTED`.
Operator-facing mutation flows are limited to governed `prepare`, `commit`, `retry`, and `reconcile` lifecycles with approval scopes and local Phase 24 briefing artifacts.
