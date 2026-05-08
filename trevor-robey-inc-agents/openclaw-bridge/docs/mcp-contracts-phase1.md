# MCP Contracts (Phase 3)

## Active contract scaffolds
- `arxiv-scholar-mcp`
- `semantic-scholar-mcp`

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
