# Architectural Blueprint

## System Overview

Medical Zettelkasten MCP is a standalone graph analysis server that bridges biomedical research data (OpenClaw/ToolUniverse) with knowledge management (Copilot MCP/Obsidian).

## ADR-001: Reimplement Algorithms from Papers

**Decision**: Reimplement all 5 InfraNodus algorithms from academic papers rather than extracting from the InfraNodus codebase.

**Context**: InfraNodus source is tightly coupled to Neo4J for all graph operations. Extraction would require rewriting ~80% of each algorithm.

**Consequences**: Zero licensing concerns. Zero-dependency graph code. Higher upfront work but cleaner result.

## ADR-002: No External Graph Libraries

**Decision**: Implement graph data structure and all algorithms in pure JavaScript with zero graph library dependencies.

**Context**: Libraries like graphology or cytoscape.js would add large dependency trees for features we won't use. The algorithms (betweenness centrality, Louvain) are ~100-200 lines each when implemented directly.

**Consequences**: Only 2 runtime dependencies total (MCP SDK + Zod). Full control over performance characteristics.

## ADR-003: Graph-Native (No LLM) Zettelkasten Commands

**Decision**: Implement all 5 Zettelkasten commands as pure graph algorithms, not LLM-driven pattern matching.

**Context**: The Copilot MCP's Zettelkasten commands use LLM calls for concept extraction and synthesis. Our commands compute structural properties (centrality, gaps, community bridges) directly from graph topology.

**Consequences**: Instant execution (~20ms for full analysis). No API costs. Deterministic results. Can serve as a pre-processing step before LLM synthesis.

## ADR-004: Session-Scoped Graphs

**Decision**: Each MCP tool call creates a fresh graph. No persistence between calls.

**Context**: Stateless design simplifies the server and avoids session management complexity. The entire analysis pipeline runs in ~20ms, so rebuilding the graph per-call is negligible.

**Consequences**: No session management needed. Horizontally scalable. A future phase could add graph caching if needed.
