# Medical Zettelkasten MCP

## What This Is

A standalone MCP server that combines InfraNodus-style text network analysis (reimplemented from academic papers, in-memory, zero Neo4J) with five Zettelkasten analytical commands, exposed as 10 MCP tools. Bridges two existing systems:

- **OpenClaw Research Agents** — consumes ToolUniverse biomedical query results, producing graph-powered research intelligence
- **Copilot MCP (Obsidian)** — outputs Obsidian-compatible markdown with wikilinks, Dataview properties, and tag suggestions

All graph analysis is algorithmic (no LLM calls) and runs in-memory per-request (no persistent storage).

## Tech Stack

- **Runtime**: Node.js 22.13.1 (engine-strict=true)
- **Modules**: CommonJS (`require()` / `module.exports`)
- **Validation**: Zod 4.6.7 (declared; no source file imports it directly, the MCP SDK shares it)
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29.0
- **Testing**: Node's native `--test` runner
- **Dependencies**: 2 total (MCP SDK + Zod). All graph algorithms are hand-rolled.

## Quick Reference

```bash
# Setup
nvm use 22.13.1 && npm ci

# Run tests (111 tests)
npm test

# Start MCP server (stdio transport)
npm start

# Demo: OpenClaw pipeline
node scripts/demo-openclaw-pipeline.js

# Demo: Copilot/Obsidian pipeline
node scripts/demo-copilot-pipeline.js

# Export analysis as Obsidian-compatible notes
node scripts/export-to-obsidian.js --input <file> --output <dir> --confirm
```

## MCP Tools (10)

| Tool | Purpose |
|------|---------|
| `analyze_network` | Full graph analysis: communities, centrality, gaps, diversity |
| `find_gaps` | Structural gaps — missing connections, research opportunities |
| `detect_clusters` | Topical communities — themes and key concepts per cluster |
| `measure_diversity` | Coverage bias — dominant vs underrepresented topics |
| `cross_domain_connect` | Cross-Domain Connector — bridges, isomorphisms, connection proposals |
| `break_echo_chamber` | Echo Chamber Breaker — bias detection, blind spots, challenge questions |
| `link_semantically` | Semantic Linker — typed relationships, transitive links, hidden connections |
| `rescue_orphans` | Orphan Rescuer — isolated concepts, reintegration proposals |
| `generate_serendipity` | Serendipity Generator — dark nodes, surprise connections, lateral prompts |
| `full_zettelkasten_analysis` | All 5 Zettelkasten analyses in a single pass |

All tools accept:
- `text` (string) — raw text or JSON-stringified data
- `input_type` (enum) — `"text"`, `"tooluniverse_json"`, `"pubmed_abstracts"`, `"openclaw_report"`

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `lib/` | Graph algorithms: graph.js, text-to-graph.js, centrality.js, community-detection.js, gap-detection.js, diversity.js |
| `lib/graph-engine.js` | Unified engine orchestrating all algorithms |
| `lib/zettelkasten/` | Five Zettelkasten analytical commands |
| `lib/biomedical-adapter.js` | Input normalization for ToolUniverse, PubMed, OpenClaw |
| `lib/biomedical-stopwords.js` | Curated biomedical stopword list |
| `lib/openclaw-bridge-adapter.js` | OpenClaw agent integration adapter |
| `lib/copilot-bridge.js` | Copilot MCP integration adapter |
| `lib/obsidian-formatter.js` | Graph analysis → Obsidian markdown/wikilinks/Dataview |
| `src/server.js` | MCP server entry point (stdio transport) |
| `src/tools.js` | 10 tool definitions |
| `src/handlers/` | Tool handler dispatch and common utilities |
| `config/` | Server config, biomedical entities, OpenClaw role-tool mapping |
| `tests/` | 111 tests (unit + integration); includes `tests/integration/export-to-obsidian.test.js` (export pipeline tests) |
| `scripts/` | Demo pipelines for OpenClaw and Copilot integration |
| `scripts/export-to-obsidian.js` | CLI: reads input, runs full analysis, writes Obsidian markdown notes (main analysis, concept notes, MOC) |

## Architecture

### Graph Pipeline

```
Input text/JSON
  → Biomedical Adapter (normalize, extract, clean)
  → Text-to-Graph (4-gram co-occurrence window)
  → Graph Engine
      ├── Betweenness Centrality (Brandes' algorithm)
      ├── Community Detection (Louvain)
      ├── Structural Gap Detection
      └── Diversity Scoring (Shannon entropy)
  → Zettelkasten Commands (5 analytical functions)
  → MCP Response (JSON)
```

### Algorithms

All reimplemented from academic papers, not extracted from InfraNodus source:

1. **Text-to-Graph** — Paranyushkin (2019): 4-gram sliding window co-occurrence
2. **Betweenness Centrality** — Brandes (2001): O(V*E) shortest-path based
3. **Community Detection** — Blondel et al. (2008): Louvain modularity optimization
4. **Structural Gap Detection** — Paranyushkin (2019): inter-community gap scoring
5. **Diversity** — Shannon entropy normalized over community count

### Integration Points

**OpenClaw** (`lib/openclaw-bridge-adapter.js`):
- In-process adapter wrapping all 10 MCP tools as async functions
- `analyzeToolUniverseData(json)` convenience method for the most common use case
- Role-to-tool mapping in `config/openclaw-role-tool-map.json`

**Copilot MCP** (`lib/copilot-bridge.js`):
- Converts analysis output to `ZettelkastenCommandResponse` format
- Obsidian formatter produces markdown with [[wikilinks]], Dataview properties, tags
- Compatible with the backend emulator's `/v1/self-host/zettelkasten/` endpoints

## Design Principles

- **In-memory**: No persistent storage. Each request creates a fresh graph.
- **Fail-closed**: Malformed input → explicit error, not best-effort parsing.
- **Minimal dependencies**: Only 2 runtime deps (MCP SDK + Zod).
- **CommonJS throughout**: No ES modules, no build step.
- **Algorithmic, not LLM-driven**: All analysis is pure graph computation. No LLM API calls.
- **Session-scoped**: Graphs don't persist between tool calls.

## Algorithm References

- Paranyushkin, D. (2019). "InfraNodus: Generating Insight Using Text Network Analysis." WWW'19.
- Paranyushkin, D. (2011). "Identifying the pathways for meaning circulation using text network analysis." Nodus Labs.
- Brandes, U. (2001). "A Faster Algorithm for Betweenness Centrality." Journal of Mathematical Sociology.
- Blondel, V. et al. (2008). "Fast unfolding of communities in large networks." Journal of Statistical Mechanics.
