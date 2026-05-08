# Zettelkasten Backend-Native: Ideation & Architecture

> **Date**: 2026-03-29
> **Updated**: 2026-03-30
> **Status**: Fully implemented. All five commands are backend-native. Miyo v4 migration complete (deprecated endpoints replaced with filesystem + Qdrant).
> **Scope**: Move five Zettelkasten commands from prompt-only to backend-native capabilities

---

## Background

Five Zettelkasten commands exist as LLM prompt templates in the Copilot Plus plugin's custom prompts folder (`copilot/copilot-custom-prompts/*.md`). They work by replacing `{}` with note content and sending the full prompt to the model. They have:

- **No backend representation** — no dedicated endpoints
- **No persistent state** — no relationship tracking
- **No semantic index awareness** — the LLM invents connections from training data, not the vault
- **No batch operations** — single-note only
- **No composability** — commands cannot chain

Moving these to backend-native capabilities unlocks grounding in real vault notes, vault-wide analysis, composable pipelines, scheduled automation, and structured Dataview-compatible output.

---

## 1. Per-Command Enhancement Ideas

### 1.1 Cross-Domain Connector

**Current**: LLM receives one note's text, generates analogies from training data alone.

**Backend-native gains**:
- Pre-query Miyo `/v0/search` with extracted concepts to find vault notes from other domains *before* prompting. The LLM grounds isomorphism suggestions in notes that actually exist.
- Tag extraction from Miyo results (the `tags` field is already returned) to auto-surface `#feedback-loop`, `#antifragility` clusters.
- `/v0/search/related` finds nearest neighbors; domain labels derived from folder paths and tags identify which domains are represented and which are missing.
- Output contains actionable `[[wikilinks]]` to real vault notes, not hypothetical suggestions.
- Universal principle tags validated against existing vault tag namespace.

**Effort**: LOW — all data sources exist. Enhancement is orchestration logic + richer system prompts.

### 1.2 Echo Chamber Breaker

**Current**: LLM generates counterarguments from training data only; no awareness of vault contradictions.

**Backend-native gains**:
- "Semantic distance" search: query Miyo with the note's thesis inverted/negated to find vault notes that contradict or complicate it.
- Multi-query strategy: LLM call 1 extracts assumptions → Miyo searches per assumption for contradictory vault evidence → LLM call 2 synthesizes grounded counterarguments.
- Cross-domain perspectives drawn from actual vault content in different folder domains.
- Contradictory evidence citations point to real notes the user can review.

**Effort**: LOW-MEDIUM — requires a two-pass LLM pattern (extract → search → synthesize). The existing preflight architecture already supports multi-step orchestration.

### 1.3 Semantic Linker

**Current**: LLM guesses relationship types without knowing what notes exist or what Dataview properties are in use.

**Backend-native gains**:
- Query Miyo for semantically related notes, then LLM classifies the relationship type between source and each result.
- Scan vault metadata (via `/v0/index/documents`) to discover existing Dataview property conventions and generate consistent syntax.
- Transitive inference: if note A→B and B→C, surface A→C as a candidate. Requires chaining two `/v0/search/related` calls.
- Output validated `[[links]]` and `[property:: value]` syntax only for notes confirmed to exist.
- Canonical relationship schema ensures consistency across all commands.

**Effort**: MEDIUM — relationship classification needs LLM judgment. Transitive chains add latency. Metadata convention discovery depends on vault's existing Dataview usage.

### 1.4 Orphan Rescuer

**Current**: LLM assesses orphanhood speculatively. No actual link/backlink data available.

**Backend-native gains**:
- **Vault-wide orphan detection**: query Miyo `/v0/index/files` for all indexed files, cross-reference against `[[wikilinks]]` in indexed content to find notes with zero inbound links.
- **Per-note rescue**: for a confirmed orphan, use `/v0/search/related` to find semantically close notes, then generate specific link suggestions grounded in real vault content.
- **Batch mode**: scan entire vault, score each file's connectivity, produce a report note.
- **Connectivity scores**: `inbound_links / total_files` as a vault health metric.
- **Exclusion rules**: skip daily notes, templates, and config files from orphan count.

**Effort**: MEDIUM-HIGH — link extraction from `chunk_text` is regex-based. Miyo doesn't store parsed `[[wikilinks]]` as structured data. Approach: parse links client-side in the emulator from chunk_text returned by `/v0/index/documents`.

### 1.5 Serendipity Generator

**Current**: LLM invents connections from imagination. No temporal awareness, no graph structure.

**Backend-native gains**:
- **"On This Day"**: Miyo time filters (`mtime`/`ctime`) surface notes from the same calendar date in prior years.
- **Semantic proximity with different terminology**: query Miyo with concept paraphrases to find notes sharing meaning but not keywords.
- **Random catalyst**: select random notes from `/v0/index/files` (offset randomization) and juxtapose against current note.
- **Graph gap analysis**: `/v0/search/related` finds the note's cluster, then search for notes far from that cluster to identify bridging opportunities.
- **Temporal resurfacing**: filter by `mtime` ranges to find stale notes (>90 days old) with semantic proximity to current work.

**Effort**: LOW — Miyo already supports time-range filters, related search, and file listing with pagination. Random selection is trivial.

---

## 2. Emulator vs Miyo Placement

**Principle**: Miyo does embedding, vector ops, and index management. The emulator does orchestration, LLM interaction, tool chaining, and result assembly. Graph analysis is a computation over Miyo data, executed in the emulator.

| Capability | Miyo (8742) | Emulator (8789) |
|---|---|---|
| Semantic similarity queries | Existing `/v0/search`, `/v0/search/related` | Calls Miyo, interprets results |
| Time-filtered retrieval | Existing filter support | Constructs filter payloads |
| File listing / pagination | Existing `/v0/index/files` | Uses for orphan scan, random selection |
| Link extraction from content | Future: could store parsed links in metadata | **Phase 1**: parse `[[wikilinks]]` from `chunk_text` |
| Relationship classification | Not here (requires LLM) | LLM call with Miyo results as context |
| Orphan detection (graph) | Provides raw data | Computes connectivity by cross-referencing files + link mentions |
| Multi-step orchestration | Single-request data provider | Chains multiple Miyo calls and LLM passes |
| Random note selection | `/v0/index/files` with offset | Random offset calculation |
| Batch vault operations | Paginated data source | Iteration and aggregation logic |
| Zettelkasten prompts | Not here | Domain-specific system prompts |

**New Miyo endpoints needed (future, not Phase 1 blockers)**:
- `POST /v0/search/links` — return all `[[wikilinks]]` found in a file's indexed chunks. Would accelerate orphan detection. Without it, the emulator parses links from chunk_text.

**No new Miyo endpoints required for Phase 1.** Everything composes from existing Miyo API calls.

---

## 3. Composability & Pipelines

### Shared Building Blocks

The five commands share sub-operations that should be reusable methods on `ZettelkastenService`:

| Helper | What it does | Used by |
|---|---|---|
| `extractConcepts()` | LLM extracts key concepts, themes, tags from note content | All five commands |
| `findSemanticNeighbors()` | Wraps `/v0/search/related` with limit | Semantic Linker, Orphan Rescuer, Serendipity, Cross-Domain |
| `searchByConceptInversion()` | Searches Miyo with negated/alternative framings | Echo Chamber, Serendipity |
| `buildLinkGraph()` | In-memory link map from Miyo index data | Orphan Rescuer, Serendipity (gap analysis) |
| `classifyRelationships()` | LLM classifies relationship types between source and targets | Semantic Linker, Cross-Domain |
| `findTemporallyRelevant()` | Wraps `/v0/search` with time filters | Serendipity, Orphan Rescuer (stale detection) |
| `selectRandomNotes()` | Random selection from `/v0/index/files` | Serendipity |

### Pipeline Compositions

| Pipeline | Steps | Outcome |
|---|---|---|
| **Deep Connect** | Cross-Domain → Semantic Linker → write note | Full cross-domain analysis with typed links, saved as a vault note |
| **Vault Health** | Orphan batch scan → Semantic Linker (per orphan) → aggregate report | Comprehensive vault connectivity audit |
| **Discovery Session** | Serendipity → Echo Chamber (on surfaced notes) → Cross-Domain (on surprising pairs) | Guided exploration surfacing unexpected challenges |
| **Assumption Audit** | Echo Chamber → vault search for counter-evidence → Semantic Linker (classify contradiction types) | Structured dialectic analysis |
| **Full Rescue** | Orphan Rescuer → Semantic Linker → Cross-Domain Connector | Orphan reintegrated with typed links and cross-domain bridges |

Pipelines are expressed as a sequence of command names with output forwarding — each step receives the previous step's results as additional context.

---

## 4. Vault-Wide Operations

### Vault Health Score

A composite metric computed on-demand:

| Metric | Source | Formula |
|---|---|---|
| Orphan ratio | `/v0/index/files` + link graph | `orphan_count / total_files` |
| Average connectivity | Link graph | `mean(inbound_links_per_file)` |
| Tag coverage | `/v0/index/documents` metadata | `files_with_tags / total_files` |
| Staleness | `/v0/index/files` mtimes | `files_not_modified_90d / total_files` |
| Semantic clustering | `/v0/search/related` sampling | `files_with_N+_neighbors / total_files` |

### Batch Operations

| Operation | Mechanism | Output |
|---|---|---|
| Orphan scan | Paginate `/v0/index/files` (50/page), build link graph, identify zero-inbound files | Orphan list with suggested connections |
| Stale note surfacing | Filter files by `mtime < now - 90d` | Stale note list with relevance scores to recent work |
| Tag audit | Count tag usage across documents | Tag frequency map, untagged file list |
| Relationship inventory | Batch N notes through Semantic Linker | Relationship catalog for Dataview querying |

**Batching strategy**: Process in chunks of 50 via `/v0/index/files` pagination. For each chunk, fetch `/v0/index/documents` for link extraction. Link graph is built in-memory per-request (acceptable since emulator is stateless — graph reconstructed each time).

**Latency concern**: A 1000-note vault would require ~20 paginated calls + ~1000 document fetches. Estimated 30-60 seconds. Mitigation: SSE streaming with progress events, configurable limits.

---

## 5. Automation & Scheduling

The emulator is stateless by design. Scheduling belongs outside the emulator, in the PM2/cron layer.

### Proposed Automation

| Schedule | Operation | Output Note |
|---|---|---|
| Nightly (2am) | Orphan scan (batch mode) | `Zettelkasten/Reports/Orphan Report YYYY-MM-DD.md` |
| Weekly (Sunday) | Vault health digest | `Zettelkasten/Reports/Weekly Health YYYY-WW.md` |
| Weekly (Wednesday) | Serendipity digest (5 random notes) | `Zettelkasten/Reports/Discovery YYYY-WW.md` |

### Implementation

- Script: `scripts/zettelkasten-scheduler.sh` — `curl` calls to emulator endpoints, writes results to vault via bridge.
- PM2 cron entries in `ecosystem.config.js`.
- Report note templates for consistent formatting.

### On-Save Auto-Linking (Future)

Requires plugin-layer modification. When a note is saved, the plugin fires a backend request to the Semantic Linker endpoint, and appends suggested links as a comment block. This is a **plugin-side enhancement**, not backend-only.

---

## 6. Dataview / Templater Integration Points

### Canonical Relationship Schema

```
relates-to, causes, part-of, contradicts, extends, precedes, depends-on,
is-a, enables, prevents, follows, evolves-into, supports, refines,
author-of, influenced-by, uses, implements
```

### Dataview Output Format

Semantic Linker and Orphan Rescuer output copy-paste-ready Dataview inline fields:

```markdown
[relates-to:: [[Target Note]]]
[causes:: [[Effect Note]]]
[part-of:: [[Parent MOC]]]
[contradicts:: [[Counter Note]]]
```

### Backend-Side Templating

The emulator handles templating itself (consistent with deferred-write pattern). Report notes are fully rendered — no Templater dependency at the backend level. Templates are hardcoded in `ZettelkastenService` as string builders.

### Queryable Metadata

Once Semantic Linker has annotated notes, Dataview queries become possible:

```dataview
TABLE relates-to, causes, part-of
FROM "Notes"
WHERE relates-to != null
SORT file.mtime DESC
```

---

## 7. Feasibility & Risk Notes

### Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Batch latency** — vault-wide scan on 1000+ notes: 30-60s | Medium | SSE streaming with progress events; configurable limits |
| **LLM cost** — multi-pass commands (Echo Chamber) need 2-3 LLM calls | Low | Use configured local model (LM Studio/Ollama) — zero cost |
| **Link extraction accuracy** — regex `[[wikilinks]]` from chunk_text misses edge cases | Medium | Well-tested regex; accept imperfection in v1; future Miyo enhancement |
| **Index freshness** — stale Miyo index produces stale suggestions | Medium | Check `/v0/index/stats` `latest_mtime`; warn if significantly behind |
| **Breaking existing functionality** | High (if violated) | New routes in separate file; new service class; no existing constructor changes |
| **Emulator statelessness** — graph recomputed each request | Low for <500 notes | Time-limited in-memory cache if needed later |
| **Request timeout** — `REQUEST_TIMEOUT_MS` defaults to 30s, batch ops may exceed | Medium | Increase timeout for batch endpoints; use streaming for long ops |

### Architectural Constraints (Non-Negotiable)

1. Emulator remains stateless — no database, no persistent cache
2. Miyo stays focused on semantic/embedding ops — no orchestration logic
3. All new capabilities accessible via MCP bridge for Claude adapter
4. Replay protection maintained on bridge for any new tools
5. `direct_plugin_mcp` vs `exact_backend_emulator` distinction preserved
6. No modifications to existing service constructor signatures

---

## Architectural Sketches

### Single-Command Flow (e.g., Serendipity Generator)

```
Client POST /v1/self-host/zettelkasten/serendipity
  { notePath: "Ideas/Emergence.md", vault: "My Digital Garden" }
         │
         ▼
  ZettelkastenService.serendipity()
         │
         ├─ 1. Read note via bridge (obsidian_read_note)
         │
         ├─ 2. LLM: extractConcepts(noteContent)
         │      → ["emergence", "complex systems", "self-organization"]
         │
         ├─ 3. Miyo /v0/search (3 queries, limit 5 each)
         │      → 15 semantically related vault notes
         │
         ├─ 4. Miyo /v0/index/files (random offset)
         │      → 3 random "catalyst" notes
         │
         ├─ 5. Miyo /v0/search (time filter: same day-of-year, prior years)
         │      → "On This Day" notes
         │
         └─ 6. LLM: synthesize serendipity with all vault context
                → Structured response with [[wikilinks]] to real notes
```

### Pipeline Flow (Deep Connect)

```
Client POST /v1/self-host/zettelkasten/pipeline
  { steps: ["cross-domain", "semantic-linker"], notePath: "..." }
         │
         ▼
  ZettelkastenService.pipeline()
         │
         ├─ Step 1: crossDomain(note) → cross-domain analysis
         │
         ├─ Step 2: semanticLinker(note, context=step1Results)
         │          → typed relationships grounded in cross-domain findings
         │
         └─ Optional: write combined results as vault note via bridge
```

### Vault Health Score Flow

```
Client POST /v1/self-host/zettelkasten/health
  { vault: "My Digital Garden" }
         │
         ▼
  ZettelkastenService.vaultHealth()
         │
         ├─ 1. /v0/index/stats → total_files, total_chunks
         │
         ├─ 2. /v0/index/files (paginated) → all file paths + mtimes
         │
         ├─ 3. For each page: /v0/index/documents → extract [[wikilinks]]
         │
         ├─ 4. Build in-memory link graph
         │
         ├─ 5. Compute metrics: orphan ratio, avg connectivity, staleness, tag coverage
         │
         └─ 6. Return VaultHealthScore
                { orphanRatio: 0.12, avgConnectivity: 3.4, staleness: 0.08, ... }
```
